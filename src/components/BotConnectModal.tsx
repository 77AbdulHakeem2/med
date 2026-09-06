import React, { useState } from 'react';
import {
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ShieldCheck,
} from 'lucide-react';
import { SystemStatus } from '../types';

interface BotConnectModalProps {
  status: SystemStatus | null;
  onClose: () => void;
  onSaveConfig: (botToken: string, pollingActive: boolean) => Promise<{ verified: boolean; error?: string }>;
}

export const BotConnectModal: React.FC<BotConnectModalProps> = ({
  status,
  onClose,
  onSaveConfig,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [polling, setPolling] = useState(status?.pollingActive ?? false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ verified: boolean; message: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setFeedback(null);

    const res = await onSaveConfig(tokenInput, polling);
    setTesting(false);

    if (res.verified) {
      setFeedback({ verified: true, message: 'تم التحقق من رمز البوت بنجاح! البوت متصل الآن بتيليجرام.' });
    } else {
      setFeedback({ verified: false, message: res.error || 'فشل الاتصال: تأكد من صحة الرمز' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#111111] border border-[#222] rounded-lg w-full max-w-lg p-6 shadow-2xl text-[#e0e0e0] relative animate-in fade-in zoom-in-95">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 text-[#666] hover:text-white rounded hover:bg-[#1c1c1c] transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded bg-[#181818] text-sky-400 border border-[#262626] flex items-center justify-center">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#f0f0f0] font-serif-display italic tracking-wide">
              Live Telegram Bot Connection
            </h3>
            <p className="text-xs text-[#777] font-sans">
              يمكنك ربط توكن البوت لتشغيله في التيليجرام الفعلي مباشرة
            </p>
          </div>
        </div>

        {/* Current status */}
        {status?.botInfo && (
          <div className="bg-[#141414] border border-emerald-900/40 p-3 rounded mb-4 flex items-center justify-between font-mono">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <span className="text-xs font-bold text-emerald-400">
                  @{status.botInfo.username}
                </span>
                <p className="text-[10px] text-[#666]">
                  NAME: {status.botInfo.first_name} • ID: {status.botInfo.id}
                </p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded uppercase font-mono">
              CONNECTED
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-[#aaa] block mb-1">
              TELEGRAM_BOT_TOKEN (من @BotFather):
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={status?.botConfigured ? '••••••••••••••••••••••••••••' : '1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
              className="w-full bg-[#0a0a0a] border border-[#282828] rounded px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:border-sky-500/60"
              dir="ltr"
            />
            <p className="text-[10px] text-[#777] mt-1 font-sans">
              يمكنك الحصول على التوكن مجاناً من خلال التحدث مع <b className="text-sky-400 font-mono">@BotFather</b> داخل التيليجرام وإنشاء بوت جديد عبر أمر <code className="text-amber-400 font-mono">/newbot</code>.
            </p>
          </div>

          <div className="bg-[#0c0c0c] border border-[#222] p-3.5 rounded flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-[#ccc] block">
                LONG_POLLING_RECEIVER
              </span>
              <span className="text-[11px] text-[#666] font-sans">
                يجعل السيرفر يستقبل الرسائل والفيديوهات من التيليجرام فور إرسالها.
              </span>
            </div>
            <input
              type="checkbox"
              checked={polling}
              onChange={(e) => setPolling(e.target.checked)}
              className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
            />
          </div>

          {feedback && (
            <div
              className={`p-3 rounded text-xs flex items-center gap-2 border font-mono ${
                feedback.verified
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-400'
                  : 'bg-rose-950/30 border-rose-800/50 text-rose-400'
              }`}
            >
              {feedback.verified ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-mono text-[#777] hover:text-[#ccc] transition rounded"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={testing}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black rounded text-xs font-mono font-semibold transition flex items-center gap-1.5 shadow-sm"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>VERIFYING...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>SAVE_AND_ACTIVATE</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live Simulator note */}
        <div className="mt-4 pt-3 border-t border-[#222] text-[11px] text-[#666] flex items-center gap-2 font-sans">
          <span>💡</span>
          <span>
            <b>ملاحظة:</b> إذا لم يكن لديك توكن حالياً، يمكنك استخدام محاكي التيليجرام المدمج بكامل مميزاته فوراً.
          </span>
        </div>

      </div>
    </div>
  );
};
