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
} from 'lucide-react';
import { UserSetting, AIRenamingConfig } from '../types';

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

  // AI Renaming Configuration state
  const [aiEnabled, setAiEnabled] = useState(true);
  const [namingPattern, setNamingPattern] = useState('{subject} - د. {doctor} - {topic} [Part {part}]');
  const [customInstructions, setCustomInstructions] = useState('');
  const [autoApplyOnQueue, setAutoApplyOnQueue] = useState(true);
  const [captionStyle, setCaptionStyle] = useState('medpulse_box');
  const [customCaptionTemplate, setCustomCaptionTemplate] = useState('');
  const [savingAiConfig, setSavingAiConfig] = useState(false);

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
        if (data.aiRenaming) {
          setAiEnabled(data.aiRenaming.enabled ?? true);
          setNamingPattern(data.aiRenaming.namingPattern || '{subject} - د. {doctor} - {topic} [Part {part}]');
          setCustomInstructions(data.aiRenaming.customInstructions || '');
          setAutoApplyOnQueue(data.aiRenaming.autoApplyOnQueue ?? true);
          setCaptionStyle(data.aiRenaming.captionStyle || 'medpulse_box');
          setCustomCaptionTemplate(data.aiRenaming.customCaptionTemplate || '');
        }
      })
      .catch((err) => console.error('Failed to load bot/AI config:', err));
  }, []);

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
                    <span>محفوظ ونشط تلقائياً ✅</span>
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
            أدخل الـ <b>Token</b> الخاص بالبوت مرة واحدة هنا ليتم حفظه وتثبيته في بيئة التشغيل واستخدامه تلقائيًا طوال فترة تشغيل الأداة، بحيث لا تضطر إلى إدخاله في كل مرة أو مع كل عملية.
          </p>

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

          {/* Interactive Batch Preview & MedPulse Caption Template */}
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

            {/* MedPulse Caption Preview */}
            <div className="bg-[#0a0a0a] border border-rose-950/40 p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#777]">
                <span className="text-rose-400 flex items-center gap-1 font-semibold">
                  <span>قالب كابشن MedPulse الموحد 🫀 (CAPTION_FORMAT):</span>
                </span>
                <span className="text-[10px] text-emerald-400">هايبرلينك تليجرام معتمد</span>
              </div>

              <div className="bg-[#111] p-2.5 rounded border border-rose-900/30 text-[11px] font-mono leading-relaxed text-[#ccc] whitespace-pre-line" dir="auto">
                {`━━━━━━━━━━━━━━━\n📕 Name\n`}<a href="https://t.me/addlist/Qr1Wx2nHR_MxZjM0" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold">MedPulse🫀</a>{` | د. محمد شريف\nEmbryology\n@MedPulseVIP\n━━━━━━━━━━━━━━━\n📌 Topic\nSomites Development\n━━━━━━━━━━━━━━━\n#Embryology`}
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
