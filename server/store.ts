import fs from 'fs';
import path from 'path';
import {
  UserSetting,
  QueueItem,
  ChannelPost,
  SimulatedTelegramMessage,
  BotConfig,
  AIRenamingConfig
} from '../src/types';

interface StoredData {
  config: BotConfig;
  users: Record<string, UserSetting>;
  queue: QueueItem[];
  channelPosts: ChannelPost[];
  simulatedMessages: Record<string, SimulatedTelegramMessage[]>;
  sequenceCounter: number;
}

export function isGeminiKey(token?: string | null): boolean {
  if (!token) return false;
  return typeof token === 'string' && token.trim().startsWith('AIza');
}

export function isValidTelegramToken(token?: string | null): boolean {
  if (!token) return false;
  const t = token.trim();
  if (t.startsWith('AIza')) return false;
  // BotFather format: <id_digits>:<token_alphanumeric_and_special>
  return /^\d{6,16}:[A-Za-z0-9_-]{25,65}$/.test(t);
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot_data.json');
const BACKUP_FILE = path.join(DATA_DIR, 'bot_data_backup.json');
const TMP_FILE = path.join(DATA_DIR, 'bot_data.tmp');
export const PERMANENT_THUMBS_DIR = path.join(DATA_DIR, 'permanent_thumbs');

class Store {
  private data: StoredData = {
    config: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      pollingActive: false,
      webhookUrl: '',
      aiRenaming: {
        enabled: true,
        namingPattern: '{subject} - د. {doctor} - {topic} [Part {part}]',
        customInstructions: '',
        autoApplyOnQueue: true,
        captionStyle: 'medpulse_box',
        customCaptionTemplate: '',
      },
      turboSpeed: {
        enabled: true,
        fastStatusUpdates: true,
        preloadNextItem: true,
        enableCache: true,
        cloudDirectDispatch: true,
        maxConcurrency: 16,
        mtprotoWorkers: 16,
      },
    },
    users: {},
    queue: [],
    channelPosts: [],
    simulatedMessages: {},
    sequenceCounter: 100,
  };

  private queueListeners: Array<(item: QueueItem) => void> = [];
  private statusListeners: Array<() => void> = [];
  private saveTimeout: NodeJS.Timeout | null = null;

  public onQueueStatusChanged(fn: () => void) {
    this.statusListeners.push(fn);
  }

  public notifyStatusChanged() {
    for (const fn of this.statusListeners) {
      try {
        fn();
      } catch {}
    }
  }

  constructor() {
    this.init();

    // Hook process termination to ensure any pending data is synchronously flushed
    try {
      process.on('beforeExit', () => this.flushBeforeExit());
      process.on('SIGTERM', () => this.flushBeforeExit());
      process.on('SIGINT', () => this.flushBeforeExit());
    } catch {}
  }

  private flushBeforeExit() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.writeToDiskSync();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(PERMANENT_THUMBS_DIR)) {
        fs.mkdirSync(PERMANENT_THUMBS_DIR, { recursive: true });
      }

      let raw = '';
      let loadedFromFile = false;

      // 1. Try reading primary DATA_FILE
      if (fs.existsSync(DATA_FILE)) {
        try {
          raw = fs.readFileSync(DATA_FILE, 'utf-8');
          if (raw.trim()) {
            loadedFromFile = true;
          }
        } catch (readErr) {
          console.warn('Failed reading primary data file, checking backup:', readErr);
        }
      }

      // 2. Fallback to BACKUP_FILE if primary was missing or unreadable
      if (!loadedFromFile && fs.existsSync(BACKUP_FILE)) {
        try {
          raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
          if (raw.trim()) {
            loadedFromFile = true;
            console.log('✅ Restored store from backup data file successfully.');
          }
        } catch (backupErr) {
          console.warn('Failed reading backup data file:', backupErr);
        }
      }

      if (loadedFromFile && raw) {
        const parsed = JSON.parse(raw);

        // Smart token resolution:
        // Priority 1: Valid Telegram token from process.env (AI Studio Secrets / .env)
        // Priority 2: Valid Telegram token from parsed database
        const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
        const storedToken = (parsed.config?.botToken || '').trim();

        let resolvedToken = '';
        if (isValidTelegramToken(envToken)) {
          resolvedToken = envToken;
        } else if (isValidTelegramToken(storedToken)) {
          resolvedToken = storedToken;
        } else if (envToken && !isGeminiKey(envToken)) {
          resolvedToken = envToken;
        } else if (storedToken && !isGeminiKey(storedToken)) {
          resolvedToken = storedToken;
        }

        if (isGeminiKey(envToken)) {
          console.warn('⚠️ TELEGRAM_BOT_TOKEN in environment appears to be a Gemini API key (AIza...), ignoring it for Telegram bot.');
          if (resolvedToken) {
            console.log('✅ Retained valid Telegram bot token from persistent storage:', resolvedToken.slice(0, 10) + '...');
          }
        }

        this.data = {
          ...this.data,
          ...parsed,
          config: {
            ...this.data.config,
            ...(parsed.config || {}),
            botToken: resolvedToken,
            pollingActive: parsed.config?.pollingActive ?? (resolvedToken.length > 0),
            aiRenaming: {
              ...this.data.config.aiRenaming,
              ...(parsed.config?.aiRenaming || {}),
            },
            turboSpeed: {
              ...this.data.config.turboSpeed!,
              ...(parsed.config?.turboSpeed || {}),
            },
          },
        };

        if (resolvedToken && process.env.TELEGRAM_BOT_TOKEN !== resolvedToken) {
          process.env.TELEGRAM_BOT_TOKEN = resolvedToken;
        }

        // Restore permanent physical thumbnails on disk for all users
        this.restorePermanentThumbnails();
      } else {
        this.seedDefaultData();
        this.save(true);
      }
    } catch (err) {
      console.error('Failed to load store data, checking backup before defaults', err);
      try {
        if (fs.existsSync(BACKUP_FILE)) {
          const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
          this.data = JSON.parse(raw);
          this.restorePermanentThumbnails();
          this.save(true);
          console.log('✅ Recovered store from backup successfully.');
          return;
        }
      } catch {}
      this.seedDefaultData();
      this.save(true);
    }
  }

  /**
   * Restores permanent physical thumbnail files on disk from stored dataUrls,
   * guaranteeing that thumbnails are NEVER lost across restarts.
   */
  public restorePermanentThumbnails() {
    try {
      if (!fs.existsSync(PERMANENT_THUMBS_DIR)) {
        fs.mkdirSync(PERMANENT_THUMBS_DIR, { recursive: true });
      }

      for (const u of Object.values(this.data.users)) {
        if (u.thumbnail) {
          const p320 = path.join(PERMANENT_THUMBS_DIR, `user_${u.userId}_thumb_320.jpg`);
          const pMaster = path.join(PERMANENT_THUMBS_DIR, `user_${u.userId}_thumb_master.jpg`);

          // 1. If dataUrl exists, ensure physical file exists
          if (u.thumbnail.dataUrl && (!fs.existsSync(p320) || fs.statSync(p320).size === 0)) {
            try {
              const base64Data = u.thumbnail.dataUrl.replace(/^data:image\/\w+;base64,/, '');
              const buf = Buffer.from(base64Data, 'base64');
              fs.writeFileSync(p320, buf);
              if (!fs.existsSync(pMaster)) {
                fs.writeFileSync(pMaster, buf);
              }
            } catch (thumbErr) {
              console.warn('Could not restore physical thumbnail for user', u.userId, thumbErr);
            }
          }

          // 2. If physical file exists, ensure standard320Path and dataUrl are populated
          if (fs.existsSync(p320) && fs.statSync(p320).size > 0) {
            u.thumbnail.standard320Path = p320;
            if (!u.thumbnail.dataUrl) {
              try {
                const buf = fs.readFileSync(p320);
                u.thumbnail.dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error in restorePermanentThumbnails:', err);
    }
  }

  private seedDefaultData() {
    const defaultUserId = '77123456';
    const defaultUser: UserSetting = {
      userId: defaultUserId,
      username: 'owner_media',
      firstName: 'عبد الحكيم (مالك البوت)',
      thumbnail: {
        id: 'thumb_default',
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
        updatedAt: Date.now() - 3600000,
      },
      tag: {
        text: 'PRO',
        position: 'before',
      },
      forbiddenWords: ['موقع_مشبوه', 'promo_link', 'ممنوع', 'watermark_xyz', 'Ads'],
      namingPrefix: '[الحصريات]',
      namingSuffix: '[1080p]',
      captionPrefix: '🎬 فيلم الأسبوع:',
      captionSuffix: '— اشترك للمزيد من المحتوى المميز',
      channel: {
        chatId: '@MediaHubArabic',
        title: 'قناة ميديا العرب الرسمية 🎬',
        publishingEnabled: true,
        lastVerifiedAt: Date.now(),
        verifiedAdmin: true,
        statusMessage: 'البوت والمستخدم يملكان صلاحيات الإشراف والنشر الكاملة',
      },
      updatedAt: Date.now(),
    };

    this.data.users[defaultUserId] = defaultUser;

    // Seed a couple of published items to show working channel feed immediately
    const samplePost1: ChannelPost = {
      id: 'post_seed_1',
      queueItemId: 'q_seed_1',
      sequenceNumber: 1,
      channelId: '@MediaHubArabic',
      channelTitle: 'قناة ميديا العرب الرسمية 🎬',
      publisherUserId: defaultUserId,
      publisherName: 'عبد الحكيم (مالك البوت)',
      type: 'text',
      title: 'إعلان البدء',
      caption: '🚀 مرحباً بكم في قناة النشر التلقائي. سيتم نشر الحلقات بالترتيب الآن!',
      text: '🚀 مرحباً بكم في قناة النشر التلقائي. سيتم نشر الحلقات بالترتيب الآن!',
      publishedAt: Date.now() - 7200000,
      viewsCount: 1420,
    };

    const samplePost2: ChannelPost = {
      id: 'post_seed_2',
      queueItemId: 'q_seed_2',
      sequenceNumber: 2,
      channelId: '@MediaHubArabic',
      channelTitle: 'قناة ميديا العرب الرسمية 🎬',
      publisherUserId: defaultUserId,
      publisherName: 'عبد الحكيم (مالك البوت)',
      type: 'video',
      title: '[الحصريات] [PRO] الحلقة الأولى [1080p].mp4',
      filename: '[الحصريات] [PRO] الحلقة الأولى [1080p].mp4',
      caption: '🎬 فيلم الأسبوع: [الحصريات] [PRO] الحلقة الأولى [1080p]\n\n— اشترك للمزيد من المحتوى المميز',
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      fileSize: 48500000,
      publishedAt: Date.now() - 3600000,
      viewsCount: 890,
    };

    this.data.channelPosts = [samplePost1, samplePost2];
    this.data.sequenceCounter = 3;
  }

  public onQueueItemAdded(listener: (item: QueueItem) => void) {
    this.queueListeners.push(listener);
  }

  public save(immediate = false) {
    if (immediate) {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      this.writeToDiskSync();
      return;
    }

    if (!this.saveTimeout) {
      this.saveTimeout = setTimeout(() => {
        this.saveTimeout = null;
        this.writeToDiskAsync();
      }, 150);
    }
  }

  private writeToDiskSync() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const serialized = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(TMP_FILE, serialized, 'utf-8');
      fs.renameSync(TMP_FILE, DATA_FILE);
      try {
        fs.writeFileSync(BACKUP_FILE, serialized, 'utf-8');
      } catch {}
    } catch (err) {
      console.error('Failed to save store to file synchronously', err);
    }
  }

  private writeToDiskAsync() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const serialized = JSON.stringify(this.data, null, 2);
      fs.promises.writeFile(TMP_FILE, serialized, 'utf-8')
        .then(() => fs.promises.rename(TMP_FILE, DATA_FILE))
        .then(() => {
          fs.promises.writeFile(BACKUP_FILE, serialized, 'utf-8').catch(() => {});
        })
        .catch((err) => {
          console.error('Failed to save store to file asynchronously', err);
        });
    } catch (err) {
      console.error('Failed to write store to file', err);
    }
  }

  // User methods
  public getUser(userId: string | number): UserSetting {
    const id = String(userId);
    if (!this.data.users[id]) {
      this.data.users[id] = {
        userId: id,
        username: `user_${id.slice(-4)}`,
        firstName: `مستخدم #${id.slice(-4)}`,
        forbiddenWords: [],
        namingPrefix: '',
        namingSuffix: '',
        captionPrefix: '',
        captionSuffix: '',
        updatedAt: Date.now(),
      };
      this.save(true);
    }
    return this.data.users[id];
  }

  public updateUser(userId: string | number, update: Partial<UserSetting>): UserSetting {
    const user = this.getUser(userId);
    Object.assign(user, update, { updatedAt: Date.now() });
    if (update.thumbnail) {
      this.restorePermanentThumbnails();
    }
    this.save(true);
    return user;
  }

  public updateQueueItemBySequence(seq: number, update: Partial<QueueItem>): QueueItem | null {
    const item = this.data.queue.find((q) => q.sequenceNumber === seq);
    if (!item) return null;
    Object.assign(item, update);
    this.save();
    this.notifyStatusChanged();
    return item;
  }

  public getAllUsers(): UserSetting[] {
    return Object.values(this.data.users);
  }

  // Queue methods
  public getNextSequenceNumber(): number {
    this.data.sequenceCounter += 1;
    this.save();
    return this.data.sequenceCounter;
  }

  public addToQueue(item: Omit<QueueItem, 'sequenceNumber' | 'createdAt'>): QueueItem {
    const seq = this.getNextSequenceNumber();
    const newItem: QueueItem = {
      ...item,
      sequenceNumber: seq,
      createdAt: Date.now(),
    };
    this.data.queue.push(newItem);
    this.save();

    // If item has sourceChannelId and sourceMessageId, ensure all pending items from this source remain in source order
    if (newItem.sourceChannelId && typeof newItem.sourceMessageId === 'number') {
      this.reorderPendingChannelItems(newItem.sourceChannelId);
    }

    for (const listener of this.queueListeners) {
      try {
        listener(newItem);
      } catch (err) {
        console.error('Queue listener error:', err);
      }
    }
    return newItem;
  }

  /**
   * Re-evaluates and maintains strict channel source order among pending un-published items
   * from the same source channel if any arrive out of order.
   */
  public reorderPendingChannelItems(sourceChannelId: string | number) {
    if (!sourceChannelId) return;
    const channelIdStr = String(sourceChannelId);

    // Find all items belonging to this source channel that haven't published or started physical upload
    const candidates = this.data.queue.filter(
      (item) =>
        item.sourceChannelId &&
        String(item.sourceChannelId) === channelIdStr &&
        typeof item.sourceMessageId === 'number' &&
        item.status !== 'published' &&
        item.status !== 'uploading' &&
        item.status !== 'failed'
    );

    if (candidates.length < 2) return;

    // Check if relative sourceMessageId order differs from relative sequenceNumber order
    const sortedBySource = [...candidates].sort((a, b) => (a.sourceMessageId || 0) - (b.sourceMessageId || 0));
    const sortedBySeq = [...candidates].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    let needsAdjustment = false;
    for (let i = 0; i < sortedBySource.length; i++) {
      if (sortedBySource[i].id !== sortedBySeq[i].id) {
        needsAdjustment = true;
        break;
      }
    }

    if (needsAdjustment) {
      console.log(`[Store] Reordering ${candidates.length} pending items for channel ${channelIdStr} to match source channel order.`);
      const seqs = sortedBySeq.map((it) => it.sequenceNumber);
      for (let i = 0; i < sortedBySource.length; i++) {
        sortedBySource[i].sequenceNumber = seqs[i];
      }
      this.save();
      this.notifyStatusChanged();
    }
  }

  public getQueue(): QueueItem[] {
    return this.data.queue.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  public getQueueItem(id: string): QueueItem | undefined {
    return this.data.queue.find((item) => item.id === id);
  }

  public updateQueueItem(id: string, update: Partial<QueueItem>): QueueItem | undefined {
    const item = this.getQueueItem(id);
    if (item) {
      Object.assign(item, update);
      this.save();
      this.notifyStatusChanged();
    }
    return item;
  }

  public removeQueueItem(id: string) {
    this.data.queue = this.data.queue.filter((item) => item.id !== id);
    this.save();
    this.notifyStatusChanged();
  }

  public clearCompletedQueue() {
    this.data.queue = this.data.queue.filter((item) => item.status !== 'published');
    this.save();
    this.notifyStatusChanged();
  }

  public clearAllQueue() {
    this.data.queue = [];
    this.save();
    this.notifyStatusChanged();
  }

  // Channel posts
  public addChannelPost(post: ChannelPost) {
    this.data.channelPosts.unshift(post);
    if (this.data.channelPosts.length > 200) {
      this.data.channelPosts = this.data.channelPosts.slice(0, 200);
    }
    this.save();
    this.notifyStatusChanged();
  }

  public getChannelPosts(channelId?: string): ChannelPost[] {
    if (channelId) {
      return this.data.channelPosts.filter((p) => p.channelId === channelId);
    }
    return this.data.channelPosts;
  }

  // Simulated Telegram Messages (for the Simulator in chat tab)
  public getSimulatedMessages(chatId: string | number): SimulatedTelegramMessage[] {
    const id = String(chatId);
    return this.data.simulatedMessages[id] || [];
  }

  public addSimulatedMessage(chatId: string | number, msg: SimulatedTelegramMessage) {
    const id = String(chatId);
    if (!this.data.simulatedMessages[id]) {
      this.data.simulatedMessages[id] = [];
    }
    this.data.simulatedMessages[id].push(msg);
    this.save();
  }

  public updateSimulatedMessageText(
    chatId: string | number,
    messageId: number,
    newText: string,
    replyMarkup?: any
  ) {
    const id = String(chatId);
    const list = this.data.simulatedMessages[id] || [];
    const target = list.find((m) => m.message_id === messageId);
    if (target) {
      target.text = newText;
      if (replyMarkup !== undefined) {
        target.reply_markup = replyMarkup;
      }
      this.save();
    }
  }

  public deleteSimulatedMessage(chatId: string | number, messageId: number) {
    const id = String(chatId);
    if (this.data.simulatedMessages[id]) {
      this.data.simulatedMessages[id] = this.data.simulatedMessages[id].filter(
        (m) => m.message_id !== messageId
      );
      this.save();
    }
  }

  // Config
  public getConfig(): BotConfig {
    return this.data.config;
  }

  public updateConfig(configUpdate: Partial<BotConfig>): BotConfig {
    if (configUpdate.aiRenaming) {
      this.data.config.aiRenaming = {
        ...this.data.config.aiRenaming,
        ...configUpdate.aiRenaming,
      };
    }
    if (configUpdate.turboSpeed) {
      this.data.config.turboSpeed = {
        ...this.data.config.turboSpeed!,
        ...configUpdate.turboSpeed,
      };
    }
    const { aiRenaming, turboSpeed, ...rest } = configUpdate;
    Object.assign(this.data.config, rest);

    // Save token into runtime process environment & persist to .env file
    if (this.data.config.botToken && !isGeminiKey(this.data.config.botToken)) {
      process.env.TELEGRAM_BOT_TOKEN = this.data.config.botToken;
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf-8');
        }
        if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
          envContent = envContent.replace(/TELEGRAM_BOT_TOKEN=.*/g, `TELEGRAM_BOT_TOKEN="${this.data.config.botToken}"`);
        } else {
          envContent += `\nTELEGRAM_BOT_TOKEN="${this.data.config.botToken}"\n`;
        }
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
      } catch (err) {
        console.error('Failed to write .env file', err);
      }
    }

    this.save(true);
    return this.data.config;
  }
}

export const store = new Store();
