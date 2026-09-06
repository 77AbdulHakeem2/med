import React from 'react';
import {
  Eye,
  FileVideo,
  CheckCircle2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { ChannelPost, UserChannelSetting } from '../types';

interface ChannelFeedProps {
  posts: ChannelPost[];
  channelSetting?: UserChannelSetting;
}

export const ChannelFeed: React.FC<ChannelFeedProps> = ({ posts, channelSetting }) => {
  const channelTitle = channelSetting?.title || 'قناة ميديا العرب الرسمية 🎬';
  const channelUsername = channelSetting?.chatId || '@MediaHubArabic';
  const isEnabled = channelSetting ? channelSetting.publishingEnabled : true;

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-5 select-none">
      
      {/* Channel Header Banner */}
      <div className="bg-[#111111] border border-[#222] rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded bg-[#181818] border border-[#282828] flex items-center justify-center text-sky-400 font-mono text-xl shadow-sm">
              CH
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#f0f0f0] font-serif-display italic tracking-wide text-lg">
                  {channelTitle}
                </h2>
                <span className="text-sky-400" title="VERIFIED CHANNEL">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <p className="text-xs text-sky-400/90 font-mono mt-0.5">{channelUsername}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-[#666]">
                <span>14.2K SUBSCRIBERS</span>
                <span>•</span>
                <span>{posts.length} DISPATCHED</span>
                <span>•</span>
                <span className={isEnabled ? 'text-emerald-400' : 'text-rose-400'}>
                  {isEnabled ? '● DISPATCH_ACTIVE' : '○ DISPATCH_PAUSED'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#161616] border border-[#262626] px-3.5 py-2.5 rounded text-xs text-[#aaa] max-w-xs font-mono">
            <div className="flex items-center gap-1.5 text-sky-400 font-semibold mb-0.5 text-[11px] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>LIVE BROADCAST VERIFIER</span>
            </div>
            <p className="text-[#666] text-[10px] leading-relaxed font-sans">
              تظهر هنا المنشورات بعد اكتمال المعالجة بالكامل: تعديل اسم الملف الحقيقي، تطبيق الـ Thumbnail، تصفية الكلمات، والترتيب الصارم.
            </p>
          </div>
        </div>
      </div>

      {/* Feed Stream */}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <div className="bg-[#111111] border border-[#222] rounded-lg p-12 text-center text-[#666] space-y-3 font-mono">
            <div className="w-10 h-10 rounded bg-[#161616] border border-[#222] mx-auto flex items-center justify-center text-sm text-[#444]">
              00
            </div>
            <h3 className="text-xs font-semibold text-[#888] uppercase tracking-wider">No Dispatched Media Yet</h3>
            <p className="text-xs text-[#555] max-w-sm mx-auto font-sans">
              عند إرسال فيديوهات أو رسائل إلى البوت واكتمال معالجتها في طابور الـ Queue، سيتم نشرها هنا بالترتيب التسلسلي التام.
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-[#111111] border border-[#222] rounded-lg overflow-hidden shadow-sm hover:border-[#333] transition"
            >
              {/* Post Header: Sequence Ticket */}
              <div className="px-4 py-2.5 bg-[#141414] border-b border-[#222] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-sky-950/40 text-sky-400 border border-sky-800/40 font-bold text-[10px]">
                    SEQ #{post.sequenceNumber}
                  </span>
                  <span className="text-[#666]">
                    PUBLISHER: <b className="text-[#bbb]">{post.publisherName}</b>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[#666] text-[11px]">
                  <Calendar className="w-3 h-3 text-[#555]" />
                  <span>
                    {new Date(post.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Post Body */}
              <div className="p-4 sm:p-5 space-y-3.5">
                {post.type === 'text' ? (
                  // Text Message Post
                  <div className="bg-[#151515] border border-[#262626] p-4 rounded">
                    <p className="text-xs sm:text-sm text-[#e0e0e0] whitespace-pre-wrap leading-relaxed">
                      {post.text || post.caption}
                    </p>
                    <div className="mt-2 text-[10px] text-amber-400/90 font-mono">
                      📌 STANDALONE_TEXT_DISPATCH: تم النشر في موقعه التسلسلي الصحيح تماماً.
                    </div>
                  </div>
                ) : (
                  // Video Post
                  <div className="space-y-3">
                    {/* Thumbnail & Video Cover */}
                    {post.thumbnailUrl && (
                      <div className="relative rounded overflow-hidden border border-[#262626] bg-black aspect-video max-h-72 w-full">
                        <img
                          src={post.thumbnailUrl}
                          alt="Custom Thumbnail"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2.5 right-2.5 bg-black/80 backdrop-blur-xs text-sky-400 border border-sky-500/30 px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-sky-400" />
                          <span>USER_THUMBNAIL_ATTACHED</span>
                        </div>
                        <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-xs text-[#aaa] px-2 py-0.5 rounded text-[10px] font-mono border border-[#333] flex items-center gap-1.5">
                          {post.duration && (
                            <span className="text-sky-400 font-semibold">
                              {Math.floor(post.duration / 60)}:{(post.duration % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                          {post.duration && <span>•</span>}
                          <span>{post.fileSize ? `${(post.fileSize / (1024 * 1024)).toFixed(1)} MB` : '48 MB'}</span>
                        </div>
                      </div>
                    )}

                    {/* Actual Filename Box (Verified Real Name) */}
                    <div className="bg-[#0d0d0d] border border-emerald-800/40 p-3 rounded flex items-center justify-between gap-3 font-mono">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/30 shrink-0">
                          <FileVideo className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] text-emerald-400 uppercase tracking-widest block">
                            ACTUAL_FILENAME (SANITIZED ON TELEGRAM):
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-[#f0f0f0] truncate block" dir="ltr">
                            {post.filename || post.title}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                        VERIFIED ✅
                      </span>
                    </div>

                    {/* Caption */}
                    {post.caption && (
                      <div className="text-xs text-[#ccc] whitespace-pre-wrap leading-relaxed bg-[#141414] p-3 rounded border border-[#222]">
                        <span className="text-[10px] font-mono text-[#666] uppercase block mb-1">CAPTION_SANITIZED:</span>
                        {post.caption}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer: Views & Channel Brand */}
                <div className="flex items-center justify-between pt-2 border-t border-[#1e1e1e] text-[11px] text-[#666] font-mono">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[#555]" />
                    <span>{post.viewsCount || 1} VIEWS</span>
                  </div>
                  <span className="text-sky-400/80">{channelUsername}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
