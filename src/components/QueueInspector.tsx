import React, { useState } from 'react';
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
  Sparkles,
  Wand2,
  RefreshCw,
  X,
  Edit3,
  Check,
  BookOpen,
} from 'lucide-react';
import { QueueItem, AIRenamedItemResult } from '../types';

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
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<AIRenamedItemResult[]>([]);
  const [editedFilenames, setEditedFilenames] = useState<Record<string, string>>({});
  const [applyingAi, setApplyingAi] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const activeProcessing = queue.find(
    (q) => q.status !== 'queued' && q.status !== 'published' && q.status !== 'failed'
  );

  // Trigger AI Batch Renaming analysis
  const handleOpenAiBatchRenamer = async () => {
    setIsAiModalOpen(true);
    setAiLoading(true);
    setAiFeedback(null);
    try {
      const itemsToAnalyze = queue.map((q) => ({
        id: q.id,
        originalFilename: q.originalFilename || (q.textContent ? `${q.textContent.slice(0, 30)}.txt` : 'item.mp4'),
        originalCaption: q.originalCaption,
        duration: q.duration,
        sequenceNumber: q.sequenceNumber,
        fileSize: q.fileSize,
      }));

      const res = await fetch('/api/ai/batch-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAnalyze }),
      });
      const data = await res.json();
      if (data.success && data.results) {
        setAiResults(data.results);
        const map: Record<string, string> = {};
        data.results.forEach((r: AIRenamedItemResult) => {
          map[r.id] = r.formattedFilename;
        });
        setEditedFilenames(map);
      } else {
        setAiFeedback('تعذر تحليل المجموعة بالذكاء الاصطناعي');
      }
    } catch (err: any) {
      setAiFeedback(err.message || 'حدث خطأ في الاتصال بالذكاء الاصطناعي');
    } finally {
      setAiLoading(false);
    }
  };

  // Apply AI renames directly to queue
  const handleApplyAiRenames = async () => {
    if (aiResults.length === 0) return;
    setApplyingAi(true);
    try {
      const renames = aiResults.map((r) => ({
        id: r.id,
        formattedFilename: editedFilenames[r.id] || r.formattedFilename,
        formattedCaption: r.formattedCaption,
        groupingReason: r.groupingReason,
      }));

      const res = await fetch('/api/ai/apply-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames }),
      });
      const data = await res.json();
      if (data.success) {
        setAiFeedback('✅ تم تطبيق التسميات الموحدة على قائمة الانتظار بنجاح!');
        setTimeout(() => {
          setIsAiModalOpen(false);
          setAiFeedback(null);
          // Reload page state
          window.location.reload();
        }, 800);
      }
    } catch (err: any) {
      setAiFeedback('فشل تطبيق التعديلات: ' + err.message);
    } finally {
      setApplyingAi(false);
    }
  };

  // Add realistic multi-part lecture batch for immediate testing
  const handleAddLectureBatchTest = async () => {
    try {
      await fetch('/api/queue/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: queue[0]?.userId || '1001',
          items: [
            {
              type: 'video',
              originalFilename: 'Dr_Mohamed_Sherif_Embryology_Part1_Introduction.mp4',
              originalCaption: 'محاضرة الدكتور محمد شريف في علم الأجنة الجزء الأول',
              fileSize: 45 * 1024 * 1024,
            },
            {
              type: 'video',
              originalFilename: 'dr.mohamed sherif - embryology p2 (somites).mp4',
              originalCaption: 'Part 2 somites and folding',
              fileSize: 52 * 1024 * 1024,
            },
            {
              type: 'video',
              originalFilename: 'Embryology_Part3_Sherif_1080p.mp4',
              originalCaption: 'الجزء الثالث والاخير من مادة Embryology',
              fileSize: 60 * 1024 * 1024,
            },
            {
              type: 'video',
              originalFilename: 'Anatomy_Pelvis_Lecture1_Dr_Ali.mp4',
              originalCaption: 'تشريح الحوض د. علي - محاضرة مستقلة 1',
              fileSize: 39 * 1024 * 1024,
            },
            {
              type: 'video',
              originalFilename: 'dr.ali-anatomy-pelvis-part2.mp4',
              originalCaption: 'الجزء الثاني من تشريح الحوض',
              fileSize: 41 * 1024 * 1024,
            },
          ],
        }),
      });
      window.location.reload();
    } catch (err) {
      console.error(err);
    }
  };

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
      case 'ready_to_publish':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono uppercase tracking-wider bg-amber-950/40 text-amber-300 border border-amber-800/40 animate-pulse">
            <Clock className="w-3 h-3 text-amber-400" />
            WAITING FIFO ORDER ⏸️
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
            onClick={handleOpenAiBatchRenamer}
            disabled={queue.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black rounded text-xs font-semibold tracking-wide transition active:scale-95 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>إعادة التسمية الذكية للدفعة بالذكاء الاصطناعي 🤖</span>
          </button>
          <button
            onClick={handleAddLectureBatchTest}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181818] hover:bg-[#252525] text-amber-300 border border-amber-800/40 rounded text-xs transition"
            title="إضافة دفعة تجريبية من 5 محاضرات تتضمن أجزاء متعددة ومواضيع لاختبار الذكاء الاصطناعي"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>دفعة محاضرات مقسمة (Parts)</span>
          </button>
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
                      {item.type === 'audio' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-emerald-950/30 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-800/40">
                          AUDIO
                        </span>
                      )}
                      {item.type === 'document' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-blue-950/30 text-blue-400 px-1.5 py-0.2 rounded border border-blue-800/40">
                          DOCUMENT
                        </span>
                      )}
                      {item.type === 'text' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-950/30 text-amber-400 px-1.5 py-0.2 rounded border border-amber-800/40">
                          STANDALONE_TEXT
                        </span>
                      )}
                      {item.performer && (
                        <span className="text-[10px] font-mono bg-[#181818] text-emerald-300 px-1.5 py-0.2 rounded border border-[#2a2a2a]">
                          🎤 {item.performer}
                        </span>
                      )}
                      {item.isAiRenamed && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-950/40 text-amber-300 px-1.5 py-0.2 rounded border border-amber-800/50 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                          AI_BATCH_UNIFIED
                        </span>
                      )}
                      {typeof item.sourceMessageId === 'number' && (
                        <span className="text-[10px] font-mono uppercase tracking-wider bg-violet-950/40 text-violet-300 px-1.5 py-0.2 rounded border border-violet-800/50">
                          SRC_MSG #{item.sourceMessageId}
                        </span>
                      )}
                    </div>

                    {/* Processed name if generated */}
                    {item.processedFilename && (
                      <p className="text-xs text-emerald-400 mt-0.5 truncate font-mono" dir="ltr">
                        ↳ الاسم الفعلي: {item.processedFilename}
                      </p>
                    )}

                    {item.aiGroupingReason && (
                      <p className="text-[11px] text-amber-300/80 mt-0.5 font-sans flex items-center gap-1">
                        <span>🤖 {item.aiGroupingReason}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#666] font-mono flex-wrap">
                      <span>USER: {item.userFirstName}</span>
                      {item.sourceChannelTitle && (
                        <>
                          <span>•</span>
                          <span className="text-violet-400">SRC: {item.sourceChannelTitle}</span>
                        </>
                      )}
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

      {/* AI Batch Renamer Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-[#121212] border border-[#282828] w-full max-w-4xl max-h-[90vh] rounded-xl flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#222] flex items-center justify-between bg-[#161616]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#f0f0f0] font-sans">
                    التحليل والتنسيق الذكي لدفعة الملفات بالذكاء الاصطناعي
                  </h3>
                  <p className="text-[11px] text-[#777] font-mono">
                    AI_BATCH_RELATIONSHIP_ANALYSIS & UNIFIED_NAMING
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAiModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#1e1e1e] hover:bg-[#282828] text-[#888] hover:text-[#eee] flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans">
              {aiLoading ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center animate-spin">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-semibold text-[#ddd]">
                    جاري استدعاء الذكاء الاصطناعي وتحليل أسماء الفيديوهات...
                  </h4>
                  <p className="text-xs text-[#777] max-w-md mx-auto">
                    يتم فحص أسماء الملفات والأوصاف كدفعة واحدة لفهم المواضيع المشتركة والأجزاء (Parts) وتوحيد الصياغة دون أي اختلاق.
                  </p>
                </div>
              ) : aiFeedback && !aiFeedback.startsWith('✅') ? (
                <div className="p-4 bg-rose-950/30 border border-rose-800/40 rounded-lg text-rose-300 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{aiFeedback}</span>
                </div>
              ) : aiResults.length === 0 ? (
                <div className="py-12 text-center text-[#777] text-xs font-mono">
                  لا توجد ملفات في قائمة الانتظار للتحليل.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Philosophy summary banner */}
                  <div className="bg-[#181818] border border-amber-900/40 p-3.5 rounded-lg flex items-start gap-3">
                    <Wand2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-[#ccc] space-y-1 leading-relaxed">
                      <span className="font-semibold text-amber-300 block">
                        نتيجة التحليل الذكي للدفعة:
                      </span>
                      <p>
                        تم استخراج الدكتور والموضوع ورقم الجزء من الأسماء الأصلية فقط، وتوحيد صياغة الموضوع للأجزاء المتطابقة. يمكنك مراجعة وتعديل أي اسم نهائي أدناه قبل تطبيقه على الطابور.
                      </p>
                    </div>
                  </div>

                  {/* Batch Items Review List */}
                  <div className="space-y-2.5">
                    {aiResults.map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-[#141414] border border-[#242424] rounded-lg p-3.5 space-y-2.5 hover:border-[#333] transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f1f1f] pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-[#202020] text-sky-400 px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-mono text-[#888] truncate max-w-md" dir="ltr">
                              {item.originalFilename}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                            {item.doctor && (
                              <span className="bg-sky-950/30 text-sky-400 border border-sky-800/40 px-2 py-0.5 rounded">
                                د: {item.doctor}
                              </span>
                            )}
                            {item.topic && (
                              <span className="bg-emerald-950/30 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded">
                                موضوع: {item.topic}
                              </span>
                            )}
                            {item.part && (
                              <span className="bg-amber-950/30 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded">
                                جزء: {item.part}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Editable Final Name Input */}
                        <div>
                          <label className="text-[11px] font-mono text-[#aaa] block mb-1">
                            الاسم المنسق المعتمد (قابل للتعديل المباشر):
                          </label>
                          <input
                            type="text"
                            value={editedFilenames[item.id] || ''}
                            onChange={(e) =>
                              setEditedFilenames({
                                ...editedFilenames,
                                [item.id]: e.target.value,
                              })
                            }
                            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-emerald-400 font-mono focus:outline-none focus:border-emerald-500/60"
                            dir="auto"
                          />
                        </div>

                        {item.formattedCaption && (
                          <div className="bg-[#0c0c0c] p-2.5 rounded border border-rose-950/30 text-[10px] font-mono text-[#aaa] whitespace-pre-line leading-relaxed" dir="auto">
                            <span className="text-rose-400/90 font-semibold block mb-1 text-[10px] flex items-center gap-1">
                              <span>📝 الكابشن وفق النمط المعتمد:</span>
                            </span>
                            {item.formattedCaption.replace(/<[^>]*>?/gm, '')}
                          </div>
                        )}

                        {item.groupingReason && (
                          <div className="text-[11px] text-[#777] font-sans flex items-center gap-1.5">
                            <span className="text-amber-400 font-mono">REASON:</span>
                            <span>{item.groupingReason}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-[#222] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161616]">
              {aiFeedback ? (
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{aiFeedback}</span>
                </span>
              ) : (
                <span className="text-xs text-[#777] font-mono">
                  {aiResults.length} عنصر جاهز للاعتماد
                </span>
              )}

              <div className="flex items-center gap-2 self-end">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-4 py-2 bg-[#202020] hover:bg-[#2a2a2a] text-[#aaa] hover:text-[#eee] rounded text-xs font-mono transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleApplyAiRenames}
                  disabled={applyingAi || aiResults.length === 0}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded text-xs font-mono transition flex items-center gap-1.5 shadow-sm"
                >
                  {applyingAi ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>APPLYING_RENAMES...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تطبيق التسميات الموحدة على قائمة الانتظار</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
