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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot_data.json');

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
    },
    users: {},
    queue: [],
    channelPosts: [],
    simulatedMessages: {},
    sequenceCounter: 100,
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const resolvedToken = process.env.TELEGRAM_BOT_TOKEN || parsed.config?.botToken || '';
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
          },
        };
        if (resolvedToken && !process.env.TELEGRAM_BOT_TOKEN) {
          process.env.TELEGRAM_BOT_TOKEN = resolvedToken;
        }
      } else {
        this.seedDefaultData();
        this.save();
      }
    } catch (err) {
      console.error('Failed to load store data, seeding defaults', err);
      this.seedDefaultData();
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

  public save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save store to file', err);
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
      this.save();
    }
    return this.data.users[id];
  }

  public updateUser(userId: string | number, update: Partial<UserSetting>): UserSetting {
    const user = this.getUser(userId);
    Object.assign(user, update, { updatedAt: Date.now() });
    this.save();
    return user;
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
    return newItem;
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
    }
    return item;
  }

  public removeQueueItem(id: string) {
    this.data.queue = this.data.queue.filter((item) => item.id !== id);
    this.save();
  }

  public clearCompletedQueue() {
    this.data.queue = this.data.queue.filter((item) => item.status !== 'published');
    this.save();
  }

  public clearAllQueue() {
    this.data.queue = [];
    this.save();
  }

  // Channel posts
  public addChannelPost(post: ChannelPost) {
    this.data.channelPosts.unshift(post);
    if (this.data.channelPosts.length > 200) {
      this.data.channelPosts = this.data.channelPosts.slice(0, 200);
    }
    this.save();
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
      const { aiRenaming, ...rest } = configUpdate;
      Object.assign(this.data.config, rest);
    } else {
      Object.assign(this.data.config, configUpdate);
    }

    // Save token into runtime process environment & persist to .env file
    if (this.data.config.botToken) {
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

    this.save();
    return this.data.config;
  }
}

export const store = new Store();
