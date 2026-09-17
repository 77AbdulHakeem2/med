import React, { useState, useEffect } from 'react';
import {
  Zap,
  Phone,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Sparkles,
  Sliders,
  Radio,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import { UserAccountInfo } from '../types';

interface UserAccountManagerProps {
  onStatusRefresh?: () => void;
}

export const UserAccountManager: React.FC<UserAccountManagerProps> = ({ onStatusRefresh }) => {
  const [accountInfo, setAccountInfo] = useState<UserAccountInfo>({ connected: false });
  const [loading, setLoading] = useState(true);

  // Tab: 'phone' or 'session'
  const [activeTab, setActiveTab] = useState<'phone' | 'session'>('phone');

  // Phone login state
  const [phone, setPhone] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [show2FaPassword, setShow2FaPassword] = useState(false);
  const [requires2Fa, setRequires2Fa] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Session string state
  const [sessionString, setSessionString] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  // Custom API ID & Hash state
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [savingApi, setSavingApi] = useState(false);

  // Feedback messages
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showMsg = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const fetchAccount = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/telegram/user-account');
      const data = await res.json();
      setAccountInfo(data);
    } catch {
      setAccountInfo({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const fetchBotConfig = async () => {
    try {
      const res = await fetch('/api/bot/config');
      const data = await res.json();
      if (data.apiId) setApiId(String(data.apiId));
      if (data.apiHash) setApiHash(data.apiHash);
    } catch {}
  };

  useEffect(() => {
    fetchAccount();
    fetchBotConfig();
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      showMsg('error', 'يرجى إدخال رقم الهاتف بصيغة دولية (مثال: +966501234567)');
      return;
    }

    setSendingCode(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/telegram/user-account/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setCodeSent(true);
        showMsg('success', 'تم إرسال كود التحقق بنجاح إلى تطبيق تيليجرام الخاص بك 📨');
      } else {
        showMsg('error', data.error || 'فشل إرسال كود التحقق. يرجى مراجعة رقم الهاتف.');
      }
    } catch (err: any) {
      showMsg('error', err?.message || 'تعذر الاتصال بالخادم.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneCode.trim()) {
      showMsg('error', 'يرجى إدخال كود التحقق المكون من أرقام');
      return;
    }

    setVerifyingCode(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/telegram/user-account/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: phoneCode.trim(),
          password: twoFaPassword.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        showMsg('success', `مرحباً بك! تم تفعيل محرك التيربو الفائق بنجاح 🚀`);
        setCodeSent(false);
        setPhone('');
        setPhoneCode('');
        setTwoFaPassword('');
        setRequires2Fa(false);
        await fetchAccount();
        onStatusRefresh?.();
      } else if (data.error === 'SESSION_PASSWORD_NEEDED') {
        setRequires2Fa(true);
        showMsg('error', 'حسابك محمي بكلمة مرور التحقق بخطوتين (2FA). يرجى كتابة كلمة المرور في الحقل أدناه ثم النقر على تأكيد.');
      } else {
        showMsg('error', data.error || 'فشل التحقق من الكود.');
      }
    } catch (err: any) {
      showMsg('error', err?.message || 'حدث خطأ أثناء التحقق.');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionString.trim()) {
      showMsg('error', 'يرجى لصق رمز الجلسة (Session String)');
      return;
    }

    setSavingSession(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/telegram/user-account/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionString: sessionString.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        showMsg('success', 'تم تفعيل الجلسة وتشغيل محرك التيربو الفائق بنجاح 🚀');
        setSessionString('');
        await fetchAccount();
        onStatusRefresh?.();
      } else {
        showMsg('error', data.error || 'رمز الجلسة غير صالح.');
      }
    } catch (err: any) {
      showMsg('error', err?.message || 'تعذر الاتصال بالخادم.');
    } finally {
      setSavingSession(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('هل تريد بالتأكيد تسجيل الخروج وقطع جلسة محرك التيربو؟ سيعود النظام لاستخدام سرعة البوت القياسية.')) {
      return;
    }

    setLoading(true);
    try {
      await fetch('/api/telegram/user-account/logout', { method: 'POST' });
      showMsg('success', 'تم قطع الاتصال بنجاح.');
      await fetchAccount();
      onStatusRefresh?.();
    } catch {
      showMsg('error', 'فشل تسجيل الخروج.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingApi(true);
    try {
      const payload: any = {};
      if (apiId.trim()) payload.apiId = Number(apiId.trim());
      if (apiHash.trim()) payload.apiHash = apiHash.trim();

      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'تم حفظ إعدادات API ID و API Hash بنجاح');
      } else {
        showMsg('error', 'فشل حفظ الإعدادات');
      }
    } catch {
      showMsg('error', 'خطأ أثناء الاتصال بالخادم');
    } finally {
      setSavingApi(false);
    }
  };

  return (
    <div className="bg-[#111111] border border-cyan-900/40 rounded-lg p-5 space-y-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-cyan-500/20 via-cyan-400/60 to-emerald-500/20" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
        <div className="flex items-center gap-2.5 text-[#f0f0f0]">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold font-sans text-cyan-300">محرك تيليجرام التيربو الفائق (User Account Engine)</span>
              {accountInfo.connected && (
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  TURBO ACTIVE (50-150 MB/s)
                </span>
              )}
            </div>
            <span className="block text-[11px] text-[#888] font-sans">
              نقل وسائط بحسابك لكسر حدود سرعة البوت والـ FloodWait، مع بقاء البوت واجهة الاستقبال والنشر
            </span>
          </div>
        </div>

        {/* API Credentials Toggle */}
        <button
          type="button"
          onClick={() => setShowApiSettings(!showApiSettings)}
          className="flex items-center gap-1.5 text-xs text-[#888] hover:text-cyan-400 font-mono transition-colors self-start sm:self-auto bg-[#181818] px-2.5 py-1.5 rounded border border-[#2a2a2a]"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>API ID & Hash</span>
          {showApiSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* API ID / Hash Drawer */}
      {showApiSettings && (
        <form onSubmit={handleSaveApiCredentials} className="p-3.5 rounded bg-[#0a0a0a] border border-[#222] space-y-3">
          <div className="text-xs font-sans text-[#aaa] flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>بيانات my.telegram.org (اختياري - مدمج تلقائياً المفاتيح الرسمية إن تركتها فارغة)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-[#888] mb-1">TELEGRAM_API_ID</label>
              <input
                type="number"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
                placeholder="مثال: 2040 أو رقمك الخاص"
                className="w-full bg-[#141414] border border-[#333] rounded px-3 py-1.5 text-xs font-mono text-[#eee] focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#888] mb-1">TELEGRAM_API_HASH</label>
              <input
                type="text"
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
                placeholder="الهاش الخاص بك من my.telegram.org"
                className="w-full bg-[#141414] border border-[#333] rounded px-3 py-1.5 text-xs font-mono text-[#eee] focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingApi}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold rounded flex items-center gap-1 transition-colors"
            >
              {savingApi ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              <span>حفظ مفاتيح API</span>
            </button>
          </div>
        </form>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded text-xs border font-sans ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-700/60 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span className="flex-1">{feedback.message}</span>
          </div>
          {feedback.message.includes('FloodWait') && activeTab === 'phone' && (
            <div className="mt-2 pt-2 border-t border-rose-800/40 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('session');
                  setFeedback(null);
                }}
                className="px-2.5 py-1 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/40 rounded text-[11px] font-sans flex items-center gap-1.5 transition-colors"
              >
                <Key className="w-3 h-3 text-cyan-300" />
                <span>تخطي الانتظار: استخدام رمز الجلسة (Session String) ⚡</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Connected State */}
      {accountInfo.connected ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-gradient-to-r from-cyan-950/20 via-[#141414] to-emerald-950/20 border border-cyan-800/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-bold text-sm">
                  {accountInfo.firstName ? accountInfo.firstName.charAt(0) : 'U'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#f0f0f0]">
                      {accountInfo.firstName} {accountInfo.lastName}
                    </span>
                    {accountInfo.username && (
                      <span className="text-xs font-mono text-cyan-400">@{accountInfo.username}</span>
                    )}
                    {accountInfo.isPremium ? (
                      <span className="text-[10px] font-sans font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        ⭐️ Telegram Premium
                      </span>
                    ) : (
                      <span className="text-[10px] font-sans bg-[#222] text-[#aaa] px-2 py-0.5 rounded">
                        حساب تيليجرام قياسي
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#777] font-mono mt-0.5">
                    {accountInfo.phone ? `Phone: +${accountInfo.phone}` : 'MTProto Session Authorized'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs font-sans transition-colors self-start sm:self-auto"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>قطع الاتصال</span>
              </button>
            </div>

            {/* Performance Capabilities Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#222] text-[11px] font-sans">
              <div className="bg-[#0a0a0a] p-2 rounded border border-[#1f1f1f]">
                <span className="text-[#666] block">سرعة التنزيل المتوازي</span>
                <span className="text-cyan-400 font-mono font-bold">8 عمال (512KB Chunks)</span>
              </div>
              <div className="bg-[#0a0a0a] p-2 rounded border border-[#1f1f1f]">
                <span className="text-[#666] block">سرعة الرفع المتوازي</span>
                <span className="text-emerald-400 font-mono font-bold">12-16 عاملاً متزامناً</span>
              </div>
              <div className="bg-[#0a0a0a] p-2 rounded border border-[#1f1f1f]">
                <span className="text-[#666] block">حدود الـ FloodWait</span>
                <span className="text-amber-400 font-mono font-bold">غير مقيد (Uncapped)</span>
              </div>
              <div className="bg-[#0a0a0a] p-2 rounded border border-[#1f1f1f]">
                <span className="text-[#666] block">الترتيب والنشر</span>
                <span className="text-sky-400 font-mono font-bold">الفرز الصارم عبر البوت 🛡️</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Not Connected State: Login Forms */
        <div className="space-y-4">
          {/* Method Selection Tabs */}
          <div className="flex border-b border-[#222] text-xs font-sans">
            <button
              type="button"
              onClick={() => setActiveTab('phone')}
              className={`pb-2 px-3 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'phone'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-[#777] hover:text-[#bbb]'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>تسجيل الدخول برقم الهاتف والكود</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('session')}
              className={`pb-2 px-3 font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'session'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-[#777] hover:text-[#bbb]'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>لصق رمز الجلسة (Session String)</span>
            </button>
          </div>

          {/* TAB 1: Phone Login */}
          {activeTab === 'phone' && (
            <div className="space-y-3">
              {!codeSent ? (
                <form onSubmit={handleSendCode} className="space-y-3">
                  <div>
                    <label className="block text-xs font-sans text-[#ccc] mb-1.5">
                      رقم هاتفك المسجل في تيليجرام (مع رمز الدولة الدولي)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+966501234567 أو +9677..."
                          dir="ltr"
                          className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-xs font-mono text-[#eee] focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={sendingCode}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-black font-bold text-xs rounded transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        {sendingCode ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>جارِ الإرسال...</span>
                          </>
                        ) : (
                          <>
                            <Phone className="w-3.5 h-3.5" />
                            <span>إرسال رمز التحقق 📨</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#777] font-sans">
                    💡 سيصلك رمز التحقق مباشرة في محادثة إشعارات تيليجرام الرسمية داخل التطبيق.
                  </p>
                </form>
              ) : (
                /* Step 2: Enter Code & optional 2FA */
                <form onSubmit={handleVerifyCode} className="space-y-3 p-3.5 rounded bg-[#0a0a0a] border border-[#222]">
                  <div className="flex items-center justify-between text-xs text-[#aaa]">
                    <span>تم إرسال كود التحقق إلى: <b className="text-cyan-400 font-mono" dir="ltr">{phone}</b></span>
                    <button
                      type="button"
                      onClick={() => setCodeSent(false)}
                      className="text-xs text-[#777] hover:text-[#ccc] underline"
                    >
                      تغيير الرقم
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-sans text-[#ccc] mb-1">
                      كود التحقق المرسل من تيليجرام (5 أرقام)
                    </label>
                    <input
                      type="text"
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value)}
                      placeholder="12345"
                      dir="ltr"
                      className="w-full bg-[#141414] border border-[#333] rounded px-3 py-2 text-sm font-mono tracking-widest text-[#eee] focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div className={requires2Fa ? 'p-2.5 rounded border border-amber-500/50 bg-amber-950/20' : ''}>
                    <label className="block text-xs font-sans text-[#aaa] mb-1">
                      {requires2Fa ? (
                        <span className="text-amber-300 font-bold flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-amber-400" />
                          <span>مطلوب: كلمة مرور التحقق بخطوتين (2FA Password) لإتمام الدخول</span>
                        </span>
                      ) : (
                        <span>كلمة مرور التحقق بخطوتين (2FA Password) — <span className="text-[#666]">فقط إن كانت مفعلة في حسابك</span></span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type={show2FaPassword ? 'text' : 'password'}
                        value={twoFaPassword}
                        onChange={(e) => setTwoFaPassword(e.target.value)}
                        placeholder={requires2Fa ? 'أدخل كلمة مرور 2FA الخاصة بحسابك هنا' : 'اتركها فارغة إذا لم تكن مفعلة'}
                        dir="ltr"
                        autoFocus={requires2Fa}
                        className={`w-full bg-[#141414] border rounded px-3 py-2 text-xs font-mono text-[#eee] focus:outline-none pr-9 ${
                          requires2Fa
                            ? 'border-amber-400/80 focus:border-amber-400 ring-1 ring-amber-400/30'
                            : 'border-[#333] focus:border-cyan-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShow2FaPassword(!show2FaPassword)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777] hover:text-[#ccc]"
                      >
                        {show2FaPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={verifyingCode}
                      className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs rounded transition-colors flex items-center gap-1.5"
                    >
                      {verifyingCode ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>جارِ تسجيل الدخول...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تأكيد والاتصال الفوري 🚀</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: Session String */}
          {activeTab === 'session' && (
            <form onSubmit={handleSaveSession} className="space-y-3">
              <div>
                <label className="block text-xs font-sans text-[#ccc] mb-1.5">
                  الصق رمز الجلسة (Telethon / GramJS StringSession)
                </label>
                <textarea
                  rows={3}
                  value={sessionString}
                  onChange={(e) => setSessionString(e.target.value)}
                  placeholder="1BJWap1wBuyw... الصق رمز الجلسة هنا"
                  dir="ltr"
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded p-2.5 text-xs font-mono text-[#eee] focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[11px] text-[#777] font-sans">
                  💡 يمكنك أيضاً وضعها كمتغير بيئة <code>TELEGRAM_USER_SESSION</code> في ملف <code>.env</code>
                </span>
                <button
                  type="submit"
                  disabled={savingSession}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-black font-bold text-xs rounded transition-colors flex items-center gap-1.5"
                >
                  {savingSession ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جارِ التفعيل...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>تفعيل الجلسة ⚡</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Architectural Guarantee Guarantee Box */}
          <div className="p-3 rounded bg-[#0a0a0a] border border-[#222] text-xs font-sans space-y-1.5 text-[#aaa]">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>الضمان المعماري للأداة</span>
            </div>
            <ul className="list-disc list-inside text-[11px] text-[#888] space-y-1">
              <li>
                <b>البوت يظل واجهتك الأساسية 100%:</b> يستقبل جميع الملفات من المستخدمين، يدير طابور المعالجة بالترتيب الصارم، وينشر في القناة.
              </li>
              <li>
                <b>حسابك الشخصي هو محرك نقل فقط:</b> يقوم بسحب ودفع كتل البيانات الضخمة (512KB Chunks) عبر خوادم MTProto ليتجاوز خنق السرعة ويصل لسرعات 100+ MB/s.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
