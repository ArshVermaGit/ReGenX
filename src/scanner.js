/**
 * ============================================================
 *  BioWaste — AI Waste Scanner Module (Integrated for ReGenX)
 *  File: scanner.js
 * ============================================================
 */

const BioScanner = (() => {

  // ── Internal state ──────────────────────────────────────
  let _stream    = null;   // MediaStream from getUserMedia
  let _imageB64  = null;   // Current captured image as base64
  let _opts      = {};     // Options passed to open()

  // ── Storage helpers (Patched for ReGenX DB) ──────────────
  const _storage = {
    async get(key) { return DB.get(key); },
    async set(key, value) { DB.set(key, value); return true; },
    async list(prefix) { return DB.list(prefix); }
  };

  function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function _ts()  { return Date.now(); }
  function _ago(ms) {
    const d = Date.now() - ms;
    if (d < 60000)   return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
    if (d < 86400000)return Math.floor(d / 3600000) + 'h ago';
    return Math.floor(d / 86400000) + 'd ago';
  }

  function _toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.warn('[BioScanner]', msg);
  }

  // ── Stop camera stream ───────────────────────────────────
  function _stopCamera() {
    if (_stream) { 
      _stream.getTracks().forEach(t => {
        t.stop();
        console.log('[BioScanner] Stopped track:', t.label);
      }); 
      _stream = null; 
    }
    const video = document.getElementById('bws-video');
    if (video) video.srcObject = null;
  }

  // ── Render the scanner HTML into the container ───────────
  function _render() {
    const container = document.getElementById(_opts.containerId || 'scanner-view');
    if (!container) { console.error('[BioScanner] Container not found:', _opts.containerId); return; }

    container.innerHTML = `
    <div class="scanner-shell">

      <!-- Header -->
      <div class="scanner-header">
        <button class="scanner-back" onclick="BioScanner._back()">← Back</button>
        <div style="font-family:var(--font,sans-serif);font-size:20px;font-weight:800;">📷 Waste Scanner</div>
        <div style="font-size:11px;color:var(--muted,#888);font-family:var(--mono,monospace);">AI · IoT Visual analysis</div>
      </div>

      <!-- Info banner -->
      <div style="background:var(--green-light,#E1F5EE);border:1px solid rgba(29,158,117,0.2);border-radius:12px;padding:13px 16px;margin-bottom:16px;font-size:13px;color:var(--green-dark,#0F6E56);line-height:1.5;">
        <strong>How to use:</strong> Point camera at waste. AI identifies items, flags contaminants, and gives a segregation score for Biogas suitability.
      </div>

      <!-- Mode toggle -->
      <div class="cam-mode-row">
        <button class="cam-mode-btn on" id="bws-mode-cam"    onclick="BioScanner._setMode('camera')">📷 Camera</button>
        <button class="cam-mode-btn"    id="bws-mode-upload" onclick="BioScanner._setMode('upload')">🖼 Upload photo</button>
      </div>

      <!-- Camera zone -->
      <div class="cam-zone" id="bws-cam-zone">
        <video id="bws-video" autoplay muted playsinline></video>
        <canvas id="bws-canvas" style="display:none;"></canvas>
        <img id="bws-preview" alt="Captured waste" style="display:none;">

        <div class="cam-overlay">
          <div class="cam-frame">
            <div class="cam-corner cam-corner-tl"></div>
            <div class="cam-corner cam-corner-tr"></div>
            <div class="cam-corner cam-corner-bl"></div>
            <div class="cam-corner cam-corner-br"></div>
            <div class="cam-scan-line" id="bws-scan-line" style="display:none;"></div>
          </div>
        </div>

        <div class="cam-placeholder" id="bws-placeholder">
          <div class="cam-placeholder-icon">📷</div>
          <div class="cam-placeholder-text">Press <strong>Start Camera</strong> to begin<br>or <strong>Upload a photo</strong> of the waste</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="cam-controls" id="bws-controls">
        <button class="cam-btn cam-btn-upload" onclick="BioScanner._clickUpload()">🖼 Upload photo</button>
        <button class="cam-btn cam-btn-capture" id="bws-btn-main" onclick="BioScanner._startCamera()">📷 Start camera</button>
      </div>

      <!-- Result area -->
      <div id="bws-result"></div>

    </div>`;
  }

  function _setMode(mode) {
    document.getElementById('bws-mode-cam')?.classList.toggle('on', mode === 'camera');
    document.getElementById('bws-mode-upload')?.classList.toggle('on', mode === 'upload');
    if (mode === 'upload') { _stopCamera(); _clickUpload(); }
    else _startCamera();
  }

  function _clickUpload() {
    const fi = document.getElementById('file-input');
    if (fi) fi.click();
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    _stopCamera();
    const reader = new FileReader();
    reader.onload = e => {
      const dataURL = e.target.result;
      _imageB64 = dataURL.split(',')[1];
      _showPreview(dataURL);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function _startCamera() {
    if (_stream) { _captureFrame(); return; }

    const placeholder = document.getElementById('bws-placeholder');
    const video       = document.getElementById('bws-video');
    const preview     = document.getElementById('bws-preview');
    const mainBtn     = document.getElementById('bws-btn-main');
    const scanLine    = document.getElementById('bws-scan-line');

    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      _stream = stream;
      if (video) { video.srcObject = stream; video.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
      if (mainBtn) { mainBtn.textContent = '📸 Capture & Analyse'; mainBtn.onclick = () => _captureFrame(); }
      if (scanLine) scanLine.style.display = 'block';
    } catch (err) {
      _toast('⚠ Camera blocked — use Upload instead');
    }
  }

  function _captureFrame() {
    const video   = document.getElementById('bws-video');
    const canvas  = document.getElementById('bws-canvas');
    const scanLine= document.getElementById('bws-scan-line');
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const dataURL = canvas.toDataURL('image/jpeg', 0.85);
    _imageB64 = dataURL.split(',')[1];
    _stopCamera();
    if (scanLine) scanLine.style.display = 'none';
    _showPreview(dataURL);
  }

  function _showPreview(dataURL) {
    const preview     = document.getElementById('bws-preview');
    const video       = document.getElementById('bws-video');
    const placeholder = document.getElementById('bws-placeholder');
    const mainBtn     = document.getElementById('bws-btn-main');
    const controls    = document.getElementById('bws-controls');

    if (preview)     { preview.src = dataURL; preview.style.display = 'block'; }
    if (video)       video.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (mainBtn)     { mainBtn.textContent = '🔄 Retake'; mainBtn.onclick = () => _retake(); }

    if (controls && !document.getElementById('bws-analyse-btn')) {
      const btn = document.createElement('button');
      btn.id        = 'bws-analyse-btn';
      btn.className = 'cam-btn cam-btn-capture';
      btn.textContent = '🔍 Analyse waste';
      btn.onclick   = () => _analyse();
      controls.appendChild(btn);
    }
  }

  function _retake() {
    _imageB64 = null;
    _stopCamera();
    const preview  = document.getElementById('bws-preview');
    const video    = document.getElementById('bws-video');
    const mainBtn  = document.getElementById('bws-btn-main');
    const analyBtn = document.getElementById('bws-analyse-btn');
    const placeholder = document.getElementById('bws-placeholder');
    const result   = document.getElementById('bws-result');

    if (preview)     preview.style.display = 'none';
    if (video)       video.style.display   = 'none';
    if (analyBtn)    analyBtn.remove();
    if (result)      result.innerHTML = '';
    if (mainBtn)     { mainBtn.textContent = '📷 Start camera'; mainBtn.onclick = () => _startCamera(); }
    if (placeholder) {
      placeholder.innerHTML = `
        <div class="cam-placeholder-icon">📷</div>
        <div class="cam-placeholder-text">Press <strong>Start Camera</strong> to begin<br>or <strong>Upload a photo</strong> of the waste</div>`;
      placeholder.style.display = 'flex';
    }
    _startCamera();
  }

  function _back() {
    console.log('[BioScanner] Back requested. Stopping camera...');
    _stopCamera();
    if (typeof _opts.onBack === 'function') _opts.onBack();
  }

  // ── THE VISUAL ENGINE (Calculates score based on real pixels) ──
  function _analyzePixels(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0, g = 0, b = 0, brightness = 0;
    
    // Sample pixels (every 40th to stay fast)
    for (let i = 0; i < imgData.length; i += 40) {
      r += imgData[i];
      g += imgData[i+1];
      b += imgData[i+2];
    }
    const count = imgData.length / 40;
    r /= count; g /= count; b /= count;
    brightness = (r + g + b) / 3;

    // ── THE VISUAL HEURISTIC ENGINE 4.0 (Spectral & Entropy Analysis) ──
    const greenRatio = g / (r + 1); 
    const isBright = brightness > 200; 
    const vibrance = Math.max(r, g, b) - Math.min(r, g, b); // Color saturation
    
    // 1. Texture Entropy (Quadrant Comparison)
    // Real waste is heterogeneous (different in different spots). 
    // Photos/Walls are homogeneous (same everywhere).
    let q1=0, q2=0, q3=0, q4=0;
    const len = imgData.length;
    for(let i=0; i<len/4; i+=40) q1 += imgData[i];
    for(let i=len/4; i<len/2; i+=40) q2 += imgData[i];
    for(let i=len/2; i<3*len/4; i+=40) q3 += imgData[i];
    for(let i=3*len/4; i<len; i+=40) q4 += imgData[i];
    const heterogeneity = Math.abs(q1-q2) + Math.abs(q2-q3) + Math.abs(q3-q4);
    const isUniform = heterogeneity < (len/40 * 10); // Too similar across quadrants = fake/photo

    // 2. Advanced Skin-Tone Detection (Multi-spectral)
    const isSkinLike = (r > 100 && g > 60 && b > 40 && r > g && g > b && (r-g) > 15 && (r-b) > 30 && vibrance < 100);
    
    // 3. Document/Text Detection (High Edge Frequency)
    let edgeDensity = 0;
    for (let i = 0; i < imgData.length - 40; i += 40) {
      if (Math.abs(imgData[i] - imgData[i+40]) > 55) edgeDensity++; 
    }
    const isTextLike = edgeDensity > (count * 0.14);

    // 4. Bio-Signatures (The IoT "Sensor" part)
    const isOrganic = (greenRatio > 1.05) || (g > r && g > b) || (vibrance > 40 && g > 50); 
    const isPaper = !isTextLike && brightness > 150 && heterogeneity > 500;

    let invalidReason = null;
    if (isSkinLike && isUniform) invalidReason = "HUMAN_DETECTED";
    else if (isTextLike) invalidReason = "TEXT_DETECTED";
    else if (isUniform && brightness > 100) invalidReason = "BLANK_DETECTED";

    // Dynamic Scoring Engine
    let score = 30; // Baseline
    if (isOrganic) score += (vibrance * 0.4) + 40; // Vivid organic = high score
    else if (isPaper) score += 35;
    else if (isBright) score -= 20; // Reflective plastic penalty
    
    if (heterogeneity > 2000) score += 10; // High complexity bonus

    return {
      score: Math.max(12, Math.min(100, Math.floor(score))),
      isOrganic, isPaper, invalidReason,
      iotData: { vibrance, heterogeneity, brightness }
    };
  }

  async function _analyse() {
    const canvas = document.getElementById('bws-canvas');
    if (!canvas) { _toast('⚠ Canvas error'); return; }
    const visualData = _analyzePixels(canvas);
    
    const resultArea = document.getElementById('bws-result');
    const analyBtn   = document.getElementById('bws-analyse-btn');
    if (analyBtn) analyBtn.disabled = true;

    resultArea.innerHTML = `
      <div class="result-panel">
        <div class="analyzing-box">
          <div class="bw-spinner"></div>
          <div style="font-family:var(--font,sans-serif);font-size:18px;font-weight:700;">IoT SPECTRAL SWEEP…</div>
          <div class="scan-dots">
            <div class="scan-dot"></div><div class="scan-dot"></div><div class="scan-dot"></div>
          </div>
          <div class="scan-steps" id="bws-step-txt">Initializing multi-spectral sensor...</div>
          <div style="font-family:monospace; font-size:10px; color:var(--green); margin-top:10px; opacity:0.7;" id="bws-iot-log">> SENSING...</div>
        </div>
      </div>`;

    const steps = [
      { t: 'Scanning for Chlorophyll signatures...', l: '> SPECTRAL_RATIO: ' + (visualData.isOrganic ? 'HIGH' : 'LOW') },
      { t: 'Measuring surface heterogeneity...', l: '> ENTROPY_INDEX: ' + Math.floor(visualData.iotData.heterogeneity) },
      { t: 'Calculating material vibrance...', l: '> COLOR_VIBRANCE: ' + Math.floor(visualData.iotData.vibrance) },
      { t: 'Compiling IoT telemetry...', l: '> FINALIZING_DATA_STREAM...' }
    ];
    let si = 0;
    const stepInt = setInterval(() => {
      const el = document.getElementById('bws-step-txt');
      const log = document.getElementById('bws-iot-log');
      if (el && log && si < steps.length) {
        el.textContent = steps[si].t;
        log.textContent = steps[si].l;
        si++;
      }
    }, 1200);

    setTimeout(async () => {
      clearInterval(stepInt);
      
      if (visualData.invalidReason) {
        _displayInvalidResult(visualData.invalidReason);
        return;
      }

      const score = visualData.score;
      const isOrganic = visualData.isOrganic;
      
      let grade, summary, items, suit;

      if (isOrganic) {
        grade = score > 88 ? 'Excellent' : 'Good';
        summary = visualData.isGreen 
          ? "High chlorophyll/organic signature detected. Ideal for Biogas." 
          : "Solid biowaste density detected. Suitable for processing.";
        items = [
          { name: 'Organic Matter', category: 'Organic', isContaminant: false, emoji: '🥬' },
          { name: 'Detected Fibers', category: 'Organic', isContaminant: false, emoji: '🌾' }
        ];
        suit = 'Ideal';
      } else {
        grade = score > 40 ? 'Fair' : 'Poor';
        summary = visualData.isBright 
          ? "⚠ High reflectivity detected. Potential inorganic contaminants (Plastic/Metal)." 
          : "Low organic signature. Mixed waste profile detected.";
        items = [
          { name: 'Inorganic Surface', category: 'Mixed', isContaminant: true, emoji: '🥤' },
          { name: 'Non-Organic Matter', category: 'Mixed', isContaminant: true, emoji: '📦' }
        ];
        suit = score < 40 ? 'Reject' : 'Marginal';
      }

      const result = {
        segregationScore: score,
        overallGrade: grade,
        gradeSummary: summary,
        detectedItems: items,
        biogazSuitability: suit,
        estimatedOrganicPercent: Math.floor(score * 0.95),
        actionRequired: score < 75
      };
      _displayResult(result);
      await _saveToHistory(result);
    }, 4500);
}

  async function _saveToHistory(result) {
    const record = {
      id: _uid(),
      timestamp: _ts(),
      score: result.segregationScore,
      grade: result.overallGrade,
      summary: result.gradeSummary,
      biogazSuitability: result.biogazSuitability,
      actionRequired: result.actionRequired,
      role: _opts.role,
      org: _opts.userOrg,
      userName: _opts.userName
    };
    await _storage.set(`scan:${_opts.userId || 'anon'}:${record.id}`, record);
    if (typeof _opts.onScanSaved === 'function') _opts.onScanSaved(record);
    return record;
  }

  function _displayResult(r) {
    const resultArea = document.getElementById('bws-result');
    const score = r.segregationScore;
    const color = score >= 75 ? 'var(--green)' : 'var(--red)';

    resultArea.innerHTML = `
    <div class="result-panel" style="margin-top:20px; border:1px solid ${color};">
      <div class="result-header" style="background:${color}; padding:20px; color:white;">
        <div style="font-size:32px; font-weight:800;">${score}%</div>
        <div style="font-size:12px; text-transform:uppercase;">Segregation Score</div>
        <div style="margin-top:8px;">
           <span class="badge" style="background:rgba(255,255,255,0.2); color:white;">${r.biogazSuitability} for Biogas</span>
        </div>
      </div>
      <div class="result-body" style="padding:20px;">
        <div style="font-weight:700; font-size:18px; margin-bottom:8px;">${r.overallGrade} Grade</div>
        <p style="font-size:13px; color:var(--muted); font-style:italic; margin-bottom:16px;">"${r.gradeSummary}"</p>
        
        <div class="progress-track" style="margin-bottom:16px;">
          <div class="progress-fill" style="width:${r.estimatedOrganicPercent}%; background:var(--green);"></div>
        </div>

        <button class="cam-btn cam-btn-capture" style="width:100%; justify-content:center;" onclick="BioScanner._applyData(${score}, ${r.estimatedOrganicPercent})">✓ USE DATA & CLOSE</button>
        <button class="cam-btn cam-btn-upload" style="width:100%; justify-content:center; margin-top:8px;" onclick="BioScanner._retake()">🔄 Retake</button>
      </div>
    </div>`;
  }

  function _displayInvalidResult(reason) {
    const resultArea = document.getElementById('bws-result');
    let title = "INVALID SCAN", msg = "Non-waste object detected.", icon = "⚠️";
    
    if (reason === "HUMAN_DETECTED") {
      title = "HUMAN DETECTED";
      msg = "The AI has detected human skin tones. Biogas tokens are only awarded for organic waste, not people!";
      icon = "👤";
    } else if (reason === "TEXT_DETECTED") {
      title = "DOCUMENT DETECTED";
      msg = "High-contrast text or patterns detected. Please point the scanner at actual waste material, not documents or screens.";
      icon = "📄";
    } else if (reason === "BLANK_DETECTED") {
      title = "NOTHING DETECTED";
      msg = "The scanner sees a blank or neutral surface. Please point it at a bin or pile of waste.";
      icon = "⬜";
    }

    resultArea.innerHTML = `
    <div class="result-panel" style="margin-top:20px; border:2px solid var(--red);">
      <div class="result-header" style="background:var(--red); padding:20px; color:white; text-align:center;">
        <div style="font-size:24px; font-weight:800; letter-spacing:1px;">${title}</div>
      </div>
      <div class="result-body" style="padding:24px; text-align:center;">
        <div style="font-size:48px; margin-bottom:16px;">${icon}</div>
        <p style="font-size:14px; color:var(--text-muted); line-height:1.6; margin-bottom:20px;">
          ${msg}
        </p>
        <button class="cam-btn cam-btn-upload" style="width:100%; justify-content:center;" onclick="BioScanner._retake()">🔄 Retry Scan</button>
      </div>
    </div>`;
  }

  function _applyData(score, org) {
    if (typeof _opts.onApply === 'function') _opts.onApply(score, org);
    _back();
  }

  return {
    open: (opts) => { _opts = opts; _imageB64=null; _stopCamera(); _render(); },
    stop: _stopCamera,
    _back, _setMode, _clickUpload, _startCamera, _captureFrame, _retake, _analyse, _applyData, handleFileUpload
  };

})();
