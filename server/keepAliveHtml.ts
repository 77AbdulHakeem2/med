/**
 * Interactive HTML Status & Keep-Alive Dashboard
 * Used by UptimeRobot, Render Liveness Probes, and System Administrators
 */

export interface KeepAliveStats {
  uptimeSeconds: number;
  environment: string;
  botConfigured: boolean;
  botUsername?: string;
  pollingActive: boolean;
  queueLength: number;
  totalPings: number;
  lastPingTime: string;
  memoryUsageMb: number;
}

export function generateKeepAliveHtml(stats: KeepAliveStats): string {
  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m ${s}s`;
  };

  const initialUptimeStr = formatUptime(stats.uptimeSeconds);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>حالة النظام وخدمة البقاء نشطاً | Keep-Alive Monitor</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700&family=Noto+Kufi+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12141c;
      --card-border: #1e2230;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.15);
      --sky: #0ea5e9;
      --sky-glow: rgba(14, 165, 233, 0.15);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', 'Noto Kufi Arabic', sans-serif;
    }
    body {
      background-color: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
      line-height: 1.6;
    }
    .container {
      width: 100%;
      max-width: 780px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      background: var(--emerald-glow);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: var(--emerald);
      margin-bottom: 16px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .header-box {
      text-align: center;
      margin-bottom: 28px;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
      transition: border-color 0.2s;
    }
    .card:hover {
      border-color: #2e364f;
    }
    .card-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .card-value {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      font-family: 'JetBrains Mono', monospace;
    }
    .card-sub {
      font-size: 11px;
      color: var(--emerald);
      margin-top: 4px;
    }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .url-box {
      display: flex;
      gap: 10px;
      margin: 14px 0;
      direction: ltr;
    }
    .url-input {
      flex: 1;
      background: #090a0f;
      border: 1px solid #283046;
      border-radius: 8px;
      padding: 10px 14px;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      outline: none;
    }
    .btn {
      background: var(--sky);
      color: #000;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn:hover {
      background: #38bdf8;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #1e2433;
      color: #e2e8f0;
      border: 1px solid #2e364f;
    }
    .btn-secondary:hover {
      background: #283046;
      color: #fff;
    }
    .steps-list {
      list-style: none;
      padding: 0;
      counter-reset: step-counter;
      margin-top: 14px;
    }
    .steps-list li {
      counter-increment: step-counter;
      position: relative;
      padding-right: 32px;
      margin-bottom: 12px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .steps-list li::before {
      content: counter(step-counter);
      position: absolute;
      right: 0;
      top: 0;
      width: 22px;
      height: 22px;
      background: #1e2433;
      border: 1px solid #334155;
      color: var(--sky);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }
    .ping-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #090a0f;
      border: 1px solid #1e2230;
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 12px;
    }
    .ping-result {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--emerald);
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
    }
    .footer a {
      color: var(--sky);
      text-decoration: none;
    }
    .nav-btn {
      margin-top: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-box">
      <div class="badge">
        <span class="pulse-dot"></span>
        <span>الخادم نشط ويعمل بكفاءة 100% (200 OK)</span>
      </div>
      <h1>مراقبة الاستضافة وحفظ النشاط (Keep-Alive)</h1>
      <p class="subtitle">هذه الصفحة مخصصة لخدمات المراقبة مثل UptimeRobot لإبقاء الاستضافة المجانية تعمل 24/7 دون نوم</p>
    </div>

    <!-- Quick Stats Grid -->
    <div class="grid">
      <div class="card">
        <div class="card-label">⏱️ مدة التشغيل المستمرة (Uptime)</div>
        <div class="card-value" id="uptimeDisplay">${initialUptimeStr}</div>
        <div class="card-sub">● يتجدد تلقائياً كل ثانية</div>
      </div>

      <div class="card">
        <div class="card-label">☁️ بيئة الاستضافة (Host)</div>
        <div class="card-value" style="font-size: 16px; color: #38bdf8;">${stats.environment}</div>
        <div class="card-sub" style="color: #94a3b8;">Node.js Runtime</div>
      </div>

      <div class="card">
        <div class="card-label">🤖 بوت تيليجرام (Telegram Bot)</div>
        <div class="card-value" style="font-size: 15px; color: ${stats.botConfigured ? '#34d399' : '#f87171'};">
          ${stats.botConfigured ? (stats.botUsername ? `@${stats.botUsername}` : 'متصل ونشط') : 'غير متصل'}
        </div>
        <div class="card-sub">${stats.pollingActive ? '⚡ الاستماع الفوري نشط' : '⏸️ الاستماع متوقف'}</div>
      </div>

      <div class="card">
        <div class="card-label">📦 طابور المهام وذاكرة الرام</div>
        <div class="card-value" style="font-size: 16px;">${stats.queueLength} مهام / ${stats.memoryUsageMb} MB</div>
        <div class="card-sub">🚀 محرك الرفع MTProto 16-Worker جاهز</div>
      </div>
    </div>

    <!-- UptimeRobot Direct URL Box -->
    <div class="section-card">
      <div class="section-title">
        <span>🔗</span>
        <span>رابط الاستدعاء لـ UptimeRobot (Keep-Alive URL)</span>
      </div>
      <p style="font-size: 13px; color: var(--text-muted);">
        استخدم هذا الرابط المباشر في UptimeRobot. عند إرسال طلب كل 5 دقائق، لن تقوم استضافة Render بإيقاف التطبيق أو إدخاله في وضع الخمول:
      </p>

      <div class="url-box">
        <input type="text" readonly id="keepAliveUrlInput" class="url-input" value="" />
        <button class="btn" onclick="copyUrl()">
          <span id="copyBtnText">نسخ الرابط</span>
        </button>
      </div>

      <div class="ping-box">
        <button class="btn btn-secondary" onclick="testPing()">
          ⚡ تجربة استجابة الخادم الآن (Test Ping)
        </button>
        <span class="ping-result" id="pingResult">بانتظار الفحص...</span>
      </div>
    </div>

    <!-- Setup Guide Steps -->
    <div class="section-card">
      <div class="section-title">
        <span>📋</span>
        <span>خطوات ضبط UptimeRobot للحفاظ على الاستضافة مجاناً مدى الحياة</span>
      </div>
      <ol class="steps-list">
        <li>سجل حساباً مجانياً على موقع <b>UptimeRobot.com</b>.</li>
        <li>من لوحة التحكم، اضغط على <b>"+ Add New Monitor"</b>.</li>
        <li>اختر <b>Monitor Type</b> واجعله: <b>HTTP(s)</b>.</li>
        <li>اكتب أي اسم يعجبك في <b>Friendly Name</b> (مثلاً: <code>My Telegram Bot</code>).</li>
        <li>في خانة <b>URL (or IP)</b>، الصق الرابط المنسوخ أعلاه <code>https://.../health</code>.</li>
        <li>اضبط <b>Monitoring Interval</b> على <b>5 دقائق</b> (أو 10 دقائق كحد أقصى؛ لأن Render تنام بعد 15 دقيقة خمول).</li>
        <li>اضغط <b>Create Monitor</b>. الآن سيبقى خادم Render مستيقظاً ويعمل بسرعة فائقة 24 ساعة يومياً بدون انقطاع وبالمجان تماماً!</li>
      </ol>
    </div>

    <div class="nav-btn">
      <a href="/" class="btn btn-secondary" style="padding: 12px 24px; font-size: 14px;">
        ⬅️ الانتقال إلى لوحة تحكم التطبيق الرئيسية (Main App)
      </a>
    </div>

    <div class="footer">
      <p>Telegram Auto-Publisher & Media Pipeline • High-Speed Keep-Alive Endpoint</p>
    </div>
  </div>

  <script>
    // Set current absolute URL
    const currentUrl = window.location.origin + '/health';
    document.getElementById('keepAliveUrlInput').value = currentUrl;

    // Live Uptime Clock
    let uptimeSec = ${stats.uptimeSeconds};
    setInterval(() => {
      uptimeSec++;
      const d = Math.floor(uptimeSec / 86400);
      const h = Math.floor((uptimeSec % 86400) / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = Math.floor(uptimeSec % 60);
      document.getElementById('uptimeDisplay').textContent =
        (d > 0 ? d + 'd ' : '') + h + 'h ' + m + 'm ' + s + 's';
    }, 1000);

    // Copy URL
    function copyUrl() {
      const input = document.getElementById('keepAliveUrlInput');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        const btn = document.getElementById('copyBtnText');
        btn.textContent = '✅ تم النسخ!';
        setTimeout(() => { btn.textContent = 'نسخ الرابط'; }, 2500);
      });
    }

    // Interactive Ping Test
    async function testPing() {
      const resultEl = document.getElementById('pingResult');
      resultEl.textContent = 'جاري إرسال الإشارة...';
      const start = performance.now();
      try {
        const res = await fetch('/health?json=true', { cache: 'no-store' });
        const data = await res.json();
        const duration = Math.round(performance.now() - start);
        if (res.ok) {
          resultEl.style.color = '#10b981';
          resultEl.textContent = '🟢 الاستجابة: ' + duration + 'ms (200 OK - الخادم نشط)';
        } else {
          resultEl.style.color = '#f87171';
          resultEl.textContent = '⚠️ استجاب الخادم برمز: ' + res.status;
        }
      } catch (err) {
        resultEl.style.color = '#f87171';
        resultEl.textContent = '❌ تعذر الاتصال بالخادم: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
}
