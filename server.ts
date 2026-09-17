import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { store, isGeminiKey, isValidTelegramToken } from './server/store';
import { TelegramService } from './server/telegram';
import { queueWorker } from './server/queueWorker';
import { FileProcessor } from './server/fileProcessor';
import { batchAnalyzeAndRenameWithAI, InputBatchItem } from './server/aiRenamer';
import { generateKeepAliveHtml } from './server/keepAliveHtml';
import { benchmarkService } from './server/benchmarkService';
import { telegramMtproto } from './server/telegramMtproto';
import { SystemStatus } from './src/types';

// In AI Studio development, Nginx reverse proxy forwards external traffic from 8080 to internal port 3000.
// In production deployments (Google Cloud Run, Render, etc.), the container MUST listen directly on process.env.PORT (e.g. 8080 on Cloud Run, 10000 on Render).
const isAiStudioDev = fs.existsSync('/app/control-plane-api') && process.env.NODE_ENV !== 'production';
const PORT = isAiStudioDev ? 3000 : (Number(process.env.PORT) || 3000);
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

// Continuous, non-overlapping Long Polling for real Telegram Bot
let isPollingActive = false;
let lastUpdateId = 0;
let consecutive409Count = 0;

function startPollingLoop() {
  if (isPollingActive) return;
  isPollingActive = true;

  (async () => {
    while (isPollingActive) {
      const config = store.getConfig();
      const pollingEnv = process.env.ENABLE_TELEGRAM_POLLING;
      const isEnvPollingDisabled = pollingEnv === 'false' || pollingEnv === '0';

      if (!config.botToken || !config.pollingActive || isGeminiKey(config.botToken) || isEnvPollingDisabled) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      try {
        const res = await TelegramService.callApi(config.botToken, 'getUpdates', {
          offset: lastUpdateId + 1,
          timeout: 20,
          allowed_updates: ['message', 'callback_query'],
        });

        if (res.ok && Array.isArray(res.result)) {
          consecutive409Count = 0;
          if (res.result.length > 0) {
            for (const update of res.result) {
              lastUpdateId = Math.max(lastUpdateId, update.update_id);
              // Dispatch asynchronously so incoming updates & callback queries respond instantly without blocking the poller
              TelegramService.handleUpdate(update).catch((err) => {
                console.error('Update handling error:', err);
              });
            }
          }
        } else if (!res.ok) {
          if (res.error_code === 409) {
            consecutive409Count++;
            const desc = (res.description || '').toLowerCase();

            // If a webhook was accidentally set on Telegram, remove it to resume getUpdates
            if (desc.includes('webhook')) {
              console.warn('Webhook was active on Telegram. Removing webhook to enable polling...');
              try {
                await TelegramService.callApi(config.botToken, 'deleteWebhook', { drop_pending_updates: false });
              } catch (delErr) {
                console.error('Failed to remove webhook:', delErr);
              }
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }

            // Exponential backoff to resolve multi-instance conflict (e.g. Render production vs AI Studio dev)
            // 5s -> 10s -> 20s -> 35s -> max 60s
            const backoffMs = Math.min(60000, 5000 * Math.pow(1.5, Math.min(consecutive409Count - 1, 6)));

            // Throttle logs so Cloud Run / Render logs aren't flooded
            if (consecutive409Count === 1 || consecutive409Count % 5 === 0) {
              console.warn(`Telegram polling notice: Another bot instance (e.g. on Render or AI Studio) is actively receiving updates. Backing off for ${Math.round(backoffMs / 1000)}s to avoid conflicts.`);
            }
            await new Promise((r) => setTimeout(r, backoffMs));
          } else if (res.error_code === 401 || res.error_code === 404) {
            console.warn('Telegram polling unauthorized/not found. Pausing 10s...');
            await new Promise((r) => setTimeout(r, 10000));
          } else {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      } catch (err: any) {
        console.error('Polling network error:', err?.message || err);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  })();
}

async function startServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Keep-Alive & Ping Metrics for UptimeRobot and Render
  let totalKeepAlivePings = 0;
  let lastKeepAlivePingTime = 'لم يتم استقبال أي استدعاء بعد';

  // Start background Queue Worker
  queueWorker.start();
  startPollingLoop();

  // ----------------------------------------------------
  // Keep-Alive, Liveness & Uptime Monitoring Routes
  // (Works seamlessly for UptimeRobot, Render Health Probes & Browsers)
  // ----------------------------------------------------
  app.all(['/health', '/uptime', '/ping', '/keep-alive', '/api/health'], (req, res) => {
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }

    totalKeepAlivePings++;
    lastKeepAlivePingTime = new Date().toISOString();

    const isJsonRequested =
      req.query.json === 'true' ||
      req.query.format === 'json' ||
      req.path === '/api/health' ||
      req.headers.accept?.includes('application/json') ||
      Boolean(req.headers['user-agent']?.match(/uptimerobot|pingdom|curl|wget|bot/i));

    const config = store.getConfig();
    const queue = store.getQueue();
    const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    if (isJsonRequested) {
      res.status(200).json({
        status: 'ok',
        service: 'Telegram Auto-Publisher & Media Pipeline',
        environment: process.env.RENDER ? 'Render Cloud (Node.js)' : 'AI Studio Container',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: lastKeepAlivePingTime,
        pingsReceived: totalKeepAlivePings,
        bot: {
          configured: !!config.botToken && !isGeminiKey(config.botToken),
          pollingActive: config.pollingActive && process.env.ENABLE_TELEGRAM_POLLING !== 'false',
        },
        queueLength: queue.length,
        memoryUsageMb: mem,
        keepAlive: 'active',
      });
      return;
    }

    // Render interactive HTML dashboard for browser visits
    const html = generateKeepAliveHtml({
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.RENDER ? 'Render Cloud (Node.js)' : 'AI Studio Container',
      botConfigured: !!config.botToken && !isGeminiKey(config.botToken),
      botUsername: undefined,
      pollingActive: config.pollingActive && process.env.ENABLE_TELEGRAM_POLLING !== 'false',
      queueLength: queue.length,
      totalPings: totalKeepAlivePings,
      lastPingTime: lastKeepAlivePingTime,
      memoryUsageMb: mem,
    });

    res.status(200).type('html').send(html);
  });

  // System Status
  app.get('/api/status', async (req, res) => {
    const config = store.getConfig();
    let botInfo = null;

    if (config.botToken && !isGeminiKey(config.botToken)) {
      const meRes = await TelegramService.getMe(config.botToken);
      if (meRes.ok && meRes.result) {
        botInfo = meRes.result;
      }
    }

    const queue = store.getQueue();
    const activeProcessing = queue.find((q) => q.status !== 'queued' && q.status !== 'published' && q.status !== 'failed');

    const userAccount = await telegramMtproto.getUserAccountInfo();

    const status: SystemStatus = {
      botConfigured: !!config.botToken && !isGeminiKey(config.botToken),
      botInfo,
      pollingActive: config.pollingActive,
      webhookActive: !!config.webhookUrl,
      webhookUrl: config.webhookUrl,
      queueLength: queue.length,
      activeProcessingId: activeProcessing?.id,
      totalProcessedCount: store.getChannelPosts().length,
      registeredUsersCount: store.getAllUsers().length,
      lastActiveTime: Date.now(),
      resumableTransfersCount: queue.filter((q) => q.chunkProgress?.resumeToken).length,
      aiRenaming: config.aiRenaming,
      turboSpeed: config.turboSpeed,
      userAccount,
    };

    res.json(status);
  });

  // Bot Config: get current configuration
  app.get('/api/bot/config', (req, res) => {
    const config = store.getConfig();
    const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const isFromSecret = isValidTelegramToken(envToken);
    const hasGeminiKeyConflict = isGeminiKey(envToken);

    res.json({
      botToken: config.botToken,
      pollingActive: config.pollingActive,
      webhookUrl: config.webhookUrl,
      aiRenaming: config.aiRenaming,
      turboSpeed: config.turboSpeed,
      apiId: config.apiId,
      apiHash: config.apiHash,
      isConfigured: !!config.botToken && !isGeminiKey(config.botToken),
      isFromSecret,
      hasGeminiKeyConflict,
    });
  });

  // Bot Config: save token, AI preferences, turbo speed & toggle polling
  app.post('/api/bot/config', async (req, res) => {
    const { botToken, pollingActive, webhookUrl, aiRenaming, turboSpeed, apiId, apiHash } = req.body;
    const current = store.getConfig();

    if (botToken !== undefined && isGeminiKey(botToken)) {
      return res.json({
        success: false,
        verified: false,
        error: '⚠️ هذا الرمز يبدو كرمز Google Gemini API (يبدأ بـ AIza) وليس توكن بوت تيليجرام. رمز التيليجرام يبدأ بأرقام مثل 123456789:AA... ويتم إنشاؤه عبر @BotFather.',
      });
    }

    const update: any = {};
    if (botToken !== undefined) {
      update.botToken = botToken.trim();
      // Auto-activate polling if a valid token is provided and pollingActive wasn't explicitly disabled
      if (update.botToken && pollingActive === undefined && !current.pollingActive) {
        update.pollingActive = true;
      }
    }
    if (pollingActive !== undefined) update.pollingActive = !!pollingActive;
    if (webhookUrl !== undefined) update.webhookUrl = webhookUrl.trim();
    if (aiRenaming !== undefined) update.aiRenaming = aiRenaming;
    if (apiId !== undefined && Number(apiId)) update.apiId = Number(apiId);
    if (apiHash !== undefined && apiHash.trim()) update.apiHash = apiHash.trim();
    if (turboSpeed !== undefined) {
      update.turboSpeed = {
        ...(current.turboSpeed || {
          enabled: true,
          fastStatusUpdates: true,
          preloadNextItem: true,
          aiCacheEnabled: true,
          ultrafastFfmpeg: true,
        }),
        ...turboSpeed,
      };
    }

    store.updateConfig(update);
    const updatedConfig = store.getConfig();

    // Test token if provided or existing
    let verified = false;
    let botUser = null;
    let errorDesc = '';

    const tokenToTest = updatedConfig.botToken;
    if (tokenToTest && !isGeminiKey(tokenToTest)) {
      const meRes = await TelegramService.getMe(tokenToTest);
      if (meRes.ok && meRes.result) {
        verified = true;
        botUser = meRes.result;
      } else {
        errorDesc = meRes.description || 'فشل الاتصال برمز البوت: يرجى التأكد من الرمز';
      }
    }

    res.json({
      success: true,
      config: updatedConfig,
      verified,
      botUser,
      error: errorDesc,
    });
  });

  // AI Batch Renaming Preview Endpoint
  app.post('/api/ai/batch-rename', async (req, res) => {
    try {
      const { items, namingPattern, customInstructions } = req.body;
      const currentConfig = store.getConfig().aiRenaming;
      const activeConfig = {
        ...currentConfig,
        ...(namingPattern ? { namingPattern } : {}),
        ...(customInstructions !== undefined ? { customInstructions } : {}),
      };

      const inputItems: InputBatchItem[] = (items && items.length > 0)
        ? items
        : store.getQueue().map((q) => ({
            id: q.id,
            originalFilename: q.originalFilename || 'video.mp4',
            originalCaption: q.originalCaption || '',
            duration: q.duration,
            sequenceNumber: q.sequenceNumber,
            mimeType: q.mimeType,
            fileSize: q.fileSize,
          }));

      const results = await batchAnalyzeAndRenameWithAI(inputItems, activeConfig);
      res.json({
        success: true,
        results,
        config: activeConfig,
      });
    } catch (err: any) {
      console.error('AI batch rename error:', err);
      res.status(500).json({ success: false, error: err.message || 'فشل التحليل بالذكاء الاصطناعي' });
    }
  });

  // Apply AI Batch Renaming Directly to Queue
  app.post('/api/ai/apply-queue', async (req, res) => {
    try {
      const { renames } = req.body;
      if (!Array.isArray(renames) || renames.length === 0) {
        return res.status(400).json({ error: 'لم يتم تزويد تعديلات لتطبيقها' });
      }

      for (const item of renames) {
        store.updateQueueItem(item.id, {
          processedFilename: item.formattedFilename,
          processedCaption: item.formattedCaption,
          isAiRenamed: true,
          aiGroupingReason: item.groupingReason,
        });
      }

      res.json({
        success: true,
        queue: store.getQueue(),
      });
    } catch (err: any) {
      console.error('Error applying AI renames to queue:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Users
  app.get('/api/users', (req, res) => {
    res.json(store.getAllUsers());
  });

  app.get('/api/users/:userId', (req, res) => {
    const user = store.getUser(req.params.userId);
    res.json(user);
  });

  app.patch('/api/users/:userId', (req, res) => {
    const updated = store.updateUser(req.params.userId, req.body);
    res.json(updated);
  });

  // Upload Thumbnail for User
  app.post('/api/users/:userId/thumbnail', upload.any(), async (req, res) => {
    const userId = req.params.userId;
    let inputSource: Buffer | string | null = null;

    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      inputSource = files[0].buffer;
    } else if (req.file) {
      inputSource = req.file.buffer;
    } else if (req.body.url) {
      inputSource = req.body.url;
    } else if (req.body.thumbnail) {
      inputSource = req.body.thumbnail;
    } else if (req.body.thumb) {
      inputSource = req.body.thumb;
    } else if (req.body.image) {
      inputSource = req.body.image;
    }

    if (!inputSource) {
      return res.status(400).json({ error: 'لم يتم تزويد صورة مصغرة صالحة (ملف أو رابط أو Base64)' });
    }

    try {
      // Standardize thumbnail into 320x320 baseline JPEG (< 200KB) + Master
      const std = await FileProcessor.standardizeThumbnail(inputSource, userId);
      const finalUrl = std?.dataUrl || (typeof inputSource === 'string' ? inputSource : '');

      const updated = store.updateUser(userId, {
        thumbnail: {
          id: `thumb_${Date.now()}`,
          url: finalUrl,
          dataUrl: std?.dataUrl,
          standard320Path: std?.standard320Path,
          updatedAt: Date.now(),
        },
        pendingAction: undefined,
      });

      res.json({
        success: true,
        message: 'تم تعيين واعتماد الصورة المصغرة بنجاح وفق معايير تليجرام المعتمدة',
        user: updated,
        standardized: std ? { width: std.width, height: std.height, sizeBytes: std.sizeBytes, path: std.standard320Path } : null,
      });
    } catch (err: any) {
      console.error('Thumbnail upload processing error:', err);
      res.status(500).json({ error: 'فشل معالجة وتنسيق الصورة المصغرة' });
    }
  });

  // Delete Thumbnail
  app.delete('/api/users/:userId/thumbnail', (req, res) => {
    const updated = store.updateUser(req.params.userId, { thumbnail: undefined });
    res.json({ success: true, message: 'تم حذف الصورة المصغرة بنجاح', user: updated });
  });

  // Queue
  app.get('/api/queue', (req, res) => {
    res.json(store.getQueue());
  });

  app.delete('/api/queue/:itemId', (req, res) => {
    store.removeQueueItem(req.params.itemId);
    res.json({ success: true });
  });

  app.post('/api/queue/clear', (req, res) => {
    const { onlyCompleted } = req.body;
    if (onlyCompleted) {
      store.clearCompletedQueue();
    } else {
      store.clearAllQueue();
    }
    res.json({ success: true, queue: store.getQueue() });
  });

  // Batch Test Add to Queue (Simulate bulk video/text arrival)
  app.post('/api/queue/batch', (req, res) => {
    const { userId, items } = req.body;
    const user = store.getUser(userId || '77123456');

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const created = items.map((it: any) => {
      const isVideo = it.type === 'video';
      const isAudio = it.type === 'audio';
      const defaultFilename = isVideo ? 'Video.mp4' : (isAudio ? 'Audio.mp3' : 'Document.pdf');
      const defaultMime = isVideo ? 'video/mp4' : (isAudio ? 'audio/mpeg' : 'application/octet-stream');
      return store.addToQueue({
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: user.userId,
        userFirstName: user.firstName,
        chatId: user.userId,
        type: it.type || 'video',
        originalFilename: it.originalFilename || (it.type === 'text' ? undefined : defaultFilename),
        originalCaption: it.originalCaption || '',
        textContent: it.textContent,
        performer: it.performer,
        title: it.title,
        fileSize: it.fileSize || (isAudio ? 12 * 1024 * 1024 : 45 * 1024 * 1024),
        mimeType: it.type === 'text' ? undefined : (it.mimeType || defaultMime),
        status: 'queued',
        statusMessage: 'في قائمة الانتظار',
        targetChannelId: user.channel?.chatId || '@MediaHubArabic',
        targetChannelTitle: user.channel?.title || 'قناة ميديا العرب الرسمية',
      });
    });

    res.json({ success: true, count: created.length, queue: store.getQueue() });
  });

  // Channel Posts
  app.get('/api/channel/posts', (req, res) => {
    const channelId = req.query.channelId as string | undefined;
    res.json(store.getChannelPosts(channelId));
  });

  // Channel Permission Verification Check
  app.post('/api/channel/verify', async (req, res) => {
    const { channelChatId, userId } = req.body;
    const config = store.getConfig();
    const result = await TelegramService.verifyUserChannelPermissions(
      config.botToken,
      channelChatId,
      userId
    );
    res.json(result);
  });

  // Telegram Simulator Chat Endpoints
  app.get('/api/simulator/messages/:chatId', (req, res) => {
    res.json(store.getSimulatedMessages(req.params.chatId));
  });

  app.post('/api/simulator/send', async (req, res) => {
    const { userId, type, text, photoUrl, filename, fileSize, caption } = req.body;
    const user = store.getUser(userId);

    const msgId = Date.now() % 1000000;
    const fakeMessage: any = {
      message_id: msgId,
      from: {
        id: Number(userId) || 77123456,
        first_name: user.firstName,
        username: user.username,
        is_bot: false,
      },
      chat: {
        id: Number(userId) || 77123456,
        type: 'private',
        first_name: user.firstName,
      },
      date: Math.floor(Date.now() / 1000),
    };

    if (type === 'text' || (!type && text)) {
      fakeMessage.text = text;
    } else if (type === 'photo') {
      fakeMessage.photo = [{ file_id: photoUrl || 'fake_id', url: photoUrl, file_size: 1024, width: 800, height: 800 }];
      fakeMessage.caption = caption;
    } else if (type === 'video') {
      fakeMessage.video = {
        file_id: 'fake_video_id',
        file_name: filename || 'Sample_Video.mp4',
        mime_type: 'video/mp4',
        file_size: fileSize || 35 * 1024 * 1024,
        duration: 120,
      };
      fakeMessage.caption = caption;
    } else if (type === 'audio') {
      fakeMessage.audio = {
        file_id: 'fake_audio_id',
        file_name: filename || 'Sample_Audio.mp3',
        mime_type: 'audio/mpeg',
        file_size: fileSize || 12 * 1024 * 1024,
        duration: 180,
        performer: req.body.performer || '',
        title: req.body.title || '',
      };
      fakeMessage.caption = caption;
    } else if (type === 'voice') {
      fakeMessage.voice = {
        file_id: 'fake_voice_id',
        mime_type: 'audio/ogg',
        file_size: fileSize || 2 * 1024 * 1024,
        duration: 45,
      };
      fakeMessage.caption = caption;
    } else if (type === 'document') {
      fakeMessage.document = {
        file_id: 'fake_doc_id',
        file_name: filename || 'Sample_Document.pdf',
        mime_type: 'application/pdf',
        file_size: fileSize || 10 * 1024 * 1024,
      };
      fakeMessage.caption = caption;
    }

    // Add to simulated chat history
    store.addSimulatedMessage(userId, fakeMessage);

    // Run handler logic
    await TelegramService.handleUpdate({ message: fakeMessage });

    res.json({
      success: true,
      user: store.getUser(userId),
      messages: store.getSimulatedMessages(userId),
    });
  });

  app.post('/api/simulator/callback', async (req, res) => {
    const { userId, messageId, data } = req.body;
    const user = store.getUser(userId);

    const fakeCallback = {
      id: `cb_${Date.now()}`,
      from: {
        id: Number(userId) || 77123456,
        first_name: user.firstName,
        username: user.username,
      },
      message: {
        message_id: messageId,
        chat: { id: Number(userId) || 77123456 },
      },
      data,
    };

    await TelegramService.handleUpdate({ callback_query: fakeCallback });

    res.json({
      success: true,
      user: store.getUser(userId),
      messages: store.getSimulatedMessages(userId),
    });
  });

  // Real Telegram Webhook Endpoint
  app.post('/api/telegram/webhook', async (req, res) => {
    try {
      await TelegramService.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (err) {
      console.error('Webhook error:', err);
      res.sendStatus(500);
    }
  });

  // Live Performance Telemetry & Benchmark Data
  app.get('/api/system/benchmark', (req, res) => {
    res.json(benchmarkService.getTelemetry());
  });

  // Telegram User Account Turbo Engine Endpoints
  app.get('/api/telegram/user-account', async (req, res) => {
    try {
      const info = await telegramMtproto.getUserAccountInfo();
      res.json(info);
    } catch (err: any) {
      res.json({ connected: false, error: err?.message });
    }
  });

  app.post('/api/telegram/user-account/send-code', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone || typeof phone !== 'string') {
        return res.json({ success: false, error: 'يرجى إدخال رقم هاتف صحيح بصيغة دولية (مثال: +966...)' });
      }
      const result = await telegramMtproto.sendUserLoginCode(phone.trim());
      res.json(result);
    } catch (err: any) {
      res.json({ success: false, error: err?.message || 'فشل إرسال كود التحقق' });
    }
  });

  app.post('/api/telegram/user-account/verify-code', async (req, res) => {
    try {
      const { code, password } = req.body;
      if (!code || typeof code !== 'string') {
        return res.json({ success: false, error: 'يرجى إدخال كود التحقق المرسل من تيليجرام' });
      }
      const result = await telegramMtproto.verifyUserLoginCode(code.trim(), password);
      res.json(result);
    } catch (err: any) {
      res.json({ success: false, error: err?.message || 'فشل تسجيل الدخول' });
    }
  });

  app.post('/api/telegram/user-account/set-session', async (req, res) => {
    try {
      const { sessionString } = req.body;
      if (!sessionString || typeof sessionString !== 'string') {
        return res.json({ success: false, error: 'يرجى إدخال كود الجلسة (Session String)' });
      }
      const result = await telegramMtproto.setUserSession(sessionString.trim());
      res.json(result);
    } catch (err: any) {
      res.json({ success: false, error: err?.message || 'فشل تفعيل الجلسة' });
    }
  });

  app.post('/api/telegram/user-account/logout', async (req, res) => {
    try {
      await telegramMtproto.logoutUserAccount();
      res.json({ success: true });
    } catch (err: any) {
      res.json({ success: false, error: err?.message });
    }
  });

  // ----------------------------------------------------
  // Static Production Serving vs Vite Dev Middleware
  // ----------------------------------------------------
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (hasDist && !process.env.npm_lifecycle_event?.includes('dev') && !process.argv[1]?.endsWith('server.ts'));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Bot Pipeline Server running on http://0.0.0.0:${PORT} [mode: ${isProduction ? 'production' : 'development'}]`);
  });

  // Graceful shutdown on Cloud Run container rotation / SIGTERM
  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    isPollingActive = false;
    try {
      queueWorker.stop();
    } catch {}
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 4000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();
