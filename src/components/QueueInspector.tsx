import React from 'react';
import {
  Layers,
  CheckCircle2,
  Clock,
  Trash2,
  PlusCircle,
  HardDrive,
  Zap,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { QueueItem } from '../types';

interface QueueInspectorProps {
  queue: QueueItem[];
  onClearCompleted: () => void;
  onClearAll: () => void;
  onAddBatchTest: () => void;
  onDeleteItem: (id: string) => void;
}

export const QueueInspector: React.FC<QueueInspectorProps> = ({
  queue,
  onClearCompleted,
  onClearAll,
  onAddBatchTest,
  onDeleteItem,
}) => {
  const activeProcessing = queue.find(
    (q) => q.status !== 'queued' && q.status !== 'published' && q.status !== 'failed'
  );

  const getStatusBadge = (status: QueueItem['status']) => {
    switch (status) {
      case 'published':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-emerald-950/30 text-emerald-400 border border-emerald-800/40">
            <CheckCircle2 className="w-3 h-3" />
            PUBLISHED
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-rose-950/40 text-rose-400 border border-rose-900/40">
            <AlertCircle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-[#181818] text-[#888] border border-[#2a2a2a]">
            <Clock className="w-3 h-3" />
            QUEUED (FIFO)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-sky-950/40 text-sky-400 border border-sky-800/40 animate-pulse">
            <Zap className="w-3 h-3" />
            PROCESSING
          </span>
        );
    }
  };

  // Determine current active step in pipeline
  const getStepStatus = (stepNumber: number) => {
    if (!activeProcessing) return 'pending';
    const st = activeProcessing.status;
    if (st === 'downloading') {
      if (stepNumber === 1) return 'active';
      return 'pending';
    }
    if (st === 'processing') {
      if (stepNumber === 1) return 'done';
      if (stepNumber === 2 || stepNumber === 3) return 'active';
      return 'pending';
    }
    if (st === 'uploading') {
      if (stepNumber <= 3) return 'done';
      if (stepNumber === 4) return 'active';
    }
    return 'pending';
  };

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-5 select-none">
      
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold text-[#f5f5f5] font-serif-display italic tracking-wide text-lg">
                  Strict FIFO Queue Engine
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#666]">
                  Sequential Pipeline
                </span>
              </div>
              <p className="text-xs text-[#888] mt-0.5">
                حفظ الترتيب الصارم للعناصر المعاد نشرها بالقناة بغض النظر عن حجم الفيديوهات ووقت المعالجة.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onAddBatchTest}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-black rounded text-xs font-semibold tracking-wide transition active:scale-95 shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>إضافة دفعة تجريبية مرتبة</span>
          </button>
          <button
            onClick={onClearCompleted}
            className="px-3 py-1.5 bg-[#161616] hover:bg-[#202020] text-[#aaa] hover:text-[#eee] border border-[#262626] rounded text-xs transition"
          >
            مسح المكتمل
          </button>
          <button
            onClick={onClearAll}
            className="px-3 py-1.5 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-900/30 rounded text-xs transition"
          >
            إفراغ الطابور
          </button>
        </div>
      </div>

      {/* 4-Step Pipeline Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center font-mono text-xs">
        <div className={`p-3 rounded border transition ${
          getStepStatus(1) === 'active'
            ? 'bg-[#151515] border-sky-500 text-sky-400'
            : getStepStatus(1) === 'done'
            ? 'bg-[#151515] border-emerald-500/40 text-emerald-400'
            : 'bg-[#111111] border-[#222] text-[#555]'
        }`}>
          <div className="text-[10px] text-[#666] tracking-widest uppercase">STEP 01</div>
          <div className="font-semibold mt-0.5">CHUNK_DOWNLOAD</div>
        </div>

        <div className={`p-3 rounded border transition ${
          getStepStatus(2) === 'active'
            ? 'bg-[#151515] border-sky-500 text-sky-400'
            : getStepStatus(2) === 'done'
            ? 'bg-[#151515] border-emerald-500/40 text-emerald-400'
            : 'bg-[#111111] border-[#222] text-[#555]'
        }`}>
          <div className="text-[10px] text-[#666] tracking-widest uppercase">STEP 02</div>
          <div className="font-semibold mt-0.5">METADATA_CLEAN</div>
        </div>

        <div className={`p-3 rounded border transition ${
          getStepStatus(3) === 'active'
            ? 'bg-[#151515] border-sky-500 text-sky-400'
            : getStepStatus(3) === 'done'
            ? 'bg-[#151515] border-emerald-500/40 text-emerald-400'
            : 'bg-[#111111] border-[#222] text-[#555]'
        }`}>
          <div className="text-[10px] text-[#666] tracking-widest uppercase">STEP 03</div>
          <div className="font-semibold mt-0.5">ATTACH_THUMBNAIL</div>
        </div>

        <div className={`p-3 rounded border transition ${
          getStepStatus(4) === 'active'
            ? 'bg-[#151515] border-sky-500 text-sky-400'
            : getStepStatus(4) === 'done'
            ? 'bg-[#151515] border-emerald-500/40 text-emerald-400'
            : 'bg-[#111111] border-[#222] text-[#555]'
        }`}>
          <div className="text-[10px] text-[#666] tracking-widest uppercase">STEP 04</div>
          <div className="font-semibold mt-0.5">SEQUENTIAL_DISPATCH</div>
        </div>
      </div>

      {/* Active Processing Pipeline Card */}
      {activeProcessing && (
        <div className="bg-[#131313] border border-sky-500/30 rounded-lg p-5 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              <span>CURRENT ITEM #{activeProcessing.sequenceNumber} IN PIPELINE</span>
            </div>
            <span className="text-xs text-[#777] font-mono">
              USER: {activeProcessing.userFirstName} ({activeProcessing.userId})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#181818] p-3 rounded border border-[#222] mb-3 font-mono">
            <div>
              <span className="text-[10px] text-[#666] uppercase tracking-wider block mb-0.5">ORIGINAL FILE:</span>
              <p className="text-xs text-[#e0e0e0] truncate" dir="ltr">
                {activeProcessing.originalFilename || activeProcessing.textContent}
              </p>
            </div>
            {activeProcessing.processedFilename && (
              <div>
                <span className="text-[10px] text-emerald-400 uppercase tracking-wider block mb-0.5">SANITIZED FILE (REAL):</span>
                <p className="text-xs text-emerald-300 truncate" dir="ltr">
                  {activeProcessing.processedFilename}
                </p>
              </div>
            )}
          </div>

          {/* Chunked Download/Upload Progress Bar */}
          {activeProcessing.chunkProgress && (
            <div className="space-y-2 mt-3 font-mono">
              <div className="flex items-center justify-between text-xs text-[#aaa]">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    CHUNK [{activeProcessing.chunkProgress.chunkIndex}/{activeProcessing.chunkProgress.totalChunks}]
                  </span>
                </span>
                <span className="text-sky-400 font-semibold">
                  {activeProcessing.chunkProgress.speedMbps} MB/s •{' '}
                  {Math.round(
                    (activeProcessing.chunkProgress.chunkIndex / activeProcessing.chunkProgress.totalChunks) * 100
                  )}
                  %
                </span>
              </div>
              <div className="w-full bg-[#202020] h-2 rounded-full overflow-hidden border border-[#2a2a2a]">
                <div
                  className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (activeProcessing.chunkProgress.chunkIndex / activeProcessing.chunkProgress.totalChunks) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#666]">
                <span>
                  TRANSFERRED: {(activeProcessing.chunkProgress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB /{' '}
                  {(activeProcessing.chunkProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
                <span>
                  TOKEN: {activeProcessing.chunkProgress.resumeToken.slice(0, 16)}...
                </span>
              </div>
            </div>
          )}

          {/* Current Status Step Text */}
          <div className="mt-3 text-xs text-[#bbb] bg-[#161616] px-3 py-2 rounded border border-[#262626] flex items-center justify-between font-mono">
            <span className="text-[#666] uppercase tracking-wider text-[10px]">CURRENT ACTION:</span>
            <span className="text-[#eee] font-medium">{activeProcessing.statusMessage}</span>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="bg-[#111111] border border-[#222] rounded-lg overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#222] flex items-center justify-between bg-[#141414]">
          <h3 className="text-xs uppercase font-mono tracking-widest text-[#aaa] flex items-center gap-2">
            <span>QUEUED MEDIA ITEMS</span>
            <span className="px-2 py-0.5 rounded bg-[#1f1f1f] text-sky-400 text-[10px] font-bold border border-[#2a2a2a]">
              {queue.length}
            </span>
          </h3>
          <span className="text-[11px] font-mono text-[#666]">
            STRICT FIFO: #1 ⬅ #2 ⬅ #3
          </span>
        </div>

        {queue.length === 0 ? (
          <div className="p-12 text-center text-[#666] space-y-3">
            <div className="w-10 h-10 rounded bg-[#161616] border border-[#222] mx-auto flex items-center justify-center text-sm font-mono text-[#444]">
              00
            </div>
            <p className="text-xs font-mono text-[#888] uppercase tracking-wider">The Queue is Empty</p>
            <p className="text-xs text-[#555] max-w-sm mx-auto">
              أرسل فيديوهات أو نصوصاً في محاكي البوت أو اضغط الزر أدناه لتجربة معالجة متتالية تحافظ على الترتيب الأصلي تماماً.
            </p>
            <button
              onClick={onAddBatchTest}
              className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-black rounded text-xs font-semibold tracking-wide transition shadow-sm"
            >
              إضافة 4 عناصر تجريبية بالترتيب
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#1c1c1c]">
            {queue.map((item) => (
              <div
                key={item.id}
                className="p-3.5 sm:p-4 hover:bg-[#141414] transition flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                {/* Left info: Sequence badge + Type + Name */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded bg-[#161616] border border-[#262626] flex flex-col items-center justify-center shrink-0 font-mono">
                    <span className="text-[9px] text-[#555] uppercase leading-none">SEQ</span>
                    <span className="text-xs font-bold text-sky-400 leading-tight">#{item.sequenceNumber}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[#f0f0f0] truncate" dir="ltr">
                        {item.type === 'text' ? `"${item.textContent}"` : item.originalFilename}
                      </span>
                      {item.type === 'video' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-sky-950/30 text-sky-400 px-1.5 py-0.2 rounded border border-sky-800/40">
                          VIDEO
                        </span>
                      )}
                      {item.type === 'text' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-950/30 text-amber-400 px-1.5 py-0.2 rounded border border-amber-800/40">
                          STANDALONE_TEXT
                        </span>
                      )}
                    </div>

                    {/* Processed name if generated */}
                    {item.processedFilename && (
                      <p className="text-xs text-emerald-400 mt-0.5 truncate font-mono" dir="ltr">
                        ↳ الاسم الفعلي: {item.processedFilename}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#666] font-mono flex-wrap">
                      <span>USER: {item.userFirstName}</span>
                      <span>•</span>
                      <span>TARGET: {item.targetChannelTitle}</span>
                      {item.fileSize && (
                        <>
                          <span>•</span>
                          <span>{(item.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Status badge & Action */}
                <div className="flex items-center justify-between md:justify-end gap-3 self-end md:self-center">
                  <div className="text-right">
                    {getStatusBadge(item.status)}
                    <p className="text-[10px] text-[#666] mt-0.5 max-w-[200px] truncate font-mono">
                      {item.statusMessage}
                    </p>
                  </div>

                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1.5 text-[#555] hover:text-rose-400 hover:bg-rose-950/20 rounded transition"
                    title="حذف من الطابور"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
