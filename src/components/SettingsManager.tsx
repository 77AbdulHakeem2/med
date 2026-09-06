import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Tag,
  Ban,
  FileEdit,
  Radio,
  Trash2,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { UserSetting } from '../types';

interface SettingsManagerProps {
  user: UserSetting;
  onUpdateUser: (userId: string, update: Partial<UserSetting>) => Promise<void>;
  onUploadThumbnail: (file: File) => Promise<void>;
  onDeleteThumbnail: () => Promise<void>;
  onVerifyChannel: (channelChatId: string) => Promise<{ valid: boolean; title?: string; error?: string }>;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  user,
  onUpdateUser,
  onUploadThumbnail,
  onDeleteThumbnail,
  onVerifyChannel,
}) => {
  // Local state for editing
  const [tagText, setTagText] = useState(user.tag?.text || '');
  const [tagPosition, setTagPosition] = useState<'before' | 'after'>(user.tag?.position || 'before');

  const [newForbiddenWord, setNewForbiddenWord] = useState('');

  const [namingPrefix, setNamingPrefix] = useState(user.namingPrefix || '');
  const [namingSuffix, setNamingSuffix] = useState(user.namingSuffix || '');
  const [captionPrefix, setCaptionPrefix] = useState(user.captionPrefix || '');
  const [captionSuffix, setCaptionSuffix] = useState(user.captionSuffix || '');

  const [channelChatId, setChannelChatId] = useState(user.channel?.chatId || '@MediaHubArabic');
  const [publishingEnabled, setPublishingEnabled] = useState(user.channel?.publishingEnabled ?? true);
  const [verifyingChannel, setVerifyingChannel] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string } | null>(null);

  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setSavedSuccess(msg);
    setTimeout(() => setSavedSuccess(null), 3500);
  };

  // 1. Thumbnail Handlers
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUploadThumbnail(file);
    showFeedback('تم تعيين الصورة المصغرة بنجاح');
  };

  // 2. Tag Handlers
  const handleSaveTag = async () => {
    if (!tagText.trim()) {
      await onUpdateUser(user.userId, { tag: undefined });
      showFeedback('تم حذف الوسم بنجاح');
      return;
    }
    await onUpdateUser(user.userId, {
      tag: { text: tagText.trim(), position: tagPosition },
    });
    const posArabic = tagPosition === 'before' ? 'قبل الاسم' : 'بعد الاسم';
    showFeedback(`تم حفظ الوسم "${tagText.trim()}" (${posArabic}) بنجاح`);
  };

  const handleDeleteTag = async () => {
    setTagText('');
    await onUpdateUser(user.userId, { tag: undefined });
    showFeedback('تم حذف الوسم بنجاح');
  };

  // 3. Forbidden Words Handlers
  const handleAddForbiddenWord = async () => {
    if (!newForbiddenWord.trim()) return;
    const word = newForbiddenWord.trim();
    if (user.forbiddenWords.includes(word)) {
      setNewForbiddenWord('');
      return;
    }
    const updated = [...user.forbiddenWords, word];
    await onUpdateUser(user.userId, { forbiddenWords: updated });
    setNewForbiddenWord('');
    showFeedback(`تمت إضافة الكلمة المحظورة "${word}"`);
  };

  const handleRemoveForbiddenWord = async (wordToRemove: string) => {
    const updated = user.forbiddenWords.filter((w) => w !== wordToRemove);
    await onUpdateUser(user.userId, { forbiddenWords: updated });
    showFeedback(`تمت إزالة الكلمة "${wordToRemove}"`);
  };

  // 4. Prefix & Suffix Handlers
  const handleSaveNaming = async () => {
    await onUpdateUser(user.userId, {
      namingPrefix: namingPrefix.trim(),
      namingSuffix: namingSuffix.trim(),
      captionPrefix: captionPrefix.trim(),
      captionSuffix: captionSuffix.trim(),
    });
    showFeedback('تم حفظ إعدادات البادئة واللاحقة بنجاح');
  };

  // 5. Channel Handlers
  const handleVerifyChannel = async () => {
    if (!channelChatId.trim()) return;
    setVerifyingChannel(true);
    setVerifyResult(null);

    const res = await onVerifyChannel(channelChatId.trim());
    setVerifyingChannel(false);

    if (res.valid) {
      setVerifyResult({ valid: true, message: `تم التحقق بنجاح! البوت والمستخدم كلاهما مشرفين في: ${res.title || channelChatId}` });
      await onUpdateUser(user.userId, {
        channel: {
          chatId: channelChatId.trim(),
          title: res.title || channelChatId.trim(),
          publishingEnabled,
          lastVerifiedAt: Date.now(),
          verifiedAdmin: true,
          statusMessage: 'مشرف معتمد',
        },
      });
      showFeedback('تم تعيين قناة النشر والتحقق من صلاحيات الإشراف بنجاح');
    } else {
      setVerifyResult({ valid: false, message: res.error || 'المستخدم ليس مشرفاً في القناة' });
    }
  };

  const handleTogglePublishing = async () => {
    const newState = !publishingEnabled;
    setPublishingEnabled(newState);
    if (user.channel) {
      await onUpdateUser(user.userId, {
        channel: {
          ...user.channel,
          publishingEnabled: newState,
        },
      });
    }
    showFeedback(newState ? '🟢 تم تفعيل النشر للقناة' : '🔴 تم تعطيل النشر مؤقتاً');
  };

  // Filename simulation preview
  const demoOriginal = 'Movie ABC - كلمة_محظورة - 001.mp4';
  let demoCleaned = demoOriginal;
  user.forbiddenWords.forEach((fw) => {
    demoCleaned = demoCleaned.replace(new RegExp(fw, 'gi'), '');
  });
  demoCleaned = demoCleaned.replace(/\s{2,}/g, ' ').trim();
  const ext = '.mp4';
  const base = demoCleaned.replace(ext, '').trim();

  let demoResult = base;
  if (tagText.trim()) {
    demoResult = tagPosition === 'before' ? `${tagText.trim()} ${demoResult}` : `${demoResult} ${tagText.trim()}`;
  }
  if (namingPrefix.trim()) {
    demoResult = `${namingPrefix.trim()} ${demoResult}`;
  }
  if (namingSuffix.trim()) {
    demoResult = `${demoResult} ${namingSuffix.trim()}`;
  }
  demoResult = `${demoResult}${ext}`;

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-5 select-none">
      
      {/* Alert toast for feedback */}
      {savedSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161616] border border-emerald-500/40 text-emerald-400 px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-[#111111] border border-[#222] p-5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#f0f0f0] font-serif-display italic tracking-wide text-lg">
              User Profile Configuration
            </h2>
            <span className="px-2 py-0.5 rounded bg-[#1c1c1c] text-sky-400 text-xs font-mono border border-[#2a2a2a]">
              UID: {user.userId}
            </span>
          </div>
          <p className="text-xs text-[#777] mt-0.5 font-sans">
            جميع الإعدادات هنا خاصة بالمستخدم <b className="text-[#ccc]">{user.firstName}</b> ومحفوظة بشكل دائم، ولا تؤثر على أي مستخدم آخر.
          </p>
        </div>

        {/* Quick Preview Box */}
        <div className="bg-[#0c0c0c] border border-[#222] px-3.5 py-2 rounded text-xs font-mono">
          <span className="text-[10px] text-[#666] block uppercase tracking-wider mb-0.5">PREVIEW_OUTPUT:</span>
          <span className="text-emerald-400 font-bold" dir="ltr">
            {demoResult}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* 1. Thumbnail Section */}
        <div className="bg-[#111111] border border-[#222] rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#222] pb-3">
            <div className="flex items-center gap-2 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <ImageIcon className="w-4 h-4 text-sky-400" />
              <span>THUMBNAIL_SYSTEM</span>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              user.thumbnail ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400' : 'bg-[#181818] border-[#2a2a2a] text-[#666]'
            }`}>
              {user.thumbnail ? 'SAVED_ACTIVE ✅' : 'NOT_SET ❌'}
            </span>
          </div>

          <p className="text-xs text-[#777] leading-relaxed font-sans">
            وفق الشروط: عند إرسال أي صورة في محادثة البوت بدون أي أمر، يتعرف عليها البوت تلقائياً كـ Thumbnail ويحفظها مباشرة.
          </p>

          {/* Thumbnail preview */}
          {user.thumbnail ? (
            <div className="relative rounded overflow-hidden border border-[#282828] aspect-video max-h-48 bg-black">
              <img
                src={user.thumbnail.url}
                alt="User Thumbnail"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-3">
                <span className="text-xs text-[#eee] font-mono">THUMBNAIL_ACTIVE</span>
                <button
                  onClick={onDeleteThumbnail}
                  className="px-2.5 py-1 bg-[#1c1c1c] hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 rounded text-xs font-mono flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>DELETE</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-[#282828] rounded p-6 text-center space-y-2">
              <ImageIcon className="w-7 h-7 text-[#444] mx-auto" />
              <p className="text-xs text-[#666] font-mono">NO_CUSTOM_THUMBNAIL</p>
            </div>
          )}

          {/* Upload button */}
          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer bg-[#181818] hover:bg-[#202020] text-[#ccc] hover:text-sky-400 text-xs font-mono py-2 px-3 rounded border border-[#2b2b2b] flex items-center justify-center gap-2 transition">
              <Upload className="w-4 h-4 text-sky-400" />
              <span>UPLOAD_NEW_THUMBNAIL</span>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
        </div>

        {/* 2. Tag & Position Section */}
        <div className="bg-[#111111] border border-[#222] rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#222] pb-3">
            <div className="flex items-center gap-2 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <Tag className="w-4 h-4 text-sky-400" />
              <span>TAG_POSITIONING</span>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              user.tag?.text ? 'bg-sky-950/40 border-sky-800/40 text-sky-400' : 'bg-[#181818] border-[#2a2a2a] text-[#666]'
            }`}>
              {user.tag?.text ? `ACTIVE_${user.tag.position.toUpperCase()}` : 'UNCONFIGURED'}
            </span>
          </div>

          <p className="text-xs text-[#777] leading-relaxed font-sans">
            يسمح بإضافة نص محدد تلقائياً إلى اسم كل ملف تتم معالجته، مع تحديد ما إذا كان يوضع قبل العنوان أو بعد العنوان.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-mono text-[#aaa] block mb-1">TAG_STRING:</label>
              <input
                type="text"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="مثال: PRO أو الحصريات"
                className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-sky-500/60 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-[#aaa] block mb-1.5">PLACEMENT:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTagPosition('before')}
                  className={`py-1.5 px-3 rounded text-xs font-mono border transition ${
                    tagPosition === 'before'
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/50'
                      : 'bg-[#0a0a0a] text-[#777] border-[#282828] hover:bg-[#181818]'
                  }`}
                >
                  BEFORE (قبل العنوان)
                </button>
                <button
                  type="button"
                  onClick={() => setTagPosition('after')}
                  className={`py-1.5 px-3 rounded text-xs font-mono border transition ${
                    tagPosition === 'after'
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/50'
                      : 'bg-[#0a0a0a] text-[#777] border-[#282828] hover:bg-[#181818]'
                  }`}
                >
                  AFTER (بعد العنوان)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSaveTag}
                className="flex-1 py-1.5 bg-sky-500 hover:bg-sky-400 text-black rounded text-xs font-mono font-semibold transition shadow-sm"
              >
                SAVE_TAG_CONFIG
              </button>
              {user.tag && (
                <button
                  onClick={handleDeleteTag}
                  className="p-1.5 bg-[#181818] hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 rounded transition"
                  title="حذف الوسم"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3. Forbidden Words Section */}
        <div className="bg-[#111111] border border-[#222] rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#222] pb-3">
            <div className="flex items-center gap-2 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <Ban className="w-4 h-4 text-rose-400" />
              <span>FORBIDDEN_WORDS</span>
            </div>
            <span className="text-[10px] font-mono text-[#666]">
              {user.forbiddenWords.length} ITEMS
            </span>
          </div>

          <p className="text-xs text-[#777] leading-relaxed font-sans">
            أي كلمة من هذه القائمة يتم العثور عليها في اسم الملف الفعلي أو وصف الملف (Caption) يتم حذفها تلقائياً قبل النشر.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newForbiddenWord}
              onChange={(e) => setNewForbiddenWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddForbiddenWord()}
              placeholder="اكتب كلمة أو رابط لحظره..."
              className="flex-1 bg-[#0a0a0a] border border-[#282828] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-rose-500/60 font-mono"
            />
            <button
              onClick={handleAddForbiddenWord}
              className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-rose-950/40 text-rose-300 border border-rose-800/40 rounded text-xs font-mono font-semibold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
            {user.forbiddenWords.length === 0 ? (
              <span className="text-xs text-[#555] font-mono italic">EMPTY_LIST</span>
            ) : (
              user.forbiddenWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/20 border border-rose-900/30 text-rose-300 text-xs font-mono"
                >
                  <span>{word}</span>
                  <button
                    onClick={() => handleRemoveForbiddenWord(word)}
                    className="hover:text-white transition ml-1 text-rose-400"
                    title="إزالة الكلمة"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* 4. Prefix & Suffix Section */}
        <div className="bg-[#111111] border border-[#222] rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#222] pb-3">
            <div className="flex items-center gap-2 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <FileEdit className="w-4 h-4 text-amber-400" />
              <span>PREFIX_SUFFIX_MODIFIERS</span>
            </div>
          </div>

          <p className="text-xs text-[#777] leading-relaxed font-sans">
            إضافة نص إلى بداية أو نهاية اسم الملف الحقيقي (مع الحفاظ التام على امتداد الملف الأصلي .mp4) وتحديث الوصف بالتوافق.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-mono text-[#aaa] block mb-1">FILE_PREFIX:</label>
              <input
                type="text"
                value={namingPrefix}
                onChange={(e) => setNamingPrefix(e.target.value)}
                placeholder="مثال: [Series]"
                className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-2.5 py-1.5 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-[#aaa] block mb-1">FILE_SUFFIX:</label>
              <input
                type="text"
                value={namingSuffix}
                onChange={(e) => setNamingSuffix(e.target.value)}
                placeholder="مثال: [HD]"
                className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-2.5 py-1.5 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-mono text-[#aaa] block mb-1">CAPTION_PREFIX:</label>
              <input
                type="text"
                value={captionPrefix}
                onChange={(e) => setCaptionPrefix(e.target.value)}
                placeholder="مثال: 🎬 فيلم الأسبوع:"
                className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-2.5 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-[#aaa] block mb-1">CAPTION_SUFFIX:</label>
              <input
                type="text"
                value={captionSuffix}
                onChange={(e) => setCaptionSuffix(e.target.value)}
                placeholder="مثال: — اشترك للمزيد"
                className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-2.5 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <button
            onClick={handleSaveNaming}
            className="w-full py-1.5 bg-[#1a1a1a] hover:bg-[#222] text-amber-400 border border-amber-500/30 rounded text-xs font-mono font-semibold transition"
          >
            APPLY_MODIFIERS
          </button>
        </div>

      </div>

      {/* 5. Channel Publishing & Permissions Section */}
      <div className="bg-[#111111] border border-[#222] rounded-lg p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
          <div className="flex items-center gap-2 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>CHANNEL_ADMIN_BINDING</span>
          </div>

          <button
            onClick={handleTogglePublishing}
            className={`px-3 py-1 rounded text-xs font-mono transition flex items-center gap-1.5 border ${
              publishingEnabled
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/30'
                : 'bg-rose-950/40 text-rose-400 border-rose-800/50 hover:bg-rose-900/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${publishingEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span>{publishingEnabled ? 'PUBLISHING: ENABLED' : 'PUBLISHING: PAUSED'}</span>
          </button>
        </div>

        <p className="text-xs text-[#777] leading-relaxed font-sans">
          وفق التعليمات: لا يُسمح للمستخدم باستخدام البوت للنشر إلا إذا كان المستخدم نفسه مشرفاً (Administrator) في القناة.
          يتم فحص الصلاحيات بشكل مستمر وموثق.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <label className="text-[11px] font-mono text-[#aaa] block mb-1">
              TARGET_CHANNEL_ID:
            </label>
            <input
              type="text"
              value={channelChatId}
              onChange={(e) => setChannelChatId(e.target.value)}
              placeholder="مثال: @MediaHubArabic أو -100123456789"
              className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <div className="self-end w-full sm:w-auto">
            <button
              onClick={handleVerifyChannel}
              disabled={verifyingChannel || !channelChatId.trim()}
              className="w-full sm:w-auto px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black rounded text-xs font-mono font-semibold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              {verifyingChannel ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>VERIFYING_PERMISSIONS...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>VERIFY_AND_BIND_CHANNEL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Verification result alert */}
        {verifyResult && (
          <div className={`p-3 rounded text-xs flex items-start gap-2 border font-mono ${
            verifyResult.valid
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-400'
              : 'bg-rose-950/30 border-rose-800/50 text-rose-400'
          }`}>
            {verifyResult.valid ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{verifyResult.message}</span>
          </div>
        )}
      </div>

    </div>
  );
};
