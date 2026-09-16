import { store } from './store';
import { UserSetting, InlineKeyboardButton, SimulatedTelegramMessage, QueueItemType } from '../src/types';
import { processActualFilename, processActualCaption } from './pipeline';
import { FileProcessor } from './fileProcessor';
import { CAPTION_PRESETS, generateFormattedCaption } from './aiRenamer';
import { forwardBatchManager, extractForwardMetadata } from './forwardBatchManager';
import { queueWorker } from './queueWorker';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramCallResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramService {
  private static meCache = new Map<string, { data: TelegramCallResult; expires: number }>();

  public static async callApi<T = any>(
    token: string,
    method: string,
    payload: Record<string, any> = {}
  ): Promise<TelegramCallResult<T>> {
    if (!token) {
      return { ok: false, description: 'Telegram Bot Token is not configured' };
    }
    const trimmed = token.trim();
    if (trimmed.startsWith('AIza')) {
      return { ok: false, description: 'الرمز يبدو كرمز Gemini API وليس توكن بوت تيليجرام.' };
    }
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}${trimmed}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { ok: false, description: err.message || 'Network request failed' };
    }
  }

  public static async callApiMultipart(token: string, method: string, formData: FormData) {
    if (!token) {
      return { ok: false, description: 'Telegram Bot Token is not configured' };
    }
    const trimmed = token.trim();
    if (trimmed.startsWith('AIza')) {
      return { ok: false, description: 'الرمز يبدو كرمز Gemini API وليس توكن بوت تيليجرام.' };
    }
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}${trimmed}/${method}`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { ok: false, description: err.message || 'Network request failed' };
    }
  }

  public static async getMe(token: string) {
    if (!token) {
      return { ok: false, description: 'Telegram Bot Token is not configured' };
    }
    const trimmed = token.trim();
    if (trimmed.startsWith('AIza')) {
      return { ok: false, description: 'الرمز يبدو كرمز Gemini API وليس توكن بوت تيليجرام.' };
    }
    const now = Date.now();
    const cached = this.meCache.get(trimmed);
    if (cached && cached.expires > now) {
      return cached.data;
    }
    const res = await this.callApi(trimmed, 'getMe');
    if (res.ok) {
      this.meCache.set(trimmed, { data: res, expires: now + 45000 });
    }
    return res;
  }

  public static async getChat(token: string, chatId: string | number) {
    return this.callApi(token, 'getChat', { chat_id: chatId });
  }

  public static async getChatMember(token: string, chatId: string | number, userId: string | number) {
    return this.callApi(token, 'getChatMember', { chat_id: chatId, user_id: userId });
  }

  public static async answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ) {
    if (token && callbackQueryId) {
      return this.callApi(token, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });
    }
    return { ok: true };
  }

  public static async getFile(token: string, fileId: string) {
    return this.callApi(token, 'getFile', { file_id: fileId });
  }

  /**
   * Verifies that the bot can access the channel and that the user is an Administrator
   */
  public static async verifyUserChannelPermissions(
    token: string,
    channelChatId: string,
    userId: string
  ): Promise<{ valid: boolean; title?: string; error?: string }> {
    // If no real token or demo channel, simulate validation based on channel format
    if (!token || channelChatId === '@MediaHubArabic') {
      if (!channelChatId.startsWith('@') && !channelChatId.startsWith('-100')) {
        return {
          valid: false,
          error: 'معرف القناة غير صالح. يجب أن يبدأ بـ @ أو -100',
        };
      }
      return {
        valid: true,
        title: `قناة ${channelChatId}`,
      };
    }

    try {
      // 1. Verify channel existence and bot access
      const chatRes = await this.getChat(token, channelChatId);
      if (!chatRes.ok || !chatRes.result) {
        return {
          valid: false,
          error: `لم يتمكن البوت من الوصول إلى القناة (${channelChatId}). تأكد من إضافة البوت كمشرف أولاً.`,
        };
      }

      const chat = chatRes.result;
      if (chat.type !== 'channel' && chat.type !== 'supergroup') {
        return {
          valid: false,
          error: 'المعرف المحدد ليس قناة تيليجرام صالحة.',
        };
      }

      // 2. Verify bot is administrator
      const botMe = await this.getMe(token);
      if (botMe.ok && botMe.result) {
        const botMemberRes = await this.getChatMember(token, channelChatId, botMe.result.id);
        if (!botMemberRes.ok || !['creator', 'administrator'].includes(botMemberRes.result?.status)) {
          return {
            valid: false,
            error: 'البوت ليس مشرفاً (Administrator) في هذه القناة. يرجى منحه صلاحيات النشر.',
          };
        }
      }

      // 3. Verify user is administrator in that channel
      const userMemberRes = await this.getChatMember(token, channelChatId, userId);
      if (!userMemberRes.ok || !['creator', 'administrator'].includes(userMemberRes.result?.status)) {
        return {
          valid: false,
          error: 'أنت لست مشرفاً (Administrator) في هذه القناة! يجب أن تكون مالكاً أو مشرفاً فيها لتتمكن من النشر.',
        };
      }

      return {
        valid: true,
        title: chat.title || channelChatId,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: `خطأ أثناء التحقق من الصلاحيات: ${err.message}`,
      };
    }
  }

  public static async sendMessage(
    token: string,
    chatId: string | number,
    text: string,
    replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] }
  ) {
    if (token) {
      return this.callApi(token, 'sendMessage', {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
      });
    }
    // Record in simulated storage
    const msgId = Date.now() % 1000000;
    store.addSimulatedMessage(chatId, {
      message_id: msgId,
      from: { id: 999999, first_name: 'Media Pipeline Bot', username: 'MediaPipelineBot', is_bot: true },
      chat: { id: Number(chatId) || 12345, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text,
      reply_markup: replyMarkup,
    });
    return { ok: true, result: { message_id: msgId } };
  }

  public static async editMessageText(
    token: string,
    chatId: string | number,
    messageId: number,
    text: string,
    replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] }
  ) {
    if (token) {
      return this.callApi(token, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
      });
    }
    store.updateSimulatedMessageText(chatId, messageId, text, replyMarkup);
    return { ok: true, result: { message_id: messageId, text } };
  }

  public static async deleteMessage(
    token: string,
    chatId: string | number,
    messageId: number
  ) {
    if (token) {
      return this.callApi(token, 'deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
    }
    store.deleteSimulatedMessage(chatId, messageId);
    return { ok: true, result: true };
  }

  public static async sendPhoto(
    token: string,
    chatId: string | number,
    photoUrlOrFileId: string,
    caption?: string
  ) {
    if (token) {
      return this.callApi(token, 'sendPhoto', {
        chat_id: chatId,
        photo: photoUrlOrFileId,
        caption,
        parse_mode: 'HTML',
      });
    }
    const msgId = Date.now() % 1000000;
    store.addSimulatedMessage(chatId, {
      message_id: msgId,
      from: { id: 999999, first_name: 'Media Pipeline Bot', is_bot: true },
      chat: { id: Number(chatId) || 12345, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      caption,
      photo: [{ file_id: photoUrlOrFileId, file_size: 1024, width: 800, height: 800 }],
    });
    return { ok: true, result: { message_id: msgId } };
  }

  /**
   * Generates the Main Settings Keyboard
   */
  public static getSettingsKeyboard(user: UserSetting): { inline_keyboard: InlineKeyboardButton[][] } {
    const config = store.getConfig();
    const aiStatus = config.aiRenaming.enabled ? '🟢 مفعل' : '⚪ معطل';
    const currentStyleId = config.aiRenaming.captionStyle || 'medpulse_box';
    const activePreset = CAPTION_PRESETS.find((p) => p.id === currentStyleId) || CAPTION_PRESETS[0];
    const thumbStatus = user.thumbnail ? '✅ دائمة' : '❌ غير محددة';
    const tagStatus = user.tag?.text ? `✅ (${user.tag.position === 'before' ? 'قبل' : 'بعد'})` : '❌ غير محدد';
    const channelStatus = user.channel?.chatId
      ? `${user.channel.publishingEnabled ? '🟢 مفعل' : '🔴 معطل'}`
      : '❌ غير معينة';
    const turboStatus = config.turboSpeed?.enabled ? '⚡ 16 خيط' : '🐢 عادي';

    return {
      inline_keyboard: [
        [
          { text: `🤖 الذكاء الاصطناعي [${aiStatus}]`, callback_data: 'settings:ai_menu' },
          { text: `📝 نمط الوصف [${activePreset.name.split(' ')[0] || 'MedPulse'}]`, callback_data: 'settings:caption_style' },
        ],
        [
          { text: `🖼️ الصورة المصغرة [${thumbStatus}]`, callback_data: 'settings:thumb' },
          { text: `🏷️ الوسم [${tagStatus}]`, callback_data: 'settings:tag' },
        ],
        [
          { text: `📢 قناة النشر [${channelStatus}]`, callback_data: 'settings:channel' },
          { text: `🚫 الكلمات المحظورة (${user.forbiddenWords.length})`, callback_data: 'settings:forbidden' },
        ],
        [
          { text: '✏️ البادئة واللاحقة (Prefix/Suffix)', callback_data: 'settings:naming' },
          { text: `⚡ السرعة الفائقة [${turboStatus}]`, callback_data: 'settings:turbo' },
        ],
        [
          { text: '🛑 إيقاف كافة العمليات / تصفير الطابور', callback_data: 'settings:emergency_stop' },
        ],
        [
          { text: '🔄 تحديث لوحة الإعدادات', callback_data: 'settings:main' },
        ],
      ],
    };
  }

  /**
   * Generates Settings Message text
   */
  public static getSettingsOverviewText(user: UserSetting): string {
    const config = store.getConfig();
    const queue = store.getQueue();
    const activeCount = queue.filter((q) => q.status !== 'published' && q.status !== 'failed').length;
    const aiText = config.aiRenaming.enabled
      ? '🟢 مُفَعّل تلقائياً (ON) - تسمية موحدة وتنسيق فوري'
      : '⚪ مُعَطّل (OFF) - التسمية اليدوية فقط';
    const currentStyleId = config.aiRenaming.captionStyle || 'medpulse_box';
    const activePreset = CAPTION_PRESETS.find((p) => p.id === currentStyleId) || CAPTION_PRESETS[0];
    const thumbText = user.thumbnail
      ? '✅ محفوظة بشكل دائم (تطبق تلقائياً على كل فيديو وصوت ولا تفقد أبداً)'
      : '❌ لا توجد صورة مصغرة حالياً';
    const tagText = user.tag?.text
      ? `"${user.tag.text}" [${user.tag.position === 'before' ? 'قبل العنوان ⬅️' : 'بعد العنوان ➡️'}]`
      : 'غير مفعل';
    const channelText = user.channel?.chatId
      ? `${user.channel.title ? user.channel.title + ' ' : ''}(${user.channel.chatId}) - ${user.channel.publishingEnabled ? 'النشر مفعل 🟢' : 'النشر معطل مؤقتاً 🔴'}`
      : 'لم يتم تعيين قناة بعد ⚠️';
    const prefixText = user.namingPrefix || 'لا توجد';
    const suffixText = user.namingSuffix || 'لا توجد';
    const captionPrefixText = user.captionPrefix || 'لا توجد';
    const captionSuffixText = user.captionSuffix || 'لا توجد';
    const turboText = config.turboSpeed?.enabled
      ? '⚡ مُفَعّل (16 مسار MTProto متوازي + معالجة مسبقة للطابور)'
      : '🐢 معطل (الوضع العادي)';

    return (
      `⚙️ <b>لوحة التحكم والإعدادات الشاملة للبوت</b>\n\n` +
      `👤 <b>المستخدم:</b> ${user.firstName} (<code>${user.userId}</code>)\n` +
      `📊 <b>حالة العمليات:</b> <b>${activeCount}</b> عملية قيد المعالجة حالياً في الطابور\n\n` +
      `• <b>🤖 الذكاء الاصطناعي (AI Renaming):</b> ${aiText}\n` +
      `• <b>📝 نمط الوصف المعتمد:</b> ${activePreset.name} (${activePreset.badge})\n` +
      `• <b>🖼️ الصورة المصغرة (Thumbnail):</b> ${thumbText}\n` +
      `• <b>🏷️ الوسم (Tag):</b> ${tagText}\n` +
      `• <b>📢 قناة النشر:</b> ${channelText}\n` +
      `• <b>✏️ بادئة اسم الملف:</b> <code>${prefixText}</code>\n` +
      `• <b>✏️ لاحقة اسم الملف:</b> <code>${suffixText}</code>\n` +
      `• <b>📝 بادئة الوصف:</b> <code>${captionPrefixText}</code>\n` +
      `• <b>📝 لاحقة الوصف:</b> <code>${captionSuffixText}</code>\n` +
      `• <b>🚫 الكلمات المحظورة:</b> ${user.forbiddenWords.length} كلمة مسجلة\n` +
      `• <b>⚡ السرعة الفائقة (Turbo):</b> ${turboText}\n\n` +
      `<i>جميع الإعدادات يتم حفظها بشكل دائم على القرص الصلب ولن تفقد إطلاقاً حتى لو أعدت تشغيل الأداة. انقر على أي زر بالأسفل لإدارته بسلاسة:</i>`
    );
  }

  /**
   * Dispatches incoming Telegram updates (messages, callback_queries)
   */
  public static async handleUpdate(update: any) {
    const config = store.getConfig();
    const token = config.botToken;

    // Handle Callback Query (inline buttons)
    if (update.callback_query) {
      await this.handleCallbackQuery(token, update.callback_query);
      return;
    }

    // Handle Message
    if (update.message) {
      await this.handleMessage(token, update.message);
      return;
    }
  }

  private static async handleCallbackQuery(token: string, callbackQuery: any) {
    // Immediately acknowledge callback query so Telegram client removes the button spinner in milliseconds!
    if (callbackQuery.id) {
      this.answerCallbackQuery(token, callbackQuery.id).catch((err) => {
        console.warn('answerCallbackQuery error:', err);
      });
    }

    const userId = String(callbackQuery.from.id);
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    const data = callbackQuery.data;
    const user = store.getUser(userId);

    // Emergency stop / reset
    if (data === 'settings:emergency_stop') {
      const res = queueWorker.emergencyStopAndReset();
      await this.answerCallbackQuery(
        token,
        callbackQuery.id,
        `🛑 تم إيقاف كافة العمليات (${res.cancelledCount}) وتصفير الطابور بنجاح!`
      );
      const updatedUser = store.getUser(userId);
      await this.sendMessage(
        token,
        chatId,
        `🛑 <b>تم تنفيذ أمر إيقاف كافة العمليات وتصفير الطابور بنجاح!</b>\n\n` +
        `• تم إلغاء وحذف <b>${res.cancelledCount}</b> عملية في المعالجة والانتظار.\n` +
        `• تم مسح ملفات المعالجة المؤقتة وتفريغ الذاكرة فوراً.\n` +
        `• البوت الآن في حالة خمول واستعداد تام لاستقبال أي ملفات جديدة متى ما شئت.`
      );
      await this.editMessageText(
        token,
        chatId,
        messageId,
        this.getSettingsOverviewText(updatedUser),
        this.getSettingsKeyboard(updatedUser)
      );
      return;
    }

    // Thumbnail menu
    if (data === 'settings:thumb') {
      const hasThumb = !!user.thumbnail;
      const statusText = hasThumb
        ? `🖼️ <b>إعدادات الصورة المصغرة الدائمة (Permanent Thumbnail)</b>\n\n` +
          `الحالة الحالية: <b>يوجد صورة مصغرة معتمدة محفوظة دائماً</b> ✅\n\n` +
          `• <b>الثبات والدوام:</b> تم حفظ ملف الصورة بشكل فيزيائي دائم ولن يفقد إطلاقاً حتى لو أعدت تشغيل الأداة.\n` +
          `• <b>المعايير:</b> تم ضبط الأبعاد والضغط تلقائياً وفق معايير Telegram الرسمية (320x320 JPEG).\n` +
          `• <b>التطبيق التلقائي:</b> تدمج في حاوية كل فيديو وصوت قبل رفعه للقناة.`
        : `🖼️ <b>إعدادات الصورة المصغرة الدائمة (Permanent Thumbnail)</b>\n\n` +
          `الحالة الحالية: <b>لا توجد صورة مصغرة محفوظة حالياً</b> ❌\n\n` +
          `<i>اضغط "تعيين صورة جديدة" أو أرسل أي صورة مباشرة إلى البوت، وسيتم ضبطها وحفظها بشكل دائم.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '➕ تعيين صورة جديدة', callback_data: 'settings:thumb_set' },
          { text: '👁️ عرض الحالية', callback_data: 'settings:thumb_view' },
        ],
        [
          { text: '🗑️ حذف الصورة المصغرة', callback_data: 'settings:thumb_delete' },
          { text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, statusText, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:thumb_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_thumbnail' } });
      await this.sendMessage(
        token,
        chatId,
        '🖼️ <b>أرسل صورتك المصغرة الآن:</b>\n\nيمكنك إرسالها كصورة عادية أو كملف صورة، وسيقوم البوت تلقائياً بتنسيقها ومطابقتها لمواصفات تليجرام المعتمدة (JPEG 320x320) وتطبيقها فوراً على كل الفيديوهات القادمة.'
      );
      return;
    }

    if (data === 'settings:thumb_view') {
      if (user.thumbnail?.url) {
        await this.sendPhoto(token, chatId, user.thumbnail.url, '🖼️ الصورة المصغرة الحالية المعتمدة لجميع فيديوهاتك');
      } else {
        await this.sendMessage(token, chatId, 'لا توجد صورة مصغرة حالياً');
      }
      return;
    }

    if (data === 'settings:thumb_delete') {
      store.updateUser(userId, { thumbnail: undefined });
      await this.sendMessage(token, chatId, 'تم حذف الصورة المصغرة بنجاح');
      const updatedUser = store.getUser(userId);
      await this.editMessageText(
        token,
        chatId,
        messageId,
        this.getSettingsOverviewText(updatedUser),
        this.getSettingsKeyboard(updatedUser)
      );
      return;
    }

    // Tag menu
    if (data === 'settings:tag') {
      const tagInfo = user.tag?.text
        ? `• الوسم المحفوظ: <b>${user.tag.text}</b>\n• الموقع: <b>${user.tag.position === 'before' ? 'قبل العنوان ⬅️' : 'بعد العنوان ➡️'}</b>`
        : `<i>لا يوجد وسم حالياً ❌</i>`;

      const text =
        `🏷️ <b>نظام الـ Tag وإعادة تسمية الملفات</b>\n\n` +
        `${tagInfo}\n\n` +
        `<i>عند تعيين الوسم، سيتم إدراجه تلقائياً في اسم كل ملف فيديو أو صوت تتم معالجته، مع إمكانية التبديل بين وضعه قبل أو بعد العنوان بنقرة زر.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '✏️ تعيين نص الوسم', callback_data: 'settings:tag_set' },
          { text: `🔄 تبديل الموضع (${user.tag?.position === 'before' ? 'قبل ⬅️' : 'بعد ➡️'})`, callback_data: 'settings:tag_toggle_pos' },
        ],
        [
          { text: '🗑️ حذف الوسم', callback_data: 'settings:tag_delete' },
          { text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:tag_toggle_pos') {
      if (user.tag?.text) {
        const newPos = user.tag.position === 'before' ? 'after' : 'before';
        store.updateUser(userId, {
          tag: {
            ...user.tag,
            position: newPos,
          },
        });
        await this.answerCallbackQuery(
          token,
          callbackQuery.id,
          newPos === 'before' ? '⬅️ تم الضبط: قبل العنوان' : '➡️ تم الضبط: بعد العنوان'
        );
      } else {
        await this.answerCallbackQuery(token, callbackQuery.id, '⚠️ يرجى تعيين الوسم أولاً.');
      }
      const updatedUser = store.getUser(userId);
      const tagInfo = updatedUser.tag?.text
        ? `• الوسم المحفوظ: <b>${updatedUser.tag.text}</b>\n• الموقع: <b>${updatedUser.tag.position === 'before' ? 'قبل العنوان ⬅️' : 'بعد العنوان ➡️'}</b>`
        : `<i>لا يوجد وسم حالياً ❌</i>`;

      const text =
        `🏷️ <b>نظام الـ Tag وإعادة تسمية الملفات</b>\n\n` +
        `${tagInfo}\n\n` +
        `<i>عند تعيين الوسم، سيتم إدراجه تلقائياً في اسم كل ملف فيديو أو صوت تتم معالجته، مع إمكانية التبديل بين وضعه قبل أو بعد العنوان بنقرة زر.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '✏️ تعيين نص الوسم', callback_data: 'settings:tag_set' },
          { text: `🔄 تبديل الموضع (${updatedUser.tag?.position === 'before' ? 'قبل ⬅️' : 'بعد ➡️'})`, callback_data: 'settings:tag_toggle_pos' },
        ],
        [
          { text: '🗑️ حذف الوسم', callback_data: 'settings:tag_delete' },
          { text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:tag_set') {
      store.updateUser(userId, {
        pendingAction: { type: 'awaiting_tag_text' },
      });
      await this.sendMessage(
        token,
        chatId,
        '✍️ الرجاء إرسال النص المطلوب استخدامه كوسم (Tag) الآن عبر المحادثة:'
      );
      return;
    }

    if (data.startsWith('tag_pos:')) {
      const pos = data.split(':')[1] as 'before' | 'after';
      const pending = user.pendingAction?.data?.tagText || user.tag?.text;
      if (pending) {
        store.updateUser(userId, {
          tag: { text: pending, position: pos },
          pendingAction: undefined,
        });
        const posArabic = pos === 'before' ? 'قبل الاسم' : 'بعد الاسم';
        await this.sendMessage(
          token,
          chatId,
          `✅ تم حفظ إعداد الوسم بنجاح!\n\n• الوسم المستخدم: <b>${pending}</b>\n• مكان وضعه: <b>${posArabic}</b>`
        );
      }
      return;
    }

    if (data === 'settings:tag_delete') {
      store.updateUser(userId, { tag: undefined });
      await this.sendMessage(token, chatId, 'تم حذف الوسم بنجاح');
      const updatedUser = store.getUser(userId);
      await this.editMessageText(
        token,
        chatId,
        messageId,
        this.getSettingsOverviewText(updatedUser),
        this.getSettingsKeyboard(updatedUser)
      );
      return;
    }

    // Channel menu
    if (data === 'settings:channel') {
      const ch = user.channel;
      const statusText = ch?.chatId
        ? `📢 <b>إدارة قناة النشر وصلاحيات المستخدم</b>\n\n` +
          `• القناة الحالية: <b>${ch.title || ch.chatId}</b> (<code>${ch.chatId}</code>)\n` +
          `• حالة النشر: <b>${ch.publishingEnabled ? 'مفعل 🟢' : 'معطل مؤقتاً 🔴'}</b>\n` +
          `• حالة التحقق: <b>مشرف معتمد ✅</b>\n\n` +
          `<i>تنبيه: لن يتم النشر إلا إذا كان البوت والمستخدم كلاهما مشرفين في القناة.</i>`
        : `📢 <b>إدارة قناة النشر وصلاحيات المستخدم</b>\n\n` +
          `• القناة الحالية: <b>لم يتم تعيين قناة بعد</b> ❌\n\n` +
          `يرجى تعيين معرف القناة للتأكد من الصلاحيات والبدء بالنشر التلقائي.`;

      const toggleText = ch?.publishingEnabled ? '⏸️ تعطيل النشر مؤقتاً' : '▶️ تفعيل النشر';

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '🔗 تعيين / تغيير القناة', callback_data: 'settings:channel_set' },
          { text: toggleText, callback_data: 'settings:channel_toggle' },
        ],
        [
          { text: '🔍 فحص الصلاحيات', callback_data: 'settings:channel_verify' },
          { text: '🗑️ إزالة القناة', callback_data: 'settings:channel_clear' },
        ],
        [
          { text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, statusText, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:channel_clear') {
      store.updateUser(userId, { channel: undefined });
      await this.answerCallbackQuery(token, callbackQuery.id, '🗑️ تم مسح القناة بنجاح.');
      const updatedUser = store.getUser(userId);
      await this.editMessageText(
        token,
        chatId,
        messageId,
        this.getSettingsOverviewText(updatedUser),
        this.getSettingsKeyboard(updatedUser)
      );
      return;
    }

    if (data === 'settings:channel_set') {
      store.updateUser(userId, {
        pendingAction: { type: 'awaiting_channel' },
      });
      await this.sendMessage(
        token,
        chatId,
        `✍️ أرسل الآن معرف قناة التيليجرام المطلوب النشر فيها (مثال: <code>@MyChannel</code> أو <code>-1001234567890</code>):\n\n` +
        `<i>تأكد من إضافة البوت كمشرف في القناة، وأنك أنت أيضاً مشرف فيها.</i>`
      );
      return;
    }

    if (data === 'settings:channel_toggle') {
      if (!user.channel?.chatId) {
        await this.sendMessage(token, chatId, '⚠️ يجب تعيين قناة النشر أولاً قبل تفعيلها أو تعطيلها.');
        return;
      }
      const newState = !user.channel.publishingEnabled;
      store.updateUser(userId, {
        channel: {
          ...user.channel,
          publishingEnabled: newState,
        },
      });
      const stateMsg = newState
        ? '🟢 تم تفعيل خدمة النشر بنجاح! سيتم إرسال الملفات المعالجة للقناة.'
        : '🔴 تم إيقاف/تعطيل النشر مؤقتاً. لن يتم إرسال أي محتوى للقناة حتى إعادة التفعيل.';
      await this.sendMessage(token, chatId, stateMsg);
      return;
    }

    if (data === 'settings:channel_verify') {
      if (!user.channel?.chatId) {
        await this.sendMessage(token, chatId, '⚠️ لا توجد قناة معينة لفحص صلاحياتها.');
        return;
      }
      const check = await this.verifyUserChannelPermissions(token, user.channel.chatId, userId);
      if (check.valid) {
        await this.sendMessage(
          token,
          chatId,
          `✅ <b>التحقق ناجح!</b>\n\n• القناة: <b>${check.title}</b>\n• صلاحيات البوت: مشرف (Admin) ✅\n• صلاحيات المستخدم: مشرف (Admin) ✅`
        );
      } else {
        await this.sendMessage(token, chatId, `❌ <b>فشل التحقق:</b>\n${check.error}`);
      }
      return;
    }

    // Forbidden words menu
    if (data === 'settings:forbidden') {
      const words = user.forbiddenWords || [];
      const wordsList = words.length > 0
        ? words.map((w, i) => `${i + 1}. <code>${w}</code>`).join('\n')
        : '<i>لا توجد كلمات محظورة مضافة حالياً.</i>';

      const text =
        `🚫 <b>نظام الكلمات المحظورة (Forbidden Words)</b>\n\n` +
        `يتم فحص اسم كل ملف ووصفه (Caption) تلقائياً وحذف أي كلمة من هذه القائمة قبل النشر.\n\n` +
        `الكلمات المحظورة الحالية (${words.length}):\n${wordsList}\n\n` +
        `<i>يمكنك النقر على زر الكلمة لحذفها منفردة أو إضافة كلمات جديدة:</i>`;

      const keyboard: InlineKeyboardButton[][] = [];
      for (let i = 0; i < words.length; i += 2) {
        const row: InlineKeyboardButton[] = [];
        row.push({ text: `❌ ${words[i]}`, callback_data: `settings:forbidden_del:${i}` });
        if (i + 1 < words.length) {
          row.push({ text: `❌ ${words[i + 1]}`, callback_data: `settings:forbidden_del:${i + 1}` });
        }
        keyboard.push(row);
      }

      keyboard.push([
        { text: '➕ إضافة كلمة محظورة', callback_data: 'settings:forbidden_add' },
        { text: '🗑️ مسح جميع الكلمات', callback_data: 'settings:forbidden_clear' },
      ]);
      keyboard.push([{ text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' }]);

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data.startsWith('settings:forbidden_del:')) {
      const idx = parseInt(data.replace('settings:forbidden_del:', ''), 10);
      const words = [...user.forbiddenWords];
      if (!isNaN(idx) && idx >= 0 && idx < words.length) {
        const removed = words.splice(idx, 1)[0];
        store.updateUser(userId, { forbiddenWords: words });
        await this.answerCallbackQuery(token, callbackQuery.id, `🗑️ تم حذف: ${removed}`);
      }
      const updatedUser = store.getUser(userId);
      const updatedWords = updatedUser.forbiddenWords || [];
      const wordsList = updatedWords.length > 0
        ? updatedWords.map((w, i) => `${i + 1}. <code>${w}</code>`).join('\n')
        : '<i>لا توجد كلمات محظورة مضافة حالياً.</i>';

      const text =
        `🚫 <b>نظام الكلمات المحظورة (Forbidden Words)</b>\n\n` +
        `يتم فحص اسم كل ملف ووصفه (Caption) تلقائياً وحذف أي كلمة من هذه القائمة قبل النشر.\n\n` +
        `الكلمات المحظورة الحالية (${updatedWords.length}):\n${wordsList}\n\n` +
        `<i>يمكنك النقر على زر الكلمة لحذفها منفردة أو إضافة كلمات جديدة:</i>`;

      const keyboard: InlineKeyboardButton[][] = [];
      for (let i = 0; i < updatedWords.length; i += 2) {
        const row: InlineKeyboardButton[] = [];
        row.push({ text: `❌ ${updatedWords[i]}`, callback_data: `settings:forbidden_del:${i}` });
        if (i + 1 < updatedWords.length) {
          row.push({ text: `❌ ${updatedWords[i + 1]}`, callback_data: `settings:forbidden_del:${i + 1}` });
        }
        keyboard.push(row);
      }
      keyboard.push([
        { text: '➕ إضافة كلمة محظورة', callback_data: 'settings:forbidden_add' },
        { text: '🗑️ مسح جميع الكلمات', callback_data: 'settings:forbidden_clear' },
      ]);
      keyboard.push([{ text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' }]);

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:forbidden_add') {
      store.updateUser(userId, {
        pendingAction: { type: 'awaiting_forbidden_word' },
      });
      await this.sendMessage(token, chatId, '✍️ أرسل الكلمة المحظورة المطلوب حذفها تلقائياً من الأسماء والأوصاف:');
      return;
    }

    if (data === 'settings:forbidden_clear') {
      store.updateUser(userId, { forbiddenWords: [] });
      await this.sendMessage(token, chatId, '✅ تم مسح قائمة الكلمات المحظورة بالكامل.');
      return;
    }

    // Naming Prefix / Suffix menu
    if (data === 'settings:naming') {
      const text =
        `✏️ <b>إعدادات البادئة واللاحقة (Prefix / Suffix)</b>\n\n` +
        `• بادئة اسم الملف: <b>${user.namingPrefix || 'لا توجد'}</b>\n` +
        `• لاحقة اسم الملف: <b>${user.namingSuffix || 'لا توجد'}</b>\n` +
        `• بادئة الوصف: <b>${user.captionPrefix || 'لا توجد'}</b>\n` +
        `• لاحقة الوصف: <b>${user.captionSuffix || 'لا توجد'}</b>\n\n` +
        `<i>يتم تطبيق البادئة واللاحقة على اسم الملف الحقيقي مع الحفاظ على الامتداد، كما يتم تنظيف الكلمات المحظورة دائماً.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '✏️ تعيين بادئة الاسم', callback_data: 'settings:prefix_set' },
          { text: '✏️ تعيين لاحقة الاسم', callback_data: 'settings:suffix_set' },
        ],
        [
          { text: '🗑️ مسح بادئة الاسم', callback_data: 'settings:prefix_clear' },
          { text: '🗑️ مسح لاحقة الاسم', callback_data: 'settings:suffix_clear' },
        ],
        [
          { text: '📝 تعيين بادئة الوصف', callback_data: 'settings:caption_prefix_set' },
          { text: '📝 تعيين لاحقة الوصف', callback_data: 'settings:caption_suffix_set' },
        ],
        [
          { text: '🗑️ مسح بادئة الوصف', callback_data: 'settings:caption_prefix_clear' },
          { text: '🗑️ مسح لاحقة الوصف', callback_data: 'settings:caption_suffix_clear' },
        ],
        [{ text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' }],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:prefix_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_prefix' } });
      await this.sendMessage(token, chatId, '✍️ أرسل البادئة المطلوبة لاسم الملف (مثال: <code>[Series]</code>):\n<i>(لإلغاء البادئة أرسل كلمة مسح أو -)</i>');
      return;
    }

    if (data === 'settings:suffix_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_suffix' } });
      await this.sendMessage(token, chatId, '✍️ أرسل اللاحقة المطلوبة لاسم الملف (مثال: <code>@MedPulseVIP</code>):\n<i>(لإلغاء اللاحقة أرسل كلمة مسح أو -)</i>');
      return;
    }

    if (data === 'settings:prefix_clear') {
      store.updateUser(userId, { namingPrefix: '' });
      await this.sendMessage(token, chatId, '✅ تم مسح بادئة اسم الملف.');
      return;
    }

    if (data === 'settings:suffix_clear') {
      store.updateUser(userId, { namingSuffix: '' });
      await this.sendMessage(token, chatId, '✅ تم مسح لاحقة اسم الملف.');
      return;
    }

    if (data === 'settings:caption_prefix_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_caption_prefix' } });
      await this.sendMessage(token, chatId, '✍️ أرسل بادئة الوصف المطلوبة:\n<i>(لإلغاء البادئة أرسل مسح أو -)</i>');
      return;
    }

    if (data === 'settings:caption_suffix_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_caption_suffix' } });
      await this.sendMessage(token, chatId, '✍️ أرسل لاحقة الوصف المطلوبة:\n<i>(لإلغاء اللاحقة أرسل مسح أو -)</i>');
      return;
    }

    if (data === 'settings:caption_prefix_clear') {
      store.updateUser(userId, { captionPrefix: '' });
      await this.sendMessage(token, chatId, '✅ تم مسح بادئة الوصف.');
      return;
    }

    if (data === 'settings:caption_suffix_clear') {
      store.updateUser(userId, { captionSuffix: '' });
      await this.sendMessage(token, chatId, '✅ تم مسح لاحقة الوصف.');
      return;
    }

    // AI Settings Menu
    if (data === 'settings:ai_menu') {
      const cfg = store.getConfig();
      const statusText = cfg.aiRenaming.enabled ? '🟢 مفعل تلقائياً' : '⚪ معطل';
      const autoApplyText = cfg.aiRenaming.autoApplyOnQueue ? '🟢 فوري على الطابور' : '⚪ يدوي';
      const patternText = cfg.aiRenaming.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]';
      const instructionsText = cfg.aiRenaming.customInstructions || '<i>لا توجد تعليمات مخصصة</i>';

      const text =
        `🤖 <b>إعدادات الذكاء الاصطناعي (AI Renaming & Analysis)</b>\n\n` +
        `• <b>حالة الذكاء الاصطناعي:</b> ${statusText}\n` +
        `• <b>صيغة التسمية (Naming Pattern):</b>\n  <code>${patternText}</code>\n` +
        `• <b>التطبيق الفوري على الطابور:</b> ${autoApplyText}\n` +
        `• <b>التعليمات والتوجيهات المخصصة:</b>\n  ${instructionsText}\n\n` +
        `<i>يستخدم الذكاء الاصطناعي أحدث موديلات Gemini لتحليل ملفات الفيديو والصوت واستخراج أسماء الأطباء والمواد بدقة فائقة.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: cfg.aiRenaming.enabled ? '⚪ إيقاف الذكاء الاصطناعي' : '🟢 تفعيل الذكاء الاصطناعي', callback_data: 'settings:ai_toggle' },
          { text: cfg.aiRenaming.autoApplyOnQueue ? '⚪ إيقاف التطبيق التلقائي' : '⚡ تطبيق فوري تلقائي', callback_data: 'settings:ai_auto_apply' },
        ],
        [
          { text: '🎯 تغيير نمط التسمية (Pattern)', callback_data: 'settings:ai_pattern' },
          { text: '✍️ تعيين تعليمات مخصصة للـ AI', callback_data: 'settings:ai_instructions' },
        ],
        [
          { text: '📝 اختيار نمط الوصف (Caption Styles)', callback_data: 'settings:caption_style' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:ai_auto_apply') {
      const cfg = store.getConfig();
      const newAuto = !cfg.aiRenaming.autoApplyOnQueue;
      store.updateConfig({
        aiRenaming: {
          ...cfg.aiRenaming,
          autoApplyOnQueue: newAuto,
        },
      });
      await this.answerCallbackQuery(
        token,
        callbackQuery.id,
        newAuto ? '⚡ تم تفعيل التطبيق الفوري التلقائي للـ AI' : '⚪ تم إيقاف التطبيق الفوري'
      );
      const updatedCfg = store.getConfig();
      const statusText = updatedCfg.aiRenaming.enabled ? '🟢 مفعل تلقائياً' : '⚪ معطل';
      const autoApplyText = updatedCfg.aiRenaming.autoApplyOnQueue ? '🟢 فوري على الطابور' : '⚪ يدوي';
      const patternText = updatedCfg.aiRenaming.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]';
      const instructionsText = updatedCfg.aiRenaming.customInstructions || '<i>لا توجد تعليمات مخصصة</i>';

      const text =
        `🤖 <b>إعدادات الذكاء الاصطناعي (AI Renaming & Analysis)</b>\n\n` +
        `• <b>حالة الذكاء الاصطناعي:</b> ${statusText}\n` +
        `• <b>صيغة التسمية (Naming Pattern):</b>\n  <code>${patternText}</code>\n` +
        `• <b>التطبيق الفوري على الطابور:</b> ${autoApplyText}\n` +
        `• <b>التعليمات والتوجيهات المخصصة:</b>\n  ${instructionsText}\n\n` +
        `<i>يستخدم الذكاء الاصطناعي أحدث موديلات Gemini لتحليل ملفات الفيديو والصوت واستخراج أسماء الأطباء والمواد بدقة فائقة.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: updatedCfg.aiRenaming.enabled ? '⚪ إيقاف الذكاء الاصطناعي' : '🟢 تفعيل الذكاء الاصطناعي', callback_data: 'settings:ai_toggle' },
          { text: updatedCfg.aiRenaming.autoApplyOnQueue ? '⚪ إيقاف التطبيق التلقائي' : '⚡ تطبيق فوري تلقائي', callback_data: 'settings:ai_auto_apply' },
        ],
        [
          { text: '🎯 تغيير نمط التسمية (Pattern)', callback_data: 'settings:ai_pattern' },
          { text: '✍️ تعيين تعليمات مخصصة للـ AI', callback_data: 'settings:ai_instructions' },
        ],
        [
          { text: '📝 اختيار نمط الوصف (Caption Styles)', callback_data: 'settings:caption_style' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:ai_pattern') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_ai_pattern' } });
      await this.sendMessage(
        token,
        chatId,
        `🎯 <b>تغيير نمط تسمية الملفات للذكاء الاصطناعي:</b>\n\n` +
        `أرسل النمط الجديد الآن عبر المحادثة، يمكنك استخدام المتغيرات التالية:\n` +
        `• <code>{subject}</code>: المادة الطبية (مثل: Embryology)\n` +
        `• <code>{doctor}</code>: اسم الدكتور (مثل: د. محمد شريف)\n` +
        `• <code>{topic}</code>: موضوع المحاضرة (مثل: Somites Development)\n` +
        `• <code>{part}</code>: رقم المحاضرة أو الجزء (مثل: 1)\n\n` +
        `<b>النمط الافتراضي الموصى به:</b>\n<code>{subject} - د. {doctor} - {topic} [Part {part}]</code>`
      );
      return;
    }

    if (data === 'settings:ai_instructions') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_ai_instructions' } });
      await this.sendMessage(
        token,
        chatId,
        `✍️ <b>تعليمات وتوجيهات مخصصة للذكاء الاصطناعي:</b>\n\n` +
        `أرسل توجيهاتك المخصصة الآن (مثال: <i>"اجعل اسم الدكتور باللغة العربية واكتب أسماء المواد بالإنجليزية دائماً ورقم المحاضرة Part X"</i>):\n\n` +
        `<i>(إذا أردت مسح التعليمات، أرسل كلمة <b>مسح</b> أو <b>-</b>)</i>`
      );
      return;
    }

    // AI Naming Toggle (ON / OFF)
    if (data === 'settings:ai_toggle') {
      const cfg = store.getConfig();
      const newEnabled = !cfg.aiRenaming.enabled;
      store.updateConfig({
        aiRenaming: {
          ...cfg.aiRenaming,
          enabled: newEnabled,
        },
      });
      await this.answerCallbackQuery(
        token,
        callbackQuery.id,
        newEnabled ? '🟢 تم تفعيل AI Naming بنجاح (معالجة تلقائية فورية)' : '⚪ تم إيقاف AI Naming (معالجة يدوية)'
      );
      const updatedUser = store.getUser(userId);
      await this.editMessageText(
        token,
        chatId,
        messageId,
        this.getSettingsOverviewText(updatedUser),
        this.getSettingsKeyboard(updatedUser)
      );
      return;
    }

    // Turbo Speed Menu
    if (data === 'settings:turbo') {
      const cfg = store.getConfig();
      const turbo = cfg.turboSpeed || {
        enabled: true,
        maxConcurrency: 16,
        fastStatusUpdates: true,
        preloadNextItem: true,
        cloudDirectDispatch: true,
      };

      const text =
        `⚡ <b>محرك السرعة الفائقة وتوازي المعالجة (Turbo Engine)</b>\n\n` +
        `• <b>الحالة العامة:</b> ${turbo.enabled ? '🟢 مفعل (أقصى أداء وسرعة)' : '⚪ معطل'}\n` +
        `• <b>مسارات المعالجة المتوازية:</b> <code>16 مسار MTProto متوازي</code>\n` +
        `• <b>التحديث اللحظي للتقدم (كل 3 ثوانٍ):</b> ${turbo.fastStatusUpdates ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>المعالجة المسبقة للطابور (Preload):</b> ${turbo.preloadNextItem ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>النقل السحابي المباشر (Cloud Dispatch):</b> ${turbo.cloudDirectDispatch ? '🟢 مفعل' : '⚪ معطل'}\n\n` +
        `<i>محرك السرعة الفائقة يضمن معالجة متوازية لجميع الفيديوهات والملفات الصوتية بسرعة تليجرام القصوى.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: turbo.enabled ? '⚪ إيقاف محرك Turbo' : '⚡ تفعيل محرك Turbo', callback_data: 'settings:turbo_toggle' },
        ],
        [
          { text: turbo.fastStatusUpdates ? '⏱️ التحديث السريع: 🟢' : '⏱️ التحديث السريع: ⚪', callback_data: 'settings:turbo_fast_updates' },
          { text: turbo.preloadNextItem ? '🔄 المعالجة المسبقة: 🟢' : '🔄 المعالجة المسبقة: ⚪', callback_data: 'settings:turbo_preload' },
        ],
        [
          { text: turbo.cloudDirectDispatch ? '🚀 النقل السحابي: 🟢' : '🚀 النقل السحابي: ⚪', callback_data: 'settings:turbo_cloud' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:turbo_toggle') {
      const cfg = store.getConfig();
      const cur = cfg.turboSpeed?.enabled ?? true;
      store.updateConfig({
        turboSpeed: {
          ...cfg.turboSpeed,
          enabled: !cur,
        },
      });
      await this.answerCallbackQuery(token, callbackQuery.id, !cur ? '⚡ تم تفعيل محرك Turbo' : '⚪ تم تعطيل محرك Turbo');
      const updatedCfg = store.getConfig();
      const turbo = updatedCfg.turboSpeed || {
        enabled: !cur,
        maxConcurrency: 16,
        fastStatusUpdates: true,
        preloadNextItem: true,
        cloudDirectDispatch: true,
      };

      const text =
        `⚡ <b>محرك السرعة الفائقة وتوازي المعالجة (Turbo Engine)</b>\n\n` +
        `• <b>الحالة العامة:</b> ${turbo.enabled ? '🟢 مفعل (أقصى أداء وسرعة)' : '⚪ معطل'}\n` +
        `• <b>مسارات المعالجة المتوازية:</b> <code>16 مسار MTProto متوازي</code>\n` +
        `• <b>التحديث اللحظي للتقدم (كل 3 ثوانٍ):</b> ${turbo.fastStatusUpdates ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>المعالجة المسبقة للطابور (Preload):</b> ${turbo.preloadNextItem ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>النقل السحابي المباشر (Cloud Dispatch):</b> ${turbo.cloudDirectDispatch ? '🟢 مفعل' : '⚪ معطل'}\n\n` +
        `<i>محرك السرعة الفائقة يضمن معالجة متوازية لجميع الفيديوهات والملفات الصوتية بسرعة تليجرام القصوى.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: turbo.enabled ? '⚪ إيقاف محرك Turbo' : '⚡ تفعيل محرك Turbo', callback_data: 'settings:turbo_toggle' },
        ],
        [
          { text: turbo.fastStatusUpdates ? '⏱️ التحديث السريع: 🟢' : '⏱️ التحديث السريع: ⚪', callback_data: 'settings:turbo_fast_updates' },
          { text: turbo.preloadNextItem ? '🔄 المعالجة المسبقة: 🟢' : '🔄 المعالجة المسبقة: ⚪', callback_data: 'settings:turbo_preload' },
        ],
        [
          { text: turbo.cloudDirectDispatch ? '🚀 النقل السحابي: 🟢' : '🚀 النقل السحابي: ⚪', callback_data: 'settings:turbo_cloud' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:turbo_fast_updates') {
      const cfg = store.getConfig();
      const cur = cfg.turboSpeed?.fastStatusUpdates ?? true;
      store.updateConfig({
        turboSpeed: {
          ...cfg.turboSpeed,
          fastStatusUpdates: !cur,
        },
      });
      await this.answerCallbackQuery(token, callbackQuery.id, !cur ? '⏱️ تم تفعيل التحديث السريع (3 ثوانٍ)' : '⚪ تم تعطيل التحديث السريع');
      const updatedCfg = store.getConfig();
      const turbo = updatedCfg.turboSpeed;
      const text =
        `⚡ <b>محرك السرعة الفائقة وتوازي المعالجة (Turbo Engine)</b>\n\n` +
        `• <b>الحالة العامة:</b> ${turbo.enabled ? '🟢 مفعل (أقصى أداء وسرعة)' : '⚪ معطل'}\n` +
        `• <b>مسارات المعالجة المتوازية:</b> <code>16 مسار MTProto متوازي</code>\n` +
        `• <b>التحديث اللحظي للتقدم (كل 3 ثوانٍ):</b> ${turbo.fastStatusUpdates ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>المعالجة المسبقة للطابور (Preload):</b> ${turbo.preloadNextItem ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>النقل السحابي المباشر (Cloud Dispatch):</b> ${turbo.cloudDirectDispatch ? '🟢 مفعل' : '⚪ معطل'}\n\n` +
        `<i>محرك السرعة الفائقة يضمن معالجة متوازية لجميع الفيديوهات والملفات الصوتية بسرعة تليجرام القصوى.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: turbo.enabled ? '⚪ إيقاف محرك Turbo' : '⚡ تفعيل محرك Turbo', callback_data: 'settings:turbo_toggle' },
        ],
        [
          { text: turbo.fastStatusUpdates ? '⏱️ التحديث السريع: 🟢' : '⏱️ التحديث السريع: ⚪', callback_data: 'settings:turbo_fast_updates' },
          { text: turbo.preloadNextItem ? '🔄 المعالجة المسبقة: 🟢' : '🔄 المعالجة المسبقة: ⚪', callback_data: 'settings:turbo_preload' },
        ],
        [
          { text: turbo.cloudDirectDispatch ? '🚀 النقل السحابي: 🟢' : '🚀 النقل السحابي: ⚪', callback_data: 'settings:turbo_cloud' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];
      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:turbo_preload') {
      const cfg = store.getConfig();
      const cur = cfg.turboSpeed?.preloadNextItem ?? true;
      store.updateConfig({
        turboSpeed: {
          ...cfg.turboSpeed,
          preloadNextItem: !cur,
        },
      });
      await this.answerCallbackQuery(token, callbackQuery.id, !cur ? '🔄 تم تفعيل المعالجة المسبقة للطابور' : '⚪ تم تعطيل المعالجة المسبقة');
      const updatedCfg = store.getConfig();
      const turbo = updatedCfg.turboSpeed;
      const text =
        `⚡ <b>محرك السرعة الفائقة وتوازي المعالجة (Turbo Engine)</b>\n\n` +
        `• <b>الحالة العامة:</b> ${turbo.enabled ? '🟢 مفعل (أقصى أداء وسرعة)' : '⚪ معطل'}\n` +
        `• <b>مسارات المعالجة المتوازية:</b> <code>16 مسار MTProto متوازي</code>\n` +
        `• <b>التحديث اللحظي للتقدم (كل 3 ثوانٍ):</b> ${turbo.fastStatusUpdates ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>المعالجة المسبقة للطابور (Preload):</b> ${turbo.preloadNextItem ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>النقل السحابي المباشر (Cloud Dispatch):</b> ${turbo.cloudDirectDispatch ? '🟢 مفعل' : '⚪ معطل'}\n\n` +
        `<i>محرك السرعة الفائقة يضمن معالجة متوازية لجميع الفيديوهات والملفات الصوتية بسرعة تليجرام القصوى.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: turbo.enabled ? '⚪ إيقاف محرك Turbo' : '⚡ تفعيل محرك Turbo', callback_data: 'settings:turbo_toggle' },
        ],
        [
          { text: turbo.fastStatusUpdates ? '⏱️ التحديث السريع: 🟢' : '⏱️ التحديث السريع: ⚪', callback_data: 'settings:turbo_fast_updates' },
          { text: turbo.preloadNextItem ? '🔄 المعالجة المسبقة: 🟢' : '🔄 المعالجة المسبقة: ⚪', callback_data: 'settings:turbo_preload' },
        ],
        [
          { text: turbo.cloudDirectDispatch ? '🚀 النقل السحابي: 🟢' : '🚀 النقل السحابي: ⚪', callback_data: 'settings:turbo_cloud' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];
      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:turbo_cloud') {
      const cfg = store.getConfig();
      const cur = cfg.turboSpeed?.cloudDirectDispatch ?? true;
      store.updateConfig({
        turboSpeed: {
          ...cfg.turboSpeed,
          cloudDirectDispatch: !cur,
        },
      });
      await this.answerCallbackQuery(token, callbackQuery.id, !cur ? '🚀 تم تفعيل النقل السحابي المباشر' : '⚪ تم تعطيل النقل السحابي');
      const updatedCfg = store.getConfig();
      const turbo = updatedCfg.turboSpeed;
      const text =
        `⚡ <b>محرك السرعة الفائقة وتوازي المعالجة (Turbo Engine)</b>\n\n` +
        `• <b>الحالة العامة:</b> ${turbo.enabled ? '🟢 مفعل (أقصى أداء وسرعة)' : '⚪ معطل'}\n` +
        `• <b>مسارات المعالجة المتوازية:</b> <code>16 مسار MTProto متوازي</code>\n` +
        `• <b>التحديث اللحظي للتقدم (كل 3 ثوانٍ):</b> ${turbo.fastStatusUpdates ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>المعالجة المسبقة للطابور (Preload):</b> ${turbo.preloadNextItem ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>النقل السحابي المباشر (Cloud Dispatch):</b> ${turbo.cloudDirectDispatch ? '🟢 مفعل' : '⚪ معطل'}\n\n` +
        `<i>محرك السرعة الفائقة يضمن معالجة متوازية لجميع الفيديوهات والملفات الصوتية بسرعة تليجرام القصوى.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: turbo.enabled ? '⚪ إيقاف محرك Turbo' : '⚡ تفعيل محرك Turbo', callback_data: 'settings:turbo_toggle' },
        ],
        [
          { text: turbo.fastStatusUpdates ? '⏱️ التحديث السريع: 🟢' : '⏱️ التحديث السريع: ⚪', callback_data: 'settings:turbo_fast_updates' },
          { text: turbo.preloadNextItem ? '🔄 المعالجة المسبقة: 🟢' : '🔄 المعالجة المسبقة: ⚪', callback_data: 'settings:turbo_preload' },
        ],
        [
          { text: turbo.cloudDirectDispatch ? '🚀 النقل السحابي: 🟢' : '🚀 النقل السحابي: ⚪', callback_data: 'settings:turbo_cloud' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];
      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    // Caption Style Selection Menu
    if (data === 'settings:caption_style') {
      const cfg = store.getConfig();
      const currentStyleId = cfg.aiRenaming.captionStyle || 'medpulse_box';
      const sample = generateFormattedCaption(
        {
          doctor: 'د. محمد شريف',
          subject: 'Embryology',
          topic: 'Somites Development',
          part: '1',
        },
        cfg.aiRenaming
      );

      const buttons: InlineKeyboardButton[][] = CAPTION_PRESETS.filter(p => p.id !== 'custom').map((preset) => [
        {
          text: `${preset.id === currentStyleId ? '✅ ' : ''}${preset.name}`,
          callback_data: `settings:set_caption:${preset.id}`,
        },
      ]);

      buttons.push([
        { text: '🎨 تعيين قالب مخصص (Custom Template)', callback_data: 'settings:custom_caption_input' },
      ]);

      buttons.push([
        { text: '🔙 العودة للإعدادات الرئيسية', callback_data: 'settings:main' },
      ]);

      const activePreset = CAPTION_PRESETS.find((p) => p.id === currentStyleId) || CAPTION_PRESETS[0];

      await this.editMessageText(
        token,
        chatId,
        messageId,
        `📝 <b>أنماط تنسيق الوصف (Caption Styles)</b>\n\n` +
        `اختر النمط المناسب؛ سيتم اعتماده وتطبيقه تلقائياً على كافة الملفات الواردة:\n\n` +
        `<b>النمط الحالي:</b> ${activePreset.name} (${activePreset.badge})\n` +
        `<i>${activePreset.description}</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🔍 <b>معاينة حية للنمط:</b>\n\n` +
        `${sample}\n` +
        `━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: buttons }
      );
      return;
    }

    if (data === 'settings:custom_caption_input') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_custom_caption_template' } });
      await this.sendMessage(
        token,
        chatId,
        `🎨 <b>تعيين قالب مخصص لوصف الملفات (Custom Caption Template):</b>\n\n` +
        `أرسل القالب المطلوب الآن عبر المحادثة، يمكنك استخدام المتغيرات التلقائية التالية:\n` +
        `• <code>{medpulse_link}</code>: رابط المنصة أو القناة الترويجية\n` +
        `• <code>{subject}</code>: اسم المادة الطبية\n` +
        `• <code>{doctor}</code>: اسم الدكتور والمحاضر\n` +
        `• <code>{topic}</code>: عنوان المحاضرة\n` +
        `• <code>{part}</code>: رقم المحاضرة أو الجزء\n` +
        `• <code>#{hashtag}</code>: الهاشتاج التلقائي\n\n` +
        `<i>مثال:</i>\n` +
        `<code>📚 المادة: {subject}\n👨‍🏫 المحاضر: د. {doctor}\n📌 العنوان: {topic} (Part {part})\n\n{medpulse_link}</code>`
      );
      return;
    }

    // Handle Setting a Caption Style
    if (data.startsWith('settings:set_caption:')) {
      const targetStyleId = data.replace('settings:set_caption:', '');
      const cfg = store.getConfig();
      store.updateConfig({
        aiRenaming: {
          ...cfg.aiRenaming,
          captionStyle: targetStyleId,
        },
      });

      const selectedPreset = CAPTION_PRESETS.find((p) => p.id === targetStyleId) || CAPTION_PRESETS[0];
      await this.answerCallbackQuery(
        token,
        callbackQuery.id,
        `✅ تم تفعيل: ${selectedPreset.name}`
      );

      // Refresh caption style menu
      const updatedCfg = store.getConfig();
      const sample = generateFormattedCaption(
        {
          doctor: 'د. محمد شريف',
          subject: 'Embryology',
          topic: 'Somites Development',
          part: '1',
        },
        updatedCfg.aiRenaming
      );

      const buttons: InlineKeyboardButton[][] = CAPTION_PRESETS.filter(p => p.id !== 'custom').map((preset) => [
        {
          text: `${preset.id === targetStyleId ? '✅ ' : ''}${preset.name}`,
          callback_data: `settings:set_caption:${preset.id}`,
        },
      ]);

      buttons.push([
        { text: '🔙 العودة للإعدادات الرئيسية', callback_data: 'settings:main' },
      ]);

      await this.editMessageText(
        token,
        chatId,
        messageId,
        `📝 <b>أنماط تنسيق الوصف (Caption Styles)</b>\n\n` +
        `✅ <b>تم تفعيل النمط بنجاح:</b> ${selectedPreset.name}\n` +
        `<i>${selectedPreset.description}</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🔍 <b>معاينة حية للنمط المختار:</b>\n\n` +
        `${sample}\n` +
        `━━━━━━━━━━━━━━━━━━━`,
        { inline_keyboard: buttons }
      );
      return;
    }

    // Main settings menu return
    if (data === 'settings:main') {
      await this.editMessageText(
        token,
        chatId,
        messageId,
        this.getSettingsOverviewText(user),
        this.getSettingsKeyboard(user)
      );
      return;
    }
  }

  private static async handleMessage(token: string, message: any) {
    const userId = String(message.from.id);
    const chatId = message.chat.id;
    const text = message.text?.trim();
    const user = store.getUser(userId);

    // Update user display details
    if (message.from.first_name || message.from.username) {
      store.updateUser(userId, {
        firstName: message.from.first_name || user.firstName,
        username: message.from.username || user.username,
      });
    }

    // 1. Check for /settings and /start command
    if (text === '/settings' || text === '/start') {
      store.updateUser(userId, { pendingAction: undefined });
      await this.sendMessage(
        token,
        chatId,
        this.getSettingsOverviewText(user),
        this.getSettingsKeyboard(user)
      );
      return;
    }

    // Emergency stop / reset commands (/stop, /cancel, /cancel_all, /reset)
    if (text === '/stop' || text === '/cancel' || text === '/cancel_all' || text === '/reset') {
      const res = queueWorker.emergencyStopAndReset();
      await this.sendMessage(
        token,
        chatId,
        `🛑 <b>تم إيقاف كافة العمليات وتصفير الطابور بنجاح!</b>\n\n` +
        `• تم إلغاء وحذف <b>${res.cancelledCount}</b> عملية جارية ومؤجلة.\n` +
        `• تم تنظيف ومسح ملفات المعالجة المؤقتة وتفريغ الذاكرة.\n` +
        `• البوت الآن جاهز تماماً وبإمكانك إرسال أي ملفات جديدة متى ما أردت.`
      );
      return;
    }

    // Turbo Speed quick command
    if (text === '/turbo') {
      const cfg = store.getConfig();
      const turbo = cfg.turboSpeed || {
        enabled: true,
        maxConcurrency: 16,
        fastStatusUpdates: true,
        preloadNextItem: true,
        cloudDirectDispatch: true,
      };
      const textMsg =
        `⚡ <b>محرك السرعة الفائقة وتوازي المعالجة (Turbo Engine)</b>\n\n` +
        `• <b>الحالة العامة:</b> ${turbo.enabled ? '🟢 مفعل (أقصى أداء وسرعة)' : '⚪ معطل'}\n` +
        `• <b>مسارات المعالجة المتوازية:</b> <code>16 مسار MTProto متوازي</code>\n` +
        `• <b>التحديث اللحظي للتقدم (كل 3 ثوانٍ):</b> ${turbo.fastStatusUpdates ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>المعالجة المسبقة للطابور (Preload):</b> ${turbo.preloadNextItem ? '🟢 مفعل' : '⚪ معطل'}\n` +
        `• <b>النقل السحابي المباشر (Cloud Dispatch):</b> ${turbo.cloudDirectDispatch ? '🟢 مفعل' : '⚪ معطل'}`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: turbo.enabled ? '⚪ إيقاف محرك Turbo' : '⚡ تفعيل محرك Turbo', callback_data: 'settings:turbo_toggle' },
        ],
        [
          { text: turbo.fastStatusUpdates ? '⏱️ التحديث السريع: 🟢' : '⏱️ التحديث السريع: ⚪', callback_data: 'settings:turbo_fast_updates' },
          { text: turbo.preloadNextItem ? '🔄 المعالجة المسبقة: 🟢' : '🔄 المعالجة المسبقة: ⚪', callback_data: 'settings:turbo_preload' },
        ],
        [
          { text: turbo.cloudDirectDispatch ? '🚀 النقل السحابي: 🟢' : '🚀 النقل السحابي: ⚪', callback_data: 'settings:turbo_cloud' },
        ],
        [{ text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' }],
      ];

      await this.sendMessage(token, chatId, textMsg, { inline_keyboard: keyboard });
      return;
    }

    // AI quick command
    if (text === '/ai') {
      const cfg = store.getConfig();
      const statusText = cfg.aiRenaming.enabled ? '🟢 مفعل تلقائياً' : '⚪ معطل';
      const autoApplyText = cfg.aiRenaming.autoApplyOnQueue ? '🟢 فوري على الطابور' : '⚪ يدوي';
      const patternText = cfg.aiRenaming.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]';
      const instructionsText = cfg.aiRenaming.customInstructions || '<i>لا توجد تعليمات مخصصة</i>';

      const textMsg =
        `🤖 <b>إعدادات الذكاء الاصطناعي (AI Renaming & Analysis)</b>\n\n` +
        `• <b>حالة الذكاء الاصطناعي:</b> ${statusText}\n` +
        `• <b>صيغة التسمية (Naming Pattern):</b>\n  <code>${patternText}</code>\n` +
        `• <b>التطبيق الفوري على الطابور:</b> ${autoApplyText}\n` +
        `• <b>التعليمات والتوجيهات المخصصة:</b>\n  ${instructionsText}\n\n` +
        `<i>يستخدم الذكاء الاصطناعي أحدث موديلات Gemini لتحليل ملفات الفيديو والصوت واستخراج أسماء الأطباء والمواد بدقة فائقة.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: cfg.aiRenaming.enabled ? '⚪ إيقاف الذكاء الاصطناعي' : '🟢 تفعيل الذكاء الاصطناعي', callback_data: 'settings:ai_toggle' },
          { text: cfg.aiRenaming.autoApplyOnQueue ? '⚪ إيقاف التطبيق التلقائي' : '⚡ تطبيق فوري تلقائي', callback_data: 'settings:ai_auto_apply' },
        ],
        [
          { text: '🎯 تغيير نمط التسمية (Pattern)', callback_data: 'settings:ai_pattern' },
          { text: '✍️ تعيين تعليمات مخصصة للـ AI', callback_data: 'settings:ai_instructions' },
        ],
        [
          { text: '📝 اختيار نمط الوصف (Caption Styles)', callback_data: 'settings:caption_style' },
        ],
        [
          { text: '🔙 رجوع للإعدادات الرئيسية', callback_data: 'settings:main' },
        ],
      ];

      await this.sendMessage(token, chatId, textMsg, { inline_keyboard: keyboard });
      return;
    }

    // 2. Check for Thumbnail Commands: /setthumb, /thumbnail, /thumb, /viewthumb, /delthumb
    const isPhoto = !!(message.photo && message.photo.length > 0);
    const isImageDoc = !!(
      message.document &&
      (message.document.mime_type?.startsWith('image/') ||
        /\.(jpe?g|png|webp|bmp)$/i.test(message.document.file_name || ''))
    );
    const isExplicitThumbCmd = text === '/setthumb' || text === '/thumbnail' || text === '/thumb';
    const isAwaitingThumb = user.pendingAction?.type === 'awaiting_thumbnail';

    if (text === '/viewthumb') {
      if (user.thumbnail?.url) {
        await this.sendPhoto(token, chatId, user.thumbnail.url, '🖼️ الصورة المصغرة الحالية المعتمدة لجميع فيديوهاتك');
      } else {
        await this.sendMessage(token, chatId, 'لا توجد صورة مصغرة محفوظة حالياً ❌');
      }
      return;
    }

    if (text === '/delthumb') {
      store.updateUser(userId, { thumbnail: undefined, pendingAction: undefined });
      await this.sendMessage(token, chatId, '✅ تم حذف الصورة المصغرة بنجاح.');
      return;
    }

    if (isExplicitThumbCmd && !isPhoto && !isImageDoc) {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_thumbnail' } });
      await this.sendMessage(
        token,
        chatId,
        '🖼️ <b>تعيين صورة مصغرة (Thumbnail)</b>\n\nأرسل الصورة الآن (صورة عادية أو كملف صورة)، وسيقوم البوت تلقائياً بتنسيقها ومطابقتها لمعايير تليجرام المعتمدة (JPEG 320x320) وتطبيقها فوراً على كل الفيديوهات القادمة.'
      );
      return;
    }

    // Process Thumbnail when photo or image document is received
    if (isPhoto || (isImageDoc && (isAwaitingThumb || !message.caption || isExplicitThumbCmd))) {
      let fileId = '';
      let imageBuffer: Buffer | null = null;
      let photoUrl = '';

      if (isPhoto) {
        const largestPhoto = message.photo[message.photo.length - 1];
        fileId = largestPhoto.file_id;
        if (largestPhoto.url) photoUrl = largestPhoto.url;
      } else if (message.document) {
        fileId = message.document.file_id;
      }

      if (token && fileId && !photoUrl) {
        try {
          const fileRes = await this.getFile(token, fileId);
          if (fileRes.ok && fileRes.result?.file_path) {
            const dlUrl = `https://api.telegram.org/file/bot${token}/${fileRes.result.file_path}`;
            photoUrl = dlUrl;
            const res = await fetch(dlUrl);
            if (res.ok) {
              const arr = await res.arrayBuffer();
              imageBuffer = Buffer.from(arr);
            }
          }
        } catch (err) {
          console.warn('Could not fetch thumbnail image from Telegram:', err);
        }
      }

      // Standardize image into Telegram standard 320x320 JPEG (< 200KB) + Master
      let stdResult: any = null;
      if (imageBuffer) {
        stdResult = await FileProcessor.standardizeThumbnail(imageBuffer, userId);
      } else if (photoUrl) {
        stdResult = await FileProcessor.standardizeThumbnail(photoUrl, userId);
      }

      const finalUrl = stdResult?.dataUrl || photoUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';

      store.updateUser(userId, {
        thumbnail: {
          id: `thumb_${Date.now()}`,
          fileId,
          url: finalUrl,
          dataUrl: stdResult?.dataUrl,
          standard320Path: stdResult?.standard320Path,
          updatedAt: Date.now(),
        },
        pendingAction: undefined,
      });

      const dimInfo = stdResult
        ? `\n• الأبعاد المعتمدة: <b>${stdResult.width}x${stdResult.height} px</b>\n• الحجم: <b>${(stdResult.sizeBytes / 1024).toFixed(1)} KB</b>`
        : '';

      await this.sendMessage(
        token,
        chatId,
        `✅ <b>تم تعيين واعتماد الصورة المصغرة بنجاح!</b>${dimInfo}\n• الصيغة: <b>JPEG قياسية متوافقة 100% مع معايير Telegram الرسمية</b>\n\n<i>سيتم دمج هذه الصورة تلقائياً في حاوية كل مقطع فيديو وملف يتم نشره في القناة.</i>`
      );
      return;
    }

    // 3. Check for Pending Actions (e.g. tag text, channel, forbidden words, etc.)
    if (user.pendingAction && text) {
      const action = user.pendingAction.type;

      if (action === 'awaiting_tag_text') {
        store.updateUser(userId, {
          pendingAction: {
            type: 'awaiting_tag_text',
            data: { tagText: text },
          },
        });

        const keyboard: InlineKeyboardButton[][] = [
          [
            { text: 'قبل العنوان (before)', callback_data: 'tag_pos:before' },
            { text: 'بعد العنوان (after)', callback_data: 'tag_pos:after' },
          ],
        ];

        await this.sendMessage(
          token,
          chatId,
          `اختر أين تريد وضع الوسم "<b>${text}</b>":`,
          { inline_keyboard: keyboard }
        );
        return;
      }

      if (action === 'awaiting_channel') {
        const targetChannel = text;
        const check = await this.verifyUserChannelPermissions(token, targetChannel, userId);

        if (!check.valid) {
          await this.sendMessage(
            token,
            chatId,
            `❌ <b>فشل تعيين القناة:</b>\n\n${check.error}\n\n<i>يجب أن تكون مشرفاً (Administrator) في القناة حتى تتمكن من استخدام هذه القناة للنشر.</i>`
          );
          return;
        }

        store.updateUser(userId, {
          channel: {
            chatId: targetChannel,
            title: check.title || targetChannel,
            publishingEnabled: true,
            lastVerifiedAt: Date.now(),
            verifiedAdmin: true,
            statusMessage: 'تم التحقق بنجاح من صلاحيات الإشراف',
          },
          pendingAction: undefined,
        });

        await this.sendMessage(
          token,
          chatId,
          `✅ <b>تم تعيين قناة النشر بنجاح!</b>\n\nالقناة: <b>${check.title || targetChannel}</b>\nالحالة: النشر مفعل 🟢`
        );
        return;
      }

      if (action === 'awaiting_forbidden_word') {
        const words = user.forbiddenWords || [];
        const rawItems = text
          .split(/[\n,]+/)
          .map((w) => w.trim().replace(/^['"`]+|['"`]+$/g, ''))
          .filter(Boolean);

        for (const w of rawItems) {
          if (!words.includes(w)) {
            words.push(w);
          }
        }
        store.updateUser(userId, {
          forbiddenWords: words,
          pendingAction: undefined,
        });
        await this.sendMessage(
          token,
          chatId,
          `✅ تمت إضافة الكلمات المحظورة بنجاح: ${rawItems.map((w) => `<code>${w}</code>`).join(', ')}.\nسيتم حذفها تلقائياً وبكافة صيغها من الأسماء والأوصاف.`
        );
        return;
      }

      if (action === 'awaiting_prefix') {
        const clean = text.trim();
        const isClear = ['-', 'حذف', 'مسح', 'clear', 'none', 'لا شيء'].includes(clean.toLowerCase());
        store.updateUser(userId, {
          namingPrefix: isClear ? '' : clean,
          pendingAction: undefined,
        });
        await this.sendMessage(
          token,
          chatId,
          isClear ? '✅ تم مسح بادئة اسم الملف.' : `✅ تم تعيين بادئة اسم الملف: <b>${clean}</b>`
        );
        return;
      }

      if (action === 'awaiting_suffix') {
        const clean = text.trim();
        const isClear = ['-', 'حذف', 'مسح', 'clear', 'none', 'لا شيء'].includes(clean.toLowerCase());
        store.updateUser(userId, {
          namingSuffix: isClear ? '' : clean,
          pendingAction: undefined,
        });
        await this.sendMessage(
          token,
          chatId,
          isClear ? '✅ تم مسح لاحقة اسم الملف.' : `✅ تم تعيين لاحقة اسم الملف: <b>${clean}</b>`
        );
        return;
      }

      if (action === 'awaiting_caption_prefix') {
        const clean = text.trim();
        const isClear = ['-', 'حذف', 'مسح', 'clear', 'none', 'لا شيء'].includes(clean.toLowerCase());
        store.updateUser(userId, {
          captionPrefix: isClear ? '' : clean,
          pendingAction: undefined,
        });
        await this.sendMessage(
          token,
          chatId,
          isClear ? '✅ تم مسح بادئة الوصف.' : `✅ تم تعيين بادئة الوصف: <b>${clean}</b>`
        );
        return;
      }

      if (action === 'awaiting_caption_suffix') {
        const clean = text.trim();
        const isClear = ['-', 'حذف', 'مسح', 'clear', 'none', 'لا شيء'].includes(clean.toLowerCase());
        store.updateUser(userId, {
          captionSuffix: isClear ? '' : clean,
          pendingAction: undefined,
        });
        await this.sendMessage(
          token,
          chatId,
          isClear ? '✅ تم مسح لاحقة الوصف.' : `✅ تم تعيين لاحقة الوصف: <b>${clean}</b>`
        );
        return;
      }

      if (action === 'awaiting_ai_pattern') {
        const clean = text.trim();
        const cfg = store.getConfig();
        store.updateConfig({
          aiRenaming: {
            ...cfg.aiRenaming,
            namingPattern: clean,
          },
        });
        store.updateUser(userId, { pendingAction: undefined });
        await this.sendMessage(
          token,
          chatId,
          `✅ <b>تم تعيين نمط التسمية للذكاء الاصطناعي بنجاح:</b>\n<code>${clean}</code>\n\n<i>سيتم اعتماده وتطبيقه على كافة الملفات القادمة.</i>`
        );
        return;
      }

      if (action === 'awaiting_ai_instructions') {
        const clean = text.trim();
        const isClear = ['-', 'حذف', 'مسح', 'clear', 'none', 'لا شيء'].includes(clean.toLowerCase());
        const cfg = store.getConfig();
        store.updateConfig({
          aiRenaming: {
            ...cfg.aiRenaming,
            customInstructions: isClear ? '' : clean,
          },
        });
        store.updateUser(userId, { pendingAction: undefined });
        await this.sendMessage(
          token,
          chatId,
          isClear
            ? '✅ تم مسح التعليمات المخصصة للذكاء الاصطناعي.'
            : `✅ <b>تم حفظ التعليمات المخصصة للذكاء الاصطناعي بنجاح:</b>\n<i>${clean}</i>`
        );
        return;
      }

      if (action === 'awaiting_custom_caption_template') {
        const clean = text.trim();
        const cfg = store.getConfig();
        store.updateConfig({
          aiRenaming: {
            ...cfg.aiRenaming,
            captionStyle: 'custom',
            customCaptionTemplate: clean,
          },
        });
        store.updateUser(userId, { pendingAction: undefined });
        await this.sendMessage(
          token,
          chatId,
          `✅ <b>تم تعيين القالب المخصص للوصف واعتماده بنجاح!</b>\n\n<code>${clean}</code>\n\n<i>سيتم استخدامه لتنسيق وصف كافة الملفات القادمة.</i>`
        );
        return;
      }
    }

    // 4. Video, Audio, Voice, or Document Received -> Add to Pipeline Queue
    if (message.video || message.audio || message.voice || message.document) {
      const isVideo = !!message.video;
      const isAudio = !!message.audio || !!message.voice;
      const isVoice = !!message.voice;
      const media = message.video || message.audio || message.voice || message.document;
      const fileId = media.file_id;
      const duration = media.duration;
      const width = isVideo ? message.video!.width : undefined;
      const height = isVideo ? message.video!.height : undefined;
      const performer = message.audio?.performer;
      const title = message.audio?.title;

      let originalFilename = '';
      if (isVideo) {
        originalFilename = message.video!.file_name || `Video_${Date.now().toString().slice(-4)}.mp4`;
      } else if (message.audio) {
        if (message.audio.file_name) {
          originalFilename = message.audio.file_name;
        } else {
          const p = message.audio.performer ? message.audio.performer.trim() : '';
          const t = message.audio.title ? message.audio.title.trim() : '';
          if (p && t) {
            originalFilename = `${p} - ${t}.mp3`;
          } else if (t) {
            originalFilename = `${t}.mp3`;
          } else {
            originalFilename = `Audio_${Date.now().toString().slice(-4)}.mp3`;
          }
        }
      } else if (isVoice) {
        originalFilename = `Voice_${Date.now().toString().slice(-4)}.ogg`;
      } else {
        originalFilename = message.document!.file_name || `Document_${Date.now().toString().slice(-4)}.bin`;
      }

      const originalCaption = message.caption || '';
      const fileSize = media.file_size || (isAudio ? 12 * 1024 * 1024 : 35 * 1024 * 1024);

      // Try to obtain real direct streaming/preview URL if file is within Telegram's direct download limits
      let mediaUrl: string | undefined = undefined;
      if (token && fileId && fileSize <= 20 * 1024 * 1024) {
        try {
          const fileRes = await this.getFile(token, fileId);
          if (fileRes.ok && fileRes.result?.file_path) {
            mediaUrl = `https://api.telegram.org/file/bot${token}/${fileRes.result.file_path}`;
          }
        } catch {
          // Non-blocking
        }
      }

      // Extract forward and source metadata
      const forwardMeta = extractForwardMetadata(message);

      // Format duration text if duration is present
      const durationText = duration
        ? `\n• المدة: <b>${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')} دقيقة</b>`
        : '';

      const mediaLabel = isVideo ? 'الفيديو' : (isAudio ? (isVoice ? 'التسجيل الصوتي' : 'الملف الصوتي') : 'المستند');

      // Create initial status message in chat to edit later
      const initialNotice = forwardMeta.isForwarded
        ? `<i>🔄 جاري فحص وتثبيت الترتيب الأصلي في القناة المصدر...</i>`
        : `<i>جاري إدراجه في طابور المعالجة بالترتيب الدقيق...</i>`;

      const initialStatusText = `📥 <b>جاري استلام ${mediaLabel}...</b>\n\n• الملف: <code>${originalFilename}</code>\n• الحجم: ${(fileSize / (1024 * 1024)).toFixed(1)} MB${durationText}\n${initialNotice}`;
      const statusSendRes = await this.sendMessage(token, chatId, initialStatusText);
      const statusMsgId = statusSendRes.ok ? statusSendRes.result?.message_id : undefined;

      const queueType: QueueItemType = isVideo ? 'video' : (isAudio ? 'audio' : 'document');
      const defaultMime = isVideo ? 'video/mp4' : (isAudio ? (isVoice ? 'audio/ogg' : 'audio/mpeg') : 'application/octet-stream');

      // Delegate to forwardBatchManager for strict channel source ordering and debounced batching
      forwardBatchManager.addOrBuffer({
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        token,
        userId,
        userFirstName: user.firstName,
        chatId: String(chatId),
        messageId: message.message_id,
        type: queueType,
        fileId,
        duration,
        width,
        height,
        performer,
        title,
        originalFilename,
        originalCaption,
        fileSize,
        mimeType: media.mime_type || defaultMime,
        mediaUrl,
        statusTelegramMessageId: statusMsgId,
        targetChannelId: user.channel?.chatId || '@MediaHubArabic',
        targetChannelTitle: user.channel?.title || 'قناة ميديا العرب الرسمية',
        meta: forwardMeta,
        receivedAt: Date.now(),
      });

      return;
    }

    // 5. Plain Text Message Received -> Treat as regular independent content in Queue
    if (text) {
      const initialStatusText = `📝 <b>تم استلام الرسالة النصية</b>\n\nالمحتوى: "${text}"\n<i>تمت إضافتها إلى طابور النشر للحفاظ على الترتيب...</i>`;
      const statusSendRes = await this.sendMessage(token, chatId, initialStatusText);
      const statusMsgId = statusSendRes.ok ? statusSendRes.result?.message_id : undefined;

      const queueItem = store.addToQueue({
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId,
        userFirstName: user.firstName,
        chatId: String(chatId),
        type: 'text',
        textContent: text,
        originalCaption: text,
        status: 'queued',
        statusMessage: 'في قائمة الانتظار للنشر التسلسلي',
        statusTelegramMessageId: statusMsgId,
        targetChannelId: user.channel?.chatId || '@MediaHubArabic',
        targetChannelTitle: user.channel?.title || 'قناة ميديا العرب الرسمية',
      });

      if (statusMsgId) {
        await this.editMessageText(
          token,
          chatId,
          statusMsgId,
          `📝 <b>تم إدراج الرسالة النصية في الطابور!</b>\n\n• الترتيب: <b>#${queueItem.sequenceNumber}</b>\n• المحتوى: "${text}"\n• الحالة: ⏳ سيتم نشرها في القناة بنفس تسلسل وصولها.`
        );
      }
      return;
    }
  }
}
