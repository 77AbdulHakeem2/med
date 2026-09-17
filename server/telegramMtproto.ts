import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import bigInt from 'big-integer';
import { readBigIntFromBuffer, generateRandomBytes } from 'telegram/Helpers';
import { computeCheck } from 'telegram/Password';
import fs from 'fs';
import path from 'path';
import { benchmarkService } from './benchmarkService';

// Secure credentials resolution: uses custom credentials if provided in env, else standard official keys
const API_ID = Number(process.env.TELEGRAM_API_ID) || 6;
const API_HASH = process.env.TELEGRAM_API_HASH || 'eb06d4abfb49dc3eeb1aeb98ae0f581e';

// Configurable performance concurrency limits
const MTPROTO_DOWNLOAD_WORKERS = Math.max(1, Math.min(8, Number(process.env.MTPROTO_DOWNLOAD_WORKERS) || 3));
const MTPROTO_UPLOAD_WORKERS = Math.max(2, Math.min(16, Number(process.env.MTPROTO_UPLOAD_WORKERS) || 8));
const DOWNLOAD_SEMAPHORE_LIMIT = Math.max(1, Math.min(10, Number(process.env.DOWNLOAD_SEMAPHORE_LIMIT) || 4));

// Adaptive concurrency resolver: optimizes worker count based on payload size & Telegram Bot API limits
export function getAdaptiveDownloadWorkers(fileSize: number, configuredMax: number = MTPROTO_DOWNLOAD_WORKERS): number {
  if (fileSize <= 5 * 1024 * 1024) return 2;
  if (fileSize <= 40 * 1024 * 1024) return Math.min(3, configuredMax);
  return Math.min(configuredMax, 4);
}

export function getAdaptiveUploadWorkers(fileSize: number, configuredMax: number = MTPROTO_UPLOAD_WORKERS): number {
  if (fileSize <= 5 * 1024 * 1024) return 2;
  if (fileSize <= 40 * 1024 * 1024) return Math.min(4, configuredMax);
  return Math.min(configuredMax, 8);
}

// Maximum protocol chunk size permitted by Telegram MTProto (512 KB)
const CHUNK_SIZE_512KB = 512 * 1024;

// Persistent session storage file to eliminate redundant DC handshakes & authorization cycles
const SESSION_FILE = path.join(process.cwd(), 'data', 'mtproto_session.txt');
const USER_SESSION_FILE = path.join(process.cwd(), 'data', 'mtproto_user_session.txt');

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
  private downloadSemaphore = new AsyncSemaphore(DOWNLOAD_SEMAPHORE_LIMIT);
  public lastInitError: string = '';

  // User Account MTProto Turbo Engine (multi-DC, uncapped bandwidth)
  private userClient: TelegramClient | null = null;
  private userConnectingPromise: Promise<TelegramClient | null> | null = null;
  private pendingAuthClient: TelegramClient | null = null;
  private pendingPhoneNumber: string = '';
  private pendingPhoneCodeHash: string = '';

  public getSavedUserSession(): string {
    const envSession = process.env.TELEGRAM_USER_SESSION;
    if (envSession && envSession.trim()) {
      return envSession.trim();
    }
    try {
      if (fs.existsSync(USER_SESSION_FILE)) {
        return fs.readFileSync(USER_SESSION_FILE, 'utf8').trim();
      }
    } catch {}
    return '';
  }

  public saveUserSession(sessionString: string): void {
    try {
      fs.writeFileSync(USER_SESSION_FILE, sessionString.trim(), 'utf8');
    } catch {}
  }

  public async getUserClient(forceFresh: boolean = false): Promise<TelegramClient | null> {
    const session = this.getSavedUserSession();
    if (!session) return null;

    if (!forceFresh && this.userClient) {
      try {
        if (this.userClient.connected) {
          return this.userClient;
        }
        await this.userClient.connect();
        if (this.userClient.connected) {
          return this.userClient;
        }
      } catch {
        this.userClient = null;
      }
    }

    if (this.userConnectingPromise) {
      return this.userConnectingPromise;
    }

    this.userConnectingPromise = (async () => {
      try {
        const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, {
          connectionRetries: 5,
          useIPV6: false,
          timeout: 45,
          autoReconnect: true,
          requestRetries: 3,
        });

        await client.connect();
        const isAuth = await client.checkAuthorization();
        if (isAuth) {
          this.userClient = client;
          return client;
        } else {
          console.warn('[MTProto] Saved user session is not authorized or expired.');
          this.userClient = null;
          return null;
        }
      } catch (err) {
        console.warn('[MTProto] Failed to connect user client:', err);
        this.userClient = null;
        return null;
      } finally {
        this.userConnectingPromise = null;
      }
    })();

    return this.userConnectingPromise;
  }

  public async getUserAccountInfo(): Promise<{
    connected: boolean;
    phone?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    userId?: number;
    isPremium?: boolean;
  }> {
    try {
      const client = await this.getUserClient();
      if (!client) {
        return { connected: false };
      }
      const me = (await client.getMe()) as any;
      if (!me) {
        return { connected: false };
      }
      return {
        connected: true,
        userId: Number(me.id) || undefined,
        firstName: me.firstName || '',
        lastName: me.lastName || '',
        username: me.username || '',
        phone: me.phone || '',
        isPremium: Boolean(me.premium),
      };
    } catch {
      return { connected: false };
    }
  }

  public async sendUserLoginCode(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.pendingAuthClient) {
        try { await this.pendingAuthClient.disconnect(); } catch {}
        this.pendingAuthClient = null;
      }

      const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
        connectionRetries: 5,
        useIPV6: false,
        timeout: 45,
        autoReconnect: true,
      });

      await client.connect();
      const res = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phoneNumber.trim());

      this.pendingAuthClient = client;
      this.pendingPhoneNumber = phoneNumber.trim();
      this.pendingPhoneCodeHash = res.phoneCodeHash;

      return { success: true };
    } catch (err: any) {
      console.error('[MTProto] SendCode failed:', err);
      if (err?.seconds || err?.errorMessage === 'FLOOD' || String(err?.message || '').includes('FloodWait')) {
        const sec = err.seconds || 60;
        const mins = Math.ceil(sec / 60);
        return {
          success: false,
          error: `عذراً، يفرض تيليجرام مهلة انتظار ${mins} دقيقة (${sec} ثانية) بسبب كثرة الطلبات (FloodWait). يمكنك الانتظار أو استخدام خيار لصق رمز الجلسة (Session String) للتخطي فوراً.`,
        };
      }
      if (err?.errorMessage === 'PHONE_NUMBER_INVALID') {
        return {
          success: false,
          error: 'رقم الهاتف غير صالح. يرجى التأكد من كتابة الرقم بالصيغة الدولية مع مفتاح الدولة (مثال: +966501234567).',
        };
      }
      return { success: false, error: err?.message || 'فشل إرسال كود التحقق. تأكد من صحة رقم الهاتف والرمز الدولي.' };
    }
  }

  public async verifyUserLoginCode(phoneCode: string, password?: string): Promise<{ success: boolean; error?: string; user?: any }> {
    if (!this.pendingAuthClient || !this.pendingPhoneNumber || !this.pendingPhoneCodeHash) {
      return { success: false, error: 'انتهت صلاحية جلسة تسجيل الدخول. يرجى طلب كود جديد.' };
    }

    try {
      const client = this.pendingAuthClient;
      let user: any;

      try {
        const res = await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: this.pendingPhoneNumber,
            phoneCodeHash: this.pendingPhoneCodeHash,
            phoneCode: phoneCode.trim(),
          })
        );
        user = (res as any)?.user;
      } catch (signInErr: any) {
        if (signInErr?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (!password || !password.trim()) {
            return { success: false, error: 'SESSION_PASSWORD_NEEDED' };
          }

          try {
            // Direct 2FA SRP calculation without any infinite retry loops
            const passwordSrpResult = (await client.invoke(
              new Api.account.GetPassword()
            )) as Api.account.Password;

            const passwordSrpCheck = await computeCheck(passwordSrpResult, password.trim());
            const checkPasswordRes = await client.invoke(
              new Api.auth.CheckPassword({
                password: passwordSrpCheck,
              })
            );
            user = (checkPasswordRes as any)?.user;
          } catch (pwdErr: any) {
            console.error('[MTProto] 2FA check error:', pwdErr);
            if (pwdErr?.seconds || pwdErr?.errorMessage === 'FLOOD' || String(pwdErr?.message || '').includes('FloodWait')) {
              const sec = pwdErr.seconds || 60;
              const mins = Math.ceil(sec / 60);
              return {
                success: false,
                error: `عذراً، يفرض تيليجرام مهلة انتظار ${mins} دقيقة (${sec} ثانية) بسبب محاولات متكررة (FloodWait). يمكنك الانتظار أو استخدام خيار لصق رمز الجلسة (Session String).`,
              };
            }
            if (pwdErr?.errorMessage === 'PASSWORD_HASH_INVALID') {
              return {
                success: false,
                error: 'كلمة مرور التحقق بخطوتين (2FA) غير صحيحة. يرجى التأكد وإعادة المحاولة.',
              };
            }
            return {
              success: false,
              error: pwdErr?.errorMessage || pwdErr?.message || 'فشل التحقق من كلمة المرور (2FA).',
            };
          }
        } else if (signInErr?.seconds || signInErr?.errorMessage === 'FLOOD' || String(signInErr?.message || '').includes('FloodWait')) {
          const sec = signInErr.seconds || 60;
          const mins = Math.ceil(sec / 60);
          return {
            success: false,
            error: `عذراً، يفرض تيليجرام مهلة انتظار ${mins} دقيقة (${sec} ثانية) بسبب كثرة الطلبات (FloodWait). يمكنك الانتظار أو استخدام رمز الجلسة (Session String).`,
          };
        } else if (signInErr?.errorMessage === 'PHONE_CODE_INVALID') {
          return { success: false, error: 'كود التحقق غير صحيح. يرجى التأكد من الأرقام المدخلة.' };
        } else if (signInErr?.errorMessage === 'PHONE_CODE_EXPIRED') {
          return { success: false, error: 'انتهت صلاحية كود التحقق. يرجى الضغط على "تغيير الرقم" وطلب كود جديد.' };
        } else {
          throw signInErr;
        }
      }

      const sessionString = client.session.save() as unknown as string;
      this.saveUserSession(sessionString);
      this.userClient = client;
      this.pendingAuthClient = null;
      this.pendingPhoneNumber = '';
      this.pendingPhoneCodeHash = '';

      const me = (await client.getMe()) as any;
      return {
        success: true,
        user: {
          id: Number(me.id),
          firstName: me.firstName,
          username: me.username,
          phone: me.phone,
          isPremium: Boolean(me.premium),
        },
      };
    } catch (err: any) {
      console.error('[MTProto] VerifyCode failed:', err);
      if (err?.seconds || err?.errorMessage === 'FLOOD' || String(err?.message || '').includes('FloodWait')) {
        const sec = err.seconds || 60;
        const mins = Math.ceil(sec / 60);
        return {
          success: false,
          error: `عذراً، يفرض تيليجرام مهلة انتظار ${mins} دقيقة (${sec} ثانية) بسبب كثرة المحاولات (FloodWait). يرجى الانتظار أو تفعيل الجلسة عبر رمز الجلسة (Session String).`,
        };
      }
      return { success: false, error: err?.errorMessage || err?.message || 'فشل التحقق من الكود أو كلمة المرور.' };
    }
  }

  public async setUserSession(sessionString: string): Promise<{ success: boolean; error?: string; user?: any }> {
    try {
      if (this.userClient) {
        try { await this.userClient.disconnect(); } catch {}
        this.userClient = null;
      }

      this.saveUserSession(sessionString);
      const client = await this.getUserClient(true);
      if (!client) {
        this.logoutUserAccount();
        return { success: false, error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' };
      }

      const me = (await client.getMe()) as any;
      return {
        success: true,
        user: {
          id: Number(me.id),
          firstName: me.firstName,
          username: me.username,
          phone: me.phone,
          isPremium: Boolean(me.premium),
        },
      };
    } catch (err: any) {
      this.logoutUserAccount();
      return { success: false, error: err?.message || 'فشل تفعيل الجلسة.' };
    }
  }

  public async logoutUserAccount(): Promise<void> {
    if (this.userClient) {
      try { await this.userClient.disconnect(); } catch {}
      this.userClient = null;
    }
    if (this.pendingAuthClient) {
      try { await this.pendingAuthClient.disconnect(); } catch {}
      this.pendingAuthClient = null;
    }
    this.pendingPhoneNumber = '';
    this.pendingPhoneCodeHash = '';
    try {
      if (fs.existsSync(USER_SESSION_FILE)) {
        fs.unlinkSync(USER_SESSION_FILE);
      }
    } catch {}
  }

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
   * High-speed parallel chunk download directly from Telegram MTProto servers.
   * Utilizes 512KB chunks (maximum protocol size), single open file handle,
   * pre-allocated file on disk, auto-recovery on FILEREF_UPGRADE_NEEDED,
   * and intelligent flood wait throttling.
   */
  private async downloadDocumentParallel(
    client: TelegramClient,
    entity: any,
    msg: any,
    doc: any,
    outputPath: string,
    onProgress?: (pct: number, mbps?: number) => Promise<void>,
    configuredMaxWorkers?: number
  ): Promise<boolean> {
    const totalSize = Number(doc.size);
    if (!totalSize || isNaN(totalSize) || totalSize <= 0) {
      return false;
    }

    const totalParts = Math.ceil(totalSize / CHUNK_SIZE_512KB);
    const sender = await client.getSender(doc.dcId);

    // Open file handle once and pre-allocate totalSize to avoid continuous filesystem re-allocations
    const fileHandle = await fs.promises.open(outputPath, 'w');
    try {
      await fileHandle.truncate(totalSize);
    } catch {}

    let location = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: '',
    });

    let nextPart = 0;
    let downloadedBytes = 0;
    let lastBytes = 0;
    let lastTime = Date.now();
    let lastNotifiedPct = -1;
    let lastNotifiedTime = 0;
    let isAborted = false;
    let abortError: any = null;

    const transferId = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const workerLimit = configuredMaxWorkers || MTPROTO_DOWNLOAD_WORKERS;
    const workerCount = Math.min(totalParts, getAdaptiveDownloadWorkers(totalSize, workerLimit));
    benchmarkService.recordTransferStart(transferId, 'download', totalSize, workerCount, path.basename(outputPath));

    const worker = async () => {
      while (!isAborted) {
        const partIndex = nextPart++;
        if (partIndex >= totalParts) break;

        const offset = partIndex * CHUNK_SIZE_512KB;

        let retries = 4;
        while (retries > 0 && !isAborted) {
          try {
            const req = new Api.upload.GetFile({
              location,
              offset: bigInt(offset),
              limit: CHUNK_SIZE_512KB,
            });

            const res = await client.invokeWithSender(req, sender);
            const bytes = (res as any)?.bytes as Buffer;

            if (!bytes || bytes.length === 0) {
              break;
            }

            await fileHandle.write(bytes, 0, bytes.length, offset);
            downloadedBytes += bytes.length;
            benchmarkService.recordTransferProgress(transferId, downloadedBytes);

            if (onProgress) {
              const pct = Math.min(99, Math.round((downloadedBytes / totalSize) * 100));
              const now = Date.now();
              const elapsed = (now - lastTime) / 1000;
              let currentSpeed = 0;
              if (elapsed >= 0.5) {
                const delta = downloadedBytes - lastBytes;
                currentSpeed = Number(((delta / (1024 * 1024)) / elapsed).toFixed(1));
                lastBytes = downloadedBytes;
                lastTime = now;
                benchmarkService.recordTransferProgress(transferId, downloadedBytes, currentSpeed);
              }

              if (
                pct >= lastNotifiedPct + 10 ||
                (now - lastNotifiedTime >= 1200 && pct > lastNotifiedPct)
              ) {
                lastNotifiedPct = pct;
                lastNotifiedTime = now;
                onProgress(pct, currentSpeed > 0 ? currentSpeed : undefined).catch(() => {});
              }
            }
            break;
          } catch (err: any) {
            retries--;
            const errMsg = err?.message || String(err);
            if (errMsg.includes('FILEREF_UPGRADE_NEEDED')) {
              try {
                const freshMsgs = await client.getMessages(entity, { ids: [msg.id] });
                const freshDoc = (freshMsgs[0]?.media as any)?.document;
                if (freshDoc) {
                  location = new Api.InputDocumentFileLocation({
                    id: freshDoc.id,
                    accessHash: freshDoc.accessHash,
                    fileReference: freshDoc.fileReference,
                    thumbSize: '',
                  });
                }
              } catch {}
            } else if (err.seconds) {
              benchmarkService.recordFloodWait(transferId, err.seconds);
              // Respect exact FloodWait duration mandated by Telegram without excessive backoff
              await new Promise((r) => setTimeout(r, (err.seconds * 1000) + 50));
            } else {
              benchmarkService.recordRetry(transferId);
              await new Promise((r) => setTimeout(r, 200));
            }

            if (retries === 0) {
              isAborted = true;
              abortError = err;
              benchmarkService.recordError(transferId, errMsg);
              throw err;
            }
          }
        }
      }
    };

    try {
      const workers = Array.from({ length: workerCount }, () => worker());
      await Promise.all(workers);
    } finally {
      await fileHandle.close();
    }

    if (abortError) {
      benchmarkService.recordTransferEnd(transferId, false, downloadedBytes, abortError.message);
      throw abortError;
    }

    // Verify downloaded file exists and is exact size
    if (!fs.existsSync(outputPath)) {
      benchmarkService.recordTransferEnd(transferId, false, downloadedBytes, 'Output file not found');
      return false;
    }
    const stat = fs.statSync(outputPath);
    if (stat.size !== totalSize) {
      console.warn(`[MTProto] Size mismatch on parallel download: expected ${totalSize}, got ${stat.size}`);
      benchmarkService.recordTransferEnd(transferId, false, stat.size, 'Size mismatch');
      return false;
    }

    benchmarkService.recordTransferEnd(transferId, true, stat.size);
    return true;
  }

  /**
   * Downloads media from a specific chat message using MTProto at turbo speed.
   * Leverages parallel 512KB chunk streaming with intelligent fallback.
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

          // Remove any stale output file before downloading
          if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch {}
          }

          const doc = (msg.media as any)?.document;
          let downloaded = false;

          // Check if User Account MTProto Turbo Engine is connected
          const userClient = await this.getUserClient();
          const activeDownloadClient = (userClient && (await userClient.checkAuthorization().catch(() => false))) ? userClient : client;
          const isUserAccount = activeDownloadClient === userClient;
          const maxDownWorkers = isUserAccount ? 8 : MTPROTO_DOWNLOAD_WORKERS;

          // If standard Document media, use high-speed parallel 512KB chunk streaming
          if (doc && doc.size && Number(doc.size) > 0) {
            try {
              downloaded = await this.downloadDocumentParallel(
                activeDownloadClient,
                entity,
                msg,
                doc,
                outputPath,
                onProgress,
                maxDownWorkers
              );
            } catch (parallelErr) {
              console.warn('[MTProto] Parallel chunk download fallback to standard downloadMedia:', parallelErr);
              downloaded = false;
            }
          }

          // Fallback to standard downloadMedia if parallel streamer was bypassed or encountered edge cases
          if (!downloaded) {
            let lastBytes = 0;
            let lastTime = Date.now();
            let lastNotifiedPct = -1;
            let lastNotifiedTime = 0;

            const buffer = await client.downloadMedia(msg, {
              outputFile: outputPath,
              workers: MTPROTO_DOWNLOAD_WORKERS,
              progressCallback: ((downloadedBytes: any, total: any) => {
                if (onProgress) {
                  const numDownloaded = Number(downloadedBytes) || 0;
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

            if (!fs.existsSync(outputPath) && buffer && Buffer.isBuffer(buffer)) {
              fs.writeFileSync(outputPath, buffer);
            }
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
   * Ultra-fast parallel chunk uploader using single file handle & 512KB chunks.
   * Eliminates disk descriptor churn and streams parts concurrently.
   */
  private async uploadDocumentParallel(
    client: TelegramClient,
    filePath: string,
    filename: string,
    fileSize: number,
    onProgress?: (pct: number, mbps?: number) => Promise<void>,
    configuredMaxWorkers?: number
  ): Promise<Api.InputFile | Api.InputFileBig> {
    const isLarge = fileSize > 10 * 1024 * 1024; // 10MB Telegram threshold
    const partCount = Math.ceil(fileSize / CHUNK_SIZE_512KB);
    const fileId = readBigIntFromBuffer(generateRandomBytes(8), true, true);

    const fileHandle = await fs.promises.open(filePath, 'r');
    let nextPart = 0;
    let uploadedBytes = 0;
    let lastBytes = 0;
    let lastTime = Date.now();
    let lastNotifiedPct = -1;
    let lastNotifiedTime = 0;
    let isAborted = false;
    let abortError: any = null;

    const transferId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const workerLimit = configuredMaxWorkers || MTPROTO_UPLOAD_WORKERS;
    const workerCount = Math.min(partCount, getAdaptiveUploadWorkers(fileSize, workerLimit));
    benchmarkService.recordTransferStart(transferId, 'upload', fileSize, workerCount, filename);

    const worker = async () => {
      // Reusable 512KB worker buffer: eliminates thousands of temporary Buffer allocations and GC sweeps
      const workerBuffer = Buffer.allocUnsafe(CHUNK_SIZE_512KB);

      while (!isAborted) {
        const partIndex = nextPart++;
        if (partIndex >= partCount) break;

        const offset = partIndex * CHUNK_SIZE_512KB;
        const readLength = Math.min(CHUNK_SIZE_512KB, fileSize - offset);
        await fileHandle.read(workerBuffer, 0, readLength, offset);
        const chunkSlice = readLength === CHUNK_SIZE_512KB ? workerBuffer : workerBuffer.subarray(0, readLength);

        let retries = 4;
        while (retries > 0 && !isAborted) {
          try {
            if (isLarge) {
              await client.invoke(
                new Api.upload.SaveBigFilePart({
                  fileId,
                  filePart: partIndex,
                  fileTotalParts: partCount,
                  bytes: chunkSlice,
                })
              );
            } else {
              await client.invoke(
                new Api.upload.SaveFilePart({
                  fileId,
                  filePart: partIndex,
                  bytes: chunkSlice,
                })
              );
            }

            uploadedBytes += readLength;
            benchmarkService.recordTransferProgress(transferId, uploadedBytes);

            if (onProgress) {
              const pct = Math.min(99, Math.round((uploadedBytes / fileSize) * 100));
              const now = Date.now();
              const elapsed = (now - lastTime) / 1000;
              let currentSpeed = 0;
              if (elapsed >= 0.5) {
                const delta = uploadedBytes - lastBytes;
                currentSpeed = Number(((delta / (1024 * 1024)) / elapsed).toFixed(1));
                lastBytes = uploadedBytes;
                lastTime = now;
                benchmarkService.recordTransferProgress(transferId, uploadedBytes, currentSpeed);
              }

              if (
                pct >= lastNotifiedPct + 10 ||
                (now - lastNotifiedTime >= 1200 && pct > lastNotifiedPct)
              ) {
                lastNotifiedPct = pct;
                lastNotifiedTime = now;
                onProgress(pct, currentSpeed > 0 ? currentSpeed : undefined).catch(() => {});
              }
            }
            break;
          } catch (err: any) {
            retries--;
            if (err.seconds) {
              benchmarkService.recordFloodWait(transferId, err.seconds);
              await new Promise((r) => setTimeout(r, (err.seconds * 1000) + 50));
            } else {
              benchmarkService.recordRetry(transferId);
              await new Promise((r) => setTimeout(r, 200));
            }

            if (retries === 0) {
              isAborted = true;
              abortError = err;
              benchmarkService.recordError(transferId, err?.message || String(err));
              throw err;
            }
          }
        }
      }
    };

    try {
      const workers = Array.from({ length: workerCount }, () => worker());
      await Promise.all(workers);
    } finally {
      await fileHandle.close();
    }

    if (abortError) {
      benchmarkService.recordTransferEnd(transferId, false, uploadedBytes, abortError.message);
      throw abortError;
    }

    benchmarkService.recordTransferEnd(transferId, true, uploadedBytes);

    return isLarge
      ? new Api.InputFileBig({
          id: fileId,
          parts: partCount,
          name: filename,
        })
      : new Api.InputFile({
          id: fileId,
          parts: partCount,
          name: filename,
          md5Checksum: '',
        });
  }

  /**
   * Uploads large media files (up to 2000MB) directly to target channel with custom thumbnail.
   * Utilizes sliding-window parallel workers and 512KB chunks.
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
        const userClient = await this.getUserClient();
        let client: TelegramClient | null = null;
        let entity: any = null;

        // Try user account first if connected and authorized to channel
        if (userClient && (await userClient.checkAuthorization().catch(() => false))) {
          try {
            const num = Number(targetChannelId);
            entity = await userClient.getEntity(!isNaN(num) ? num : String(targetChannelId));
            client = userClient;
          } catch {
            // User account might not be member/admin of channel; will use botClient
            entity = null;
            client = null;
          }
        }

        if (!client) {
          client = await this.getClient(botToken, attempt > 1);
          if (!client) {
            return { ok: false, description: 'تعذر الاتصال بخادم تليجرام المباشر' };
          }

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
        }

        const stat = fs.statSync(filePath);
        const filename = displayFilename || path.basename(filePath);
        const isUserAccount = client === userClient;
        const maxUpWorkers = isUserAccount ? 12 : MTPROTO_UPLOAD_WORKERS;

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

        let uploadedFileHandle: any;

        // Use ultra-fast parallel chunk streaming for files > 10MB
        if (stat.size > 10 * 1024 * 1024) {
          try {
            uploadedFileHandle = await this.uploadDocumentParallel(
              client,
              filePath,
              filename,
              stat.size,
              onProgress,
              maxUpWorkers
            );
          } catch (uploadFastErr) {
            console.warn('[MTProto] uploadDocumentParallel failed, falling back to client.uploadFile:', uploadFastErr);
            uploadedFileHandle = null;
          }
        }

        // Fallback for smaller files or edge-case recovery
        if (!uploadedFileHandle) {
          let lastBytes = 0;
          let lastTime = Date.now();
          let lastNotifiedPct = -1;
          let lastNotifiedTime = 0;

          const customFile = new CustomFile(filename, stat.size, filePath);
          uploadedFileHandle = await client.uploadFile({
            file: customFile,
            workers: MTPROTO_UPLOAD_WORKERS,
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
        }

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
