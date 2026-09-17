import { store } from './store';
import { TelegramService } from './telegram';
import {
  processActualFilename,
  processActualCaption,
  removeForbiddenWords,
} from './pipeline';
import { FileProcessor } from './fileProcessor';
import { batchAnalyzeAndRenameWithAI, ensureMedPulseLinkInCaption } from './aiRenamer';
import { QueueItem, ChannelPost, UserSetting } from '../src/types';
import { LiveTelegramProgressReporter } from './progressTracker';
import { forwardBatchManager } from './forwardBatchManager';
import fs from 'fs';
import path from 'path';

class AsyncSemaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private max: number) {}

  public async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      });
    });
  }

  private release() {
    this.active--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

class QueueWorker {
  private isLoopRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private isStarted = false;

  // Track currently processing items (allows concurrent processing up to maxConcurrent)
  private activeItemIds = new Set<string>();

  // Staged resource semaphores for optimal parallel pipelining
  private downloadSemaphore = new AsyncSemaphore(
    Math.max(1, Math.min(10, Number(process.env.DOWNLOAD_SEMAPHORE_LIMIT) || 4))
  );
  private ffmpegSemaphore = new AsyncSemaphore(
    Math.max(1, Math.min(8, Number(process.env.FFMPEG_SEMAPHORE_LIMIT) || 3))
  );

  private getMaxConcurrent(): number {
    const config = store.getConfig();
    return Math.max(4, Math.min(32, config.turboSpeed?.maxConcurrency || 16));
  }

  // Mutex to guarantee that only ONE item can actively upload/publish to the channel at any instant
  private channelPublishMutex: Promise<void> = Promise.resolve();

  // Guard against overlapping AI prewarming batches
  private isPrewarming = false;
  private lastPrewarmTime = 0;

  public start() {
    if (this.isStarted) return;
    this.isStarted = true;

    // Automatic recovery of any uncompleted or stranded items from previous server restarts/crashes
    const uncompleted = store.getQueue().filter(
      (q) => q.status !== 'published' && q.status !== 'failed'
    );
    for (const item of uncompleted) {
      if (item.status !== 'queued') {
        console.log(`[QueueRecovery] Recovering stranded queue item #${item.sequenceNumber} (was: ${item.status}) -> queued`);
        store.updateQueueItem(item.id, {
          status: 'queued',
          statusMessage: '⏳ في قائمة الانتظار للمتابعة والنشر التسلسلي...',
        });
      }
    }

    // Zero-latency event trigger whenever any item is added or status changes
    store.onQueueItemAdded(() => this.kick());
    store.onQueueStatusChanged(() => this.kick());

    // Safety fallback interval
    this.timer = setInterval(() => this.processNext(), 1000);
    this.kick();
  }

  public kick() {
    setImmediate(() => this.processNext());
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isStarted = false;
  }

  /**
   * Emergency Stop & Reset Queue
   * Immediately terminates and resets all active processes, clears pending buffers,
   * purges temp files, and marks current operations cancelled.
   */
  public emergencyStopAndReset(): { cancelledCount: number } {
    console.log('🛑 [EmergencyStop] User requested emergency stop and queue reset.');

    // 1. Clear forward batch buffers
    const forwardCleared = forwardBatchManager.clearAllBuffers();

    // 2. Clear all active workers and reset mutex
    this.activeItemIds.clear();
    this.channelPublishMutex = Promise.resolve();

    // 3. Mark all ongoing and queued items as cancelled
    const queue = store.getQueue();
    let cancelledCount = 0;
    for (const item of queue) {
      if (item.status !== 'published' && item.status !== 'failed') {
        store.updateQueueItem(item.id, {
          status: 'failed',
          statusMessage: '🛑 تم إيقاف العملية وإلغاؤها بناءً على طلب المستخدم.',
          error: 'تم الإيقاف بواسطة زر إيقاف الطوارئ',
          completedAt: Date.now(),
        });
        cancelledCount++;
      }
    }

    // 4. Purge temporary downloads and processed files
    try {
      const tempDownloads = path.join(process.cwd(), 'data', 'temp', 'downloads');
      const tempProcessed = path.join(process.cwd(), 'data', 'temp', 'processed');
      [tempDownloads, tempProcessed].forEach((dir) => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            try {
              fs.unlinkSync(path.join(dir, file));
            } catch {}
          }
        }
      });
    } catch (cleanErr) {
      console.warn('Emergency clean temp files error:', cleanErr);
    }

    store.notifyStatusChanged();
    store.save(true);

    return { cancelledCount: cancelledCount + forwardCleared };
  }

  /**
   * Mutex lock wrapper to serialize channel publishing operations.
   */
  private async withPublishLock<T>(fn: () => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const waitPromise = this.channelPublishMutex;
    this.channelPublishMutex = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await waitPromise;
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  }

  /**
   * Pre-analyze future items in the queue concurrently in the background (batches of up to 15).
   */
  private async prewarmQueuedItems() {
    if (this.isPrewarming) return;
    const now = Date.now();
    if (now - this.lastPrewarmTime < 4000) return;

    const config = store.getConfig();
    if (config.turboSpeed && !config.turboSpeed.preloadNextItem) return;

    const queue = store.getQueue();
    const pendingAiItems = queue.filter(
      (q) =>
        (q.type === 'video' || q.type === 'audio' || q.type === 'document') &&
        q.status === 'queued' &&
        (!q.processedFilename || !q.processedCaption)
    );

    if (pendingAiItems.length === 0 || !config.aiRenaming.enabled) return;

    this.isPrewarming = true;
    this.lastPrewarmTime = now;

    try {
      const itemsToBatch = pendingAiItems.slice(0, 15);
      const results = await batchAnalyzeAndRenameWithAI(
        itemsToBatch.map((q) => {
          const qUser = store.getUser(q.userId);
          const fWords = qUser?.forbiddenWords || [];
          return {
            id: q.id,
            originalFilename: removeForbiddenWords(q.originalFilename || (q.type === 'audio' ? 'Audio.mp3' : q.type === 'document' ? 'Document.pdf' : 'video.mp4'), fWords),
            originalCaption: removeForbiddenWords(q.originalCaption || '', fWords),
            duration: q.duration,
            sequenceNumber: q.sequenceNumber,
            mimeType: q.mimeType,
            fileSize: q.fileSize,
          };
        }),
        config.aiRenaming
      );

      for (const res of results) {
        const qItem = store.getQueueItem(res.id);
        const qUser = qItem ? store.getUser(qItem.userId) : null;
        const finalFilename = processActualFilename(res.formattedFilename, qUser);
        let finalCaption = removeForbiddenWords(res.formattedCaption, qUser?.forbiddenWords || []);
        if (qUser?.captionPrefix && !finalCaption.startsWith(qUser.captionPrefix.trim())) {
          finalCaption = `${qUser.captionPrefix.trim()}\n${finalCaption}`.trim();
        }
        if (qUser?.captionSuffix && !finalCaption.endsWith(qUser.captionSuffix.trim())) {
          finalCaption = `${finalCaption}\n${qUser.captionSuffix.trim()}`.trim();
        }
        finalCaption = ensureMedPulseLinkInCaption(finalCaption, 4096);

        store.updateQueueItem(res.id, {
          processedFilename: finalFilename,
          processedCaption: finalCaption,
          isAiRenamed: true,
          aiGroupingReason: res.groupingReason,
        });
      }
    } catch (err: any) {
      console.warn('[QueueWorker] prewarmQueuedItems skipped or encountered error:', err?.message || err);
    } finally {
      this.isPrewarming = false;
    }
  }

  /**
   * Main Queue Loop:
   * Dispatches items concurrently up to dynamic `maxConcurrent`, but channel publishing
   * is strictly regulated by `waitForPublishingTurn`.
   */
  private async processNext() {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    try {
      while (true) {
        const maxWorkers = this.getMaxConcurrent();
        if (this.activeItemIds.size >= maxWorkers) {
          // Concurrency limit reached; sleep briefly and re-check
          await new Promise((res) => setTimeout(res, 50));
          continue;
        }

        const queue = store.getQueue();
        const queuedItems = queue
          .filter((item) => item.status === 'queued' && !this.activeItemIds.has(item.id))
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        const nextItem = queuedItems[0];

        if (!nextItem) {
          if (this.activeItemIds.size === 0) {
            break; // No items queued and no workers busy
          }
          await new Promise((res) => setTimeout(res, 100));
          continue;
        }

        // Mark item active and spawn worker
        this.activeItemIds.add(nextItem.id);
        this.prewarmQueuedItems();

        this.processItem(nextItem)
          .catch((err: any) => {
            console.error(`Error processing queue item #${nextItem.sequenceNumber}:`, err);
            store.updateQueueItem(nextItem.id, {
              status: 'failed',
              statusMessage: `فشل: ${err.message || 'خطأ غير متوقع'}`,
              error: err.message,
            });
          })
          .finally(() => {
            this.activeItemIds.delete(nextItem.id);
            this.kick();
          });
      }
    } finally {
      this.isLoopRunning = false;
    }
  }

  /**
   * Strict FIFO Sequential Gate (بوابة النشر التسلسلي الصارم):
   * Ensures this item CANNOT be uploaded or sent to the channel until all prior items
   * (with lower sequenceNumber) have finished publishing or reached a terminal failed state.
   * Zero-latency event driven wake-up!
   */
  private async waitForPublishingTurn(
    item: QueueItem,
    tracker: LiveTelegramProgressReporter
  ): Promise<void> {
    const waitStart = Date.now();
    while (true) {
      const queue = store.getQueue();
      const targetChannel = item.targetChannelId || '';

      // Find any prior items that were received before this item and haven't published yet
      const pendingPrior = queue.filter(
        (q) =>
          q.sequenceNumber < item.sequenceNumber &&
          q.status !== 'published' &&
          q.status !== 'failed' &&
          (!targetChannel || !q.targetChannelId || q.targetChannelId === targetChannel)
      );

      if (pendingPrior.length === 0) {
        // All prior items have been published! It is this item's turn to publish.
        tracker.clearWaiting();
        break;
      }

      // Prior item is still processing or uploading
      const prior = pendingPrior[0];

      // Safety Watchdog: Check if prior item has an active worker
      const isPriorActive = this.activeItemIds.has(prior.id);

      // If prior item is not queued and has no active worker, it was stranded (e.g. from crash or restart) -> recover immediately
      if (!isPriorActive && prior.status !== 'queued') {
        console.warn(`[QueueWatchdog] Prior item #${prior.sequenceNumber} was in status '${prior.status}' with no active worker. Re-queuing to resume publishing.`);
        store.updateQueueItem(prior.id, {
          status: 'queued',
          statusMessage: '⏳ إعادة جدولة في قائمة الانتظار لضمان التسلسل...',
        });
        this.kick();
      }

      if (!isPriorActive && Date.now() - waitStart > 900000) {
        console.warn(`Safety watchdog: Item #${item.sequenceNumber} waited >15min for inactive prior item #${prior.sequenceNumber}. Proceeding.`);
        tracker.clearWaiting();
        break;
      }

      tracker.setWaitingForPrior(prior.sequenceNumber, prior.statusMessage);

      // Event-driven zero-latency wait with 100ms safety timeout
      await new Promise((res) => {
        const t = setTimeout(res, 100);
        const unlisten = () => {
          clearTimeout(t);
          res(null);
        };
        store.onQueueStatusChanged(unlisten);
      });
    }
  }

  private async processItem(item: QueueItem) {
    const config = store.getConfig();
    const token = config.botToken;
    const rawUser = store.getUser(item.userId);

    // Ensure thumbnail is always found, falling back across users if configured via Web UI or admin
    let effectiveThumbnail = rawUser.thumbnail;
    if (!effectiveThumbnail?.url && !effectiveThumbnail?.standard320Path && !effectiveThumbnail?.dataUrl) {
      const fallbackUserWithThumb = Object.values(store.getAllUsers()).find(
        (u) => !!u.thumbnail?.url || !!u.thumbnail?.standard320Path || !!u.thumbnail?.dataUrl
      );
      if (fallbackUserWithThumb?.thumbnail) {
        effectiveThumbnail = fallbackUserWithThumb.thumbnail;
      }
    }
    const user: UserSetting = {
      ...rawUser,
      thumbnail: effectiveThumbnail,
    };

    const chatId = item.chatId;
    const msgId = item.statusTelegramMessageId;

    // 1. Verify Channel & User Admin Privileges
    const channelSetting = user.channel;
    const targetChannel = channelSetting?.chatId || '@MediaHubArabic';
    const channelTitle = channelSetting?.title || 'قناة ميديا العرب الرسمية 🎬';

    // Initialize Interactive Live Progress Reporter (auto updates Telegram message every 3 seconds)
    const tracker = new LiveTelegramProgressReporter({
      token,
      chatId,
      messageId: msgId,
      sequenceNumber: item.sequenceNumber,
      originalFilename: item.originalFilename || item.textContent || 'Media',
      targetChannelTitle: channelTitle,
      targetChannel,
    });

    try {
      if (channelSetting && !channelSetting.publishingEnabled) {
        store.updateQueueItem(item.id, {
          status: 'failed',
          statusMessage: 'النشر متوقف مؤقتاً في إعدادات القناة الخاصة بك',
          error: 'Publishing disabled by user',
        });
        await tracker.finishFailed('خدمة النشر معطلة مؤقتاً في إعدادات القناة الخاصة بك.');
        return;
      }

      // Check admin permissions
      const permCheck = await TelegramService.verifyUserChannelPermissions(
        token,
        targetChannel,
        item.userId
      );
      if (!permCheck.valid) {
        store.updateQueueItem(item.id, {
          status: 'failed',
          statusMessage: `رفض الصلاحيات: ${permCheck.error}`,
          error: permCheck.error,
        });
        await tracker.finishFailed(permCheck.error || 'يجب أن تكون مشرفاً في القناة بن صلاحيات النشر.');
        return;
      }

      // 2. Handle Plain Text Message in Queue (Respects FIFO order)
      if (item.type === 'text') {
        tracker.updateProgress('المعالجة مكتملة - بانتظار دور النشر', 90, 'تحضير الرسالة النصية');
        store.updateQueueItem(item.id, {
          status: 'ready_to_publish',
          statusMessage: '⏳ بانتظار دور النشر التسلسلي',
        });

        // Wait for prior items
        await this.waitForPublishingTurn(item, tracker);

        // Acquire publishing lock to publish text
        await this.withPublishLock(async () => {
          store.updateQueueItem(item.id, {
            status: 'uploading',
            statusMessage: '📤 جاري نشر الرسالة النصية في القناة...',
          });
          tracker.updateProgress('📤 جاري نشر الرسالة في القناة', 100, `القناة: ${channelTitle}`);

          if (token) {
            await TelegramService.sendMessage(token, targetChannel, item.textContent || '');
          }

          const post: ChannelPost = {
            id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            queueItemId: item.id,
            sequenceNumber: item.sequenceNumber,
            channelId: targetChannel,
            channelTitle,
            publisherUserId: item.userId,
            publisherName: item.userFirstName,
            type: 'text',
            title: 'رسالة نصية',
            text: item.textContent,
            caption: item.textContent,
            publishedAt: Date.now(),
            viewsCount: 1,
          };
          store.addChannelPost(post);

          store.updateQueueItem(item.id, {
            status: 'published',
            statusMessage: '✅ تم نشر الرسالة في القناة بنجاح',
            completedAt: Date.now(),
          });

          await tracker.finishSuccess({
            processedFilename: 'رسالة نصية',
            caption: item.textContent || '',
            hasCustomThumb: false,
            channelTitle,
            targetChannel,
          });
        });
        return;
      }

      // 3. Handle Video, Audio, or Document Media File through Full Pipeline
      const isVideo = item.type === 'video' || /\.(mp4|mkv|mov|avi|flv|webm)$/i.test(item.originalFilename || '') || /\.(mp4|mkv|mov|avi|flv|webm)$/i.test(item.processedFilename || '');
      const isAudio = item.type === 'audio' || /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(item.originalFilename || '') || /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(item.processedFilename || '');
      const defaultFilename = isVideo ? 'Video.mp4' : (isAudio ? 'Audio.mp3' : 'Document.pdf');
      const originalName = item.originalFilename || defaultFilename;
      const fileSize = item.fileSize || (isAudio ? 15 * 1024 * 1024 : 45 * 1024 * 1024);

      // Stage 1: 📥 استلام وتجهيز الملف
      store.updateQueueItem(item.id, {
        status: 'receiving',
        statusMessage: '📥 استلام وتجهيز الملف',
      });
      tracker.updateProgress(
        '📥 استلام وتجهيز الملف',
        10,
        `الحجم: ${(fileSize / (1024 * 1024)).toFixed(1)} MB`
      );

      // Prepare custom thumbnail if configured
      let thumbPrep = await FileProcessor.prepareThumbnail(token, user);
      if (!thumbPrep && (user.thumbnail?.url || user.thumbnail?.dataUrl)) {
        try {
          const std = await FileProcessor.standardizeThumbnail(user.thumbnail.url || user.thumbnail.dataUrl!, user.userId);
          if (std) {
            thumbPrep = { standard320Path: std.standard320Path, masterPath: std.masterPath, dataUrl: std.dataUrl };
          }
        } catch {}
      }

      const thumbStandardPath = thumbPrep?.standard320Path || user.thumbnail?.standard320Path || null;
      const thumbMasterPath = thumbPrep?.masterPath || null;
      const hasCustomThumb = !!thumbPrep || !!user.thumbnail?.url || !!user.thumbnail?.fileId || !!user.thumbnail?.standard320Path;

      const hasThumbnailToApply =
        hasCustomThumb ||
        !!thumbStandardPath ||
        !!thumbMasterPath ||
        !!user.thumbnail?.url ||
        !!user.thumbnail?.fileId ||
        !!user.thumbnail?.standard320Path;

      // Stage: 🖼️ تجهيز الصورة المصغرة
      store.updateQueueItem(item.id, {
        thumbnailUrl: thumbPrep?.dataUrl || user.thumbnail?.url,
        hasCustomThumbnail: hasCustomThumb,
      });

      // Stage: ✏️ استخراج الاسم الذكي (AI Renaming or Pattern Engine + Forbidden Words Filter)
      let processedFilename = item.processedFilename;
      let itemProcessedCaption = item.processedCaption;
      let isAiRenamed = !!item.isAiRenamed;
      let aiReason = item.aiGroupingReason || '';

      const botConfig = store.getConfig();
      if (botConfig.aiRenaming.enabled) {
        if (!processedFilename || !itemProcessedCaption) {
          try {
            const batchPending = store.getQueue().filter(
              (q) => q.userId === user.userId && (q.status === 'queued' || q.status === 'processing' || q.id === item.id)
            );
            const aiResults = await batchAnalyzeAndRenameWithAI(
              batchPending.map((q) => {
                const qUser = store.getUser(q.userId) || user;
                const fWords = qUser?.forbiddenWords || [];
                return {
                  id: q.id,
                  originalFilename: removeForbiddenWords(q.originalFilename || (q.type === 'audio' ? 'Audio.mp3' : q.type === 'document' ? 'Document.pdf' : 'video.mp4'), fWords),
                  originalCaption: removeForbiddenWords(q.originalCaption || '', fWords),
                  duration: q.duration,
                  sequenceNumber: q.sequenceNumber,
                  mimeType: q.mimeType,
                  fileSize: q.fileSize,
                };
              }),
              botConfig.aiRenaming
            );

            for (const res of aiResults) {
              const qItem = store.getQueueItem(res.id);
              const qUser = qItem ? store.getUser(qItem.userId) : user;
              const formattedName = processActualFilename(res.formattedFilename, qUser);
              let formattedCaption = removeForbiddenWords(res.formattedCaption, qUser?.forbiddenWords || []);
              if (qUser?.captionPrefix && !formattedCaption.startsWith(qUser.captionPrefix.trim())) {
                formattedCaption = `${qUser.captionPrefix.trim()}\n${formattedCaption}`.trim();
              }
              if (qUser?.captionSuffix && !formattedCaption.endsWith(qUser.captionSuffix.trim())) {
                formattedCaption = `${formattedCaption}\n${qUser.captionSuffix.trim()}`.trim();
              }
              formattedCaption = ensureMedPulseLinkInCaption(formattedCaption, 4096);

              store.updateQueueItem(res.id, {
                processedFilename: formattedName,
                processedCaption: formattedCaption,
                isAiRenamed: true,
                aiGroupingReason: res.groupingReason,
              });
              if (res.id === item.id) {
                processedFilename = formattedName;
                itemProcessedCaption = formattedCaption;
                isAiRenamed = true;
                aiReason = res.groupingReason || '';
              }
            }
          } catch (aiErr) {
            console.warn('Queue worker AI batch rename error:', aiErr);
          }
        }
      }

      // Guarantee that user settings (forbidden words, prefix, suffix, tag) are ALWAYS enforced on filename
      if (!processedFilename) {
        processedFilename = processActualFilename(originalName, user);
      } else {
        processedFilename = processActualFilename(processedFilename, user);
      }

      // Format caption with user settings & MedPulse link
      let processedCaption = '';
      if (isAiRenamed && itemProcessedCaption) {
        processedCaption = removeForbiddenWords(itemProcessedCaption, user.forbiddenWords || []);
        if (user.captionPrefix && !processedCaption.startsWith(user.captionPrefix.trim())) {
          processedCaption = `${user.captionPrefix.trim()}\n${processedCaption}`.trim();
        }
        if (user.captionSuffix && !processedCaption.endsWith(user.captionSuffix.trim())) {
          processedCaption = `${processedCaption}\n${user.captionSuffix.trim()}`.trim();
        }
      } else {
        processedCaption = processActualCaption(item.originalCaption, user, originalName);
      }
      processedCaption = ensureMedPulseLinkInCaption(processedCaption, 4096);

      store.updateQueueItem(item.id, {
        processedFilename,
        processedCaption,
        isAiRenamed,
        aiGroupingReason: aiReason,
      });

      // =========================================================================
      // TURBO CLOUD DIRECT DISPATCH
      // Cloud direct dispatch (sending via fileId) can ONLY be used if:
      // 1. There is NO custom thumbnail to attach or embed (Telegram ignores thumbnails on fileId!)
      // 2. The filename has not been altered for documents
      // 3. User has explicitly enabled cloud direct dispatch
      // =========================================================================
      const canCloudDirect =
        !hasThumbnailToApply &&
        botConfig.turboSpeed?.cloudDirectDispatch !== false &&
        item.fileId &&
        !item.fileId.startsWith('fake_') &&
        (!isVideo && !isAudio ? processedFilename === originalName : true);

      let directDispatchSucceeded = false;

      if (canCloudDirect) {
        tracker.updateProgress(
          '⚡ تجهيز النقل السحابي الفوري',
          90,
          'محرك 16 خيط فائق السرعة جاهز'
        );

        // Transition to ready_to_publish immediately
        store.updateQueueItem(item.id, {
          status: 'ready_to_publish',
          statusMessage: '⏳ جاهز للنشر السحابي الفوري - بانتظار الدور',
        });

        // Strict FIFO publishing gate
        await this.waitForPublishingTurn(item, tracker);

        // Acquire publishing lock
        await this.withPublishLock(async () => {
          store.updateQueueItem(item.id, {
            status: 'uploading',
            statusMessage: '🚀 جاري النقل السحابي الفوري إلى القناة...',
          });
          tracker.updateProgress(
            '🚀 جاري النقل السحابي الفوري إلى القناة...',
            100,
            `القناة: ${channelTitle} (#${item.sequenceNumber})`,
            true,
            120 // ~120 MB/s equivalent cloud throughput
          );

          if (token && targetChannel !== '@MediaHubArabic') {
            const uploadRes = await FileProcessor.uploadProcessedFileToTelegram(
              token,
              targetChannel,
              null, // Direct cloud dispatch with fileId
              item.fileId,
              processedFilename,
              processedCaption,
              thumbStandardPath,
              isVideo,
              item.duration,
              item.width,
              item.height,
              isAudio,
              item.performer,
              item.title
            );

            if (uploadRes.ok) {
              directDispatchSucceeded = true;
            } else {
              console.warn('Direct cloud dispatch was rejected, falling back to physical pipeline:', uploadRes.description);
            }
          } else {
            // Local simulation
            directDispatchSucceeded = true;
          }

          if (directDispatchSucceeded) {
            const post: ChannelPost = {
              id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              queueItemId: item.id,
              sequenceNumber: item.sequenceNumber,
              channelId: targetChannel,
              channelTitle,
              publisherUserId: item.userId,
              publisherName: item.userFirstName,
              type: item.type,
              fileId: item.fileId,
              duration: item.duration,
              width: item.width,
              height: item.height,
              performer: item.performer,
              title: item.title || processedFilename,
              filename: processedFilename,
              caption: processedCaption,
              thumbnailUrl:
                thumbPrep?.dataUrl ||
                user.thumbnail?.url ||
                'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
              hasCustomThumbnail: hasCustomThumb,
              mediaUrl: item.mediaUrl,
              fileSize,
              publishedAt: Date.now(),
              viewsCount: 1,
            };
            store.addChannelPost(post);

            store.updateQueueItem(item.id, {
              status: 'published',
              statusMessage: '✅ تم نشر الملف بنجاح فائق السرعة',
              hasCustomThumbnail: hasCustomThumb,
              completedAt: Date.now(),
            });

            await tracker.finishSuccess({
              processedFilename,
              caption: processedCaption,
              hasCustomThumb,
              channelTitle,
              targetChannel,
            });
          }
        });

        if (directDispatchSucceeded) {
          return;
        }
      }

      // =========================================================================
      // PHYSICAL TURBO PIPELINE (16-Worker MTProto Parallel Engine)
      // Used when file needs physical transcoding or direct dispatch was unavailable
      // =========================================================================

      // Stage 2: ⬇️ تحميل الملف من تليجرام
      store.updateQueueItem(item.id, {
        status: 'downloading',
        statusMessage: '⬇️ تحميل الملف بأقصى سرعة...',
      });

      const releaseDownload = await this.downloadSemaphore.acquire();
      let downloadResult;
      try {
        downloadResult = await FileProcessor.downloadOriginalFile(
          token,
          item.fileId,
          originalName,
          async (pct, speed) => {
            tracker.updateProgress(
              '⬇️ تحميل الملف من تليجرام',
              10 + Math.round(pct * 0.35),
              speed ? `سرعة التحميل: ${speed} MB/s` : `تم جلب ${pct}% من وسائط الملف`,
              false,
              speed
            );
          },
          item.chatId,
          item.messageId
        );
      } finally {
        releaseDownload();
      }

      // Stage 3: 🛠️ معالجة الملف ودمج الغلاف
      store.updateQueueItem(item.id, {
        status: 'processing',
        statusMessage: '🛠️ معالجة الملف',
      });
      tracker.updateProgress('⚙️ دمج الغلاف في الوسائط (FFmpeg)', 75, 'إنشاء ملف الإخراج النهائي');

      const releaseFFmpeg = await this.ffmpegSemaphore.acquire();
      let processRes;
      try {
        processRes = await FileProcessor.processAndEmbedThumbnail(
          downloadResult.localPath,
          thumbMasterPath || thumbStandardPath,
          processedFilename,
          isVideo,
          isAudio,
          `item_${item.sequenceNumber}_${item.id}`
        );
      } finally {
        releaseFFmpeg();
      }

      // Verification before publishing
      if (!processRes.success && !item.fileId) {
        throw new Error(processRes.error || 'فشلت معالجة الملف ولم يتم اجتياز اختبار التحقق');
      }

      // Stage 7: ✅ اكتملت المعالجة بنجاح 100% -> الانتقال لوضع الانتظار التسلسلي (ready_to_publish)
      store.updateQueueItem(item.id, {
        status: 'ready_to_publish',
        statusMessage: '⏳ اكتملت المعالجة - بانتظار دور النشر التسلسلي',
      });
      tracker.updateProgress(
        '✅ اكتملت المعالجة بنجاح 100%',
        100,
        'جاهز للنشر - بانتظار الترتيب التسلسلي الصارم'
      );

      // STRICT FIFO PUBLISHING GATE
      await this.waitForPublishingTurn(item, tracker);

      // ACQUIRE SERIALIZED PUBLISHING LOCK
      await this.withPublishLock(async () => {
        // Stage 8: 📤 جاري إرسال الملف إلى القناة...
        store.updateQueueItem(item.id, {
          status: 'uploading',
          statusMessage: '📤 جاري إرسال الملف إلى القناة...',
        });
        tracker.updateProgress(
          '📤 جاري إرسال الملف إلى القناة...',
          100,
          `القناة: ${channelTitle} (#${item.sequenceNumber})`,
          true
        );

        let wasPhysicalUpload = false;

        // If real Telegram bot token is configured and target is a real channel, upload the processed file
        if (token && targetChannel !== '@MediaHubArabic') {
          const uploadRes = await FileProcessor.uploadProcessedFileToTelegram(
            token,
            targetChannel,
            processRes.outputPath,
            item.fileId,
            processedFilename,
            processedCaption,
            thumbStandardPath || thumbMasterPath,
            isVideo,
            item.duration,
            item.width,
            item.height,
            isAudio,
            item.performer,
            item.title
          );

          if (!uploadRes.ok) {
            throw new Error(uploadRes.description || 'فشل إرسال الملف المعالج إلى القناة');
          }
          wasPhysicalUpload = uploadRes.wasPhysicalUpload;
        } else {
          wasPhysicalUpload = true;
        }

        // Clean up temporary local files
        FileProcessor.cleanupTempFiles([downloadResult.localPath, processRes.outputPath]);

        // Record in Published Channel Posts
        const post: ChannelPost = {
          id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          queueItemId: item.id,
          sequenceNumber: item.sequenceNumber,
          channelId: targetChannel,
          channelTitle,
          publisherUserId: item.userId,
          publisherName: item.userFirstName,
          type: item.type,
          fileId: item.fileId,
          duration: item.duration,
          width: item.width,
          height: item.height,
          performer: item.performer,
          title: item.title || processedFilename,
          filename: processedFilename,
          caption: processedCaption,
          thumbnailUrl:
            thumbPrep?.dataUrl ||
            user.thumbnail?.url ||
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
          hasCustomThumbnail: hasCustomThumb,
          mediaUrl: item.mediaUrl,
          fileSize,
          publishedAt: Date.now(),
          viewsCount: 1,
        };
        store.addChannelPost(post);

        // Stage 9: ✅ تم نشر الملف بنجاح وفق الترتيب الصارم
        store.updateQueueItem(item.id, {
          status: 'published',
          statusMessage: '✅ تم نشر الملف بنجاح',
          hasCustomThumbnail: hasCustomThumb,
          completedAt: Date.now(),
        });

        await tracker.finishSuccess({
          processedFilename,
          caption: processedCaption,
          hasCustomThumb,
          channelTitle,
          targetChannel,
        });
      });
    } catch (err: any) {
      console.error(`Error processing queue item #${item.sequenceNumber}:`, err);
      store.updateQueueItem(item.id, {
        status: 'failed',
        statusMessage: `فشل: ${err.message || 'خطأ غير متوقع'}`,
        error: err.message,
      });
      await tracker.finishFailed(err.message || 'حدث خطأ غير متوقع أثناء معالجة الملف.');
    }
  }
}

export const queueWorker = new QueueWorker();
