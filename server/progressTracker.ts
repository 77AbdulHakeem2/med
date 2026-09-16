import { TelegramService } from './telegram';
import { MEDPULSE_LINK, MEDPULSE_ANCHOR } from './aiRenamer';
import { store } from './store';

export function formatProgressBar(percent: number, barLength = 12): string {
  const p = Math.min(100, Math.max(0, Math.round(percent)));
  const filled = Math.min(barLength, Math.round((p / 100) * barLength));
  const empty = barLength - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${p}%`;
}

export interface LiveTrackerOptions {
  token: string;
  chatId: string;
  messageId: number | undefined;
  sequenceNumber: number;
  originalFilename: string;
  targetChannelTitle: string;
  targetChannel: string;
}

/**
 * Interactive Live Progress Indicator for Telegram Chat
 * Automatically refreshes status and interactive progress bar every 3 seconds
 * "مؤشر حي وتفاعلي يوضح مدى تقدم المعالجة ويظهر داخل محادثة البوت مع التحديث كل 3 ثوانٍ"
 */
export class LiveTelegramProgressReporter {
  private token: string;
  private chatId: string;
  private messageId: number | undefined;
  private sequenceNumber: number;
  private originalFilename: string;
  private targetChannelTitle: string;
  private targetChannel: string;

  private startTime = Date.now();
  private currentStage = 'بدء استلام وتجهيز الملف 📥';
  private currentPercent = 0;
  private currentDetails = '';
  private currentSpeedMb?: number;
  private waitingForSeq: number | null = null;
  private waitingPriorReason = '';

  private lastRenderedText = '';
  private lastUpdateTime = 0;
  private timer: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  constructor(options: LiveTrackerOptions) {
    this.token = options.token;
    this.chatId = options.chatId;
    this.messageId = options.messageId;
    this.sequenceNumber = options.sequenceNumber;
    this.originalFilename = options.originalFilename;
    this.targetChannelTitle = options.targetChannelTitle;
    this.targetChannel = options.targetChannel;

    // Start 3-second recurring interactive progress update
    if (this.token && this.chatId) {
      this.timer = setInterval(() => {
        this.flushUpdate(false).catch(() => {});
      }, 3000);

      // Send initial frame immediately
      this.flushUpdate(true).catch(() => {});
    }
  }

  public updateProgress(stage: string, percent: number, details = '', force = false, speedMb?: number) {
    this.currentStage = stage;
    this.currentPercent = Math.min(100, Math.max(this.currentPercent, percent));
    this.currentDetails = details;
    if (speedMb !== undefined) {
      this.currentSpeedMb = speedMb;
    }
    this.waitingForSeq = null;

    if (force || Date.now() - this.lastUpdateTime >= 3000) {
      this.flushUpdate(force).catch(() => {});
    }
  }

  public setSpeed(mbps: number) {
    this.currentSpeedMb = mbps;
  }

  public setWaitingForPrior(priorSeq: number, reason = '') {
    this.waitingForSeq = priorSeq;
    this.waitingPriorReason = reason;
    this.currentPercent = 100;
    this.flushUpdate(true).catch(() => {});
  }

  public clearWaiting() {
    this.waitingForSeq = null;
    this.flushUpdate(true).catch(() => {});
  }

  private formatLiveMessage(): string {
    const elapsedSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const p = Math.min(100, Math.max(0, Math.round(this.currentPercent)));
    const progressBar = formatProgressBar(p, 12);
    const speedLine = this.currentSpeedMb && this.currentSpeedMb > 0
      ? `• ⚡ سرعة النقل: <b>${this.currentSpeedMb.toFixed(1)} MB/s</b> (محرك 16 خيط فائق السرعة)\n`
      : '';

    if (this.waitingForSeq !== null) {
      return (
        `⏳ <b>المعالجة مكتملة 100% [بانتظار دور النشر في القناة]</b>\n\n` +
        `${formatProgressBar(100, 12)}\n\n` +
        `• الترتيب في القناة: <b>#${this.sequenceNumber}</b> (تسلسل صارم 🔒)\n` +
        `• الحالة: ⏸️ <b>بانتظار نشر الملف السابق (#${this.waitingForSeq}) أولاً</b>\n` +
        `• التوضيح: تم الانتهاء من التنزيل، وضبط الغلاف والاسم والوصف بنجاح. لن يتم إرسال هذا الملف إلى القناة حتى يكتمل إرسال الملف #${this.waitingForSeq} لضمان الترتيب التام والمنظم داخل القناة.\n` +
        `• القناة: <b>${this.targetChannelTitle}</b> (<code>${this.targetChannel}</code>)\n` +
        `• الرابط المعتمد المضمن: ${MEDPULSE_ANCHOR}\n\n` +
        `⏱️ <i>مؤشر حي تفاعلي يتحدث تلقائياً كل 3 ثوانٍ (${elapsedSec} ثانية)</i>`
      );
    }

    return (
      `⚡ <b>جاري معالجة الملف [#${this.sequenceNumber}]</b>\n\n` +
      `${progressBar}\n\n` +
      `• المرحلة الحالية: <b>${this.currentStage}</b>\n` +
      (this.currentDetails ? `• التفاصيل: <i>${this.currentDetails}</i>\n` : '') +
      speedLine +
      `• الترتيب في القناة: <b>#${this.sequenceNumber}</b> (حفظ الترتيب الصارم 🔒)\n` +
      `• اسم الملف: <code>${this.originalFilename}</code>\n` +
      `• القناة المستهدفة: <b>${this.targetChannelTitle}</b> (<code>${this.targetChannel}</code>)\n` +
      `• الرابط المعتمد المضمن: ${MEDPULSE_ANCHOR}\n\n` +
      `⏱️ <i>مؤشر حي تفاعلي يتحدث تلقائياً كل 3 ثوانٍ (${elapsedSec} ثانية)</i>`
    );
  }

  private async flushUpdate(force = false) {
    if (this.isDestroyed || !this.token || !this.chatId) return;
    const now = Date.now();
    if (!force && now - this.lastUpdateTime < 2800) return;

    const text = this.formatLiveMessage();
    if (text === this.lastRenderedText && this.messageId) return;

    this.lastRenderedText = text;
    this.lastUpdateTime = now;

    try {
      // 1. If we don't have a messageId yet, create the progress message immediately!
      if (!this.messageId) {
        const sendRes = await TelegramService.sendMessage(this.token, this.chatId, text);
        if (sendRes.ok && sendRes.result?.message_id) {
          this.messageId = sendRes.result.message_id;
          store.updateQueueItemBySequence(this.sequenceNumber, {
            statusTelegramMessageId: this.messageId,
          });
        }
        return;
      }

      // 2. We have a messageId, edit it
      const res = await TelegramService.editMessageText(this.token, this.chatId, this.messageId, text);
      if (!res.ok) {
        if (res.description?.includes('retry after')) {
          const match = res.description.match(/retry after (\d+)/i);
          const waitSec = match ? parseInt(match[1], 10) : 3;
          this.lastUpdateTime = now + waitSec * 1000;
        } else if (res.description?.includes('message to edit not found')) {
          // If message was deleted or lost, recreate it!
          const sendRes = await TelegramService.sendMessage(this.token, this.chatId, text);
          if (sendRes.ok && sendRes.result?.message_id) {
            this.messageId = sendRes.result.message_id;
            store.updateQueueItemBySequence(this.sequenceNumber, {
              statusTelegramMessageId: this.messageId,
            });
          }
        }
      }
    } catch {
      // Ignored
    }
  }

  public async finishSuccess(_details?: {
    processedFilename?: string;
    caption?: string;
    hasCustomThumb?: boolean;
    channelTitle?: string;
    targetChannel?: string;
  }) {
    this.destroy();
    if (!this.messageId) return;

    try {
      // Auto-remove the live progress & queue status message from bot chat once published to channel
      await TelegramService.deleteMessage(this.token || '', this.chatId, this.messageId);
    } catch {
      // If delete fails (e.g. Telegram restriction), ignore gracefully
    }
  }

  public async finishFailed(errorMsg: string) {
    this.destroy();
    if (!this.messageId || !this.token) return;

    const text =
      `❌ <b>تعذرت معالجة الملف #${this.sequenceNumber}:</b>\n\n` +
      `• الخطأ: <i>${errorMsg}</i>\n` +
      `• اسم الملف الأصلي: <code>${this.originalFilename}</code>\n` +
      `• تم إيقاف نشر هذا الملف للحفاظ على سلامة القناة.`;

    try {
      await TelegramService.editMessageText(this.token, this.chatId, this.messageId, text);
    } catch {
      // Ignored
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
