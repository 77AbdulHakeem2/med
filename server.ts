import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { store } from './server/store';
import { TelegramService } from './server/telegram';
import { queueWorker } from './server/queueWorker';
import { FileProcessor } from './server/fileProcessor';
import { batchAnalyzeAndRenameWithAI, InputBatchItem } from './server/aiRenamer';
import { SystemStatus } from './src/types';

const PORT = 3000;
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

// Continuous, non-overlapping Long Polling for real Telegram Bot
let isPollingActive = false;
let lastUpdateId = 0;

function startPollingLoop() {
  if (isPollingActive) return;
  isPollingActive = true;

  (async () => {
    while (true) {
      const config = store.getConfig();
      if (!config.botToken || !config.pollingActive) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      try {
        const res = await TelegramService.callApi(config.botToken, 'getUpdates', {
          offset: lastUpdateId + 1,
          timeout: 20,
          allowed_updates: ['message', 'callback_query'],
        });

        if (res.ok && Array.isArray(res.result) && res.result.length > 0) {
          for (const update of res.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            // Dispatch asynchronously so incoming updates & callback queries respond instantly without blocking the poller
            TelegramService.handleUpdate(update).catch((err) => {
              console.error('Update handling error:', err);
            });
          }
        } else if (!res.ok) {
          if (res.error_code === 409) {
            console.warn('Telegram polling conflict (multiple instances). Waiting 3s...');
            await new Promise((r) => setTimeout(r, 3000));
          } else {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      } catch (err) {
        console.error('Polling network error:', err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();
}

async function startServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Start background Queue Worker
  queueWorker.start();
  startPollingLoop();

  // ----------------------------------------------------
  // API Routes
  // ----------------------------------------------------

  // System Status
  app.get('/api/status', async (req, res) => {
    const config = store.getConfig();
    let botInfo = null;

    if (config.botToken) {
      const meRes = await TelegramService.getMe(config.botToken);
      if (meRes.ok && meRes.result) {
        botInfo = meRes.result;
      }
    }

    const queue = store.getQueue();
    const activeProcessing = queue.find((q) => q.status !== 'queued' && q.status !== 'published' && q.status !== 'failed');

    const status: SystemStatus = {
      botConfigured: !!config.botToken,
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
    };

    res.json(status);
  });

  // Bot Config: get current configuration
  app.get('/api/bot/config', (req, res) => {
    const config = store.getConfig();
    res.json({
      botToken: config.botToken,
      pollingActive: config.pollingActive,
      webhookUrl: config.webhookUrl,
      aiRenaming: config.aiRenaming,
      isConfigured: !!config.botToken,
    });
  });

  // Bot Config: save token, AI preferences & toggle polling
  app.post('/api/bot/config', async (req, res) => {
    const { botToken, pollingActive, webhookUrl, aiRenaming } = req.body;
    const current = store.getConfig();

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

    store.updateConfig(update);
    const updatedConfig = store.getConfig();

    // Test token if provided or existing
    let verified = false;
    let botUser = null;
    let errorDesc = '';

    const tokenToTest = updatedConfig.botToken;
    if (tokenToTest) {
      const meRes = await TelegramService.getMe(tokenToTest);
      if (meRes.ok && meRes.result) {
        verified = true;
        botUser = meRes.result;
      } else {
        errorDesc = meRes.description || 'فشل الاتصال برمز البوت';
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
      return store.addToQueue({
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: user.userId,
        userFirstName: user.firstName,
        chatId: user.userId,
        type: it.type || 'video',
        originalFilename: it.originalFilename || (it.type === 'text' ? undefined : 'Video.mp4'),
        originalCaption: it.originalCaption || '',
        textContent: it.textContent,
        fileSize: it.fileSize || 45 * 1024 * 1024,
        mimeType: it.type === 'text' ? undefined : 'video/mp4',
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

  // ----------------------------------------------------
  // Vite Integration
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Bot Pipeline Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
