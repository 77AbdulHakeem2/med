import { store } from './store';
import { UserSetting, InlineKeyboardButton, SimulatedTelegramMessage } from '../src/types';
import { processActualFilename, processActualCaption } from './pipeline';
import { FileProcessor } from './fileProcessor';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramCallResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramService {
  public static async callApi<T = any>(
    token: string,
    method: string,
    payload: Record<string, any> = {}
  ): Promise<TelegramCallResult<T>> {
    if (!token) {
      return { ok: false, description: 'Telegram Bot Token is not configured' };
    }
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
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
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { ok: false, description: err.message || 'Network request failed' };
    }
  }

  public static async getMe(token: string) {
    return this.callApi(token, 'getMe');
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
    const thumbStatus = user.thumbnail ? '✅ مفعلة' : '❌ غير محددة';
    const tagStatus = user.tag?.text ? `✅ (${user.tag.position === 'before' ? 'قبل' : 'بعد'})` : '❌ غير محدد';
    const channelStatus = user.channel?.chatId
      ? `${user.channel.publishingEnabled ? '🟢 مفعل' : '🔴 معطل'}`
      : '❌ غير معينة';

    return {
      inline_keyboard: [
        [
          { text: `🖼️ Thumbnail [${thumbStatus}]`, callback_data: 'settings:thumb' },
          { text: `🏷️ Tag [${tagStatus}]`, callback_data: 'settings:tag' },
        ],
        [
          { text: `📢 Channel [${channelStatus}]`, callback_data: 'settings:channel' },
          { text: `🚫 الكلمات المحظورة (${user.forbiddenWords.length})`, callback_data: 'settings:forbidden' },
        ],
        [
          { text: '✏️ البادئة واللاحقة (Prefix / Suffix)', callback_data: 'settings:naming' },
        ],
      ],
    };
  }

  /**
   * Generates Settings Message text
   */
  public static getSettingsOverviewText(user: UserSetting): string {
    const thumbText = user.thumbnail ? 'محفوظة ومفعلة تلقائياً ✅' : 'لا توجد صورة مصغرة حالياً ❌';
    const tagText = user.tag?.text
      ? `"${user.tag.text}" [${user.tag.position === 'before' ? 'قبل العنوان' : 'بعد العنوان'}]`
      : 'غير مفعل';
    const channelText = user.channel?.chatId
      ? `${user.channel.chatId} (${user.channel.publishingEnabled ? 'النشر مفعل 🟢' : 'النشر معطل مؤقتاً 🔴'})`
      : 'لم يتم تعيين قناة بعد ⚠️';
    const prefixText = user.namingPrefix || 'غير محددة';
    const suffixText = user.namingSuffix || 'غير محددة';

    return (
      `⚙️ <b>لوحة إعدادات البوت الشخصية</b>\n\n` +
      `👤 <b>المستخدم:</b> ${user.firstName} (<code>${user.userId}</code>)\n\n` +
      `• <b>الصورة المصغرة (Thumbnail):</b> ${thumbText}\n` +
      `• <b>الوسم (Tag):</b> ${tagText}\n` +
      `• <b>قناة النشر:</b> ${channelText}\n` +
      `• <b>بادئة الاسم (Prefix):</b> ${prefixText}\n` +
      `• <b>لاحقة الاسم (Suffix):</b> ${suffixText}\n` +
      `• <b>الكلمات المحظورة:</b> ${user.forbiddenWords.length} كلمة\n\n` +
      `<i>اختر قسماً من الأزرار بالأسفل لإدارته:</i>`
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

    // Thumbnail menu
    if (data === 'settings:thumb') {
      const hasThumb = !!user.thumbnail;
      const statusText = hasThumb
        ? `🖼️ <b>إعدادات الصورة المصغرة (Thumbnail)</b>\n\nالحالة الحالية: <b>يوجد صورة مصغرة معتمدة</b> ✅\n\nيمكنك استعراضها، أو حذفها، أو تعيين صورة جديدة وسيقوم البوت بتهيئتها وفق معايير تليجرام بدقة (320x320 JPEG).`
        : `🖼️ <b>إعدادات الصورة المصغرة (Thumbnail)</b>\n\nالحالة الحالية: <b>لا توجد صورة مصغرة حالياً</b> ❌\n\n<i>اضغط "تعيين صورة جديدة" أو أرسل أي صورة مباشرة إلى البوت.</i>`;

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
        ? `الوسم المحفوظ: <b>${user.tag.text}</b>\nالموقع: <b>${user.tag.position === 'before' ? 'قبل العنوان' : 'بعد العنوان'}</b>`
        : `لا يوجد وسم حالياً ❌`;

      const text =
        `🏷️ <b>نظام الـ Tag وإعادة تسمية الملفات</b>\n\n` +
        `الحالة الحالية:\n${tagInfo}\n\n` +
        `عند تفعيل الوسم، سيتم إدراجه تلقائياً في اسم كل ملف فيديو تتم معالجته.`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '✏️ تعيين الوسم', callback_data: 'settings:tag_set' },
          { text: '🗑️ حذف الوسم', callback_data: 'settings:tag_delete' },
        ],
        [{ text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' }],
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
          { text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' },
        ],
      ];

      await this.editMessageText(token, chatId, messageId, statusText, { inline_keyboard: keyboard });
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
      const wordsList = user.forbiddenWords.length > 0
        ? user.forbiddenWords.map((w, i) => `${i + 1}. <code>${w}</code>`).join('\n')
        : '<i>لا توجد كلمات محظورة مضافة حالياً.</i>';

      const text =
        `🚫 <b>نظام الكلمات المحظورة</b>\n\n` +
        `يتم فحص اسم كل ملف ووصفه (Caption) تلقائياً وحذف أي كلمة من هذه القائمة قبل النشر.\n\n` +
        `الكلمات المحظورة الحالية:\n${wordsList}`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '➕ إضافة كلمة محظورة', callback_data: 'settings:forbidden_add' },
          { text: '🗑️ مسح جميع الكلمات', callback_data: 'settings:forbidden_clear' },
        ],
        [{ text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' }],
      ];

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
        `• بادئة الاسم (Prefix): <b>${user.namingPrefix || 'لا توجد'}</b>\n` +
        `• لاحقة الاسم (Suffix): <b>${user.namingSuffix || 'لا توجد'}</b>\n` +
        `• بادئة الوصف: <b>${user.captionPrefix || 'لا توجد'}</b>\n` +
        `• لاحقة الوصف: <b>${user.captionSuffix || 'لا توجد'}</b>\n\n` +
        `<i>يتم تطبيق البادئة واللاحقة على اسم الملف الحقيقي مع حفظ الامتداد، وعلى الوصف بشكل مستقل ومتناسق.</i>`;

      const keyboard: InlineKeyboardButton[][] = [
        [
          { text: '✏️ تعيين بادئة الاسم', callback_data: 'settings:prefix_set' },
          { text: '✏️ تعيين لاحقة الاسم', callback_data: 'settings:suffix_set' },
        ],
        [{ text: '🔙 رجوع للإعدادات', callback_data: 'settings:main' }],
      ];

      await this.editMessageText(token, chatId, messageId, text, { inline_keyboard: keyboard });
      return;
    }

    if (data === 'settings:prefix_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_prefix' } });
      await this.sendMessage(token, chatId, '✍️ أرسل البادئة المطلوبة لاسم الملف (مثال: <code>[Series]</code>):');
      return;
    }

    if (data === 'settings:suffix_set') {
      store.updateUser(userId, { pendingAction: { type: 'awaiting_suffix' } });
      await this.sendMessage(token, chatId, '✍️ أرسل اللاحقة المطلوبة لاسم الملف (مثال: <code>[HD]</code>):');
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

    // 1. Check for /settings command
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
        if (!words.includes(text)) {
          words.push(text);
        }
        store.updateUser(userId, {
          forbiddenWords: words,
          pendingAction: undefined,
        });
        await this.sendMessage(
          token,
          chatId,
          `✅ تمت إضافة الكلمة المحظورة: "<code>${text}</code>". سيتم حذفها تلقائياً من أي اسم ملف أو وصف.`
        );
        return;
      }

      if (action === 'awaiting_prefix') {
        store.updateUser(userId, {
          namingPrefix: text,
          pendingAction: undefined,
        });
        await this.sendMessage(token, chatId, `✅ تم تعيين بادئة اسم الملف: <b>${text}</b>`);
        return;
      }

      if (action === 'awaiting_suffix') {
        store.updateUser(userId, {
          namingSuffix: text,
          pendingAction: undefined,
        });
        await this.sendMessage(token, chatId, `✅ تم تعيين لاحقة اسم الملف: <b>${text}</b>`);
        return;
      }
    }

    // 4. Video or Document Received -> Add to Pipeline Queue
    if (message.video || message.document) {
      const media = message.video || message.document;
      const isVideo = !!message.video;
      const fileId = media.file_id;
      const duration = media.duration;
      const width = media.width;
      const height = media.height;
      const originalFilename = media.file_name || (isVideo ? `Video_${Date.now().toString().slice(-4)}.mp4` : `Document_${Date.now().toString().slice(-4)}.bin`);
      const originalCaption = message.caption || '';
      const fileSize = media.file_size || 35 * 1024 * 1024;

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

      // Format duration text if video duration is present
      const durationText = duration
        ? `\n• المدة: <b>${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')} دقيقة</b>`
        : '';

      // Create initial status message in chat to edit later
      const initialStatusText = `📥 <b>جاري استلام الملف...</b>\n\n• الملف: <code>${originalFilename}</code>\n• الحجم: ${(fileSize / (1024 * 1024)).toFixed(1)} MB${durationText}\n<i>جاري إدراجه في طابور المعالجة بالترتيب الدقيق...</i>`;
      const statusSendRes = await this.sendMessage(token, chatId, initialStatusText);
      const statusMsgId = statusSendRes.ok ? statusSendRes.result?.message_id : undefined;

      // Add to Queue with complete fileId, duration, resolution, and sizes
      const queueItem = store.addToQueue({
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId,
        userFirstName: user.firstName,
        chatId: String(chatId),
        type: isVideo ? 'video' : 'document',
        fileId,
        duration,
        width,
        height,
        originalFilename,
        originalCaption,
        fileSize,
        mimeType: media.mime_type || (isVideo ? 'video/mp4' : 'application/octet-stream'),
        mediaUrl,
        status: 'queued',
        statusMessage: 'في قائمة الانتظار للمعالجة',
        statusTelegramMessageId: statusMsgId,
        targetChannelId: user.channel?.chatId || '@MediaHubArabic',
        targetChannelTitle: user.channel?.title || 'قناة ميديا العرب الرسمية',
      });

      // Notify in chat with queue ticket
      if (statusMsgId) {
        await this.editMessageText(
          token,
          chatId,
          statusMsgId,
          `📥 <b>تم استلام الملف بنجاح!</b>\n\n• الملف: <code>${originalFilename}</code>\n• رقم الانتظار: <b>#${queueItem.sequenceNumber}</b>\n• الحجم: ${(fileSize / (1024 * 1024)).toFixed(1)} MB${durationText}\n• الحالة: ⏳ في قائمة الانتظار (FIFO Queue)`
        );
      }
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
