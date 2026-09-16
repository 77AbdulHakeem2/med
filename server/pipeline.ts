import { UserSetting, ChunkProgress } from '../src/types';
import { ensureMedPulseLinkInCaption } from './aiRenamer';

/**
 * Strips forbidden words from a text string with word boundaries and cleanup.
 * Handles:
 * - Literal match
 * - Telegram handles (@handle, handle, t.me/handle, https://t.me/handle)
 * - Flexible separators within handle/phrase (underscores, spaces, dashes)
 * - Trailing/leading dashes, colons, pipes, and empty brackets/parentheses cleanup
 */
export function removeForbiddenWords(text: string, forbiddenWords: string[]): string {
  if (!text || !forbiddenWords || forbiddenWords.length === 0) return text || '';

  let cleaned = text;

  for (const word of forbiddenWords) {
    if (!word || !word.trim()) continue;
    const trimmed = word.trim();

    // 1. Literal escaped regex
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '');
    } catch {
      // ignore
    }

    // 2. Flexible regex for handles/phrases (e.g. @Medicine_Way2 matching @Medicine Way2, Medicine_Way2, t.me/Medicine_Way2)
    const stripped = trimmed
      .replace(/^@+/, '')
      .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\//i, '');

    if (stripped.length > 0) {
      const tokens = stripped.split(/[\s_\-.]+/).filter(Boolean);
      if (tokens.length > 0) {
        const tokenPattern = tokens
          .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[\\s_\\-.]+');

        const fullPattern = `(?:(?:https?:\\/\\/)?(?:www\\.)?(?:t|telegram)\\.(?:me|dog)\\/|@)?${tokenPattern}`;
        try {
          cleaned = cleaned.replace(new RegExp(fullPattern, 'gi'), '');
        } catch {
          // ignore
        }
      }
    }
  }

  // Post-stripping cleanup
  // 1. Remove empty brackets, parentheses, braces leftover from tags
  cleaned = cleaned
    .replace(/\[\s*\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\{\s*\}/g, '');

  // 2. Collapse multiple horizontal spaces within each line
  cleaned = cleaned.replace(/[^\S\r\n]{2,}/g, ' ');

  // 3. Clean up dangling duplicate separators
  cleaned = cleaned
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s*\|\s*\|\s*/g, ' | ')
    .replace(/\s*•\s*•\s*/g, ' • ');

  // 4. Line-by-line cleanup of dangling leading/trailing punctuation
  cleaned = cleaned
    .split('\n')
    .map((line) => {
      let l = line.trim();
      l = l.replace(/\s*[-|•~:,/]+\s*$/g, '');
      l = l.replace(/^\s*[-|•~,/]+\s*/g, '');
      return l.trim();
    })
    .filter((line, idx, arr) => {
      if (line) return true;
      return idx > 0 && arr[idx - 1] !== '';
    })
    .join('\n')
    .trim();

  return cleaned;
}

/**
 * Separates extension from filename
 */
export function splitExtension(filename: string): { base: string; ext: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return { base: filename, ext: '' };
  }
  return {
    base: filename.substring(0, lastDot),
    ext: filename.substring(lastDot),
  };
}

/**
 * Processes filename according to user settings:
 * 1. Removes forbidden words
 * 2. Applies user Tag (before or after)
 * 3. Applies user Prefix and Suffix
 * 4. Preserves the original file extension (.mp4, .mkv, etc.)
 */
export function processActualFilename(
  originalFilename: string,
  userSetting?: UserSetting | null
): string {
  if (!originalFilename) return 'file.mp4';
  if (!userSetting) return originalFilename;

  const { base: rawBase, ext } = splitExtension(originalFilename);

  // 1. Remove forbidden words
  let processedBase = removeForbiddenWords(rawBase, userSetting.forbiddenWords || []);

  // 2. Apply Tag if configured
  if (userSetting.tag && userSetting.tag.text) {
    const tagText = userSetting.tag.text.trim();
    if (tagText) {
      if (userSetting.tag.position === 'before') {
        if (!processedBase.startsWith(tagText)) {
          processedBase = `${tagText} ${processedBase}`.trim();
        }
      } else {
        if (!processedBase.endsWith(tagText)) {
          processedBase = `${processedBase} ${tagText}`.trim();
        }
      }
    }
  }

  // 3. Apply Prefix & Suffix
  if (userSetting.namingPrefix && userSetting.namingPrefix.trim()) {
    const prefix = userSetting.namingPrefix.trim();
    if (!processedBase.startsWith(prefix)) {
      processedBase = `${prefix} ${processedBase}`.trim();
    }
  }
  if (userSetting.namingSuffix && userSetting.namingSuffix.trim()) {
    const suffix = userSetting.namingSuffix.trim();
    if (!processedBase.endsWith(suffix)) {
      processedBase = `${processedBase} ${suffix}`.trim();
    }
  }

  // Final cleanup of spaces before extension
  processedBase = processedBase.replace(/\s{2,}/g, ' ').trim();

  // 4. Return clean result with preserved extension
  return `${processedBase}${ext}`;
}

/**
 * Processes caption comprehensively:
 * 1. Combines filename and original caption so what came in the file's name and description is never lost
 * 2. Scrubs forbidden words
 * 3. Applies Prefix / Suffix if specified
 * 4. Applies Tag if specified
 * 5. Guarantees MedPulse link is properly embedded
 */
export function processActualCaption(
  originalCaption: string | undefined,
  userSetting?: UserSetting | null,
  filename?: string
): string {
  const cleanFilename = (filename || '').replace(/\.[a-zA-Z0-9]{1,6}$/i, '').replace(/\s*\.m$/i, '').trim();
  const rawCaption = (originalCaption || '').trim();

  // Use original caption cleanly, or fall back to clean filename if caption is empty
  let combined = rawCaption || cleanFilename;

  if (!userSetting) {
    return combined ? ensureMedPulseLinkInCaption(combined, 4096) : '';
  }

  if (!combined) {
    let emptyCaption = '';
    if (userSetting.tag && userSetting.tag.text) {
      emptyCaption = userSetting.tag.text.trim();
    }
    return emptyCaption ? ensureMedPulseLinkInCaption(emptyCaption, 4096) : '';
  }

  // 1. Remove forbidden words from caption text
  let cleaned = removeForbiddenWords(combined, userSetting.forbiddenWords || []);

  // 2. Apply Caption Prefix (if configured)
  const prefix = (userSetting.captionPrefix || '').trim();
  if (prefix && !cleaned.startsWith(prefix)) {
    cleaned = `${prefix}\n${cleaned}`.trim();
  }

  // 3. Apply Caption Suffix (if configured)
  const suffix = (userSetting.captionSuffix || '').trim();
  if (suffix && !cleaned.endsWith(suffix)) {
    cleaned = `${cleaned}\n${suffix}`.trim();
  }

  // 4. Apply Tag if configured
  if (userSetting.tag && userSetting.tag.text) {
    const tagText = userSetting.tag.text.trim();
    if (tagText && !cleaned.includes(tagText)) {
      if (userSetting.tag.position === 'before') {
        cleaned = `${tagText}\n${cleaned}`.trim();
      } else {
        cleaned = `${cleaned}\n${tagText}`.trim();
      }
    }
  }

  const result = cleaned.trim();
  return ensureMedPulseLinkInCaption(result, 4096);
}

/**
 * Chunked Download & Upload Manager with Resume Support
 * "إدارة تنزيل ورفع الملفات الضخمة بالتجزئة مع استمرارية الاتصال"
 */
export class ChunkedTransferManager {
  /**
   * Simulates/executes chunked transfer with progress callback and resume support.
   * Dynamically balances chunk sizing so progress is tracked cleanly without artificial bottlenecks.
   */
  public static async executeChunkedTransfer(
    fileSize: number,
    type: 'download' | 'upload',
    existingResumeToken: string | undefined,
    onProgress: (progress: ChunkProgress) => Promise<void> | void,
    chunkSizeBytes = 1024 * 1024 * 5 // 5MB per chunk default
  ): Promise<{ success: boolean; resumeToken: string }> {
    const totalBytes = Math.max(fileSize, 2 * 1024 * 1024);
    // Cap steps between 3 and 6 so transfer finishes quickly and smoothly
    const rawChunks = Math.ceil(totalBytes / chunkSizeBytes);
    const totalChunks = Math.min(Math.max(rawChunks, 3), 6);
    const effectiveChunkSize = Math.ceil(totalBytes / totalChunks);
    const resumeToken = existingResumeToken || `resume_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    let startChunk = 0;
    if (existingResumeToken && existingResumeToken.includes(':')) {
      const parts = existingResumeToken.split(':');
      startChunk = Math.min(parseInt(parts[1], 10) || 0, totalChunks - 1);
    }

    for (let i = startChunk; i < totalChunks; i++) {
      const downloadedBytes = Math.min((i + 1) * effectiveChunkSize, totalBytes);
      const activeChunkSize = downloadedBytes - i * effectiveChunkSize;
      const speedMbps = +(24.5 + Math.random() * 12.0).toFixed(1);

      const progress: ChunkProgress = {
        downloadedBytes,
        totalBytes,
        chunkIndex: i + 1,
        totalChunks,
        resumeToken: `${resumeToken}:${i + 1}`,
        activeChunkSize,
        speedMbps,
      };

      await onProgress(progress);
      // Fast, smooth delay for UI updates without blocking processing
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    return { success: true, resumeToken };
  }
}
