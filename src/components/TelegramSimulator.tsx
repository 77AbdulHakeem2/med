import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Image as ImageIcon,
  Video,
  Music,
  Sliders,
  Sparkles,
  Info,
  UploadCloud,
} from 'lucide-react';
import { SimulatedTelegramMessage, UserSetting } from '../types';

interface TelegramSimulatorProps {
  user: UserSetting;
  messages: SimulatedTelegramMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onSendPhoto: (photoUrl: string, caption?: string) => Promise<void>;
  onSendVideo: (filename: string, fileSize: number, caption?: string) => Promise<void>;
  onSendAudio?: (filename: string, fileSize: number, caption?: string, performer?: string, title?: string) => Promise<void>;
  onSendBatch: () => Promise<void>;
  onCallbackQuery: (messageId: number, data: string) => Promise<void>;
  loading: boolean;
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  user,
  messages,
  onSendMessage,
  onSendPhoto,
  onSendVideo,
  onSendAudio,
  onSendBatch,
  onCallbackQuery,
  loading,
}) => {
  const [inputText, setInputText] = useState('');
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<'photo' | 'video' | 'audio'>('photo');
  const [customFilename, setCustomFilename] = useState('Movie 01 - موقع_مشبوه - 1080p.mp4');
  const [customCaption, setCustomCaption] = useState('حلقة خاصة - موقع_مشبوه للتنزيل');
  const [customFileSizeMb, setCustomFileSizeMb] = useState(48);
  const [customPerformer, setCustomPerformer] = useState('مشاري العفاسي');
  const [customAudioTitle, setCustomAudioTitle] = useState('تلاوة خاشعة');
  const [customPhotoUrl, setCustomPhotoUrl] = useState(
    'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop&q=80'
  );

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loading) return;
    const text = inputText;
    setInputText('');
    await onSendMessage(text);
  };

  const handleQuickSettings = () => {
    onSendMessage('/settings');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          // Sending photo without command automatically sets user thumbnail as requested!
          onSendPhoto(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mkv')) {
      onSendVideo(file.name, file.size, 'ملف فيديو من الجهاز');
    } else if (file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.m4a') || file.name.endsWith('.ogg') || file.name.endsWith('.wav')) {
      if (onSendAudio) {
        onSendAudio(file.name, file.size, 'ملف صوتي من الجهاز');
      } else {
        onSendVideo(file.name, file.size, 'ملف صوتي من الجهاز');
      }
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto p-2 sm:p-4 select-none">
      {/* Simulation Info Callout */}
      <div className="bg-[#111111] border border-[#222] rounded-lg p-3 sm:p-3.5 mb-3 text-xs text-[#888] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#f0f0f0] tracking-wide font-serif-display italic text-sm">
                Telegram Bot Simulator
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#666]">
                Interactive Client
              </span>
            </div>
            <p className="text-[11px] text-[#777] mt-0.5">
              المستخدم النشط: <b className="text-sky-400 font-mono">{user.firstName}</b> ({user.userId}). الإعدادات منعزلة تماماً.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleQuickSettings}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#161616] hover:bg-[#202020] text-sky-400 border border-[#2b2b2b] hover:border-sky-500/40 rounded transition text-[11px] font-mono"
          >
            <Sliders className="w-3 h-3 text-sky-400" />
            <span>/settings</span>
          </button>
          <button
            onClick={() => {
              setMediaModalType('photo');
              setShowMediaModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#161616] hover:bg-[#202020] text-[#ccc] border border-[#2b2b2b] hover:border-[#444] rounded transition text-[11px] font-mono"
          >
            <ImageIcon className="w-3 h-3 text-sky-400" />
            <span>إرسال صورة (Thumbnail)</span>
          </button>
          <button
            onClick={() => {
              setMediaModalType('video');
              setShowMediaModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#161616] hover:bg-[#202020] text-[#ccc] border border-[#2b2b2b] hover:border-[#444] rounded transition text-[11px] font-mono"
          >
            <Video className="w-3 h-3 text-emerald-400" />
            <span>إرسال فيديو مخصص</span>
          </button>
          <button
            onClick={() => {
              setMediaModalType('audio');
              setCustomFilename('Audio Track 01 - موقع_مشبوه.mp3');
              setCustomCaption('تسجيل صوتي خاص - موقع_مشبوه');
              setCustomFileSizeMb(12);
              setShowMediaModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#161616] hover:bg-[#202020] text-[#ccc] border border-[#2b2b2b] hover:border-[#444] rounded transition text-[11px] font-mono"
          >
            <Music className="w-3 h-3 text-emerald-400" />
            <span>إرسال صوتي مخصص</span>
          </button>
          <button
            onClick={onSendBatch}
            className="flex items-center gap-1 px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded transition text-[11px] font-mono"
            title="يرسل فيديو 1 ثم فيديو 2 ثم نص 'القسم الثاني' ثم فيديو 3 لاختبار الترتيب الصارم"
          >
            <Sparkles className="w-3 h-3" />
            <span>دفعة بالترتيب</span>
          </button>
        </div>
      </div>

      {/* Main Telegram Chat Window */}
      <div className="flex-1 bg-[#0f0f0f] border border-[#222] rounded-lg flex flex-col overflow-hidden shadow-sm">
        
        {/* Chat Header */}
        <div className="bg-[#141414] border-b border-[#222] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded bg-[#1c1c1c] border border-[#2c2c2c] flex items-center justify-center text-sky-400 font-bold font-mono text-xs shadow-sm">
                BOT
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border border-[#141414] rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[#f0f0f0] tracking-wide font-mono">
                  TELEGRAM MEDIA PIPELINE
                </h3>
                <span className="text-[9px] bg-[#222] text-[#888] px-1.5 py-0.2 rounded font-mono uppercase">
                  BOT
                </span>
              </div>
              <p className="text-[10px] text-emerald-400 font-mono tracking-wider">
                ONLINE • CHUNKED ENGINE READY
              </p>
            </div>
          </div>

          <div className="text-right text-xs font-mono text-[#777]">
            <span className="block text-[#bbb] text-[11px]">{user.firstName}</span>
            <span className="text-[9px] text-[#555]">UID: {user.userId}</span>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0a0a]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[#666] p-6 space-y-3 font-mono">
              <div className="w-10 h-10 rounded bg-[#141414] border border-[#222] flex items-center justify-center text-sky-400 text-sm">
                &gt;_
              </div>
              <h4 className="text-xs font-semibold text-[#aaa] uppercase tracking-wider">
                Interactive Bot Session Initialized
              </h4>
              <p className="text-xs text-[#555] max-w-md leading-relaxed font-sans">
                أرسل <code className="text-sky-400 font-mono bg-[#161616] px-1 py-0.5 rounded border border-[#262626]">/settings</code> لإدارة الصورة المصغرة والوسم والقناة، أو أرسل صورة مباشرة لتصبح الـ Thumbnail تلقائياً للمستخدم الحالي.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleQuickSettings}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-black text-xs font-semibold rounded tracking-wide transition shadow-sm font-sans"
                >
                  فتح قائمة /settings الآن
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isBot = msg.from.is_bot;
              return (
                <div
                  key={msg.message_id}
                  className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} group`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[80%] rounded px-3.5 py-2.5 shadow-sm text-xs ${
                      isBot
                        ? 'bg-[#141414] border border-[#242424] text-[#dcdcdc]'
                        : 'bg-[#181818] border border-sky-500/40 text-[#f5f5f5]'
                    }`}
                  >
                    {/* Media attachments */}
                    {msg.photo && msg.photo.length > 0 && (
                      <div className="mb-2 overflow-hidden rounded border border-[#282828]">
                        <img
                          src={msg.photo[0].url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'}
                          alt="Thumbnail preview"
                          referrerPolicy="no-referrer"
                          className="w-full max-h-56 object-cover"
                        />
                        <div className="bg-[#111] px-2 py-1 text-[10px] text-sky-400 font-mono flex items-center justify-between border-t border-[#222]">
                          <span>ATTACHED_IMAGE</span>
                          {!msg.caption && (
                            <span className="text-emerald-400 font-semibold font-sans">تعيين تلقائي كـ Thumbnail ✅</span>
                          )}
                        </div>
                      </div>
                    )}

                    {msg.video && (
                      <div className="mb-2 p-2.5 rounded bg-[#0d0d0d] border border-[#222] flex items-center gap-3 font-mono">
                        <div className="w-8 h-8 rounded bg-sky-950/40 text-sky-400 border border-sky-800/40 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate text-[#eee]" dir="ltr">
                            {msg.video.file_name}
                          </p>
                          <p className="text-[10px] text-[#666]">
                            {(msg.video.file_size / (1024 * 1024)).toFixed(1)} MB • TELEGRAM_VIDEO
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Text & Caption */}
                    {(msg.text || msg.caption) && (
                      <div
                        className="leading-relaxed break-words font-sans text-xs"
                        dangerouslySetInnerHTML={{
                          __html: (msg.text || msg.caption || '')
                            .replace(/\n/g, '<br/>')
                            .replace(/<b>(.*?)<\/b>/g, '<strong class="font-semibold text-white">$1</strong>')
                            .replace(/<code>(.*?)<\/code>/g, '<code class="bg-[#1e1e1e] text-amber-300 font-mono px-1 py-0.5 rounded border border-[#2f2f2f] text-[11px]">$1</code>')
                            .replace(/<i>(.*?)<\/i>/g, '<em class="text-[#888]">$1</em>')
                            .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '<a href="$1" target="_blank" rel="noreferrer" class="text-sky-400 hover:text-sky-300 underline font-semibold decoration-sky-400/50 hover:decoration-sky-300 transition-colors">$2</a>'),
                        }}
                      />
                    )}

                    {/* Inline Keyboard (Buttons) */}
                    {msg.reply_markup?.inline_keyboard && (
                      <div className="mt-2.5 space-y-1 pt-2 border-t border-[#222]">
                        {msg.reply_markup.inline_keyboard.map((row, rowIdx) => (
                          <div key={rowIdx} className="grid grid-flow-col auto-cols-fr gap-1">
                            {row.map((btn, btnIdx) => (
                              <button
                                key={btnIdx}
                                onClick={() => {
                                  if (btn.callback_data) {
                                    onCallbackQuery(msg.message_id, btn.callback_data);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-[#1a1a1a] hover:bg-[#222] hover:text-sky-400 text-[#ccc] rounded text-xs font-mono border border-[#2c2c2c] transition active:scale-[0.98] shadow-sm flex items-center justify-center text-center truncate"
                              >
                                {btn.text}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Time indicator */}
                    <div className="flex justify-end items-center gap-1 mt-1 text-[9px] font-mono text-[#555]">
                      <span>
                        {new Date(msg.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-[#121212] border-t border-[#222] p-2 sm:p-2.5">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            
            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,video/*"
            />

            {/* Quick Upload / Attach Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded bg-[#181818] hover:bg-[#202020] text-[#777] hover:text-sky-400 border border-[#2a2a2a] transition"
              title="رفع صورة مصغرة أو فيديو من جهازك مباشرة"
            >
              <UploadCloud className="w-4 h-4" />
            </button>

            {/* Modal opener for fine-grained video simulation */}
            <button
              type="button"
              onClick={() => {
                setMediaModalType('video');
                setShowMediaModal(true);
              }}
              className="p-2 rounded bg-[#181818] hover:bg-[#202020] text-[#777] hover:text-emerald-400 border border-[#2a2a2a] transition"
              title="إرسال فيديو مخصص مع كلمات محظورة للاختبار"
            >
              <Video className="w-4 h-4" />
            </button>

            {/* Message input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="اكتب رسالة أو أمر /settings أو أرسل نصاً لإضافته للطابور..."
              className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded px-3 py-2 text-xs text-[#e0e0e0] placeholder:text-[#555] focus:outline-none focus:border-sky-500/60 transition font-sans"
              dir="auto"
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={!inputText.trim() || loading}
              className="p-2 rounded bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-black font-semibold transition active:scale-95 flex items-center justify-center shadow-sm"
            >
              <Send className="w-4 h-4 -rotate-12" />
            </button>
          </form>
        </div>
      </div>

      {/* Media Test Modal */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#262626] rounded-lg w-full max-w-md p-5 shadow-2xl text-[#e0e0e0]">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2 font-mono">
              {mediaModalType === 'photo' && (
                <>
                  <ImageIcon className="w-4 h-4 text-sky-400" />
                  <span>UPLOAD_THUMBNAIL_TEST</span>
                </>
              )}
              {mediaModalType === 'video' && (
                <>
                  <Video className="w-4 h-4 text-emerald-400" />
                  <span>SEND_VIDEO_TEST</span>
                </>
              )}
              {mediaModalType === 'audio' && (
                <>
                  <Music className="w-4 h-4 text-emerald-400" />
                  <span>SEND_AUDIO_TEST</span>
                </>
              )}
            </h3>

            {mediaModalType === 'photo' ? (
              <div className="space-y-3">
                <p className="text-xs text-[#888]">
                  وفق المتطلبات: بمجرد إرسال صورة بدون أوامر، يتعرف عليها البوت تلقائياً كـ Thumbnail للمستخدم ويحفظها مباشرة مع رسالة تأكيد.
                </p>
                <div>
                  <label className="text-[11px] font-mono text-[#aaa] block mb-1">IMAGE_URL:</label>
                  <input
                    type="text"
                    value={customPhotoUrl}
                    onChange={(e) => setCustomPhotoUrl(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-sky-500/60 font-mono"
                  />
                </div>
                <div className="w-full h-32 rounded overflow-hidden border border-[#262626]">
                  <img
                    src={customPhotoUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap pb-1">
                  <span className="text-[10px] text-[#666] font-mono">PRESETS:</span>
                  {mediaModalType === 'audio' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFilename('Audio Track 01 - موقع_مشبوه - 320k.mp3');
                        setCustomCaption('تسجيل صوتي - موقع_مشبوه للتحميل');
                        setCustomPerformer('مشاري العفاسي');
                        setCustomAudioTitle('سورة الفاتحة');
                        setCustomFileSizeMb(14);
                      }}
                      className="px-2 py-0.5 bg-[#1a1a1a] hover:bg-[#252525] text-emerald-300 text-[10px] rounded border border-[#333] font-mono"
                    >
                      Audio Track (مع محظور وفنان)
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomFilename('Movie ABC 01.mp4');
                          setCustomCaption('Movie ABC 01 - Special Edition');
                          setCustomFileSizeMb(32);
                        }}
                        className="px-2 py-0.5 bg-[#1a1a1a] hover:bg-[#252525] text-amber-300 text-[10px] rounded border border-[#333] font-mono"
                      >
                        Movie ABC 01 (كلمة محظورة)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomFilename('Episode 05.mp4');
                          setCustomCaption('Episode 05 - Season 1');
                          setCustomFileSizeMb(28);
                        }}
                        className="px-2 py-0.5 bg-[#1a1a1a] hover:bg-[#252525] text-sky-300 text-[10px] rounded border border-[#333] font-mono"
                      >
                        Episode 05 (فصل الاسم والوصف)
                      </button>
                    </>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-mono text-[#aaa] block mb-1">ORIGINAL_FILENAME:</label>
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-emerald-500/60 font-mono"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-[#666] font-mono mt-0.5 block">
                    إذا وُجدت كلمة محظورة في الاسم (مثل "ABC") سيتم حذفها أولاً ثم تطبيق Prefix/Suffix على اسم الملف الحقيقي.
                  </span>
                </div>

                {mediaModalType === 'audio' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-mono text-[#aaa] block mb-1">PERFORMER (الفنان):</label>
                      <input
                        type="text"
                        value={customPerformer}
                        onChange={(e) => setCustomPerformer(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-[#aaa] block mb-1">TITLE (العنوان):</label>
                      <input
                        type="text"
                        value={customAudioTitle}
                        onChange={(e) => setCustomAudioTitle(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-mono text-[#aaa] block mb-1">CAPTION:</label>
                  <input
                    type="text"
                    value={customCaption}
                    onChange={(e) => setCustomCaption(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-[#aaa] block mb-1">FILE_SIZE (MB):</label>
                  <input
                    type="number"
                    value={customFileSizeMb}
                    onChange={(e) => setCustomFileSizeMb(Number(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#262626] rounded px-3 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-emerald-500/60 font-mono"
                  />
                  <span className="text-[10px] text-[#666] font-mono mt-0.5 block">
                    CHUNKED TRANSFER WITH RESUME TOKEN ACTIVE.
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[#222]">
              <button
                type="button"
                onClick={() => setShowMediaModal(false)}
                className="px-3 py-1 text-xs text-[#777] hover:text-[#bbb] rounded transition font-mono"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowMediaModal(false);
                  if (mediaModalType === 'photo') {
                    await onSendPhoto(customPhotoUrl);
                  } else if (mediaModalType === 'audio') {
                    if (onSendAudio) {
                      await onSendAudio(customFilename, customFileSizeMb * 1024 * 1024, customCaption, customPerformer, customAudioTitle);
                    } else {
                      await onSendVideo(customFilename, customFileSizeMb * 1024 * 1024, customCaption);
                    }
                  } else {
                    await onSendVideo(customFilename, customFileSizeMb * 1024 * 1024, customCaption);
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-black rounded transition font-mono"
              >
                SUBMIT_TO_BOT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
