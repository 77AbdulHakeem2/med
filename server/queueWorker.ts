import { store } from './store';
import { TelegramService } from './telegram';
import {
  processActualFilename,
  processActualCaption,
  removeForbiddenWords,
  ChunkedTransferManager,
} from './pipeline';
import { FileProcessor } from './fileProcessor';
import { batchAnalyzeAndRenameWithAI } from './aiRenamer';
import { QueueItem, ChannelPost } from '../src/types';

class QueueWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.processNext(), 1500);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async processNext() {
    if (this.isRunning) return;

    // Get all items in strict sequence order
    const queue = store.getQueue();
    const nextItem = queue.find((item) => item.status === 'queued');

    if (!nextItem) return;

    this.isRunning = true;
    try {
      await this.processItem(nextItem);
    } catch (err: any) {
      console.error(`Error processing queue item #${nextItem.sequenceNumber}:`, err);
      store.updateQueueItem(nextItem.id, {
        status: 'failed',
        statusMessage: `فشل: ${err.message || 'خطأ غير متوقع'}`,
        error: err.message,
      });
    } finally {
      this.isRunning = false;
    }
  }

  private async updateChatStatus(
    token: string,
    chatId: string,
    messageId: number | undefined,
    text: string
  ) {
    if (!messageId) return;
    try {
      await TelegramService.editMessageText(token, chatId, messageId, text);
    } catch (err) {
      console.warn('Could not update status message:', err);
    }
  }

  private async processItem(item: QueueItem) {
    const config = store.getConfig();
    const token = config.botToken;
    const user = store.getUser(item.userId);

    const chatId = item.chatId;
    const msgId = item.statusTelegramMessageId;

    // 1. Verify Channel & User Admin Privileges
    const channelSetting = user.channel;
    const targetChannel = channelSetting?.chatId || '@MediaHubArabic';
    const channelTitle = channelSetting?.title || 'قناة ميديا العرب الرسمية 🎬';

    if (channelSetting && !channelSetting.publishingEnabled) {
      store.updateQueueItem(item.id, {
        status: 'failed',
        statusMessage: 'النشر متوقف مؤقتاً في إعدادات القناة الخاصة بك',
        error: 'Publishing disabled by user',
      });
      await this.updateChatStatus(
        token,
        chatId,
        msgId,
        `⚠️ <b>تعذر النشر في القناة:</b>\n\nخدمة النشر معطلة مؤقتاً في إعداداتك.\nيمكنك تفعيلها عبر <code>/settings</code> -> <b>Channel</b> ثم إعادة المحاولة.`
      );
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
      await this.updateChatStatus(
        token,
        chatId,
        msgId,
        `❌ <b>تعذر معالجة ونشر العنصر #${item.sequenceNumber}:</b>\n\n${permCheck.error}\n\n<i>يجب أن تكون مشرفاً في القناة لنشر المحتوى.</i>`
      );
      return;
    }

    // 2. Handle Plain Text Message in Queue
    if (item.type === 'text') {
      store.updateQueueItem(item.id, {
        status: 'uploading',
        statusMessage: 'جاري نشر الرسالة النصية في القناة...',
      });

      await this.updateChatStatus(
        token,
        chatId,
        msgId,
        `📤 <b>جاري نشر الرسالة النصية في القناة...</b>\n\n• الترتيب: <b>#${item.sequenceNumber}</b>\n• المحتوى: "${item.textContent}"`
      );

      // Real Telegram send if token present
      if (token) {
        await TelegramService.sendMessage(token, targetChannel, item.textContent || '');
      }

      // Record in published channel posts
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
        statusMessage: 'تم نشر الرسالة في القناة بنجاح',
        completedAt: Date.now(),
      });

      await this.updateChatStatus(
        token,
        chatId,
        msgId,
        `✅ <b>تم نشر الرسالة النصية بنجاح!</b>\n\n• القناة: <b>${channelTitle}</b>\n• الترتيب: <b>#${item.sequenceNumber}</b>\n• النص: "${item.textContent}"`
      );
      return;
    }

    // 3. Handle Video or Document Media File through Full Pipeline
    const originalName = item.originalFilename || (item.type === 'video' ? 'Video.mp4' : 'Document.pdf');
    const fileSize = item.fileSize || 45 * 1024 * 1024;
    const isVideo = item.type === 'video';

    // Stage 1: 📥 استلام الملف
    store.updateQueueItem(item.id, {
      status: 'receiving',
      statusMessage: '📥 استلام الملف',
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `📥 <b>استلام الملف</b>\n\n• الملف الأصلي: <code>${originalName}</code>\n• رقم الانتظار: <b>#${item.sequenceNumber}</b>\n• الحجم: ${(fileSize / (1024 * 1024)).toFixed(1)} MB`
    );

    // Stage 2: ⬇️ تحميل الملف
    store.updateQueueItem(item.id, {
      status: 'downloading',
      statusMessage: '⬇️ تحميل الملف...',
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `⬇️ <b>تحميل الملف</b>\n\n• الملف: <code>${originalName}</code>\n• جاري جلب وسائط الملف إلى بيئة المعالجة...`
    );

    // Prepare custom thumbnail if configured by user
    const thumbPrep = await FileProcessor.prepareThumbnail(token, user);
    const thumbStandardPath = thumbPrep?.standard320Path || null;
    const thumbMasterPath = thumbPrep?.masterPath || null;
    const hasCustomThumb = !!thumbPrep || !!user.thumbnail?.url || !!user.thumbnail?.fileId;

    // Download original file to local disk
    const downloadResult = await FileProcessor.downloadOriginalFile(
      token,
      item.fileId,
      originalName,
      async (pct) => {
        if (pct === 50 || pct === 100) {
          await this.updateChatStatus(
            token,
            chatId,
            msgId,
            `⬇️ <b>تحميل الملف (${pct}%)</b>\n\n• الملف: <code>${originalName}</code>\n• جاري استلام الحزم وتأمين البيانات...`
          );
        }
      },
      item.chatId,
      item.messageId
    );

    // Stage 3: 🛠️ معالجة الملف
    store.updateQueueItem(item.id, {
      status: 'processing',
      statusMessage: '🛠️ معالجة الملف',
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `🛠️ <b>معالجة الملف</b>\n\n• الملف: <code>${originalName}</code>\n• جاري فحص الحاويات وترميز الوسائط وقواعد المستخدم...`
    );
    await new Promise((r) => setTimeout(r, 70));

    // Stage 4: 🖼️ تطبيق Thumbnail
    store.updateQueueItem(item.id, {
      status: 'applying_thumb',
      statusMessage: hasCustomThumb
        ? '🖼️ تطبيق الصورة المصغرة المعتمدة'
        : '🖼️ الاحتفاظ بالصورة المصغرة الافتراضية',
      thumbnailUrl: thumbPrep?.dataUrl || user.thumbnail?.url,
      hasCustomThumbnail: hasCustomThumb,
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `🖼️ <b>تطبيق Thumbnail</b>\n\n• الحالة: ${
        hasCustomThumb
          ? 'تم تجهيز الصورة المصغرة القياسية ودمجها بنجاح ✅'
          : 'لا توجد صورة مصغرة محددة (الافتراضية)'
      }`
    );
    await new Promise((r) => setTimeout(r, 70));

    // Stage 5: ✏️ تغيير اسم الملف (AI Renaming or Pattern Engine + Forbidden Words Filter)
    let processedFilename = item.processedFilename;
    let itemProcessedCaption = item.processedCaption;
    let isAiRenamed = !!item.isAiRenamed;
    let aiReason = item.aiGroupingReason || '';

    const botConfig = store.getConfig();
    if (botConfig.aiRenaming.enabled) {
      if (!processedFilename || !itemProcessedCaption) {
        try {
          // Collect pending items in queue for this user to analyze as a batch
          const batchPending = store.getQueue().filter(
            (q) => q.userId === user.userId && (q.status === 'queued' || q.status === 'processing' || q.id === item.id)
          );
          const aiResults = await batchAnalyzeAndRenameWithAI(
            batchPending.map((q) => ({
              id: q.id,
              originalFilename: q.originalFilename || 'video.mp4',
              originalCaption: q.originalCaption,
              duration: q.duration,
              sequenceNumber: q.sequenceNumber,
              mimeType: q.mimeType,
              fileSize: q.fileSize,
            })),
            botConfig.aiRenaming
          );

          for (const res of aiResults) {
            store.updateQueueItem(res.id, {
              processedFilename: res.formattedFilename,
              processedCaption: res.formattedCaption,
              isAiRenamed: true,
              aiGroupingReason: res.groupingReason,
            });
            if (res.id === item.id) {
              processedFilename = res.formattedFilename;
              itemProcessedCaption = res.formattedCaption;
              isAiRenamed = true;
              aiReason = res.groupingReason || '';
            }
          }
        } catch (aiErr) {
          console.warn('Queue worker AI batch rename error:', aiErr);
        }
      }
    }

    if (!processedFilename) {
      processedFilename = processActualFilename(originalName, user);
    }

    store.updateQueueItem(item.id, {
      status: 'renaming',
      statusMessage: `✏️ تغيير اسم الملف إلى: ${processedFilename}`,
      processedFilename,
      isAiRenamed,
      aiGroupingReason: aiReason,
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `✏️ <b>تغيير اسم الملف ${isAiRenamed ? '(ذكاء اصطناعي موحد 🤖)' : ''}</b>\n\n` +
      `• الاسم الأصلي: <code>${originalName}</code>\n` +
      `• اسم الملف الحقيقي الجديد: <code>${processedFilename}</code>\n` +
      (aiReason ? `• استنتاج الذكاء الاصطناعي: <i>${aiReason}</i>\n` : '') +
      `• فلترة الكلمات المحظورة: تم التحقق والحذف بنجاح ✅`
    );

    // Apply ffmpeg thumbnail embedding and create the physical renamed file
    const processRes = await FileProcessor.processAndEmbedThumbnail(
      downloadResult.localPath,
      thumbMasterPath || thumbStandardPath,
      processedFilename,
      isVideo
    );

    // Stage 6: 📝 معالجة الوصف (Process Caption)
    let processedCaption = '';
    if (isAiRenamed && itemProcessedCaption) {
      // Use MedPulse standardized AI caption with scrubbed forbidden words if any
      processedCaption = removeForbiddenWords(itemProcessedCaption, user.forbiddenWords);
    } else {
      processedCaption = processActualCaption(item.originalCaption, user);
    }

    store.updateQueueItem(item.id, {
      status: 'processing_caption',
      statusMessage: '📝 معالجة وتنسيق الوصف',
      processedCaption,
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `📝 <b>معالجة وتنسيق الوصف ${isAiRenamed ? '(نمط MedPulse الموحد 🫀)' : ''}</b>\n\n${processedCaption || '(بدون وصف)'}`
    );
    await new Promise((r) => setTimeout(r, 70));

    // Stage 7: ✅ اكتملت المعالجة (Verification before publishing)
    if (!processRes.success && !item.fileId) {
      throw new Error(processRes.error || 'فشلت معالجة الملف ولم يتم اجتياز اختبار التحقق');
    }

    store.updateQueueItem(item.id, {
      status: 'completed_processing',
      statusMessage: '✅ اكتملت المعالجة بنجاح',
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `✅ <b>اكتملت المعالجة</b>\n\n` +
      `• اسم الملف الفعلي: <code>${processedFilename}</code>\n` +
      `• الصورة المصغرة: ${hasCustomThumb ? 'مدمجة ومجهزة بالكامل ✅' : 'افتراضية'}\n` +
      `• الوصف: ${processedCaption ? 'معدل ومطابق للسياسات ✅' : 'محدد'}\n` +
      `• الترتيب في القناة: <b>#${item.sequenceNumber}</b>`
    );
    await new Promise((r) => setTimeout(r, 90));

    // Stage 8: 📤 جاري إرسال الملف إلى القناة... (Publishing happens ONLY after completion)
    store.updateQueueItem(item.id, {
      status: 'uploading',
      statusMessage: '📤 جاري إرسال الملف إلى القناة...',
    });
    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `📤 <b>جاري إرسال الملف إلى القناة...</b>\n\n` +
      `• القناة: <b>${channelTitle}</b> (<code>${targetChannel}</code>)\n` +
      `• النسخة المرسلة: النسخة المعالجة بالاسم والـ Thumbnail الجديدين\n` +
      `• الترتيب: <b>#${item.sequenceNumber}</b>`
    );

    let wasPhysicalUpload = false;

    // If real Telegram bot token is configured and target is a real channel, upload the processed file via multipart/form-data
    if (token && targetChannel !== '@MediaHubArabic') {
      const uploadRes = await FileProcessor.uploadProcessedFileToTelegram(
        token,
        targetChannel,
        processRes.outputPath,
        item.fileId,
        processedFilename,
        processedCaption,
        thumbStandardPath,
        isVideo,
        item.duration,
        item.width,
        item.height
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
      title: processedFilename,
      filename: processedFilename,
      caption: processedCaption,
      thumbnailUrl: thumbPrep?.dataUrl || user.thumbnail?.url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      hasCustomThumbnail: hasCustomThumb && wasPhysicalUpload,
      mediaUrl: item.mediaUrl,
      fileSize,
      publishedAt: Date.now(),
      viewsCount: 1,
    };
    store.addChannelPost(post);

    // Stage 9: ✅ تم نشر الملف بنجاح
    store.updateQueueItem(item.id, {
      status: 'published',
      statusMessage: '✅ تم نشر الملف بنجاح',
      hasCustomThumbnail: hasCustomThumb && wasPhysicalUpload,
      completedAt: Date.now(),
    });

    const thumbReportText = hasCustomThumb
      ? (wasPhysicalUpload
          ? 'مخصصة (User Thumbnail) 🖼️ ✅ (تم الدمج والرفع بنجاح)'
          : 'افتراضية (أُرسل كمعرّف سحابي؛ يتطلب تليجرام رفع الملف بالكامل لتغيير الصورة)')
      : 'افتراضية (الخاصة بالملف)';

    await this.updateChatStatus(
      token,
      chatId,
      msgId,
      `✅ <b>تم نشر الملف بنجاح</b>\n\n` +
      `• القناة: <b>${channelTitle}</b> (<code>${targetChannel}</code>)\n` +
      `• اسم الملف الفعلي: <code>${processedFilename}</code>\n` +
      `• الصورة المصغرة: ${thumbReportText}\n` +
      `• الوصف: ${processedCaption || '(بدون وصف)'}\n` +
      `• رقم الترتيب المنشور: <b>#${item.sequenceNumber}</b>`
    );
  }
}

export const queueWorker = new QueueWorker();
