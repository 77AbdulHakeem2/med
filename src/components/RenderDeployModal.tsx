import React, { useState } from 'react';
import {
  Globe,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Zap,
  HelpCircle,
  X,
  Server,
  Activity,
} from 'lucide-react';

interface RenderDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  pollingActive: boolean;
  onTogglePolling?: () => void;
}

export const RenderDeployModal: React.FC<RenderDeployModalProps> = ({
  isOpen,
  onClose,
  pollingActive,
  onTogglePolling,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedBuild, setCopiedBuild] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);
  const [activeTab, setActiveTab] = useState<'uptimerobot' | 'render' | 'coexistence'>('uptimerobot');

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const keepAliveUrl = `${origin}/health`;

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#0f1117] border border-[#222738] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2436] bg-[#141722]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>تشغيل الاستضافة المجانية 24/7 (Render & UptimeRobot)</span>
              </h3>
              <p className="text-xs text-[#94a3b8]">
                إبقاء خادم Render نشطاً بالمجان، وتنسيق العمل مع AI Studio بدون أي تعارض
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#64748b] hover:text-white rounded-lg hover:bg-[#1e2333] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#1f2436] bg-[#10131d] px-6">
          <button
            onClick={() => setActiveTab('uptimerobot')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition ${
              activeTab === 'uptimerobot'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-[#71717a] hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>ضبط UptimeRobot (منع النوم)</span>
          </button>
          <button
            onClick={() => setActiveTab('render')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition ${
              activeTab === 'render'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-[#71717a] hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>إعدادات النشر على Render</span>
          </button>
          <button
            onClick={() => setActiveTab('coexistence')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition ${
              activeTab === 'coexistence'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-[#71717a] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>التشغيل المشترك مع AI Studio</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-[#cbd5e1]">
          
          {/* Tab 1: UptimeRobot */}
          {activeTab === 'uptimerobot' && (
            <div className="space-y-4">
              <div className="bg-[#141824] border border-[#21283d] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>رابط الاستدعاء لـ UptimeRobot (Keep-Alive URL)</span>
                  </span>
                  <a
                    href="/health"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>معاينة صفحة المراقبة</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex items-center gap-2 bg-[#090b10] border border-[#28314a] rounded-lg p-1.5 direction-ltr">
                  <input
                    type="text"
                    readOnly
                    value={keepAliveUrl}
                    className="bg-transparent text-xs text-sky-300 font-mono flex-1 px-2 outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(keepAliveUrl, setCopiedUrl)}
                    className="px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'تم النسخ!' : 'نسخ'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#94a3b8] mt-2">
                  ملاحظة: عند النشر على Render، استبدل الدومين برابط موقعك على Render مثل: <code className="text-sky-300">https://your-bot.onrender.com/health</code>
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  خطوات الحفاظ على البوت يعمل 24/7 مجاناً:
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2.5 items-start bg-[#12151e] p-2.5 rounded-lg border border-[#1e2330]">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
                    <span>سجل مجاناً في موقع <b>UptimeRobot.com</b> ثم اضغط على <b>"+ Add New Monitor"</b>.</span>
                  </div>
                  <div className="flex gap-2.5 items-start bg-[#12151e] p-2.5 rounded-lg border border-[#1e2330]">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
                    <span>اختر <b>Monitor Type: HTTP(s)</b> والصق رابط الـ <code className="text-sky-300">/health</code> في خانة URL.</span>
                  </div>
                  <div className="flex gap-2.5 items-start bg-[#12151e] p-2.5 rounded-lg border border-[#1e2330]">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
                    <span>اضبط <b>Monitoring Interval</b> على <b>5 دقائق</b> (Render ينام بعد 15 دقيقة، لذا 5 دقائق تضمن بقاءه مستيقظاً دائماً).</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Render Deploy */}
          {activeTab === 'render' && (
            <div className="space-y-4">
              <p className="text-xs text-[#94a3b8]">
                الأداة مجهزة بالكامل للعمل على استضافة Render المجانية مع ملف <code className="text-sky-300">render.yaml</code> للتجهيز التلقائي:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#12151e] border border-[#1e2330] rounded-lg p-3">
                  <div className="text-[11px] text-[#94a3b8] mb-1">أمر البناء (Build Command):</div>
                  <div className="flex items-center justify-between bg-[#090a0f] p-2 rounded border border-[#232838]">
                    <code className="text-xs text-emerald-400 font-mono">npm install && npm run build</code>
                    <button
                      onClick={() => copyToClipboard('npm install && npm run build', setCopiedBuild)}
                      className="text-[#94a3b8] hover:text-white p-1"
                      title="نسخ"
                    >
                      {copiedBuild ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="bg-[#12151e] border border-[#1e2330] rounded-lg p-3">
                  <div className="text-[11px] text-[#94a3b8] mb-1">أمر التشغيل (Start Command):</div>
                  <div className="flex items-center justify-between bg-[#090a0f] p-2 rounded border border-[#232838]">
                    <code className="text-xs text-emerald-400 font-mono">npm start</code>
                    <button
                      onClick={() => copyToClipboard('npm start', setCopiedStart)}
                      className="text-[#94a3b8] hover:text-white p-1"
                      title="نسخ"
                    >
                      {copiedStart ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#12151e] border border-[#1e2330] rounded-lg p-3">
                <div className="text-xs font-bold text-white mb-2">متغيرات البيئة المطلوبة في Render (Environment Variables):</div>
                <ul className="space-y-1.5 text-xs text-[#94a3b8] font-mono">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-white">TELEGRAM_BOT_TOKEN</span> : توكن البوت من @BotFather
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-white">GEMINI_API_KEY</span> : مفتاح Gemini AI لإعادة التسمية والوصف
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-white">ENABLE_TELEGRAM_POLLING</span> : <span className="text-emerald-400">true</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Tab 3: Coexistence with AI Studio */}
          {activeTab === 'coexistence' && (
            <div className="space-y-4 text-xs">
              <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-3.5 text-emerald-300">
                <div className="font-bold flex items-center gap-2 mb-1 text-emerald-400 text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>نظام التوافق الذكي لمنع التعارض (Zero Conflict Engine)</span>
                </div>
                تسمح خوادم تيليجرام لنسخة واحدة فقط بالاستماع للرسائل في نفس اللحظة عبر الـ Polling. تم تزويد الكود بنظام ذكي يكتشف تلقائياً عند تشغيل البوت في Render وفي AI Studio معاً.
              </div>

              <div className="space-y-2">
                <div className="bg-[#12151e] p-3 rounded-lg border border-[#1e2330]">
                  <b className="text-white">1. الخادم الرئيسي المستمر (Render):</b>
                  <p className="text-[#94a3b8] mt-1">
                    يعمل خادم Render على مدار الساعة في السحابة لاستقبال ومعالجة ونشر ملفاتك في القناة بسرعة فائقة.
                  </p>
                </div>

                <div className="bg-[#12151e] p-3 rounded-lg border border-[#1e2330]">
                  <b className="text-white">2. بيئة التطوير والتحكم (AI Studio):</b>
                  <p className="text-[#94a3b8] mt-1">
                    يمكنك استخدام واجهة AI Studio في أي وقت لتجربة التسمية بالذكاء الاصطناعي، تعديل القوالب، متابعة الطابور، أو رفع ملفات يدوياً.
                  </p>
                </div>

                <div className="bg-[#12151e] p-3 rounded-lg border border-[#1e2330] flex items-center justify-between">
                  <div>
                    <b className="text-white">الاستماع في هذا الجهاز (Polling):</b>
                    <p className="text-[#94a3b8] mt-0.5">
                      {pollingActive ? 'الاستماع نشط حالياً' : 'الاستماع متوقف في هذا الجهاز (Render يتولى الاستماع)'}
                    </p>
                  </div>
                  {onTogglePolling && (
                    <button
                      onClick={onTogglePolling}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                        pollingActive
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                      }`}
                    >
                      {pollingActive ? 'إيقاف الاستماع هنا' : 'تفعيل الاستماع هنا'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#1f2436] bg-[#141722]">
          <div className="text-[11px] text-[#64748b]">
            الملف <code className="text-sky-400 font-mono">RENDER_DEPLOY_GUIDE.md</code> متوفر في المشروع
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1e2434] hover:bg-[#283147] text-white text-xs font-semibold transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
