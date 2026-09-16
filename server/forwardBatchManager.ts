import { store } from './store';
import { TelegramService } from './telegram';
import { QueueItem, QueueItemType } from '../src/types';

export interface ForwardMetadata {
  isForwarded: boolean;
  sourceChatId?: string | number;
  sourceChannelTitle?: string;
  sourceMessageId?: number;
  forwardDate?: number;
  mediaGroupId?: string;
}

export interface PendingForwardItem {
  id: string;
  token: string;
  userId: string;
  userFirstName: string;
  chatId: string;
  messageId: number;
  type: QueueItemType;
  fileId: string;
  duration?: number;
  width?: number;
  height?: number;
  performer?: string;
  title?: string;
  originalFilename: string;
  originalCaption: string;
  fileSize: number;
  mimeType: string;
  mediaUrl?: string;
  statusTelegramMessageId?: number;
  targetChannelId?: string;
  targetChannelTitle?: string;
  meta: ForwardMetadata;
  receivedAt: number;
}

/**
 * Extracts comprehensive forward provenance metadata from Telegram message.
 * Supports Telegram Bot API 7.0+ (forward_origin) as well as legacy fields.
 */
export function extractForwardMetadata(message: any): ForwardMetadata {
  const mediaGroupId = message.media_group_id ? String(message.media_group_id) : undefined;

  // 1. Telegram Bot API 7.0+ forward_origin object
  if (message.forward_origin) {
    const origin = message.forward_origin;
    if (origin.type === 'channel' && origin.chat) {
      return {
        isForwarded: true,
        sourceChatId: String(origin.chat.id),
        sourceChannelTitle: origin.chat.title || origin.chat.username,
        sourceMessageId: typeof origin.message_id === 'number' ? origin.message_id : undefined,
        forwardDate: origin.date,
        mediaGroupId,
      };
    } else if (origin.type === 'chat' && origin.sender_chat) {
      return {
        isForwarded: true,
        sourceChatId: String(origin.sender_chat.id),
        sourceChannelTitle: origin.sender_chat.title || origin.sender_chat.username,
        sourceMessageId: typeof origin.message_id === 'number' ? origin.message_id : undefined,
        forwardDate: origin.date,
        mediaGroupId,
      };
    } else if (origin.type === 'user' || origin.type === 'hidden_user') {
      return {
        isForwarded: true,
        sourceChatId: origin.sender_user?.id ? String(origin.sender_user.id) : origin.sender_user_name,
        sourceChannelTitle: origin.sender_user?.first_name || origin.sender_user_name,
        sourceMessageId: undefined,
        forwardDate: origin.date,
        mediaGroupId,
      };
    }
  }

  // 2. Legacy Telegram Bot API forward fields
  if (message.forward_from_chat) {
    return {
      isForwarded: true,
      sourceChatId: String(message.forward_from_chat.id),
      sourceChannelTitle: message.forward_from_chat.title || message.forward_from_chat.username,
      sourceMessageId: typeof message.forward_from_message_id === 'number' ? message.forward_from_message_id : undefined,
      forwardDate: message.forward_date,
      mediaGroupId,
    };
  }

  if (message.forward_from) {
    return {
      isForwarded: true,
      sourceChatId: String(message.forward_from.id),
      sourceChannelTitle: message.forward_from.first_name || message.forward_from.username,
      sourceMessageId: typeof message.forward_from_message_id === 'number' ? message.forward_from_message_id : undefined,
      forwardDate: message.forward_date,
      mediaGroupId,
    };
  }

  if (message.forward_date) {
    return {
      isForwarded: true,
      sourceChatId: message.forward_sender_name,
      sourceChannelTitle: message.forward_sender_name,
      sourceMessageId: typeof message.forward_from_message_id === 'number' ? message.forward_from_message_id : undefined,
      forwardDate: message.forward_date,
      mediaGroupId,
    };
  }

  return {
    isForwarded: false,
    mediaGroupId,
  };
}

/**
 * Extracts natural part or episode number from filename or caption as fallback.
 * Examples: "Part 1", "[Part 2]", "01 - Anatomy", "Video 3"
 */
export function extractPartOrIndexNumber(filename?: string, caption?: string): number | null {
  const text = `${filename || ''} ${caption || ''}`;

  // Explicit part/section/chapter indicators with word boundary
  const partMatch = text.match(/(?:\b(?:part|pt|ep|episode)\b|جزء|الجزء|حلقة|الحلقة|محاضرة|المحاضرة|درس|الدرس)[\s.:_-]*([0-9]{1,4})/i);
  if (partMatch && partMatch[1]) {
    return parseInt(partMatch[1], 10);
  }

  // Bracketed part e.g. [Part 1], [01], (1)
  const bracketMatch = text.match(/[\[(](?:part\s*)?([0-9]{1,4})[\])]/i);
  if (bracketMatch && bracketMatch[1]) {
    return parseInt(bracketMatch[1], 10);
  }

  // Leading index: "01 - Anatomy", "1. Joints"
  const leadMatch = (filename || '').trim().match(/^([0-9]{1,4})[\s.\-_]/);
  if (leadMatch && leadMatch[1]) {
    return parseInt(leadMatch[1], 10);
  }

  // Trailing index: "Joints 1.mp4", "Anatomy 2.mp4"
  const trailMatch = (filename || '').replace(/\.[a-zA-Z0-9]{2,5}$/, '').match(/[\s\-_]([0-9]{1,4})$/);
  if (trailMatch && trailMatch[1]) {
    return parseInt(trailMatch[1], 10);
  }

  return null;
}

/**
 * Strict Master Comparison for Source Ordering:
 * Ensures forwarded messages from Telegram channels are ordered by their
 * ORIGINAL channel post order (sourceMessageId), NOT the order Telegram delivered them.
 */
export function compareBatchItems(a: PendingForwardItem, b: PendingForwardItem): number {
  // 1. Same source channel/chat: sourceMessageId is strictly monotonic in Telegram channels!
  if (
    a.meta.sourceChatId &&
    b.meta.sourceChatId &&
    String(a.meta.sourceChatId) === String(b.meta.sourceChatId) &&
    typeof a.meta.sourceMessageId === 'number' &&
    typeof b.meta.sourceMessageId === 'number'
  ) {
    return a.meta.sourceMessageId - b.meta.sourceMessageId;
  }

  // 2. Both have sourceMessageId
  if (
    typeof a.meta.sourceMessageId === 'number' &&
    typeof b.meta.sourceMessageId === 'number' &&
    a.meta.sourceMessageId !== b.meta.sourceMessageId
  ) {
    return a.meta.sourceMessageId - b.meta.sourceMessageId;
  }

  // 3. Original Telegram forward_date
  if (
    typeof a.meta.forwardDate === 'number' &&
    typeof b.meta.forwardDate === 'number' &&
    a.meta.forwardDate !== b.meta.forwardDate
  ) {
    return a.meta.forwardDate - b.meta.forwardDate;
  }

  // 4. Natural numeric part/number extraction
  const numA = extractPartOrIndexNumber(a.originalFilename, a.originalCaption);
  const numB = extractPartOrIndexNumber(b.originalFilename, b.originalCaption);
  if (numA !== null && numB !== null && numA !== numB) {
    return numA - numB;
  }

  // 5. If same media group or chat, use incoming messageId
  if (a.messageId && b.messageId && a.messageId !== b.messageId) {
    return a.messageId - b.messageId;
  }

  // 6. Arrival timestamp
  return a.receivedAt - b.receivedAt;
}

interface UserBatchBuffer {
  items: PendingForwardItem[];
  timer: NodeJS.Timeout | null;
  firstReceivedAt: number;
}

/**
 * ForwardBatchManager:
 * Intercepts incoming forwarded media bursts, buffers them briefly (1200ms debounce),
 * sorts them by the source channel message order, and then assigns consecutive Queue sequence numbers.
 */
class ForwardBatchManager {
  private buffers = new Map<string, UserBatchBuffer>();

  // Debounce delay: how long to wait after the last forwarded message in a burst
  private readonly DEBOUNCE_MS = 1200;
  // Maximum total window from the first item in the batch
  private readonly MAX_WINDOW_MS = 4000;

  private getBufferKey(item: PendingForwardItem): string {
    const sourceKey = item.meta.sourceChatId ? String(item.meta.sourceChatId) : (item.meta.mediaGroupId || 'fwd');
    return `${item.userId}_${sourceKey}`;
  }

  /**
   * Immediately registers a non-forwarded, standalone media file directly into Queue.
   */
  public enqueueImmediate(item: PendingForwardItem): QueueItem {
    return store.addToQueue({
      id: item.id,
      userId: item.userId,
      userFirstName: item.userFirstName,
      chatId: item.chatId,
      messageId: item.messageId,
      type: item.type,
      fileId: item.fileId,
      duration: item.duration,
      width: item.width,
      height: item.height,
      performer: item.performer,
      title: item.title,
      originalFilename: item.originalFilename,
      originalCaption: item.originalCaption,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      mediaUrl: item.mediaUrl,
      status: 'queued',
      statusMessage: 'في قائمة الانتظار للمعالجة',
      statusTelegramMessageId: item.statusTelegramMessageId,
      targetChannelId: item.targetChannelId,
      targetChannelTitle: item.targetChannelTitle,
      sourceChannelId: item.meta.sourceChatId,
      sourceChannelTitle: item.meta.sourceChannelTitle,
      sourceMessageId: item.meta.sourceMessageId,
      forwardDate: item.meta.forwardDate,
      mediaGroupId: item.meta.mediaGroupId,
    });
  }

  /**
   * Adds an incoming forwarded or album media item into the accumulation buffer.
   * If not forwarded and no media group, enqueues immediately.
   */
  public addOrBuffer(item: PendingForwardItem) {
    // If not forwarded and not an album, bypass buffer and enqueue immediately
    if (!item.meta.isForwarded && !item.meta.mediaGroupId) {
      const queueItem = this.enqueueImmediate(item);
      this.sendInstantTicketUpdate(item, queueItem.sequenceNumber);
      return;
    }

    const key = this.getBufferKey(item);
    let buf = this.buffers.get(key);

    if (!buf) {
      buf = {
        items: [],
        timer: null,
        firstReceivedAt: Date.now(),
      };
      this.buffers.set(key, buf);
    }

    buf.items.push(item);

    // If there is an existing timer, clear it to reset the debounce
    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }

    const elapsed = Date.now() - buf.firstReceivedAt;
    const remainingToMax = Math.max(100, this.MAX_WINDOW_MS - elapsed);
    const delay = Math.min(this.DEBOUNCE_MS, remainingToMax);

    // Schedule batch flush
    buf.timer = setTimeout(() => {
      this.flushBatch(key);
    }, delay);
  }

  /**
   * Flushes and commits the accumulated batch in true source order.
   */
  private async flushBatch(key: string) {
    const buf = this.buffers.get(key);
    if (!buf || buf.items.length === 0) {
      this.buffers.delete(key);
      return;
    }

    this.buffers.delete(key);
    if (buf.timer) {
      clearTimeout(buf.timer);
    }

    // Sort items using Master Source Ordering Algorithm
    const sorted = [...buf.items].sort(compareBatchItems);

    console.log(`[ForwardBatchManager] Flushing batch of ${sorted.length} items for key "${key}" sorted by source order:`);
    sorted.forEach((item, idx) => {
      console.log(`  [${idx + 1}/${sorted.length}] ${item.originalFilename} (sourceMsgId: ${item.meta.sourceMessageId ?? 'N/A'}, fwdDate: ${item.meta.forwardDate ?? 'N/A'})`);
    });

    // Enqueue sequentially in exact sorted order
    for (const item of sorted) {
      const queueItem = store.addToQueue({
        id: item.id,
        userId: item.userId,
        userFirstName: item.userFirstName,
        chatId: item.chatId,
        messageId: item.messageId,
        type: item.type,
        fileId: item.fileId,
        duration: item.duration,
        width: item.width,
        height: item.height,
        performer: item.performer,
        title: item.title,
        originalFilename: item.originalFilename,
        originalCaption: item.originalCaption,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        mediaUrl: item.mediaUrl,
        status: 'queued',
        statusMessage: 'في قائمة الانتظار للمعالجة',
        statusTelegramMessageId: item.statusTelegramMessageId,
        targetChannelId: item.targetChannelId,
        targetChannelTitle: item.targetChannelTitle,
        sourceChannelId: item.meta.sourceChatId,
        sourceChannelTitle: item.meta.sourceChannelTitle,
        sourceMessageId: item.meta.sourceMessageId,
        forwardDate: item.meta.forwardDate,
        mediaGroupId: item.meta.mediaGroupId,
      });

      this.sendInstantTicketUpdate(item, queueItem.sequenceNumber);
    }
  }

  /**
   * Clears all pending forward batch buffers immediately (used for emergency stop).
   */
  public clearAllBuffers(): number {
    let count = 0;
    for (const buf of this.buffers.values()) {
      if (buf.timer) {
        clearTimeout(buf.timer);
      }
      count += buf.items.length;
    }
    this.buffers.clear();
    return count;
  }

  /**
   * Updates Telegram progress message to display the assigned queue ticket and source info.
   */
  private async sendInstantTicketUpdate(item: PendingForwardItem, sequenceNumber: number) {
    if (!item.token || !item.chatId) return;

    const botConfig = store.getConfig();
    const durationText = item.duration
      ? `\n• المدة: <b>${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')} دقيقة</b>`
      : '';

    const sourceInfo = item.meta.sourceMessageId
      ? ` <i>(الترتيب في القناة المصدر: #${item.meta.sourceMessageId})</i>`
      : '';

    const channelSource = item.meta.sourceChannelTitle
      ? `\n• المصدر: <b>${item.meta.sourceChannelTitle}</b>${sourceInfo}`
      : (item.meta.isForwarded ? `\n• الحالة: <b>رسالة محوّلة مرتبة تلقائياً</b>` : '');

    const aiNote = botConfig.aiRenaming.enabled
      ? `\n• الذكاء الاصطناعي: 🟢 <b>AI Naming: ON</b> (تسمية موحدة ووصف MedPulse)`
      : `\n• الذكاء الاصطناعي: ⚪ <b>AI Naming: OFF</b>`;

    const ticketText =
      `📥 <b>تم استلام وتأكيد ترتيب الملف بنجاح!</b>\n\n` +
      `• الملف: <code>${item.originalFilename}</code>\n` +
      `• رقم الانتظار في الطابور: <b>#${sequenceNumber}</b>\n` +
      `• الحجم: ${(item.fileSize / (1024 * 1024)).toFixed(1)} MB${durationText}${channelSource}${aiNote}\n` +
      `• حالة المعالجة: ⏳ <b>جاهز للمعالجة المتوازية وسينشر في القناة بالترتيب الصارم</b>`;

    try {
      if (item.statusTelegramMessageId) {
        const editRes = await TelegramService.editMessageText(
          item.token,
          item.chatId,
          item.statusTelegramMessageId,
          ticketText
        );
        if (editRes.ok) return;
      }

      // If messageId was not set or editing failed (e.g. not found), send fresh ticket message
      const sendRes = await TelegramService.sendMessage(item.token, item.chatId, ticketText);
      if (sendRes.ok && sendRes.result?.message_id) {
        item.statusTelegramMessageId = sendRes.result.message_id;
        store.updateQueueItemBySequence(sequenceNumber, {
          statusTelegramMessageId: sendRes.result.message_id,
        });
      }
    } catch {
      // Non-blocking
    }
  }
}

export const forwardBatchManager = new ForwardBatchManager();
