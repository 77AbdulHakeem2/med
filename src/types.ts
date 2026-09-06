export interface UserThumbnail {
  id: string;
  fileId?: string;
  url: string;
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
    type: 'awaiting_tag_text' | 'awaiting_channel' | 'awaiting_forbidden_word' | 'awaiting_prefix' | 'awaiting_suffix' | 'awaiting_thumbnail';
    data?: Record<string, any>;
  };
  updatedAt: number;
}

export type QueueItemType = 'video' | 'document' | 'text';

export type QueueItemStatus =
  | 'queued'
  | 'receiving'
  | 'downloading'
  | 'processing'
  | 'applying_thumb'
  | 'renaming'
  | 'processing_caption'
  | 'completed_processing'
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
  type: QueueItemType;
  fileId?: string;
  duration?: number;
  width?: number;
  height?: number;
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
  chunkProgress?: ChunkProgress;
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
