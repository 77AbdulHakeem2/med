import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import fs from 'fs';
import path from 'path';

const API_ID = 6;
const API_HASH = 'eb06d4abfb49dc3eeb1aeb98ae0f581e';

class TelegramMtprotoService {
  private client: TelegramClient | null = null;
  private connectingPromise: Promise<TelegramClient | null> | null = null;
  private currentToken: string = '';

  public async getClient(botToken: string): Promise<TelegramClient | null> {
    if (!botToken) return null;

    if (this.client && this.client.connected && this.currentToken === botToken) {
      return this.client;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      try {
        if (this.client) {
          try { await this.client.disconnect(); } catch {}
          this.client = null;
        }

        const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
          connectionRetries: 5,
          useIPV6: false,
          timeout: 60,
        });

        await client.start({ botAuthToken: botToken });
        this.client = client;
        this.currentToken = botToken;
        return client;
      } catch (err) {
        console.error('Failed to initialize MTProto client:', err);
        return null;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  /**
   * Downloads media from a specific chat message using MTProto.
   * Supports files of any size (up to 2000MB), bypassing the 20MB Bot API limit.
   */
  public async downloadMediaFromMessage(
    botToken: string,
    chatId: string | number,
    messageId: number,
    outputPath: string,
    onProgress?: (pct: number) => Promise<void>
  ): Promise<{ success: boolean; localPath: string; error?: string }> {
    try {
      const client = await this.getClient(botToken);
      if (!client) {
        return { success: false, localPath: '', error: 'تعذر الاتصال بخادم MTProto' };
      }

      const entity = await client.getEntity(String(chatId));
      const messages = await client.getMessages(entity, { ids: [messageId] });

      if (!messages || messages.length === 0 || !messages[0]?.media) {
        return { success: false, localPath: '', error: 'الرسالة أو الوسائط غير موجودة' };
      }

      const msg = messages[0];
      const buffer = await client.downloadMedia(msg.media, {
        progressCallback: ((downloaded: any, total: any) => {
          if (onProgress) {
            const numDownloaded = Number(downloaded) || 0;
            const numTotal = Number(total) || 1;
            const pct = Math.min(100, Math.max(0, Math.round((numDownloaded / numTotal) * 100)));
            onProgress(pct).catch(() => {});
          }
        }) as any,
      });

      if (!buffer || (Buffer.isBuffer(buffer) && buffer.length === 0)) {
        return { success: false, localPath: '', error: 'الملف المنزّل فارغ' };
      }

      fs.writeFileSync(outputPath, Buffer.from(buffer as any));
      if (onProgress) await onProgress(100);

      return { success: true, localPath: outputPath };
    } catch (err: any) {
      console.error('MTProto downloadMedia error:', err);
      return { success: false, localPath: '', error: err.message || 'خطأ أثناء تنزيل الوسائط' };
    }
  }

  /**
   * Uploads large media files (up to 2000MB) directly to target channel with custom thumbnail.
   * Bypasses the 50MB HTTP Bot API limit.
   */
  public async uploadMediaFile(
    botToken: string,
    targetChannelId: string | number,
    filePath: string,
    thumbPath: string | null,
    caption: string,
    isVideo: boolean,
    duration?: number,
    width?: number,
    height?: number,
    onProgress?: (pct: number) => Promise<void>
  ): Promise<{ ok: boolean; description?: string; result?: any }> {
    try {
      const client = await this.getClient(botToken);
      if (!client) {
        return { ok: false, description: 'تعذر الاتصال بخادم تليجرام المباشر' };
      }

      const entity = await client.getEntity(String(targetChannelId));

      const attributes: any[] = [];
      if (isVideo) {
        attributes.push(
          new Api.DocumentAttributeVideo({
            duration: duration || 0,
            w: width || 0,
            h: height || 0,
            supportsStreaming: true,
          })
        );
      }

      const sendOptions: any = {
        file: filePath,
        caption: caption || undefined,
        attributes: attributes.length > 0 ? attributes : undefined,
        video: isVideo,
        progressCallback: (progress: number) => {
          if (onProgress) {
            const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
            onProgress(pct).catch(() => {});
          }
        },
      };

      if (thumbPath && fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
        sendOptions.thumb = thumbPath;
      }

      const res = await client.sendFile(entity, sendOptions);

      return {
        ok: true,
        result: {
          message_id: res.id,
          chat: { id: targetChannelId },
        },
      };
    } catch (err: any) {
      console.error('MTProto uploadMediaFile error:', err);
      return { ok: false, description: err.message || 'فشل رفع الملف عبر MTProto' };
    }
  }
}

export const telegramMtproto = new TelegramMtprotoService();
