/**
 * Standalone Testing Server for Israeli ID Vision OCR & Validation
 *
 * Runs an interactive web tester and REST API on a dedicated port.
 *
 * Endpoints:
 *   GET  /                        - Interactive Web UI (drag & drop, camera, instant verification)
 *   GET  /health                  - Server & Model health status
 *   POST /api/id/verify           - Vision OCR & Checksum Verification API
 *   POST /api/id/validate-checksum- Direct Luhn Modulo-10 checksum calculation
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { processGuestIDDocument } from './idOcrService.js';
import { validateIsraeliId } from './israeliIdValidator.js';

const PORT = Number(process.env.ID_OCR_PORT || 4088);
const DEFAULT_URL = (process.env.QWEN_OCR_URL || process.env.OLLAMA_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.QWEN_OCR_MODEL || process.env.OLLAMA_MODEL || 'Julioa/Qwen3.8-27B-UD-Q3_K_XL:latest';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limitBytes = 25 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limitBytes) {
        req.destroy();
        reject(new Error('Payload too large (max 25MB)'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const HTML_UI = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResortOS — אימות וזיהוי תעודות זהות ישראליות</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --card-border: #30363d;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --text: #f0f6fc;
      --text-muted: #8b949e;
      --code-bg: #0b0e14;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Assistant', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      min-height: 100vh;
    }
    .container { max-width: 1050px; margin: 0 auto; }
    header {
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
    }
    h1 { font-size: 1.8rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }
    .badge {
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 9999px;
      background: var(--card-border);
      color: var(--text-muted);
    }
    .badge.online { background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-title { font-size: 1.15rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .dropzone {
      border: 2px dashed var(--card-border);
      border-radius: 12px;
      padding: 32px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.01);
      position: relative;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--accent);
      background: rgba(37, 99, 235, 0.05);
    }
    .dropzone input { display: none; }
    .dropzone-icon { font-size: 2.5rem; margin-bottom: 8px; }
    .dropzone-text { font-size: 0.95rem; color: var(--text-muted); }
    .preview-box {
      max-height: 260px;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      justify-content: center;
      background: var(--code-bg);
      border: 1px solid var(--card-border);
    }
    .preview-box img { max-width: 100%; max-height: 260px; object-fit: contain; }
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .btn:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .config-panel {
      font-size: 0.85rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      background: var(--code-bg);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
    }
    .config-field { display: flex; flex-direction: column; gap: 4px; }
    .config-field label { color: var(--text-muted); }
    .config-field input {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 6px 10px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
    }
    .result-banner {
      padding: 14px 18px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 700;
      font-size: 1.05rem;
    }
    .result-banner.success { background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }
    .result-banner.danger { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger); }
    .result-banner.warning { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning); }
    .result-list { display: flex; flex-direction: column; gap: 10px; }
    .result-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: var(--code-bg);
      border-radius: 8px;
      border: 1px solid var(--card-border);
    }
    .result-label { color: var(--text-muted); font-size: 0.9rem; }
    .result-value { font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 6px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .raw-box {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 220px;
      overflow-y: auto;
      color: #9cdcfe;
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .sample-bar { display: flex; gap: 8px; align-items: center; font-size: 0.85rem; color: var(--text-muted); }
    .sample-btn {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .sample-btn:hover { border-color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>🪪 ResortOS ID Verify Engine <span class="badge online" id="statusBadge">Active :${PORT}</span></h1>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 4px;">
          סביבת בדיקות מקומית למודל Vision: חילוץ פרטי תעודות רשמיות, סינון כרטיסים לא מורשים ואימות ספרת ביקורת Modulo 10
        </p>
      </div>
      <div id="healthMetric" style="text-align: left; font-size: 0.85rem; color: var(--text-muted);">
        <div>Backend: <span class="mono" style="color: var(--success);">Online</span></div>
        <div id="latencyLabel">Endpoint: Qwen 3.8 / Ollama</div>
      </div>
    </header>

    <div class="grid">
      <!-- Input Panel -->
      <div class="card">
        <div class="card-title">📸 העלאת תמונה לבדיקה</div>

        <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
          <input type="file" id="fileInput" accept="image/*">
          <div class="dropzone-icon">📷</div>
          <div style="font-weight: 700; margin-bottom: 4px;">גרור תמונה לכאן או לחץ לבחירת קובץ</div>
          <div class="dropzone-text">תומך בת"ז ישראלית (ביומטרית/כחולה), רישיון נהיגה, דרכון, או כרטיסים לבדיקת סינון</div>
        </div>

        <div class="preview-box" id="previewBox" style="display: none;">
          <img id="previewImg" src="" alt="תצוגה מקדימה">
        </div>

        <div class="config-panel">
          <div class="config-field" style="grid-column: span 2;">
            <label style="display: flex; justify-content: space-between;">
              <span>⚡ מנוע OCR (Engine)</span>
              <span id="engineBadge" style="color: var(--success); font-size: 0.75rem;">Neural Engine Active (~50ms)</span>
            </label>
            <select id="engineSelect" style="background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text); padding: 8px 10px; border-radius: 6px; font-family: inherit; font-size: 0.9rem;" onchange="toggleEngineFields()">
              <option value="auto" selected>⚡ Auto (Apple Silicon Vision + Fallback) — מומלץ, מיידי ודטרמיניסטי</option>
              <option value="apple-vision">🍎 Apple Silicon Vision (Native OCR ~50ms, Offline, No GPU needed)</option>
              <option value="qwen">🤖 Qwen 3.8 / OpenAI Vision API (Mac Studio / Local LAN)</option>
            </select>
          </div>
          <div class="config-field" id="endpointField">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label>API Endpoint (Mac Studio / Qwen)</label>
              <button type="button" class="sample-btn" style="padding: 2px 6px; font-size: 0.72rem;" onclick="testConnection()">בדוק חיבור 🔌</button>
            </div>
            <input type="text" id="endpointUrl" value="${DEFAULT_URL}">
          </div>
          <div class="config-field" id="modelField">
            <label>Model Name</label>
            <input type="text" id="modelName" value="${DEFAULT_MODEL}">
          </div>
        </div>

        <button class="btn" id="verifyBtn" onclick="runVerification()" disabled>
          <span>🚀 בצע אימות תעודה</span>
        </button>


        <div class="sample-bar">
          <span>בדיקת אלגוריתם ספרת ביקורת:</span>
          <button class="sample-btn" onclick="quickCheckId('012345674')">ת"ז תקינה (012345674)</button>
          <button class="sample-btn" onclick="quickCheckId('012345675')">שגויה (012345675)</button>
        </div>
      </div>

      <!-- Results Panel -->
      <div class="card">
        <div class="card-title">📋 תוצאות פענוח ואימות (OCR & Validation)</div>

        <div id="emptyState" style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 10px;">🔍</div>
          <div>העלה תמונה ולחץ "בצע אימות תעודה" כדי לצפות בתוצאות הפענוח והוולידציה</div>
        </div>

        <div id="loadingState" style="display: none; text-align: center; padding: 60px 20px;">
          <div class="spinner" style="width: 32px; height: 32px; margin: 0 auto 16px;"></div>
          <div style="font-weight: 700;">שולח תמונה למודל Qwen Vision ומפענח שדות...</div>
          <div id="elapsedTimer" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 6px;">0 ms</div>
        </div>

        <div id="resultsContent" style="display: none; display: flex; flex-direction: column; gap: 14px;">
          <div id="resultBanner" class="result-banner success">
            <span id="bannerText">תעודה אומתה בהצלחה ✅</span>
            <span id="bannerTime" class="mono" style="font-size: 0.85rem;"></span>
          </div>

          <div class="result-list">
            <div class="result-row">
              <span class="result-label">סיווג מסמך (Classification)</span>
              <span class="result-value" id="resDocType">-</span>
            </div>
            <div class="result-row">
              <span class="result-label">תעודה רשמית מוכרת</span>
              <span class="result-value" id="resIsOfficial">-</span>
            </div>
            <div class="result-row">
              <span class="result-label">מספר תעודה / דרכון</span>
              <span class="result-value mono" id="resIdNumber" style="font-size: 1.15rem; letter-spacing: 1px;">-</span>
            </div>
            <div class="result-row">
              <span class="result-label">ולידציית ספרת ביקורת (Luhn Modulo-10)</span>
              <span class="result-value" id="resChecksum">-</span>
            </div>
            <div class="result-row">
              <span class="result-label">שם מלא</span>
              <span class="result-value" id="resFullName">-</span>
            </div>
            <div class="result-row">
              <span class="result-label">תאריך לידה</span>
              <span class="result-value mono" id="resBirthDate">-</span>
            </div>
            <div class="result-row">
              <span class="result-label">רמת ביטחון מודל (Confidence)</span>
              <span class="result-value mono" id="resConfidence">-</span>
            </div>
            <div class="result-row" id="rejectionRow" style="display: none; background: var(--danger-bg); border-color: var(--danger);">
              <span class="result-label" style="color: var(--danger);">סיבת דחייה</span>
              <span class="result-value" id="resRejection" style="color: var(--danger); font-size: 0.9rem;">-</span>
            </div>
          </div>

          <div>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; display: flex; justify-content: space-between;">
              <span>פלט גולמי מהמודל (Raw JSON Output):</span>
              <button class="sample-btn" onclick="copyRaw()">העתק JSON</button>
            </div>
            <pre class="raw-box" id="rawOutput"></pre>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentBase64 = null;
    let currentMime = 'image/jpeg';
    let timerInterval = null;

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const previewBox = document.getElementById('previewBox');
    const previewImg = document.getElementById('previewImg');
    const verifyBtn = document.getElementById('verifyBtn');

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length) handleFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      if (!file.type.startsWith('image/')) {
        alert('אנא בחר קובץ תמונה תקין');
        return;
      }
      currentMime = file.type || 'image/jpeg';
      const reader = new FileReader();
      reader.onload = (e) => {
        currentBase64 = e.target.result;
        previewImg.src = currentBase64;
        previewBox.style.display = 'flex';
        verifyBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }

    async function runVerification() {
      if (!currentBase64) return;

      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('resultsContent').style.display = 'none';
      document.getElementById('loadingState').style.display = 'block';
      verifyBtn.disabled = true;

      const start = Date.now();
      timerInterval = setInterval(() => {
        document.getElementById('elapsedTimer').textContent = (Date.now() - start) + ' ms';
      }, 50);

      const endpointUrl = document.getElementById('endpointUrl').value.trim();
      const modelName = document.getElementById('modelName').value.trim();
      const engine = document.getElementById('engineSelect').value;

      try {
        const res = await fetch('/api/id/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: currentBase64,
            mimeType: currentMime,
            endpointUrl,
            modelName,
            engine
          })
        });
        const data = await res.json();
        renderResults(data);
      } catch (err) {

        renderResults({
          success: false,
          is_valid_official_id: false,
          document_type: 'unrecognized',
          id_number: '',
          first_name: '',
          last_name: '',
          confidence: 0,
          rejection_reason: 'Network/server error: ' + err.message,
          latency_ms: Date.now() - start
        });
      } finally {
        clearInterval(timerInterval);
        document.getElementById('loadingState').style.display = 'none';
        verifyBtn.disabled = false;
      }
    }

    function renderResults(data) {
      const resultsContent = document.getElementById('resultsContent');
      const banner = document.getElementById('resultBanner');
      const bannerText = document.getElementById('bannerText');
      const bannerTime = document.getElementById('bannerTime');

      resultsContent.style.display = 'flex';
      bannerTime.textContent = (data.latency_ms || 0) + ' ms';

      if (data.success) {
        banner.className = 'result-banner success';
        bannerText.textContent = 'תעודה רשמית אומתה בהצלחה ✅';
      } else if (!data.is_valid_official_id) {
        banner.className = 'result-banner danger';
        bannerText.textContent = 'נדחה: כרטיס שאינו תעודה רשמית ⛔';
      } else if (data.is_checksum_valid === false) {
        banner.className = 'result-banner warning';
        bannerText.textContent = 'שגיאה: ספרת ביקורת ת"ז שגויה ⚠️';
      } else {
        banner.className = 'result-banner danger';
        bannerText.textContent = 'אימות התעודה נכשל ❌';
      }

      const docLabels = {
        'israeli_id_biometric': 'תעודת זהות ביומטרית ישראלית 🪪',
        'israeli_id_blue': 'תעודת זהות ישראלית (כחולה) 📄',
        'israeli_driver_license': 'רישיון נהיגה ישראלי 🚗',
        'passport': 'דרכון בינלאומי / ישראלי ✈️',
        'unrecognized': 'לא מוכר / כרטיס לא רשמי ❓'
      };
      document.getElementById('resDocType').textContent = docLabels[data.document_type] || data.document_type;
      document.getElementById('resIsOfficial').innerHTML = data.is_valid_official_id
        ? '<span style="color: var(--success);">כן (מסמך ממשלתי רשמי) ✅</span>'
        : '<span style="color: var(--danger);">לא (כרטיס מועדון/אשראי/אחר) ❌</span>';

      document.getElementById('resIdNumber').textContent = data.id_number || '(ריק)';

      const checksumEl = document.getElementById('resChecksum');
      if (data.is_checksum_valid === true) {
        checksumEl.innerHTML = '<span style="color: var(--success);">תקינה ✅ (ספרת ביקורת תואמת)</span>';
      } else if (data.is_checksum_valid === false) {
        checksumEl.innerHTML = '<span style="color: var(--danger);">שגויה ❌ (Luhn Failed)</span>';
      } else {
        checksumEl.innerHTML = '<span style="color: var(--text-muted);">לא חל (דרכון בינלאומי) ⚪</span>';
      }

      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || '(לא זוהה)';
      document.getElementById('resFullName').textContent = fullName;
      document.getElementById('resBirthDate').textContent = data.birth_date || '(לא זוהה)';
      document.getElementById('resConfidence').textContent = Math.round((data.confidence || 0) * 100) + '%';

      const rejRow = document.getElementById('rejectionRow');
      if (data.rejection_reason) {
        rejRow.style.display = 'flex';
        document.getElementById('resRejection').textContent = data.rejection_reason;
      } else {
        rejRow.style.display = 'none';
      }

      document.getElementById('rawOutput').textContent = data.raw_output || JSON.stringify(data, null, 2);
    }

    async function quickCheckId(sampleId) {
      const res = await fetch('/api/id/validate-checksum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sampleId })
      });
      const data = await res.json();
      alert('בדיקת ת"ז ' + sampleId + ':\\nתקין: ' + (data.isValid ? 'כן ✅' : 'לא ❌') +
            '\\nספרת ביקורת שהתקבלה: ' + data.checkDigit +
            '\\nספרת ביקורת צפויה: ' + data.calculatedCheckDigit +
            (data.error ? ('\\nהודעה: ' + data.error) : ''));
    }

    function toggleEngineFields() {
      const engine = document.getElementById('engineSelect').value;
      const endpointField = document.getElementById('endpointField');
      const modelField = document.getElementById('modelField');
      const badge = document.getElementById('engineBadge');
      if (engine === 'apple-vision') {
        endpointField.style.opacity = '0.35';
        modelField.style.opacity = '0.35';
        badge.textContent = 'Native Apple Silicon Vision (Local ~50ms, Offline)';
        badge.style.color = 'var(--success)';
      } else if (engine === 'qwen') {
        endpointField.style.opacity = '1';
        modelField.style.opacity = '1';
        badge.textContent = 'Mac Studio / LLM Vision Endpoint';
        badge.style.color = 'var(--warning)';
      } else {
        endpointField.style.opacity = '1';
        modelField.style.opacity = '1';
        badge.textContent = 'Neural Engine Active (~50ms)';
        badge.style.color = 'var(--success)';
      }
    }

    async function testConnection() {
      const endpoint = document.getElementById('endpointUrl').value.trim();
      const model = document.getElementById('modelName').value.trim();
      const btn = event.target;
      const origText = btn.textContent;
      btn.textContent = 'בודק...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/id/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpointUrl: endpoint, modelName: model })
        });
        const data = await res.json();
        if (data.ok) {
          alert('חיבור הצליח! ה-Endpoint זמין ברשת ✅\\n' + JSON.stringify(data.data || data, null, 2));
        } else {
          alert('שגיאת חיבור ל-Endpoint ❌:\\n' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        alert('שגיאת רשת בבדיקת חיבור ❌:\\n' + e.message);
      } finally {
        btn.textContent = origText;
        btn.disabled = false;
      }
    }
  </script>

</body>
</html>
`;

export function startIdOcrServer(port = PORT) {
  const server = createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    try {
      // 1. Health check
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
        return sendJson(res, 200, {
          ok: true,
          service: 'resortos-israeli-id-ocr',
          port,
          defaultEndpoint: DEFAULT_URL,
          defaultModel: DEFAULT_MODEL,
          uptime_seconds: Math.round(process.uptime()),
        });
      }

      // 2. Interactive Web UI
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_UI);
        return;
      }

      // 3. Verify Document API
      if (req.method === 'POST' && url.pathname === '/api/id/verify') {
        const raw = await readBody(req);
        if (!raw) return sendJson(res, 400, { error: 'Empty request body' });

        const body = JSON.parse(raw);
        const image = body.image || body.imageBase64;
        if (!image) {
          return sendJson(res, 400, { error: 'Missing image or imageBase64 field' });
        }

        const result = await processGuestIDDocument(
          {
            imageBase64: image,
            mimeType: body.mimeType || 'image/jpeg',
          },
          {
            endpointUrl: body.endpointUrl || DEFAULT_URL,
            modelName: body.modelName || DEFAULT_MODEL,
            engine: body.engine || 'auto',
          }
        );

        return sendJson(res, 200, result);
      }

      // 3.5 Test Model Connection API
      if (req.method === 'POST' && url.pathname === '/api/id/test-connection') {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const ep = (body.endpointUrl || DEFAULT_URL).replace(/\/$/, '');
        const target = ep.endsWith('/v1') ? `${ep}/models` : `${ep}/api/tags`;
        try {
          const resp = await fetch(target, { signal: AbortSignal.timeout(5000) });
          if (!resp.ok) {
            return sendJson(res, 200, { ok: false, error: `HTTP ${resp.status}: ${resp.statusText}` });
          }
          const data = await resp.json();
          return sendJson(res, 200, { ok: true, data });
        } catch (e: any) {
          return sendJson(res, 200, { ok: false, error: e?.message || String(e) });
        }
      }


      // 4. Standalone Luhn Checksum validation helper
      if (req.method === 'POST' && url.pathname === '/api/id/validate-checksum') {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const result = validateIsraeliId(body.id || body.id_number);
        return sendJson(res, 200, result);
      }

      // 404 Fallback
      sendJson(res, 404, { error: 'Not found' });
    } catch (err: any) {
      console.error('[ID OCR SERVER ERROR]', err);
      sendJson(res, 500, { error: err?.message || String(err) });
    }
  });

  server.listen(port, () => {
    console.log('================================================================');
    console.log(`🪪  ResortOS Israeli ID Vision OCR Server is LIVE!`);
    console.log(`🌐  Interactive Web Dashboard: http://localhost:${port}/`);
    console.log(`📡  Verify API Endpoint:       http://localhost:${port}/api/id/verify`);
    console.log(`🤖  Connected Model:           ${DEFAULT_MODEL}`);
    console.log(`🔗  Backend OCR Engine:        ${DEFAULT_URL}`);
    console.log('================================================================');
  });

  return server;
}

// Auto-run if executed directly via `tsx idOcrServer.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  startIdOcrServer();
}
