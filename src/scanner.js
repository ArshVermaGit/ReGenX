/**
 * ========================================================================================================================
 * BioWaste — AI Waste Scanner Module
 * File: scanner.js (AI-Powered Vision Version)
 * ========================================================================================================================
 */

const BioScanner = (() => {

  // ── Internal state ─────────────────────────────────────────────────────────
  let __stream = null;   
  let __imageB64 = null;   
  let __opts = {};     
  let __apiKey = '';     // User's Anthropic API Key

  // ── Storage helpers ────────────────────────────────────────────────────────
  const __storage = {
    async get(key) {
      try { 
        if (typeof window.storage !== 'undefined' && window.storage.get) {
          const r = await window.storage.get(key, true); 
          return r ? JSON.parse(r.value) : null; 
        }
        const r = localStorage.getItem('regenx:' + key);
        return r ? JSON.parse(r) : null;
      }
      catch { return null; }
    },
    async set(key, value) {
      try { 
        if (typeof window.storage !== 'undefined' && window.storage.set) {
          await window.storage.set(key, JSON.stringify(value), true); 
          return true; 
        }
        localStorage.setItem('regenx:' + key, JSON.stringify(value));
        return true;
      }
      catch { return false; }
    }
  };

  function __uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function __ts() { return Date.now(); }

  function __toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.warn('[BioScanner]', msg);
  }

  function __stopCamera() {
    if (__stream) { __stream.getTracks().forEach(t => t.stop()); __stream = null; }
  }

  // ── Initialization & Key Loading ───────────────────────────────────────────
  async function __init() {
    const saved = await __storage.get('settings:api_key');
    if (saved) __apiKey = saved;
  }

  function __render() {
    const container = document.getElementById(__opts.containerId || 'scanner-view');
    if (!container) { 
      const modalBox = document.getElementById('modal-box');
      if (modalBox) { __opts.containerId = 'modal-box'; __render(); return; }
      return; 
    }

    container.innerHTML = `
      <div class="scanner-shell">
        <div class="scanner-header">
          <button class="scanner-back" onclick="BioScanner.__back()">← Back</button>
          <div style="flex:1; text-align:center;">
            <div style="font-family:var(--font,sans-serif);font-size:18px;font-weight:800;">📷 AI Waste Scanner</div>
            <div style="font-size:10px;color:var(--muted,#888);text-transform:uppercase;letter-spacing:1px;">Powered by Claude 3 Vision</div>
          </div>
          <button class="scanner-settings-btn" onclick="BioScanner.__toggleSettings()" title="API Settings">⚙️</button>
        </div>

        <!-- API Settings Panel (Hidden by default) -->
        <div id="bws-settings" class="scanner-settings-panel" style="display:none;">
          <div style="font-weight:700; font-size:14px; margin-bottom:8px;">Anthropic API Settings</div>
          <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">Enter your API key to enable real AI visual analysis. If empty, the scanner runs in <strong>Demo Mode</strong>.</p>
          <div class="form-group">
            <input type="password" id="bws-api-key-input" class="form-input" placeholder="sk-ant-api..." value="${__apiKey}">
          </div>
          <button class="btn btn-primary btn-sm btn-full" onclick="BioScanner.__saveApiKey()">Save API Key</button>
        </div>

        <div id="bws-main-view">
          <div style="background:var(--green-light,#E1F5EE);border:1px solid #b0e4cf;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:var(--green-dark,#0F6E56);line-height:1.4;">
            ${__apiKey ? '🟢 <strong>AI Active:</strong> Capture an image for real-time contamination analysis.' : '🟡 <strong>Demo Mode:</strong> Enter an API key in settings for real visual analysis.'}
          </div>

          <div class="cam-mode-row">
            <button class="cam-mode-btn on" id="bws-mode-cam"    onclick="BioScanner.__setMode('camera')">📷 Camera</button>
            <button class="cam-mode-btn"    id="bws-mode-upload" onclick="BioScanner.__setMode('upload')">🖼 Upload</button>
          </div>

          <div class="cam-zone" id="bws-cam-zone">
            <video id="bws-video" autoplay muted playsinline></video>
            <canvas id="bws-canvas" style="display:none;"></canvas>
            <img id="bws-preview" alt="Captured waste">
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
              <div class="cam-placeholder-text">Press <strong>Start Camera</strong> to begin</div>
            </div>
          </div>

          <div class="cam-controls" id="bws-controls">
            <button class="cam-btn btn-secondary" style="border-radius:10px;" onclick="BioScanner.__clickUpload()">🖼 Upload</button>
            <button class="cam-btn btn-primary" id="bws-btn-main" style="border-radius:10px; min-width:180px;" onclick="BioScanner.__startCamera()">📷 Start camera</button>
          </div>
        </div>

        <div id="bws-result"></div>
      </div>`;
  }

  // ── API Key Management ─────────────────────────────────────────────────────
  function __toggleSettings() {
    const s = document.getElementById('bws-settings');
    const m = document.getElementById('bws-main-view');
    if (s.style.display === 'none') {
      s.style.display = 'block';
      m.style.opacity = '0.3';
      m.style.pointerEvents = 'none';
    } else {
      s.style.display = 'none';
      m.style.opacity = '1';
      m.style.pointerEvents = 'auto';
    }
  }

  async function __saveApiKey() {
    const val = document.getElementById('bws-api-key-input').value.trim();
    __apiKey = val;
    await __storage.set('settings:api_key', val);
    __toast(val ? '✓ API Key Saved' : '✓ Switched to Demo Mode');
    __toggleSettings();
    __render();
  }

  // ── Camera & Capture ───────────────────────────────────────────────────────
  function __setMode(mode) {
    document.getElementById('bws-mode-cam')?.classList.toggle('on', mode === 'camera');
    document.getElementById('bws-mode-upload')?.classList.toggle('on', mode === 'upload');
    if (mode === 'upload') { __stopCamera(); __clickUpload(); }
    else __startCamera();
  }

  function __clickUpload() {
    const fi = document.getElementById('file-input');
    if (!fi) return;
    fi.removeAttribute('capture');
    fi.click();
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    __stopCamera();
    const reader = new FileReader();
    reader.onload = e => {
      const dataURL = e.target.result;
      __imageB64 = dataURL.split(',')[1];
      __showPreview(dataURL);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function __startCamera() {
    if (__stream) { __captureFrame(); return; }
    const placeholder = document.getElementById('bws-placeholder');
    const video = document.getElementById('bws-video');
    const preview = document.getElementById('bws-preview');
    const mainBtn = document.getElementById('bws-btn-main');
    const scanLine = document.getElementById('bws-scan-line');

    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      __stream = stream;
      if (video) { video.srcObject = stream; video.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
      if (mainBtn) { mainBtn.textContent = '📸 Capture & Analyse'; mainBtn.onclick = () => __captureFrame(); }
      if (scanLine) scanLine.style.display = 'block';
    } catch (err) {
      if (placeholder) placeholder.innerHTML = `<div class="cam-placeholder-text">Camera error: ${err.message}</div>`;
    }
  }

  function __captureFrame() {
    const video = document.getElementById('bws-video');
    const canvas = document.getElementById('bws-canvas');
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataURL = canvas.toDataURL('image/jpeg', 0.8);
    __imageB64 = dataURL.split(',')[1];
    __stopCamera();
    __showPreview(dataURL);
  }

  function __showPreview(dataURL) {
    const preview = document.getElementById('bws-preview');
    const video = document.getElementById('bws-video');
    const mainBtn = document.getElementById('bws-btn-main');
    const controls = document.getElementById('bws-controls');

    if (preview) { preview.src = dataURL; preview.style.display = 'block'; }
    if (video) video.style.display = 'none';
    if (mainBtn) { mainBtn.textContent = '🔄 Retake'; mainBtn.onclick = () => __retake(); }

    if (controls && !document.getElementById('bws-analyse-btn')) {
      const btn = document.createElement('button');
      btn.id = 'bws-analyse-btn';
      btn.className = 'cam-btn btn-primary';
      btn.style.borderRadius = '10px';
      btn.style.minWidth = '180px';
      btn.textContent = '🔍 Run AI Analysis';
      btn.onclick = () => __analyse();
      controls.appendChild(btn);
    }
  }

  function __retake() {
    __imageB64 = null; __stopCamera();
    const preview = document.getElementById('bws-preview');
    const video = document.getElementById('bws-video');
    const mainBtn = document.getElementById('bws-btn-main');
    const analyBtn = document.getElementById('bws-analyse-btn');
    const result = document.getElementById('bws-result');

    if (preview) preview.style.display = 'none';
    if (video) video.style.display = 'none';
    if (analyBtn) analyBtn.remove();
    if (result) result.innerHTML = '';
    if (mainBtn) { mainBtn.textContent = '📷 Start camera'; mainBtn.onclick = () => __startCamera(); }
    __startCamera();
  }

  function __back() { __stopCamera(); if (__opts.onBack) __opts.onBack(); }

  // ── CORE ANALYSIS (REAL AI VS SIMULATION) ────────────────────────────────
  async function __analyse() {
    if (!__imageB64) { __toast('⚠ Capture image first'); return; }

    const resultArea = document.getElementById('bws-result');
    const analyBtn = document.getElementById('bws-analyse-btn');
    if (analyBtn) analyBtn.disabled = true;

    resultArea.innerHTML = `
      <div class="result-panel">
        <div class="analysing-box">
          <div class="bw-spinner"></div>
          <div style="font-family:var(--font,sans-serif);font-size:18px;font-weight:700;">${__apiKey ? 'AI Vision Analysing…' : 'Simulating Analysis…'}</div>
          <div class="scan-dots"><div class="scan-dot"></div><div class="scan-dot"></div><div class="scan-dot"></div></div>
          <div class="scan-steps" id="bws-step-txt">Processing image...</div>
        </div>
      </div>`;

    if (__apiKey) {
      // ── REAL CLAUDE 3 VISION ANALYSIS ─────────────────────────────────────
      try {
        const stepTxt = document.getElementById('bws-step-txt');
        if (stepTxt) stepTxt.textContent = 'Calling Claude 3 Vision API...';

        const prompt = `You are an expert waste segregation inspector. Analyze the provided image of waste.
        Return ONLY valid JSON with this exact schema:
        {
          "segregationScore": <integer 0-100>,
          "overallGrade": "<Excellent|Good|Fair|Poor>",
          "gradeSummary": "<one sentence describing what you see>",
          "detectedItems": [
            { "name": "<item>", "category": "<Organic|Plastic|Glass|Metal|Paper>", "isContaminant": <bool>, "emoji": "<emoji>" }
          ],
          "recommendations": [ { "icon": "<emoji>", "text": "<instruction>" } ],
          "biogasSuitability": "<Ideal|Acceptable|Marginal|Reject>",
          "estimatedOrganicPercent": <integer 0-100>,
          "actionRequired": <bool>
        }`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': __apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true' // Required for client-side fetch
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: __imageB64 } }
              ]
            }]
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || 'API Error');
        }

        const data = await response.json();
        const textResult = data.content[0].text;
        const result = JSON.parse(textResult.replace(/```json/g, '').replace(/```/g, ''));
        
        __displayResult(result);
        await __saveToHistory(result);

      } catch (err) {
        console.error('[BioScanner] AI Error:', err);
        __toast('⚠ AI Analysis failed. Using simulation.');
        const result = __simulateAnalysis();
        __displayResult(result);
      }
    } else {
      // ── SIMULATION FALLBACK ───────────────────────────────────────────────
      setTimeout(() => {
        const result = __simulateAnalysis();
        __displayResult(result);
      }, 3000);
    }
    
    if (analyBtn) analyBtn.disabled = false;
  }

  function __simulateAnalysis() {
    const categories = {
      Organic:   { emoji: '🍃', items: ['Banana Peel', 'Egg Shells', 'Vegetable Scraps'], biogas: true },
      Plastic:   { emoji: '🥤', items: ['Water Bottle', 'Snack Wrapper'], biogas: false },
      Glass:     { emoji: '🍾', items: ['Broken Bottle'], biogas: false }
    };
    const catKeys = Object.keys(categories);
    const numItems = Math.floor(Math.random() * 3) + 2; 
    const detectedItems = [];
    let containsContaminants = false;

    for (let i = 0; i < numItems; i++) {
      const catName = i === 0 ? 'Organic' : catKeys[Math.floor(Math.random() * catKeys.length)]; 
      const catData = categories[catName];
      const name = catData.items[Math.floor(Math.random() * catData.items.length)];
      const isContaminant = !catData.biogas;
      if (isContaminant) containsContaminants = true;
      detectedItems.push({ name, category: catName, isContaminant, emoji: catData.emoji });
    }

    let segregationScore = containsContaminants ? 45 : 92;
    return {
      segregationScore,
      overallGrade: segregationScore > 80 ? 'Excellent' : 'Fair',
      gradeSummary: containsContaminants ? "Contamination detected in the organic batch." : "Clean organic waste batch.",
      detectedItems,
      recommendations: [{ icon: '🧤', text: 'Please sort the waste better next time.' }],
      biogasSuitability: containsContaminants ? 'Marginal' : 'Ideal',
      estimatedOrganicPercent: containsContaminants ? 70 : 100,
      actionRequired: containsContaminants
    };
  }

  async function __saveToHistory(result) {
    const record = { id: __uid(), timestamp: __ts(), score: result.segregationScore, grade: result.overallGrade };
    await __storage.set(`scan:${record.id}`, record);
    if (__opts.onScanSaved) __opts.onScanSaved(record);
    return record;
  }

  function __displayResult(r) {
    const resultArea = document.getElementById('bws-result');
    if (!resultArea) return;

    const score = r.segregationScore || 0;
    const headerBg = r.overallGrade === 'Excellent' ? 'linear-gradient(135deg,#0F6E56,#1D9E75)' : 'linear-gradient(135deg,#8B2E0E,#D85A30)';
    const ringStroke = score >= 75 ? '#4ADE80' : '#F87171';
    const C = 2 * Math.PI * 34;
    const dashOffset = C * (1 - score / 100);

    const itemsHTML = (r.detectedItems || []).map(item => `
      <div class="detected-item">
        <div class="detected-item-name"><span>${item.emoji}</span> ${item.name}</div>
        <span class="badge ${item.isContaminant ? 'badge-amber' : 'badge-green'}" style="font-size:10px;">${item.category}</span>
      </div>`).join('');

    resultArea.innerHTML = `
      <div class="result-panel" style="margin-top:24px; animation: fadeIn 0.4s ease-out;">
        <div class="result-header" style="background:${headerBg}; border-radius:20px 20px 0 0; padding: 24px;">
          <div class="score-ring-wrap" style="display:flex; align-items:center; gap:24px;">
            <div class="score-ring" style="position:relative; width:80px; height:80px;">
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6"/>
                <circle cx="40" cy="40" r="34" fill="none" stroke="${ringStroke}" stroke-width="6"
                  stroke-dasharray="${C}" stroke-dashoffset="${dashOffset}" stroke-linecap="round"/>
              </svg>
              <div class="score-ring-num" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#fff; font-weight:800; font-size:22px;">${score}</div>
            </div>
            <div>
              <div class="score-grade-label" style="color:#fff; font-weight:800; font-size:24px; line-height:1;">${r.overallGrade}</div>
              <div style="margin-top:10px; display:flex; gap:8px;">
                <span class="badge badge-teal" style="font-size:11px;">⚗ ${r.biogasSuitability}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="result-body" style="padding: 24px; background: var(--surface); border-radius: 0 0 20px 20px;">
          <p style="font-size:15px; color:var(--text-muted); margin-bottom:20px; font-style:italic;">"${r.gradeSummary}"</p>
          <div class="detected-grid">${itemsHTML}</div>
          <div style="display:flex; gap:12px; margin-top:24px;">
            <button class="btn btn-secondary" onclick="BioScanner.__retake()" style="flex:1;">🔄 New Scan</button>
            <button class="btn btn-primary" onclick="BioScanner.__applyResult(${score}, ${r.estimatedOrganicPercent})" style="flex:1.5;">📥 Apply Data</button>
          </div>
        </div>
      </div>`;
  }

  function __applyResult(score, organicPercent) {
    if (typeof __opts.onApply === 'function') __opts.onApply(score, organicPercent);
  }

  async function open(options) {
    __opts = options || {};
    await __init();
    __render();
  }

  return {
    open,
    handleFileUpload,
    __back: () => { __stopCamera(); if (__opts.onBack) __opts.onBack(); },
    __setMode,
    __clickUpload,
    __startCamera,
    __captureFrame,
    __retake,
    __analyse,
    __applyResult,
    __toggleSettings,
    __saveApiKey
  };

})();
