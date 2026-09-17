import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import fs from 'fs';
import path from 'path';

const API_ID = 6;
const API_HASH = 'eb06d4abfb49dc3eeb1aeb98ae0f581e';

// Persistent session storage file to eliminate redundant DC handshakes & authorization cycles
const SESSION_FILE = path.join(process.cwd(), 'data', 'mtproto_session.txt');

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

class TelegramMtprotoService {
  private client: TelegramClient | null = null;
  private connectingPromise: Promise<TelegramClient | null> | null = null;
  private currentToken: string = '';
  private downloadSemaphore = new AsyncSemaphore(2);
  public lastInitError: string = '';

  private getSavedSession(): string {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        return fs.readFileSync(SESSION_FILE, 'utf8').trim();
      }
    } catch {}
    return '';
  }

  private saveSession(sessionString: string) {
    try {
      if (sessionString) {
        fs.writeFileSync(SESSION_FILE, sessionString, 'utf8');
      }
    } catch {}
  }

  public clearSession(): void {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
      }
    } catch {}
  }

  public async resetClient(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {}
      this.client = null;
    }
    this.connectingPromise = null;
  }

  public async getClient(botToken: string, forceFresh: boolean = false): Promise<TelegramClient | null> {
    if (!botToken) return null;

    if (!forceFresh && this.client && this.currentToken === botToken) {
      try {
        if (this.client.connected) {
          return this.client;
        }
        // Attempt fast reconnect if socket was paused or idle
        await this.client.connect();
        if (this.client.connected) {
          return this.client;
        }
      } catch {
        await this.resetClient();
      }
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

        let savedSession = forceFresh ? '' : this.getSavedSession();
        let client = new TelegramClient(new StringSession(savedSession), API_ID, API_HASH, {
          connectionRetries: 5,
          useIPV6: false,
          timeout: 45,
          autoReconnect: true,
          requestRetries: 3,
        });

        try {
          await client.start({ botAuthToken: botToken });
        } catch (startErr: any) {
          const errMsg = startErr?.message || String(startErr);
          // If auth key duplicated or session invalidated, clear stored session and retry immediately fresh
          if (
            savedSession &&
            (errMsg.includes('AUTH_KEY_DUPLICATED') ||
              errMsg.includes('406') ||
              errMsg.includes('401') ||
              errMsg.includes('SESSION_REVOKED') ||
              errMsg.includes('SESSION_EXPIRED'))
          ) {
            console.warn(`[MTProto] Stored session invalid (${errMsg}). Clearing stored session and reconnecting fresh...`);
            this.clearSession();
            savedSession = '';
            client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
              connectionRetries: 5,
              useIPV6: false,
              timeout: 45,
              autoReconnect: true,
              requestRetries: 3,
            });
            await client.start({ botAuthToken: botToken });
          } else {
            throw startErr;
          }
        }

        this.client = client;
        this.currentToken = botToken;
        this.lastInitError = '';

        // Persist session to disk for zero-latency reconnects
        try {
          const sessionStr = client.session.save() as unknown as string;
          if (sessionStr) {
            this.saveSession(sessionStr);
          }
        } catch {}

        return client;
      } catch (err: any) {
        this.lastInitError = err?.message || String(err);
        console.warn('[MTProto] Failed to initialize MTProto client:', this.lastInitError);
        if (this.lastInitError.includes('AUTH_KEY_DUPLICATED') || this.lastInitError.includes('406')) {
          this.clearSession();
        }
        await this.resetClient();
        return null;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  /**
   * Downloads media from a specific chat message using MTProto at turbo speed.
   * Utilizes 4 parallel workers (optimal sweet spot for Telegram MTProto rate-limits,
   * avoiding FLOOD_WAIT and DC throttling) for maximum transfer speed (10-30 MB/s).
   */
  public async downloadMediaFromMessage(
    botToken: string,
    chatId: string | number,
    messageId: number,
    outputPath: string,
    onProgress?: (pct: number, mbps?: number) => Promise<void>
  ): Promise<{ success: boolean; localPath: string; error?: string }> {
    const release = await this.downloadSemaphore.acquire();
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const client = await this.getClient(botToken, attempt > 1);
          if (!client) {
            return { success: false, localPath: '', error: 'تعذر الاتصال بخادم MTProto' };
          }

          let entity: any;
          try {
            entity = await client.getEntity(String(chatId));
          } catch {
            const num = Number(chatId);
            if (!isNaN(num)) {
              entity = await client.getEntity(num);
            } else {
              throw new Error(`تعذر العثور على محادثة المستخدم (${chatId})`);
            }
          }

          const messages = await client.getMessages(entity, { ids: [messageId] });

          if (!messages || messages.length === 0 || !messages[0]?.media) {
            return { success: false, localPath: '', error: 'الرسالة أو الوسائط غير موجودة' };
          }

          const msg = messages[0];
          let lastBytes = 0;
          let lastTime = Date.now();
          let lastNotifiedPct = -1;
          let lastNotifiedTime = 0;

          // Remove any stale output file before downloading
          if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch {}
          }

          // Download directly to disk with 4 parallel workers (Telegram sweet spot)
          // Pass msg so GramJS has access to inputChat and message ID for refreshing file references
          const buffer = await client.downloadMedia(msg, {
            outputFile: outputPath,
            workers: 4,
            progressCallback: ((downloaded: any, total: any) => {
              if (onProgress) {
                const numDownloaded = Number(downloaded) || 0;
                const numTotal = Number(total) || 1;
                const pct = Math.min(100, Math.max(0, Math.round((numDownloaded / numTotal) * 100)));

                const now = Date.now();
                const elapsed = (now - lastTime) / 1000;
                let currentSpeed = 0;
                if (elapsed >= 0.5) {
                  const delta = numDownloaded - lastBytes;
                  currentSpeed = Number(((delta / (1024 * 1024)) / elapsed).toFixed(1));
                  lastBytes = numDownloaded;
                  lastTime = now;
                }

                // Throttle progress notifications to avoid overwhelming the event loop & Telegram rate limits
                if (
                  pct === 100 ||
                  pct >= lastNotifiedPct + 15 ||
                  (now - lastNotifiedTime >= 1500 && pct > lastNotifiedPct)
                ) {
                  lastNotifiedPct = pct;
                  lastNotifiedTime = now;
                  onProgress(pct, currentSpeed > 0 ? currentSpeed : undefined).catch(() => {});
                }
              }
            }) as any,
          } as any);

          // Ensure file exists on disk
          if (!fs.existsSync(outputPath) && buffer && Buffer.isBuffer(buffer)) {
            fs.writeFileSync(outputPath, buffer);
          }

          if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
            return { success: false, localPath: '', error: 'الملف المنزّل فارغ أو تالف' };
          }

          if (onProgress) await onProgress(100);

          return { success: true, localPath: outputPath };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          const isDisconnect = errMsg.includes('Not connected') || !this.client?.connected;
          const isAuthProblem = errMsg.includes('AUTH_KEY') || errMsg.includes('406') || errMsg.includes('401');

          if ((isDisconnect || isAuthProblem) && attempt === 1) {
            console.warn(`[MTProto] Connection interrupted (${errMsg}), resetting client and retrying download...`);
            if (isAuthProblem) {
              this.clearSession();
            }
            await this.resetClient();
            continue;
          }

          console.warn('[MTProto] downloadMedia exception:', errMsg);
          return { success: false, localPath: '', error: errMsg || 'خطأ أثناء تنزيل الوسائط' };
        }
      }

      return { success: false, localPath: '', error: 'فشل تحميل الوسائط بعد محاولة إعادة الاتصال' };
    } finally {
      release();
    }
  }

  /**
   * Uploads large media files (up to 2000MB) directly to target channel with custom thumbnail.
   * Utilizes 6 concurrent workers for optimal bandwidth and Telegram connection stability.
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
    onProgress?: (pct: number, mbps?: number) => Promise<void>,
    isAudio: boolean = false,
    performer?: string,
    title?: string,
    displayFilename?: string
  ): Promise<{ ok: boolean; description?: string; result?: any }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const client = await this.getClient(botToken, attempt > 1);
        if (!client) {
          return { ok: false, description: 'تعذر الاتصال بخادم تليجرام المباشر' };
        }

        let entity: any;
        try {
          entity = await client.getEntity(String(targetChannelId));
        } catch {
          const num = Number(targetChannelId);
          if (!isNaN(num)) {
            entity = await client.getEntity(num);
          } else {
            throw new Error(`تعذر العثور على القناة المستهدفة (${targetChannelId})`);
          }
        }
        const stat = fs.statSync(filePath);
        const filename = displayFilename || path.basename(filePath);

        const attributes: any[] = [];
        attributes.push(
          new Api.DocumentAttributeFilename({
            fileName: filename,
          })
        );

        if (isVideo) {
          attributes.push(
            new Api.DocumentAttributeVideo({
              duration: duration || 0,
              w: width || 0,
              h: height || 0,
              supportsStreaming: true,
            })
          );
        } else if (isAudio) {
          attributes.push(
            new Api.DocumentAttributeAudio({
              duration: duration || 0,
              title: title || path.basename(filename, path.extname(filename)),
              performer: performer || '',
              voice: false,
            })
          );
        }

        let lastBytes = 0;
        let lastTime = Date.now();
        let lastNotifiedPct = -1;
        let lastNotifiedTime = 0;

        // Parallel chunk upload using 6 TCP workers for ultra-fast bandwidth and connection stability
        const customFile = new CustomFile(filename, stat.size, filePath);
        const uploadedFileHandle = await client.uploadFile({
          file: customFile,
          workers: 6,
          onProgress: (progress: number) => {
            if (onProgress) {
              const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
              const currentBytes = Math.round(stat.size * progress);
              const now = Date.now();
              const elapsed = (now - lastTime) / 1000;
              let currentSpeed = 0;
              if (elapsed >= 0.5) {
                const delta = currentBytes - lastBytes;
                currentSpeed = Number(((delta / (1024 * 1024)) / elapsed).toFixed(1));
                lastBytes = currentBytes;
                lastTime = now;
              }

              if (
                pct === 100 ||
                pct >= lastNotifiedPct + 15 ||
                (now - lastNotifiedTime >= 1500 && pct > lastNotifiedPct)
              ) {
                lastNotifiedPct = pct;
                lastNotifiedTime = now;
                onProgress(pct, currentSpeed > 0 ? currentSpeed : undefined).catch(() => {});
              }
            }
          },
        });

        const sendOptions: any = {
          file: uploadedFileHandle,
          caption: caption || undefined,
          parseMode: 'html',
          attributes: attributes.length > 0 ? attributes : undefined,
          forceDocument: !isVideo && !isAudio,
        };

        if (isVideo) {
          sendOptions.video = true;
          sendOptions.supportsStreaming = true;
        }

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
        const errMsg = err?.message || String(err);
        const isDisconnect = errMsg.includes('Not connected') || !this.client?.connected;
        const isAuthProblem = errMsg.includes('AUTH_KEY') || errMsg.includes('406') || errMsg.includes('401');

        if ((isDisconnect || isAuthProblem) && attempt === 1) {
          console.warn(`[MTProto] Connection dropped (${errMsg}), resetting client and retrying upload...`);
          if (isAuthProblem) {
            this.clearSession();
          }
          await this.resetClient();
          continue;
        }

        console.warn('[MTProto] uploadMediaFile failed:', errMsg);
        return { ok: false, description: errMsg || 'فشل رفع الملف عبر MTProto' };
      }
    }

    return { ok: false, description: 'فشل رفع الملف عبر MTProto بعد إعادة المحاولة' };
  }
}

export const telegramMtproto = new TelegramMtprotoService();
