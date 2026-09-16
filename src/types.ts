export interface UserThumbnail {
  id: string;
  fileId?: string;
  url: string;
  dataUrl?: string;
  standard320Path?: string;
  updatedAt: number;
}

export interface UserTag {
  text: string;
  position: 'before' | 'after';
}

export interface UserChannelSetting {
  chatId: string;
  title: string;
  publishingEnabled: boolean;
  lastVerifiedAt: number;
  verifiedAdmin: boolean;
  statusMessage?: string;
}

export interface UserSetting {
  userId: string;
  username: string;
  firstName: string;
  thumbnail?: UserThumbnail;
  tag?: UserTag;
  forbiddenWords: string[];
  namingPrefix: string;
  namingSuffix: string;
  captionPrefix: string;
  captionSuffix: string;
  channel?: UserChannelSetting;
  pendingAction?: {
    type:
      | 'awaiting_tag_text'
      | 'awaiting_channel'
      | 'awaiting_forbidden_word'
      | 'awaiting_prefix'
      | 'awaiting_suffix'
      | 'awaiting_caption_prefix'
      | 'awaiting_caption_suffix'
      | 'awaiting_thumbnail'
      | 'awaiting_ai_pattern'
      | 'awaiting_ai_instructions'
      | 'awaiting_custom_caption_template';
    data?: Record<string, any>;
  };
  updatedAt: number;
}

export type QueueItemType = 'video' | 'audio' | 'document' | 'text';

export type QueueItemStatus =
  | 'queued'
  | 'receiving'
  | 'downloading'
  | 'processing'
  | 'applying_thumb'
  | 'renaming'
  | 'processing_caption'
  | 'completed_processing'
  | 'ready_to_publish'
  | 'uploading'
  | 'published'
  | 'failed';

export interface ChunkProgress {
  downloadedBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
  resumeToken: string;
  activeChunkSize: number;
  speedMbps: number;
}

export interface QueueItem {
  id: string;
  sequenceNumber: number;
  userId: string;
  userFirstName: string;
  chatId: string;
  messageId?: number;
  type: QueueItemType;
  fileId?: string;
  duration?: number;
  width?: number;
  height?: number;
  performer?: string;
  title?: string;
  originalFilename?: string;
  originalCaption?: string;
  processedFilename?: string;
  processedCaption?: string;
  textContent?: string;
  fileSize?: number;
  mimeType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  hasCustomThumbnail?: boolean;
  status: QueueItemStatus;
  statusMessage: string;
  statusTelegramMessageId?: number;
  targetChannelId?: string;
  targetChannelTitle?: string;
  sourceChannelId?: string | number;
  sourceChannelTitle?: string;
  sourceMessageId?: number;
  forwardDate?: number;
  mediaGroupId?: string;
  chunkProgress?: ChunkProgress;
  isAiRenamed?: boolean;
  aiGroupingReason?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ChannelPost {
  id: string;
  queueItemId: string;
  sequenceNumber: number;
  channelId: string;
  channelTitle: string;
  publisherUserId: string;
  publisherName: string;
  type: QueueItemType;
  fileId?: string;
  duration?: number;
  width?: number;
  height?: number;
  performer?: string;
  title?: string;
  filename?: string;
  caption?: string;
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  hasCustomThumbnail?: boolean;
  fileSize?: number;
  publishedAt: number;
  viewsCount: number;
}

export interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

export interface CaptionStylePreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  template: string;
}

export const CAPTION_STYLE_PRESETS: CaptionStylePreset[] = [
  {
    id: 'medpulse_box',
    name: 'النمط الرسمي المعتمد (MedPulse Box)',
    badge: 'الافتراضي المعتمد 👑',
    description: 'إطار خطي فخم، اسم الدكتور بجانب MedPulse، الموضوع، ومعرف القناة بجانب الهاشتاق.',
    template: `━━━━━━━━━━━━━━━\n📕 Name :\n{medpulse_link} | {doctor}\n━━━━━━━━━━━━━━━\n📌 Topic\n{topic}\n━━━━━━━━━━━━━━━\n@MedPulseVIP | #{hashtag}`,
  },
  {
    id: 'academic_badges',
    name: 'النمط الأكاديمي الشامل (Academic Badges)',
    badge: 'منظم وتفصيلي 📚',
    description: 'توزيع منظم بأيقونات طبية وأكاديمية للمادة، المحاضر، العنوان ورقم الجزء.',
    template: `🩺 {medpulse_link}\n━━━━━━━━━━━━━━━━━━\n📚 المادة: {subject}\n👨‍⚕️ الدكتور: {doctor}\n📑 المحاضرة: {topic}\n🔢 الجزء: {part}\n━━━━━━━━━━━━━━━━━━\n📢 القناة: @MedPulseVIP\n#{hashtag}`,
  },
  {
    id: 'modern_minimal',
    name: 'النمط العصري الهادئ (Modern Minimal)',
    badge: 'هادئ وأنيق ✨',
    description: 'خطوط هادئة ونقاط ناعمة بدون فواصل عريضة، ممتاز للقراءة السلسة.',
    template: `{medpulse_link} | {subject}\n▪️ المحاضر: {doctor}\n▫️ الموضوع: {topic} {part}\n\n🔗 @MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'compact_bullets',
    name: 'النمط الهندسي المركز (Compact Bullets)',
    badge: 'هندسي ومركّز ◈',
    description: 'نقاط هندسية واضحة وخط فاصل رفيع، خفيف ومنظم.',
    template: `◈ {medpulse_link} ◈\n▸ الكورس: {subject}\n▸ الدكتور: {doctor}\n▸ العنوان: {topic} {part}\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n@MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'single_line_clean',
    name: 'النمط المختصر والسريع (Direct Short)',
    badge: 'موجز وسريع ⚡',
    description: 'صيغة سريعة بدون تفاصيل إضافية لتوفير المساحة في القنوات المزدحمة.',
    template: `{medpulse_link} • {subject}\n{doctor} — {topic} {part}\n@MedPulseVIP • #{hashtag}`,
  },
  {
    id: 'custom',
    name: 'قالب مخصص بالكامل (Custom Template)',
    badge: 'حرية كاملة ✏️',
    description: 'اكتب نمطك الخاص واستخدم المتغيرات الذكية: {subject}, {doctor}, {topic}, {part}, #{hashtag}, {channel}, {medpulse_link}.',
    template: '',
  },
];

export interface AIRenamingConfig {
  enabled: boolean;
  namingPattern: string;
  customInstructions: string;
  autoApplyOnQueue: boolean;
  captionStyle?: string;
  customCaptionTemplate?: string;
}

export interface AIRenamedItemResult {
  id: string;
  originalFilename: string;
  originalCaption?: string;
  extractedDoctor?: string;
  extractedSubject?: string;
  extractedTopic?: string;
  extractedPart?: string | number;
  formattedFilename: string;
  formattedCaption?: string;
  groupingReason?: string;
}

export interface TurboSpeedConfig {
  enabled: boolean;
  fastStatusUpdates: boolean;
  preloadNextItem: boolean;
  enableCache: boolean;
  cloudDirectDispatch: boolean;
  maxConcurrency: number;
  mtprotoWorkers: number;
}

export interface BotConfig {
  botToken: string;
  pollingActive: boolean;
  webhookUrl: string;
  aiRenaming: AIRenamingConfig;
  turboSpeed?: TurboSpeedConfig;
}

export interface SystemStatus {
  botConfigured: boolean;
  botInfo: BotInfo | null;
  pollingActive: boolean;
  webhookActive: boolean;
  webhookUrl?: string;
  queueLength: number;
  activeProcessingId?: string;
  totalProcessedCount: number;
  registeredUsersCount: number;
  lastActiveTime: number;
  resumableTransfersCount: number;
  aiRenaming?: AIRenamingConfig;
  turboSpeed?: TurboSpeedConfig;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SimulatedTelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    username?: string;
    is_bot?: boolean;
  };
  chat: {
    id: number;
    first_name?: string;
    title?: string;
    type: 'private' | 'channel' | 'group' | 'supergroup';
  };
  date: number;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_size: number; width: number; height: number }>;
  video?: {
    file_id: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    duration: number;
    thumb?: { file_id: string };
  };
  document?: {
    file_id: string;
    file_name: string;
    mime_type: string;
    file_size: number;
  };
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}
