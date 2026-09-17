import os from 'os';

export interface TransferMetrics {
  id: string;
  type: 'download' | 'upload' | 'benchmark';
  fileName?: string;
  fileSize: number;
  transferredBytes: number;
  startTime: number;
  endTime?: number;
  durationSeconds: number;
  averageMbps: number;
  peakMbps: number;
  workers: number;
  retries: number;
  floodWaits: number;
  errors: number;
  status: 'running' | 'completed' | 'failed';
  errorDetails?: string;
}

export interface SystemTelemetry {
  cpuUsagePercent: number;
  ramRssMb: number;
  ramHeapUsedMb: number;
  ramHeapTotalMb: number;
  systemFreeMemMb: number;
  systemTotalMemMb: number;
  activeTransfers: number;
  activeWorkers: number;
  totalTransferredBytes: number;
  cumulativeDurationSeconds: number;
  overallAverageMbps: number;
  peakMbps: number;
  totalErrors: number;
  totalRetries: number;
  totalFloodWaits: number;
  totalReconnectTimeMs: number;
  totalQueueWaitTimeMs: number;
  recentTransfers: TransferMetrics[];
}

class BenchmarkService {
  private totalTransferredBytes = 0;
  private peakMbps = 0;
  private totalErrors = 0;
  private totalRetries = 0;
  private totalFloodWaits = 0;
  private totalReconnectTimeMs = 0;
  private totalQueueWaitTimeMs = 0;

  private activeTransfers = new Map<string, TransferMetrics>();
  private completedTransfers: TransferMetrics[] = [];

  // CPU measurement state
  private lastCpuUsage = process.cpuUsage();
  private lastCpuCheckTime = Date.now();
  private cachedCpuPercent = 0;

  constructor() {
    // Periodically sample CPU usage
    setInterval(() => {
      this.sampleCpu();
    }, 2000).unref();
  }

  private sampleCpu(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastCpuCheckTime;
    if (elapsedMs < 500) return;

    const diff = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheckTime = now;

    // Total microseconds spent by process across user & system
    const totalMicros = diff.user + diff.system;
    // Available microseconds across all CPU cores in elapsed time
    const cores = os.cpus().length || 1;
    const availableMicros = elapsedMs * 1000 * cores;

    this.cachedCpuPercent = Number(Math.min(100, (totalMicros / availableMicros) * 100).toFixed(1));
  }

  public recordTransferStart(
    id: string,
    type: 'download' | 'upload' | 'benchmark',
    fileSize: number,
    workers: number,
    fileName?: string
  ): void {
    this.activeTransfers.set(id, {
      id,
      type,
      fileName,
      fileSize,
      transferredBytes: 0,
      startTime: Date.now(),
      durationSeconds: 0,
      averageMbps: 0,
      peakMbps: 0,
      workers,
      retries: 0,
      floodWaits: 0,
      errors: 0,
      status: 'running',
    });
  }

  public recordTransferProgress(id: string, transferredBytes: number, currentSpeedMbps?: number): void {
    const transfer = this.activeTransfers.get(id);
    if (!transfer) return;

    transfer.transferredBytes = transferredBytes;
    const now = Date.now();
    transfer.durationSeconds = Math.max(0.1, (now - transfer.startTime) / 1000);
    transfer.averageMbps = Number(
      ((transfer.transferredBytes / (1024 * 1024)) / transfer.durationSeconds).toFixed(2)
    );

    if (currentSpeedMbps && currentSpeedMbps > transfer.peakMbps) {
      transfer.peakMbps = currentSpeedMbps;
    }
    if (currentSpeedMbps && currentSpeedMbps > this.peakMbps) {
      this.peakMbps = currentSpeedMbps;
    }
  }

  public recordRetry(id?: string): void {
    this.totalRetries++;
    if (id && this.activeTransfers.has(id)) {
      this.activeTransfers.get(id)!.retries++;
    }
  }

  public recordFloodWait(id?: string, seconds?: number): void {
    this.totalFloodWaits++;
    if (id && this.activeTransfers.has(id)) {
      this.activeTransfers.get(id)!.floodWaits++;
    }
  }

  public recordError(id?: string, errorMsg?: string): void {
    this.totalErrors++;
    if (id && this.activeTransfers.has(id)) {
      const t = this.activeTransfers.get(id)!;
      t.errors++;
      t.errorDetails = errorMsg;
    }
  }

  public recordReconnectTime(timeMs: number): void {
    this.totalReconnectTimeMs += timeMs;
  }

  public recordQueueWaitTime(timeMs: number): void {
    this.totalQueueWaitTimeMs += timeMs;
  }

  public recordTransferEnd(id: string, success: boolean, finalBytes?: number, errorDetails?: string): TransferMetrics | null {
    const transfer = this.activeTransfers.get(id);
    if (!transfer) return null;

    transfer.endTime = Date.now();
    transfer.durationSeconds = Math.max(0.1, (transfer.endTime - transfer.startTime) / 1000);
    if (finalBytes !== undefined && finalBytes > 0) {
      transfer.transferredBytes = finalBytes;
    }
    transfer.averageMbps = Number(
      ((transfer.transferredBytes / (1024 * 1024)) / transfer.durationSeconds).toFixed(2)
    );
    transfer.status = success ? 'completed' : 'failed';
    if (errorDetails) {
      transfer.errorDetails = errorDetails;
    }

    if (success) {
      this.totalTransferredBytes += transfer.transferredBytes;
    }

    this.activeTransfers.delete(id);

    // Keep up to 20 recent transfers in memory
    this.completedTransfers.unshift({ ...transfer });
    if (this.completedTransfers.length > 20) {
      this.completedTransfers.pop();
    }

    return transfer;
  }

  public getTelemetry(): SystemTelemetry {
    this.sampleCpu();
    const mem = process.memoryUsage();

    let activeWorkers = 0;
    for (const t of this.activeTransfers.values()) {
      activeWorkers += t.workers;
    }

    let cumulativeDuration = 0;
    let totalCompletedBytes = 0;
    for (const t of this.completedTransfers) {
      if (t.status === 'completed') {
        cumulativeDuration += t.durationSeconds;
        totalCompletedBytes += t.transferredBytes;
      }
    }

    const overallAverageMbps = cumulativeDuration > 0
      ? Number(((totalCompletedBytes / (1024 * 1024)) / cumulativeDuration).toFixed(2))
      : 0;

    return {
      cpuUsagePercent: this.cachedCpuPercent,
      ramRssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
      ramHeapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
      ramHeapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(1)),
      systemFreeMemMb: Number((os.freemem() / (1024 * 1024)).toFixed(1)),
      systemTotalMemMb: Number((os.totalmem() / (1024 * 1024)).toFixed(1)),
      activeTransfers: this.activeTransfers.size,
      activeWorkers,
      totalTransferredBytes: this.totalTransferredBytes,
      cumulativeDurationSeconds: Number(cumulativeDuration.toFixed(1)),
      overallAverageMbps,
      peakMbps: this.peakMbps,
      totalErrors: this.totalErrors,
      totalRetries: this.totalRetries,
      totalFloodWaits: this.totalFloodWaits,
      totalReconnectTimeMs: this.totalReconnectTimeMs,
      totalQueueWaitTimeMs: this.totalQueueWaitTimeMs,
      recentTransfers: [...Array.from(this.activeTransfers.values()), ...this.completedTransfers.slice(0, 10)],
    };
  }
}

export const benchmarkService = new BenchmarkService();
