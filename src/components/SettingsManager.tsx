import React, { useState, useEffect } from 'react';
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
  Key,
  Sparkles,
  Bot,
  Layers,
  Wand2,
  HelpCircle,
  Eye,
  EyeOff,
  Sliders,
  FileText,
  Zap,
  Gauge,
  Cpu,
  Rocket,
} from 'lucide-react';
import { UserSetting, AIRenamingConfig, CAPTION_STYLE_PRESETS } from '../types';

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
  // Bot Token state
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [botConfigured, setBotConfigured] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [botPolling, setBotPolling] = useState(true);
  const [savingBotToken, setSavingBotToken] = useState(false);
  const [botTokenFeedback, setBotTokenFeedback] = useState<{ verified: boolean; message: string } | null>(null);
  const [isFromSecret, setIsFromSecret] = useState(false);
  const [hasGeminiKeyConflict, setHasGeminiKeyConflict] = useState(false);

  // AI Renaming Configuration state
  const [aiEnabled, setAiEnabled] = useState(true);
  const [namingPattern, setNamingPattern] = useState('{subject} - د. {doctor} - {topic} [Part {part}]');
  const [customInstructions, setCustomInstructions] = useState('');
  const [autoApplyOnQueue, setAutoApplyOnQueue] = useState(true);
  const [captionStyle, setCaptionStyle] = useState('medpulse_box');
  const [customCaptionTemplate, setCustomCaptionTemplate] = useState('');
  const [savingAiConfig, setSavingAiConfig] = useState(false);

  // Turbo Speed Engine state
  const [turboEnabled, setTurboEnabled] = useState(true);
  const [fastStatusUpdates, setFastStatusUpdates] = useState(true);
  const [preloadNextItem, setPreloadNextItem] = useState(true);
  const [savingTurbo, setSavingTurbo] = useState(false);

  // Fetch bot & AI configuration on mount
  useEffect(() => {
    fetch('/api/bot/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.botToken) {
          setBotToken(data.botToken);
          setBotConfigured(true);
        }
        if (data.pollingActive !== undefined) {
          setBotPolling(data.pollingActive);
        }
        if (data.isFromSecret !== undefined) {
          setIsFromSecret(data.isFromSecret);
        }
        if (data.hasGeminiKeyConflict !== undefined) {
          setHasGeminiKeyConflict(data.hasGeminiKeyConflict);
        }
        if (data.aiRenaming) {
          setAiEnabled(data.aiRenaming.enabled ?? true);
          setNamingPattern(data.aiRenaming.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]');
          setCustomInstructions(data.aiRenaming.customInstructions || '');
          setAutoApplyOnQueue(data.aiRenaming.autoApplyOnQueue ?? true);
          setCaptionStyle(data.aiRenaming.captionStyle || 'medpulse_box');
          setCustomCaptionTemplate(data.aiRenaming.customCaptionTemplate || '');
        }
        if (data.turboSpeed) {
          setTurboEnabled(data.turboSpeed.enabled ?? true);
          setFastStatusUpdates(data.turboSpeed.fastStatusUpdates ?? true);
          setPreloadNextItem(data.turboSpeed.preloadNextItem ?? true);
        }
      })
      .catch((err) => console.error('Failed to load bot/AI config:', err));
  }, []);

  // Update Turbo Speed Settings
  const handleUpdateTurbo = async (changes: Partial<{ enabled: boolean; fastStatusUpdates: boolean; preloadNextItem: boolean }>) => {
    const nextTurbo = {
      enabled: changes.enabled !== undefined ? changes.enabled : turboEnabled,
      fastStatusUpdates: changes.fastStatusUpdates !== undefined ? changes.fastStatusUpdates : fastStatusUpdates,
      preloadNextItem: changes.preloadNextItem !== undefined ? changes.preloadNextItem : preloadNextItem,
      aiCacheEnabled: true,
      ultrafastFfmpeg: true,
    };
    if (changes.enabled !== undefined) setTurboEnabled(changes.enabled);
    if (changes.fastStatusUpdates !== undefined) setFastStatusUpdates(changes.fastStatusUpdates);
    if (changes.preloadNextItem !== undefined) setPreloadNextItem(changes.preloadNextItem);

    setSavingTurbo(true);
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turboSpeed: nextTurbo,
        }),
      });
      showFeedback('تم تطبيق وحفظ إعدادات السرعة الفائقة بنجاح ⚡');
    } catch {
      showFeedback('فشل حفظ إعدادات السرعة الفائقة');
    } finally {
      setSavingTurbo(false);
    }
  };

  // Toggle AI Naming (ON / OFF) with instant server synchronization
  const handleToggleAiEnabled = async () => {
    const nextState = !aiEnabled;
    setAiEnabled(nextState);
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiRenaming: {
            enabled: nextState,
            namingPattern: namingPattern.trim() || '{subject} - د. {doctor} - {topic} [Part {part}]',
            customInstructions: customInstructions.trim(),
            autoApplyOnQueue,
            captionStyle,
            customCaptionTemplate: customCaptionTemplate.trim(),
          },
        }),
      });
      showFeedback(
        nextState
          ? 'تم تفعيل الذكاء الاصطناعي بنجاح (AI Naming: ON) - معالجة تلقائية فورية لكل ملف وارد'
          : 'تم إيقاف الذكاء الاصطناعي (AI Naming: OFF) - معالجة يدوية للملفات'
      );
    } catch {
      showFeedback('فشل تحديث حالة الذكاء الاصطناعي في الخادم');
    }
  };

  // Instant Caption Style selector handler
  const handleSelectCaptionStyle = async (newStyle: string) => {
    setCaptionStyle(newStyle);
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiRenaming: {
            enabled: aiEnabled,
            namingPattern: namingPattern.trim() || '{subject} - د. {doctor} - {topic} [Part {part}]',
            customInstructions: customInstructions.trim(),
            autoApplyOnQueue,
            captionStyle: newStyle,
            customCaptionTemplate: customCaptionTemplate.trim(),
          },
        }),
      });
      const presetName =
        newStyle === 'medpulse_box'
          ? 'النمط الرسمي المعتمد (MedPulse Box)'
          : newStyle === 'academic_badges'
          ? 'النمط الأكاديمي الشامل (Academic Badges)'
          : newStyle === 'modern_minimal'
          ? 'النمط العصري الهادئ (Modern Minimal)'
          : newStyle === 'compact_bullets'
          ? 'النمط الهندسي المركز (Compact Bullets)'
          : newStyle === 'single_line_clean'
          ? 'النمط المختصر والسريع (Direct Short)'
          : 'قالب مخصص';
      showFeedback(`تم اعتماد نمط الوصف: ${presetName} بنجاح`);
    } catch (err) {
      console.error('Failed to update caption style:', err);
    }
  };

  // Save Bot Token Handler
  const handleSaveBotToken = async () => {
    if (!botToken.trim()) return;
    setSavingBotToken(true);
    setBotTokenFeedback(null);
    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botToken.trim(),
          pollingActive: botPolling,
        }),
      });
      const data = await res.json();
      setSavingBotToken(false);
      if (data.verified) {
        setBotConfigured(true);
        setBotUsername(data.botUser?.username || null);
        setBotTokenFeedback({
          verified: true,
          message: `تم تثبيت الرمز بنجاح! متصل بحساب البوت: @${data.botUser?.username || 'بوت معتمد'} (تم حفظه دائماً)`,
        });
        showFeedback('تم حفظ وتثبيت رمز البوت بنجاح في بيئة التشغيل');
      } else {
        setBotTokenFeedback({
          verified: false,
          message: data.error || 'رمز البوت غير صالح، يرجى التأكد من نسخه بشكل صحيح من @BotFather',
        });
      }
    } catch (err: any) {
      setSavingBotToken(false);
      setBotTokenFeedback({ verified: false, message: 'حدث خطأ في الاتصال بالخادم' });
    }
  };

  // Save AI Configuration Handler
  const handleSaveAiConfig = async () => {
    setSavingAiConfig(true);
    try {
      const aiConfig: AIRenamingConfig = {
        enabled: aiEnabled,
        namingPattern: namingPattern.trim() || '{subject} - د. {doctor} - {topic} [Part {part}]',
        customInstructions: customInstructions.trim(),
        autoApplyOnQueue,
        captionStyle,
        customCaptionTemplate: customCaptionTemplate.trim(),
      };
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiRenaming: aiConfig }),
      });
      setSavingAiConfig(false);
      showFeedback('تم حفظ وتطبيق إعدادات الذكاء الاصطناعي بنجاح');
    } catch (err) {
      setSavingAiConfig(false);
      showFeedback('فشل حفظ إعدادات الذكاء الاصطناعي');
    }
  };

  // Local state for editing user settings
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

  // Sync state whenever the active user or user settings update
  useEffect(() => {
    setTagText(user.tag?.text || '');
    setTagPosition(user.tag?.position || 'before');
    setNamingPrefix(user.namingPrefix || '');
    setNamingSuffix(user.namingSuffix || '');
    setCaptionPrefix(user.captionPrefix || '');
    setCaptionSuffix(user.captionSuffix || '');
    setChannelChatId(user.channel?.chatId || '@MediaHubArabic');
    setPublishingEnabled(user.channel?.publishingEnabled ?? true);
  }, [user]);

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
    if (!fw || !fw.trim()) return;
    const escaped = fw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    demoCleaned = demoCleaned.replace(new RegExp(escaped, 'gi'), '');
  });
  demoCleaned = demoCleaned.replace(/\s{2,}/g, ' ').trim();
  const ext = '.mp4';
  let base = demoCleaned.replace(/\.mp4$/i, '').trim();

  if (tagText.trim()) {
    base = tagPosition === 'before' ? `${tagText.trim()} ${base}` : `${base} ${tagText.trim()}`;
  }
  if (namingPrefix.trim() && !base.startsWith(namingPrefix.trim())) {
    base = `${namingPrefix.trim()} ${base}`;
  }
  if (namingSuffix.trim() && !base.endsWith(namingSuffix.trim())) {
    base = `${base} ${namingSuffix.trim()}`;
  }
  const demoResult = `${base}${ext}`;

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
        
        {/* === CARD 1: Bot Token Runtime Persistence (Full Width) === */}
        <div className="col-span-1 md:col-span-2 bg-[#111111] border border-sky-900/30 rounded-lg p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-sky-500/20 via-sky-500/50 to-transparent" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
            <div className="flex items-center gap-2.5 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <div className="w-7 h-7 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center justify-center">
                <Key className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-sm font-bold font-sans text-sky-300">إدخال وحفظ توكن البوت في بيئة التشغيل</span>
                <span className="block text-[10px] text-[#777] font-mono">BOT_TOKEN_PERSISTENCE & RUNTIME_SYNC</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-mono px-2.5 py-1 rounded border flex items-center gap-1.5 ${
                botConfigured
                  ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400'
                  : 'bg-amber-950/40 border-amber-800/40 text-amber-400'
              }`}>
                {botConfigured ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>{isFromSecret ? 'محفوظ كـ Secret ونشط دائماً 🔐' : 'محفوظ ونشط تلقائياً ✅'}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>غير مدخل بعد</span>
                  </>
                )}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#999] leading-relaxed font-sans">
            أدخل الـ <b>Token</b> الخاص بالبوت مرة واحدة هنا ليتم حفظه وتثبيته في قاعدة البيانات وبيئة التشغيل واستخدامه تلقائيًا طوال فترة تشغيل الأداة، بحيث لا تضطر إلى إدخاله في كل مرة أو مع كل عملية.
          </p>

          {/* Secret / Persistent Storage status info */}
          <div className="p-3 bg-gradient-to-r from-sky-950/20 to-transparent border border-sky-800/30 rounded text-xs space-y-1.5 font-sans">
            <div className="flex items-center gap-2 text-sky-400 font-medium">
              <span className="text-base">🔐</span>
              <span>تثبيت التوكن كـ Secret في إعدادات الأداة:</span>
            </div>
            <p className="text-[#aaa] text-[11px] leading-relaxed">
              لتثبيت التوكن للأبد حتى مع إعادة التشغيل الكاملة للسيرفر: يمكنك إضافة الرمز في قائمة <b>Settings (⚙️)</b> في الزاوية العلوية للمنصة تحت بند <b>Secrets</b> باسم المتغير: <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded border border-white/10">TELEGRAM_BOT_TOKEN</code>. يقوم النظام بقراءته وتفعيله تلقائياً وبشكل دائم.
            </p>
          </div>

          {hasGeminiKeyConflict && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded text-xs text-amber-300 font-sans flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                <b>ملاحظة:</b> تم اكتشاف مفتاح Gemini API في متغير البيئة، وقام النظام تلقائياً بالحفاظ على توكن بوت التيليجرام الحقيقي الصحيح من قاعدة البيانات دون استبداله.
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-mono text-[#aaa] block mb-1">
                TELEGRAM_BOT_TOKEN (من @BotFather):
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                    className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-3 py-2 pl-9 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-sky-500/60"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777] hover:text-[#bbb] transition"
                    title={showToken ? 'إخفاء التوكن' : 'إظهار التوكن'}
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveBotToken}
                  disabled={savingBotToken || !botToken.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black font-semibold rounded text-xs font-mono transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  {savingBotToken ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>SAVING_TOKEN...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>حفظ وتثبيت التوكن دائماً</span>
                    </>
                  )}
                </button>
              </div>

              {botToken.trim().startsWith('AIza') && (
                <div className="mt-2 p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 text-[11px] font-sans flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>
                    ⚠️ <b>تنبيه:</b> الرمز المدخل يبدو كـ مفتاح Google Gemini API وليس توكن تيليجرام. توكن تيليجرام يبدأ بأرقام مثل <code>7529022034:AA...</code> ويتم إنشاؤه عبر بوت <b>@BotFather</b>.
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#0a0a0a] border border-[#222] rounded text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="botPollingCheck"
                  checked={botPolling}
                  onChange={(e) => setBotPolling(e.target.checked)}
                  className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
                />
                <label htmlFor="botPollingCheck" className="text-[#ccc] cursor-pointer font-sans text-xs">
                  تفعيل استقبال الملفات عبر (Long Polling) تلقائياً فور إرسالها للبوت
                </label>
              </div>
              {botUsername && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-800/40">
                  @{botUsername}
                </span>
              )}
            </div>

            {botTokenFeedback && (
              <div className={`p-3 rounded text-xs flex items-start gap-2 border font-mono ${
                botTokenFeedback.verified
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-400'
                  : 'bg-rose-950/30 border-rose-800/50 text-rose-400'
              }`}>
                {botTokenFeedback.verified ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{botTokenFeedback.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* === CARD 2: AI Batch Renaming Engine (Full Width) === */}
        <div className="col-span-1 md:col-span-2 bg-[#111111] border border-amber-900/30 rounded-lg p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-amber-500/20 via-amber-500/50 to-transparent" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
            <div className="flex items-center gap-2.5 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <div className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-sm font-bold font-sans text-amber-300">نظام إعادة التسمية وتنسيق الوصف بالذكاء الاصطناعي</span>
                <span className="block text-[10px] text-[#777] font-mono">AUTOMATED_AI_NAMING & MEDPULSE_FORMATTING</span>
              </div>
            </div>

            {/* AI Toggle Switch: AI Naming: ON / OFF */}
            <div className="flex items-center gap-3 bg-[#0a0a0a] px-3 py-1.5 rounded-lg border border-[#222]">
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-[#e0e0e0]">AI Naming:</span>
                  <span className={`text-xs font-mono font-black px-1.5 py-0.5 rounded ${
                    aiEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-[#222] text-[#777]'
                  }`}>
                    {aiEnabled ? 'ON 🟢' : 'OFF ⚪'}
                  </span>
                </div>
                <span className="text-[10px] text-[#666] font-sans">
                  {aiEnabled ? 'معالجة تلقائية فورية دون طلب تأكيد' : 'معالجة يدوية (معطل)'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleAiEnabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  aiEnabled ? 'bg-emerald-500' : 'bg-[#2a2a2a]'
                }`}
                title={aiEnabled ? 'إيقاف AI Naming' : 'تشغيل AI Naming'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${
                    aiEnabled ? 'translate-x-1' : 'translate-x-6'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-[#0e0e0e] border border-[#222] p-3 rounded text-xs text-[#aaa] space-y-1.5 leading-relaxed">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-300">
                ⚡ تشغيل الذكاء الاصطناعي تلقائيًا (Default: ON دائمًا):
              </span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-800/40">
                بدون أي رسالة تأكيد أو انتظار
              </span>
            </div>
            <p className="text-[#888]">
              بمجرد إرسال أي ملف فيديو للبوت، تبدأ المعالجة الذكية فوراً لاستخراج المادة <code>{'{subject}'}</code> والدكتور <code>{'{doctor}'}</code> والموضوع <code>{'{topic}'}</code> والـ Part <code>{'{part}'}</code>، مع تنسيق كابشن MedPulse الموحد التلقائي دون أي اختراع لأي تفاصيل جديدة.
            </p>
          </div>

          {/* Naming Pattern Config */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-[#ccc] block">
                نمط التسمية الثابت المعتمد (FIXED_NAMING_PATTERN):
              </label>
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <span className="text-[#666]">المتغيرات المتاحة:</span>
                {['{subject}', '{doctor}', '{topic}', '{part}'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (!namingPattern.includes(tag)) {
                        setNamingPattern((prev) => `${prev} ${tag}`.trim());
                      }
                    }}
                    className="bg-[#181818] hover:bg-[#252525] text-amber-300 border border-amber-900/40 px-1.5 py-0.5 rounded text-[10px] transition"
                  >
                    +{tag}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={namingPattern}
              onChange={(e) => setNamingPattern(e.target.value)}
              placeholder="مثال: {subject} - د. {doctor} - {topic} [Part {part}]"
              className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-amber-500/60"
              dir="auto"
            />

            {/* Pattern Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-mono text-[#777]">أنماط جاهزة سريعة:</span>
              {[
                '{subject} - د. {doctor} - {topic} [Part {part}]',
                '{subject} | د. {doctor} - {topic}',
                '{subject} - {topic} - Part {part}',
                'د. {doctor} - {topic} [Part {part}]',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNamingPattern(preset)}
                  className={`text-[10px] font-mono px-2 py-1 rounded border transition ${
                    namingPattern === preset
                      ? 'bg-amber-950/40 border-amber-700/60 text-amber-300'
                      : 'bg-[#141414] border-[#262626] text-[#888] hover:text-[#ccc] hover:border-[#333]'
                  }`}
                  dir="ltr"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Caption Style Selection & Presets */}
          <div className="space-y-3 pt-2 border-t border-[#222]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-rose-400" />
                <label className="text-xs font-mono font-semibold text-[#eee]">
                  أنماط تنسيق الوصف (CAPTION_STYLES):
                </label>
              </div>
              <span className="text-[11px] text-[#888] font-sans">
                اختر النمط المناسب أو قم بإنشاء قالبك الخاص — يُطبق تلقائياً على كافة الملفات
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {CAPTION_STYLE_PRESETS.map((preset) => {
                const isSelected = captionStyle === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectCaptionStyle(preset.id)}
                    className={`p-3 rounded-lg border text-right transition-all flex flex-col justify-between gap-2 relative ${
                      isSelected
                        ? 'bg-rose-950/25 border-rose-500/80 shadow-md shadow-rose-950/30 ring-1 ring-rose-500/40'
                        : 'bg-[#0a0a0a] border-[#222] hover:border-[#3a3a3a] hover:bg-[#121212]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                        isSelected ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-[#181818] text-[#888]'
                      }`}>
                        {preset.badge}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                      )}
                    </div>

                    <div className="space-y-1 w-full">
                      <div className={`text-xs font-bold font-sans ${isSelected ? 'text-rose-300' : 'text-[#ddd]'}`}>
                        {preset.name}
                      </div>
                      <p className="text-[10px] text-[#777] font-sans leading-relaxed line-clamp-2">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Template Editor if 'custom' is active */}
            {captionStyle === 'custom' && (
              <div className="bg-[#0a0a0a] border border-amber-900/40 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-amber-300 font-semibold">
                    محرر القالب المخصص (CUSTOM_TEMPLATE):
                  </span>
                  <span className="text-[10px] text-[#777]">انقر على المتغير لإضافته للقالب</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { token: '{medpulse_link}', label: 'رابط MedPulse🫀' },
                    { token: '{subject}', label: 'المادة' },
                    { token: '{doctor}', label: 'الدكتور' },
                    { token: '{topic}', label: 'الموضوع' },
                    { token: '{part}', label: 'الجزء' },
                    { token: '#{hashtag}', label: 'الهاشتاق' },
                    { token: '{channel}', label: 'معرف القناة' },
                  ].map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => setCustomCaptionTemplate((prev) => `${prev} ${v.token}`.trim())}
                      className="text-[10px] font-mono bg-[#161616] hover:bg-amber-950/40 text-amber-300 border border-amber-900/30 px-2 py-0.5 rounded transition"
                    >
                      +{v.token} ({v.label})
                    </button>
                  ))}
                </div>

                <textarea
                  rows={4}
                  value={customCaptionTemplate}
                  onChange={(e) => setCustomCaptionTemplate(e.target.value)}
                  placeholder="اكتب قالبك هنا، مثال:&#10;{medpulse_link} | {subject}&#10;👨‍⚕️ د. {doctor}&#10;📌 {topic} {part}&#10;#{hashtag}"
                  className="w-full bg-[#111] border border-[#282828] rounded px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-amber-500/60 leading-relaxed"
                />
              </div>
            )}
          </div>

          {/* Interactive Batch Preview & Live Caption Template */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Filename Preview */}
            <div className="bg-[#0a0a0a] border border-[#222] p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777]">
                <span>معاينة نمط اسم الملف (FILENAME_PREVIEW):</span>
                <span className="text-amber-400">توحيد المادة والأجزاء</span>
              </div>
              
              <div className="space-y-1.5 text-xs font-mono">
                <div className="bg-[#111] p-2 rounded border border-[#1a1a1a] space-y-1">
                  <span className="text-[#666] text-[10px] block" dir="ltr">الأصل: Embryo_P1_Dr_Sherif_somites.mp4</span>
                  <span className="text-emerald-400 font-medium block" dir="auto">
                    {namingPattern
                      .replace('{subject}', 'Embryology')
                      .replace('{doctor}', 'محمد شريف')
                      .replace('{topic}', 'Somites Development')
                      .replace('{part}', '1')}.mp4
                  </span>
                </div>
                <div className="bg-[#111] p-2 rounded border border-[#1a1a1a] space-y-1">
                  <span className="text-[#666] text-[10px] block" dir="ltr">الأصل: Embryo_somites_part2_sherif.mp4</span>
                  <span className="text-emerald-400 font-medium block" dir="auto">
                    {namingPattern
                      .replace('{subject}', 'Embryology')
                      .replace('{doctor}', 'محمد شريف')
                      .replace('{topic}', 'Somites Development')
                      .replace('{part}', '2')}.mp4
                  </span>
                </div>
              </div>
            </div>

            {/* Selected Caption Live Preview */}
            <div className="bg-[#0a0a0a] border border-rose-950/40 p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777]">
                <span className="text-rose-400 flex items-center gap-1 font-semibold">
                  <span>معاينة نمط الوصف المختار (LIVE_CAPTION_PREVIEW):</span>
                </span>
                <span className="text-[10px] text-emerald-400">
                  {CAPTION_STYLE_PRESETS.find(p => p.id === captionStyle)?.badge || 'مخصص'}
                </span>
              </div>

              <div className="bg-[#111] p-2.5 rounded border border-rose-900/30 text-[11px] font-mono leading-relaxed text-[#ccc] whitespace-pre-line" dir="auto">
                {captionStyle === 'medpulse_box' && (
                  <>
                    {`━━━━━━━━━━━━━━━\n📕 Name :\n`}
                    <a href="https://t.me/addlist/Qr1Wx2nHR_MxZjM0" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold">MedPulse🫀</a>
                    {` | د. محمد شريف\n━━━━━━━━━━━━━━━\n📌 Topic\nSomites Development [Part 1]\n━━━━━━━━━━━━━━━\n@MedPulseVIP | #Embryology`}
                  </>
                )}
                {captionStyle === 'academic_badges' && (
                  <>
                    <span>🩺 </span>
                    <a href="https://t.me/addlist/Qr1Wx2nHR_MxZjM0" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold">MedPulse🫀</a>
                    {`\n━━━━━━━━━━━━━━━━━━\n📚 المادة: Embryology\n👨‍⚕️ الدكتور: د. محمد شريف\n📑 المحاضرة: Somites Development\n🔢 الجزء: Part 1\n━━━━━━━━━━━━━━━━━━\n📢 القناة: @MedPulseVIP\n#Embryology`}
                  </>
                )}
                {captionStyle === 'modern_minimal' && (
                  <>
                    <a href="https://t.me/addlist/Qr1Wx2nHR_MxZjM0" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold">MedPulse🫀</a>
                    {` | Embryology\n▪️ المحاضر: د. محمد شريف\n▫️ الموضوع: Somites Development Part 1\n\n🔗 @MedPulseVIP • #Embryology`}
                  </>
                )}
                {captionStyle === 'compact_bullets' && (
                  <>
                    <span>◈ </span>
                    <a href="https://t.me/addlist/Qr1Wx2nHR_MxZjM0" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold">MedPulse🫀</a>
                    <span> ◈</span>
                    {`\n▸ الكورس: Embryology\n▸ الدكتور: د. محمد شريف\n▸ العنوان: Somites Development Part 1\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n@MedPulseVIP • #Embryology`}
                  </>
                )}
                {captionStyle === 'single_line_clean' && (
                  <>
                    <a href="https://t.me/addlist/Qr1Wx2nHR_MxZjM0" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold">MedPulse🫀</a>
                    {` • Embryology\nد. محمد شريف — Somites Development Part 1\n@MedPulseVIP • #Embryology`}
                  </>
                )}
                {captionStyle === 'custom' && (
                  customCaptionTemplate.trim() ? (
                    customCaptionTemplate
                      .replace(/\{medpulse_link\}/g, 'MedPulse🫀')
                      .replace(/\{doctor\}/g, 'د. محمد شريف')
                      .replace(/\{subject\}/g, 'Embryology')
                      .replace(/\{topic\}/g, 'Somites Development')
                      .replace(/\{part\}/g, 'Part 1')
                      .replace(/#\{hashtag\}/g, '#Embryology')
                      .replace(/\{hashtag\}/g, 'Embryology')
                      .replace(/\{channel\}/g, '@MedPulseVIP')
                  ) : (
                    <span className="text-[#666] italic">اكتب قالبك المخصص في الصندوق أعلاه لمعاينته فورياً هنا...</span>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Custom Instructions Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-[#ccc] block">
                حقل تعليمات إضافية مخصصة للذكاء الاصطناعي (CUSTOM_AI_INSTRUCTIONS):
              </label>
              <span className="text-[10px] text-[#777] font-sans">تُدمج مع المحرك دون التأثير على القالب الإجباري</span>
            </div>
            <textarea
              rows={3}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="اكتب هنا أي تعليمات إضافية ترغب بأن يلتزم بها الذكاء الاصطناعي...&#10;مثال: اكتب اسم الدكتور بالإنجليزية كما ورد، لا تحذف اسم الكلية أو المستشفى، وإذا كانت المحاضرة مراجعة نهائية ضع كلمة Final Revision..."
              className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-3 py-2 text-xs text-[#e0e0e0] font-sans focus:outline-none focus:border-amber-500/60 leading-relaxed"
            />
          </div>

          {/* Auto-apply option and Save button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#222]">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#bbb] font-sans">
              <input
                type="checkbox"
                checked={autoApplyOnQueue}
                onChange={(e) => setAutoApplyOnQueue(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded"
              />
              <span>تطبيق التسمية والوصف الذكي تلقائياً على كل الملفات الواردة لقائمة الانتظار</span>
            </label>

            <button
              type="button"
              onClick={handleSaveAiConfig}
              disabled={savingAiConfig}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-sm self-end"
            >
              {savingAiConfig ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>SAVING_AI_CONFIG...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>حفظ وتطبيق إعدادات الذكاء الاصطناعي</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* === CARD 2.5: Ultra Turbo Speed & Performance Engine (Full Width) === */}
        <div className="col-span-1 md:col-span-2 bg-[#111111] border border-amber-500/30 rounded-lg p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-amber-500/30 via-yellow-400 to-amber-500/20" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
            <div className="flex items-center gap-2.5 text-[#f0f0f0] font-mono text-xs font-semibold uppercase tracking-wider">
              <div className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold font-sans text-amber-300">محرك السرعة الفائقة والمعالجة اللحظية (Ultra Turbo Engine)</span>
                <span className="block text-[10px] text-[#777] font-mono">0ms_LATENCY • ASYNC_IO • PIPELINED_PREWARM</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-mono px-2.5 py-1 rounded border flex items-center gap-1.5 ${
                turboEnabled
                  ? 'bg-amber-950/40 border-amber-700/50 text-amber-400 font-bold'
                  : 'bg-[#1a1a1a] border-[#333] text-[#777]'
              }`}>
                <Rocket className="w-3.5 h-3.5 text-amber-400" />
                <span>{turboEnabled ? 'TURBO_SPEED: ACTIVE (أقصى سرعة) ⚡' : 'TURBO_SPEED: OFF'}</span>
              </span>

              <button
                type="button"
                onClick={() => handleUpdateTurbo({ enabled: !turboEnabled })}
                disabled={savingTurbo}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition flex items-center gap-1.5 border ${
                  turboEnabled
                    ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400'
                    : 'bg-[#181818] hover:bg-[#222] text-[#ccc] border-[#333]'
                }`}
              >
                {turboEnabled ? 'تعطيل السرعة الفائقة' : 'تفعيل أقصى سرعة ⚡'}
              </button>
            </div>
          </div>

          <p className="text-xs text-[#aaa] leading-relaxed font-sans">
            تم تطبيق حزمة متكاملة من أحدث تقنيات تسريع الأنظمة البرمجية لتحقيق <b>أقصى سرعة معالجة ممكنة للملفات</b>، تشمل إزالة التأخيرات الزمنية، المعالجة التزامنية المتوازية، التخزين المؤقت في الذاكرة (In-Memory Cache)، واختزال طلبات الشبكة.
          </p>

          {/* Speed Optimization Modules Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            
            {/* 1. Zero-Latency Event Trigger */}
            <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#eee] flex items-center gap-1.5 font-sans">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  <span>معالجة فورية بلا تأخير</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-800/40">
                  0ms Delay
                </span>
              </div>
              <p className="text-[11px] text-[#777] font-sans leading-relaxed">
                استبدال دورات الانتظار الزمنية بنظام أحداث فوري (Event-Driven) ينطلق في نفس اللحظة التي يُدرج فيها الملف.
              </p>
            </div>

            {/* 2. Fast Telegram API Status */}
            <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#eee] flex items-center gap-1.5 font-sans">
                  <Bot className="w-3.5 h-3.5 text-sky-400" />
                  <span>تحديثات التليجرام السريعة</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleUpdateTurbo({ fastStatusUpdates: !fastStatusUpdates })}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition ${
                    fastStatusUpdates
                      ? 'bg-sky-950/50 text-sky-300 border-sky-800/40 font-bold'
                      : 'bg-[#181818] text-[#777] border-[#333]'
                  }`}
                >
                  {fastStatusUpdates ? 'مفعّل (أسرع 3x)' : 'معطل (مفصل)'}
                </button>
              </div>
              <p className="text-[11px] text-[#777] font-sans leading-relaxed">
                اختزال طلبات الشبكة لتقليص استهلاك API وتفادي حدود المعدل (429) وتوفير 3+ ثوانٍ من زمن معالجة كل ملف.
              </p>
            </div>

            {/* 3. Concurrent Pre-Warming & Pipelining */}
            <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#eee] flex items-center gap-1.5 font-sans">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>التحليل والتجهيز بالتوازي</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleUpdateTurbo({ preloadNextItem: !preloadNextItem })}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition ${
                    preloadNextItem
                      ? 'bg-purple-950/50 text-purple-300 border-purple-800/40 font-bold'
                      : 'bg-[#181818] text-[#777] border-[#333]'
                  }`}
                >
                  {preloadNextItem ? 'Pipelining: ON' : 'Pipelining: OFF'}
                </button>
              </div>
              <p className="text-[11px] text-[#777] font-sans leading-relaxed">
                أثناء رفع أو تجهيز الملف الحالي، يقوم المحرك بتحليل وتسمية الملفات التالية في الطابور تلقائياً في الخلفية.
              </p>
            </div>

            {/* 4. AI In-Memory Result Caching */}
            <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#eee] flex items-center gap-1.5 font-sans">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>كاش الذكاء الاصطناعي الفوري</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-800/40">
                  Instant Memory Hit
                </span>
              </div>
              <p className="text-[11px] text-[#777] font-sans leading-relaxed">
                الذاكرة السريعة تحفظ نتائج التسمية وتنسيق الأوصاف، لتعود النتيجة بـ 0ms وتوفر حصص Gemini API.
              </p>
            </div>

            {/* 5. Ultrafast Parallel FFmpeg */}
            <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#eee] flex items-center gap-1.5 font-sans">
                  <Sliders className="w-3.5 h-3.5 text-yellow-400" />
                  <span>معالجة وسائط فائقة السرعة</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-yellow-950/50 text-yellow-400 border border-yellow-800/40">
                  FFmpeg Ultrafast
                </span>
              </div>
              <p className="text-[11px] text-[#777] font-sans leading-relaxed">
                توليد وضبط مقاسات الـ Thumbnail المتوافقة مع معايير تيليجرام بالتوازي التام (Parallel Promise Execution).
              </p>
            </div>

            {/* 6. Asynchronous Non-blocking Storage */}
            <div className="bg-[#0c0c0c] border border-[#222] p-3 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#eee] flex items-center gap-1.5 font-sans">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>تخزين غير معطل للقرص</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/50 text-cyan-400 border border-cyan-800/40">
                  Async Debounced I/O
                </span>
              </div>
              <p className="text-[11px] text-[#777] font-sans leading-relaxed">
                فصل عمليات كتابة الملفات عن مسار المعالجة الفعلي لضمان عدم توقف الطابور ولو لجزء من الثانية.
              </p>
            </div>

          </div>
        </div>

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
