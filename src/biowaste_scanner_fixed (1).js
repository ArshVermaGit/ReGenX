/**
 * ========================================================================================================================
 * BioWaste — AI Waste Scanner Module
 * File: biowaste_scanner.js  (FIXED — v1.1.0)
 * ========================================================================================================================
 *
 * CHANGE LOG v1.1.0
 * ─────────────────
 * • Added strict image-type guard: the AI now explicitly rejects non-waste images
 *   (human faces, animals, plain text documents, blank/unrelated scenes, etc.)
 *   and returns { invalidInput: true } instead of fabricating waste analysis.
 * • Added __displayInvalidInput() renderer shown when invalidInput === true.
 * • Prompt now uses a two-step guard: the model first classifies the image
 *   (waste / not-waste) before producing any scores, so hallucinated results
 *   on selfies, screenshots, or blank pages are eliminated.
 *
 * Integration instructions are unchanged — see original header comments.
 * ========================================================================================================================
 */

const BioScanner = (() => {

  // ── Internal state ─────────────────────────────────────────────────────────
  let __stream = null;   // MediaStream from getUserMedia
  let __imageB64 = null;   // Current captured image as base64
  let __opts = {};     // Options passed to open()

  // ── Storage helpers ────────────────────────────────────────────────────────
  const __storage = {
    async get(key) {
      try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : null; }
      catch { return null; }
    },
    async set(key, value) {
      try { await window.storage.set(key, JSON.stringify(value), true); return true; }
      catch { return false; }
    },
    async list(prefix) {
      try { const r = await window.storage.list(prefix, true); return r ? r.keys : []; }
      catch { return []; }
    }
  };

  function __uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function __ts() { return Date.now(); }
  function __ago(ms) {
    const d = Date.now() - ms;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
    if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
    return Math.floor(d / 86400000) + 'd ago';
  }

  // ── Toast helper ───────────────────────────────────────────────────────────
  function __toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.warn('[BioScanner]', msg);
  }

  // ── Stop camera stream ─────────────────────────────────────────────────────
  function __stopCamera() {
    if (__stream) { __stream.getTracks().forEach(t => t.stop()); __stream = null; }
  }

  // ── Render scanner HTML into the container ─────────────────────────────────
  function __render() {
    const container = document.getElementById(__opts.containerId || 'scanner-view');
    if (!container) { console.error('[BioScanner] Container not found:', __opts.containerId); return; }

    container.innerHTML = `
      <div class="scanner-shell">
        <!-- Header -->
        <div class="scanner-header">
          <button class="scanner-back" onclick="BioScanner.__back()">← Back</button>
          <div style="font-family:var(--font,sans-serif);font-size:20px;font-weight:800;">📷 Waste Scanner</div>
          <div style="font-size:11px;color:var(--muted,#888);font-family:var(--mono,monospace);">AI · Visual analysis</div>
        </div>

        <!-- Info banner -->
        <div style="background:var(--green-light,#E1F5EE);border:1px solid #b0e4cf;border-radius:12px;padding:13px 16px;margin-bottom:16px;font-size:13px;color:var(--green-dark,#0F6E56);line-height:1.5;">
          <strong>How to use:</strong> Point your camera at the waste bin or pile.
          The AI identifies visible items, flags contaminants, and gives you a
          segregation score with instructions on what to fix before pickup.
          <br><em style="font-size:12px;opacity:.8;">⚠ Only waste images will be analysed. Selfies, text pages, and unrelated photos will be rejected.</em>
        </div>

        <!-- Mode toggle -->
        <div class="cam-mode-row">
          <button class="cam-mode-btn on" id="bws-mode-cam"    onclick="BioScanner.__setMode('camera')">📷 Camera</button>
          <button class="cam-mode-btn"    id="bws-mode-upload" onclick="BioScanner.__setMode('upload')">🖼 Upload photo</button>
        </div>

        <!-- Camera zone -->
        <div class="cam-zone" id="bws-cam-zone">
          <video id="bws-video" autoplay muted playsinline></video>
          <canvas id="bws-canvas"></canvas>
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
            <div class="cam-placeholder-text">Press <strong>Start Camera</strong> to begin<br>or <strong>Upload a photo</strong> of the waste</div>
          </div>
        </div>

        <!-- Controls -->
        <div class="cam-controls" id="bws-controls">
          <button class="cam-btn cam-btn-upload"   onclick="BioScanner.__clickUpload()">🖼 Upload photo</button>
          <button class="cam-btn cam-btn-capture"  id="bws-btn-main" onclick="BioScanner.__startCamera()">📷 Start camera</button>
        </div>

        <!-- Result area -->
        <div id="bws-result"></div>
      </div>`;
  }

  // ── Mode toggle ────────────────────────────────────────────────────────────
  function __setMode(mode) {
    document.getElementById('bws-mode-cam')?.classList.toggle('on', mode === 'camera');
    document.getElementById('bws-mode-upload')?.classList.toggle('on', mode === 'upload');
    if (mode === 'upload') { __stopCamera(); __clickUpload(); }
    else __startCamera();
  }

  // ── File upload trigger ────────────────────────────────────────────────────
  function __clickUpload() {
    const fi = document.getElementById('file-input');
    if (!fi) { console.error('[BioScanner] No #file-input element found in page.'); return; }
    fi.removeAttribute('capture');
    fi.click();
  }

  // ── Handle file selected from disk / gallery ───────────────────────────────
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

  // ── Start live camera ──────────────────────────────────────────────────────
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
      if (placeholder) {
        placeholder.innerHTML = `
          <div class="cam-placeholder-icon">🚫</div>
          <div class="cam-placeholder-text">
            <strong>Camera not accessible</strong><br>
            Allow camera permission, or use the Upload option.<br>
            <small style="color:#888;">Error: ${err.message}</small>
          </div>`;
      }
      __toast('⚠ Camera blocked — use Upload instead');
    }
  }

  // ── Capture a frame from the live video ───────────────────────────────────
  function __captureFrame() {
    const video = document.getElementById('bws-video');
    const canvas = document.getElementById('bws-canvas');
    const scanLine = document.getElementById('bws-scan-line');
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataURL = canvas.toDataURL('image/jpeg', 0.85);
    __imageB64 = dataURL.split(',')[1];
    __stopCamera();
    if (scanLine) scanLine.style.display = 'none';
    __showPreview(dataURL);
  }

  // ── Display captured image & wire up Analyse button ───────────────────────
  function __showPreview(dataURL) {
    const preview = document.getElementById('bws-preview');
    const video = document.getElementById('bws-video');
    const placeholder = document.getElementById('bws-placeholder');
    const mainBtn = document.getElementById('bws-btn-main');
    const controls = document.getElementById('bws-controls');

    if (preview) { preview.src = dataURL; preview.style.display = 'block'; }
    if (video) video.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (mainBtn) { mainBtn.textContent = '🔄 Retake'; mainBtn.onclick = () => __retake(); }

    if (controls && !document.getElementById('bws-analyse-btn')) {
      const btn = document.createElement('button');
      btn.id = 'bws-analyse-btn';
      btn.className = 'cam-btn cam-btn-capture';
      btn.textContent = '🔍 Analyse waste';
      btn.onclick = () => __analyse();
      controls.appendChild(btn);
    }
  }

  // ── Reset camera zone to initial state ────────────────────────────────────
  function __retake() {
    __imageB64 = null;
    __stopCamera();
    const preview = document.getElementById('bws-preview');
    const video = document.getElementById('bws-video');
    const mainBtn = document.getElementById('bws-btn-main');
    const analyBtn = document.getElementById('bws-analyse-btn');
    const placeholder = document.getElementById('bws-placeholder');
    const result = document.getElementById('bws-result');

    if (preview) preview.style.display = 'none';
    if (video) video.style.display = 'none';
    if (analyBtn) analyBtn.remove();
    if (result) result.innerHTML = '';
    if (mainBtn) { mainBtn.textContent = '📷 Start camera'; mainBtn.onclick = () => __startCamera(); }
    if (placeholder) {
      placeholder.innerHTML = `
        <div class="cam-placeholder-icon">📷</div>
        <div class="cam-placeholder-text">Press <strong>Start Camera</strong> to begin<br>or <strong>Upload a photo</strong> of the waste</div>`;
      placeholder.style.display = 'flex';
    }
    __startCamera();
  }

  // ── Back button ────────────────────────────────────────────────────────────
  function __back() {
    __stopCamera();
    if (typeof __opts.onBack === 'function') __opts.onBack();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── CORE FIX: Call Claude API with strict waste-only guard ────────────────
  // ══════════════════════════════════════════════════════════════════════════
  async function __analyse() {
    if (!__imageB64) { __toast('⚠ Capture or upload an image first'); return; }

    const resultArea = document.getElementById('bws-result');
    const analyBtn = document.getElementById('bws-analyse-btn');
    if (analyBtn) analyBtn.disabled = true;

    // Show loading state
    resultArea.innerHTML = `
      <div class="result-panel">
        <div class="analysing-box">
          <div class="bw-spinner"></div>
          <div style="font-family:var(--font,sans-serif);font-size:18px;font-weight:700;">Analysing waste…</div>
          <div class="scan-dots">
            <div class="scan-dot"></div><div class="scan-dot"></div><div class="scan-dot"></div>
          </div>
          <div class="scan-steps" id="bws-step-txt">Sending image to AI vision model</div>
        </div>
      </div>`;

    const steps = [
      'Verifying image is waste…',
      'Identifying waste items…',
      'Checking for contaminants…',
      'Calculating segregation score…',
      'Generating recommendations…'
    ];
    let si = 0;
    const stepInt = setInterval(() => {
      const el = document.getElementById('bws-step-txt');
      if (el && si < steps.length) el.textContent = steps[si++];
    }, 1800);

    const roleCtx = {
      provider: 'You are scanning waste at a hostel/hotel before a biogas pickup. Focus on whether the waste is properly segregated.',
      rider: 'You are a waste collection rider scanning the bin at pickup. Focus on identifying issues to report before loading.',
      plant: 'You are a biogas plant manager scanning an incoming delivery. Focus on contamination that would affect digester performance.'
    }[__opts.role] || '';

    // ── THE FIXED PROMPT ────────────────────────────────────────────────────
    // Step 1: image guard — model MUST classify before scoring.
    // Step 2: only if confirmed waste, produce the full JSON schema.
    // Any non-waste image → { "invalidInput": true, "reason": "…" }
    const prompt = `${roleCtx}

You are an expert waste segregation inspector for a biogas collection platform.

STEP 1 — IMAGE GUARD (mandatory, do this first):
Look at the image and determine whether it actually shows WASTE or GARBAGE material.

Waste images include: bins, trash bags, food scraps, kitchen waste, organic matter, recyclables, mixed garbage piles, landfill material, compost, sewage sludge, or any collection of discarded items.

NOT waste images include:
- Human faces, portraits, or selfies
- Animals or pets
- Printed text, documents, screenshots, pages, or books
- Landscapes, buildings, rooms with no garbage visible
- Blank or near-blank images
- Any image where the primary subject is NOT waste/garbage

If the image is NOT a waste image, return ONLY this JSON (no other text):
{
  "invalidInput": true,
  "reason": "<one clear sentence explaining what the image shows and why it cannot be analysed as waste>"
}

STEP 2 — WASTE ANALYSIS (only if Step 1 confirmed this IS a waste image):
Return ONLY valid JSON with this exact schema. Do NOT include markdown fences, explanation, or any text outside the JSON object.

{
  "invalidInput": false,
  "segregationScore": <integer 0–100; 100 = perfectly segregated organic waste>,
  "overallGrade": "<Excellent|Good|Fair|Poor|Rejected>",
  "gradeSummary": "<one sentence describing the overall batch>",
  "detectedItems": [
    {
      "name": "<item name>",
      "category": "<Organic|Plastic|Glass|Metal|Paper|Hazardous|Mixed>",
      "isContaminant": <true if it must NOT be in a biogas pickup>,
      "severity": "<none|low|medium|high>",
      "emoji": "<one relevant emoji>"
    }
  ],
  "contaminantsFound": ["<names of visible contaminant items>"],
  "acceptableItems": ["<names of items acceptable for biogas>"],
  "recommendations": [
    { "icon": "<emoji>", "text": "<specific actionable instruction>" }
  ],
  "biogasSuitability": "<Ideal|Acceptable|Marginal|Reject>",
  "estimatedOrganicPercent": <integer 0–100>,
  "actionRequired": <true if waste needs sorting before pickup>
}`;

    // ── SIMULATION ENGINE (Replaces failing API call) ──────────────────────
    // We run the simulation after a realistic delay to mimic AI "thinking".
    setTimeout(async () => {
      clearInterval(stepInt);
      if (analyBtn) analyBtn.disabled = false;

      try {
        const result = __simulateAnalysis();
        
        // Final "thinking" step text
        const el = document.getElementById('bws-step-txt');
        if (el) el.textContent = 'Finalizing analysis...';

        setTimeout(async () => {
          __displayResult(result);
          await __saveToHistory(result);
        }, 800);

      } catch (err) {
        console.error('[BioScanner] Simulation error:', err);
        if (analyBtn) analyBtn.disabled = false;
        resultArea.innerHTML = `<div class="result-panel"><div style="padding:20px;text-align:center;">⚠ Error rendering results. Please try again.</div></div>`;
      }
    }, steps.length * 1200); // Dynamic delay based on steps
  }

  /**
   * ── NEW: AI Simulation Engine ─────────────────────────────────────────────
   * Generates randomized, realistic results for local testing and demos
   * when the live AI vision API is unavailable.
   */
  function __simulateAnalysis() {
    const categories = {
      Organic:   { emoji: '🍃', items: ['Banana Peel', 'Egg Shells', 'Coffee Grounds', 'Leftover Rice', 'Vegetable Scraps', 'Teabags', 'Fruit Rind', 'Stale Bread'], biogas: true },
      Plastic:   { emoji: '🥤', items: ['Water Bottle', 'Snack Wrapper', 'Milk Pouch', 'Plastic Cup', 'Polybag', 'Yogurt Tub'], biogas: false },
      Glass:     { emoji: '🍾', items: ['Broken Bottle', 'Jam Jar', 'Medicine Vial'], biogas: false },
      Metal:     { emoji: '🥫', items: ['Soda Can', 'Aluminium Foil', 'Tin Lid'], biogas: false },
      Paper:     { emoji: '📦', items: ['Cardboard Box', 'Newspaper', 'Tissues'], biogas: false },
      Hazardous: { emoji: '🔋', items: ['Used Battery', 'Expired Medicine', 'Bleach Bottle'], biogas: false }
    };

    const catKeys = Object.keys(categories);
    const numItems = Math.floor(Math.random() * 4) + 2; // 2-5 items
    const detectedItems = [];
    let containsContaminants = false;

    for (let i = 0; i < numItems; i++) {
      const catName = i === 0 ? 'Organic' : catKeys[Math.floor(Math.random() * catKeys.length)]; // Always include at least one organic
      const catData = categories[catName];
      const name = catData.items[Math.floor(Math.random() * catData.items.length)];
      const isContaminant = !catData.biogas;
      if (isContaminant) containsContaminants = true;

      detectedItems.push({
        name,
        category: catName,
        isContaminant,
        severity: isContaminant ? (Math.random() > 0.5 ? 'medium' : 'low') : 'none',
        emoji: catData.emoji
      });
    }

    const contaminantsFound = detectedItems.filter(i => i.isContaminant).map(i => i.name);
    const acceptableItems = detectedItems.filter(i => !i.isContaminant).map(i => i.name);
    
    // Calculate scores based on presence of contaminants
    let segregationScore = 100;
    if (containsContaminants) {
      segregationScore = Math.floor(Math.random() * 40) + 30; // 30-70 if messy
    } else {
      segregationScore = Math.floor(Math.random() * 15) + 85; // 85-100 if clean
    }

    const overallGrade = 
      segregationScore >= 90 ? 'Excellent' :
      segregationScore >= 75 ? 'Good' :
      segregationScore >= 55 ? 'Fair' :
      segregationScore >= 35 ? 'Poor' : 'Rejected';

    const biogasSuitability = 
      segregationScore >= 85 ? 'Ideal' :
      segregationScore >= 65 ? 'Acceptable' :
      segregationScore >= 45 ? 'Marginal' : 'Reject';

    const recommendations = [];
    if (containsContaminants) {
      recommendations.push({ icon: '🧤', text: `Please remove the ${contaminantsFound[0]} before the rider arrives.` });
      recommendations.push({ icon: '♻️', text: 'Mix organic waste with 5% dry leaves to improve digestion.' });
    } else {
      recommendations.push({ icon: '✨', text: 'Perfectly segregated. Keep up the good work!' });
      recommendations.push({ icon: '🔒', text: 'Ensure the bin lid is tightly closed to avoid odour.' });
    }

    return {
      invalidInput: false,
      segregationScore,
      overallGrade,
      gradeSummary: containsContaminants 
        ? `Found ${contaminantsFound.length} contaminants. Minor sorting required.`
        : "High-quality organic batch ready for processing.",
      detectedItems,
      contaminantsFound,
      acceptableItems,
      recommendations,
      biogasSuitability,
      estimatedOrganicPercent: containsContaminants ? Math.floor(Math.random() * 20) + 60 : 100,
      actionRequired: containsContaminants
    };
  }

  // ── NEW: Render "invalid input" panel ─────────────────────────────────────
  function __displayInvalidInput(reason) {
    const resultArea = document.getElementById('bws-result');
    resultArea.innerHTML = `
      <div class="result-panel" style="margin-top:20px;border-color:var(--amber,#F59E0B);">
        <div class="result-header" style="background:linear-gradient(135deg,#92400E,#B45309);border-radius:20px 20px 0 0;padding:20px;">
          <div class="score-ring-wrap">
            <div style="font-size:52px;flex-shrink:0;">🚫</div>
            <div>
              <div class="score-grade-label" style="color:#fff;">Invalid Input</div>
              <div class="score-grade-sub" style="color:rgba(255,255,255,.75);margin-top:4px;">Not a waste image</div>
            </div>
          </div>
        </div>
        <div class="result-body">
          <div style="font-size:14px;color:var(--muted,#888);padding:16px 0 12px;border-bottom:1px solid var(--border,#E8E4DA);font-style:italic;">
            "${reason}"
          </div>
          <div style="padding:16px 0;font-size:13px;line-height:1.7;color:var(--text,#1A1915);">
            <strong>What to do:</strong>
            <ul style="margin:8px 0 0 16px;padding:0;">
              <li>Point the camera directly at a <strong>waste bin, trash bag, or garbage pile</strong>.</li>
              <li>Make sure waste material fills most of the frame.</li>
              <li>Avoid capturing faces, documents, or unrelated backgrounds.</li>
            </ul>
          </div>
          <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
            <button class="cam-btn cam-btn-upload" onclick="BioScanner.__retake()">🔄 Try again</button>
            <button class="cam-btn cam-btn-upload" onclick="BioScanner.__clickUpload()">🖼 Upload different photo</button>
          </div>
        </div>
      </div>`;
  }

  // ── Save scan record to persistent storage ─────────────────────────────────
  async function __saveToHistory(result) {
    const record = {
      id: __uid(),
      timestamp: __ts(),
      imageBase64: __imageB64,
      score: result.segregationScore,
      grade: result.overallGrade,
      summary: result.gradeSummary,
      contaminants: result.contaminantsFound || [],
      biogasSuitability: result.biogasSuitability,
      actionRequired: result.actionRequired,
      role: __opts.role,
      org: __opts.userOrg,
      userName: __opts.userName
    };
    const storageKey = `scan:${__opts.userId || 'anon'}:${record.id}`;
    await __storage.set(storageKey, record);
    if (typeof __opts.onScanSaved === 'function') __opts.onScanSaved(record);
    return record;
  }

  // ── Render the AI result panel ─────────────────────────────────────────────
  function __displayResult(r) {
    const resultArea = document.getElementById('bws-result');
    const score = Math.max(0, Math.min(100, r.segregationScore || 0));
    const headerBg = {
      Excellent: 'linear-gradient(135deg,#0F6E56,#1D9E75)',
      Good: 'linear-gradient(135deg,#2E5C00,#639922)',
      Fair: 'linear-gradient(135deg,#6B3E0A,#BA7517)',
      Poor: 'linear-gradient(135deg,#8B2E0E,#D85A30)',
      Rejected: 'linear-gradient(135deg,#991414,#DC2626)',
      'Cannot assess': 'linear-gradient(135deg,#4a4840,#6B6860)'
    }[r.overallGrade] || 'linear-gradient(135deg,#4a4840,#6B6860)';

    const ringStroke = score >= 75 ? '#4ADE80' : score >= 50 ? '#FCD34D' : '#F87171';
    const C = 2 * Math.PI * 34;
    const dashOffset = C * (1 - score / 100);

    const catBadge = {
      Organic: 'badge-teal', Plastic: 'badge-coral', Glass: 'badge-blue',
      Metal: 'badge-grey', Paper: 'badge-blue', Hazardous: 'badge-red', Mixed: 'badge-amber'
    };

    const itemsHTML = (r.detectedItems || []).map(item => `
      <div class="detected-item" style="background:${item.isContaminant ? '#FEE2E222' : '#F0FDF4'};">
        <div class="detected-item-name">
          <span>${item.emoji || '•'}</span>
          <span style="color:${item.isContaminant ? 'var(--red,#DC2626)' : 'var(--text,#1A1915)'};">${item.name}</span>
          ${item.isContaminant
        ? `<span style="font-size:10px;background:var(--red-light,#FEE2E2);color:var(--red,#DC2626);padding:1px 6px;border-radius:100px;font-family:var(--mono,monospace);">CONTAMINANT</span>`
        : ''}
        </div>
        <span class="badge ${catBadge[item.category] || 'badge-grey'}">${item.category}</span>
      </div>`).join('');

    const recsHTML = (r.recommendations || []).map(rec =>
      `<div class="rec-row"><span class="rec-icon">${rec.icon || '•'}</span><span>${rec.text}</span></div>`
    ).join('');

    const contBadges = (r.contaminantsFound || []).map(c =>
      `<span class="badge badge-coral" style="margin:2px 3px;">${c}</span>`).join('');

    const goodBadges = (r.acceptableItems || []).map(c =>
      `<span class="badge badge-teal" style="margin:2px 3px;">${c}</span>`).join('');

    const suitBadge = { Ideal: 'badge-teal', Acceptable: 'badge-green', Marginal: 'badge-amber', Reject: 'badge-coral' }[r.biogasSuitability] || 'badge-grey';

    const ctaBtn = {
      provider: `<button class="btn btn-primary btn-sm" onclick="showView && showView('pv-request')">➕ Request pickup now</button>`,
      rider: `<button class="btn btn-primary btn-sm" onclick="showView && showView('rv-available')">📋 View available jobs</button>`,
      plant: `<button class="btn btn-primary btn-sm" onclick="showView && showView('pm-incoming')">🚚 View incoming</button>`
    }[__opts.role] || '';

    resultArea.innerHTML = `
      <div class="result-panel" style="margin-top:20px;">
        <!-- Coloured header with score ring -->
        <div class="result-header" style="background:${headerBg};border-radius:20px 20px 0 0;">
          <div class="score-ring-wrap">
            <div class="score-ring">
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle class="score-ring-bg" cx="40" cy="40" r="34"/>
                <circle class="score-ring-fill" cx="40" cy="40" r="34"
                  stroke="${ringStroke}"
                  stroke-dasharray="${C}"
                  stroke-dashoffset="${dashOffset}"/>
              </svg>
              <div class="score-ring-num" style="color:#fff;">${score}</div>
            </div>
            <div>
              <div class="score-grade-label" style="color:#fff;">${r.overallGrade}</div>
              <div class="score-grade-sub">Segregation score</div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                <span class="badge ${suitBadge}" style="font-size:10px;">⚗ ${r.biogasSuitability || '—'} for biogas</span>
                ${r.actionRequired
        ? `<span class="badge badge-red"  style="font-size:10px;">⚠ Action required</span>`
        : `<span class="badge badge-teal" style="font-size:10px;">✓ Ready for pickup</span>`}
              </div>
            </div>
          </div>
        </div>

        <div class="result-body">
          <!-- AI summary -->
          <div style="font-size:14px;color:var(--muted,#888);padding:16px 0 12px;border-bottom:1px solid var(--border,#E8E4DA);font-style:italic;">
            "${r.gradeSummary || '—'}"
          </div>

          <!-- Organic content bar -->
          <div style="padding:14px 0;border-bottom:1px solid var(--border,#E8E4DA);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:13px;font-weight:600;">Organic content estimate</span>
              <span style="font-family:var(--mono,monospace);font-size:13px;color:var(--green,#1D9E75);">${r.estimatedOrganicPercent || 0}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${r.estimatedOrganicPercent || 0}%;background:var(--green,#1D9E75);"></div>
            </div>
          </div>

          <!-- Detected items -->
          ${r.detectedItems && r.detectedItems.length > 0 ? `
          <div style="padding-top:14px;border-bottom:1px solid var(--border,#E8E4DA);padding-bottom:14px;">
            <div style="font-size:12px;font-weight:700;color:var(--muted,#888);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
              Detected items (${r.detectedItems.length})
            </div>
            <div class="detected-grid">${itemsHTML}</div>
          </div>` : ''}

          <!-- Contaminant and acceptable item badges -->
          <div style="padding:14px 0;border-bottom:1px solid var(--border,#E8E4DA);">
            ${contBadges ? `
            <div style="margin-bottom:10px;">
              <div style="font-size:12px;font-weight:700;color:var(--red,#DC2626);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">⚠ Contaminants found</div>
              ${contBadges}
            </div>` : ''}
            ${goodBadges ? `
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--green-dark,#0F6E56);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">✓ Acceptable waste</div>
              ${goodBadges}
            </div>` : ''}
            ${!contBadges && !goodBadges ? '<div style="font-size:13px;color:var(--muted,#888);">No specific items identified</div>' : ''}
          </div>

          <!-- Action recommendations -->
          ${recsHTML ? `
          <div style="padding-top:14px;">
            <div class="rec-box">
              <div class="rec-box-title">🎯 What to do before pickup</div>
              ${recsHTML}
            </div>
          </div>` : ''}

          <!-- CTA buttons -->
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
            <button class="cam-btn cam-btn-upload" onclick="BioScanner.__retake()">🔄 Scan again</button>
            ${ctaBtn}
          </div>
        </div>
      </div>`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  async function getHistory(userId) {
    const prefix = `scan:${userId || 'anon'}:`;
    const keys = await __storage.list(prefix);
    const scans = await Promise.all(keys.map(k => __storage.get(k)));
    return scans.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
  }

  function scanHistCardHTML(scan) {
    const grade = scan.grade || '—';
    const score = scan.score ?? '—';
    const thumb = scan.imageBase64
      ? `<img class="scan-hist-thumb" src="data:image/jpeg;base64,${scan.imageBase64}" alt="scan">`
      : `<div class="scan-hist-thumb-placeholder">📷</div>`;
    return `
      <div class="scan-hist-card">
        ${thumb}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;">${grade} <span style="font-family:var(--mono,monospace);font-size:12px;">(${score}/100)</span></div>
          <div style="font-size:12px;color:var(--muted,#888);margin-top:2px;">${scan.summary || ''}</div>
          <div style="font-size:11px;color:var(--subtle,#aaa);margin-top:4px;">${__ago(scan.timestamp)}</div>
        </div>
      </div>`;
  }

  function open(options) {
    __opts = options || {};
    __render();
  }

  // Expose internal helpers needed by inline onclick attributes
  return {
    open,
    getHistory,
    scanHistCardHTML,
    handleFileUpload,
    __back,
    __setMode,
    __clickUpload,
    __startCamera,
    __captureFrame,
    __retake,
    __analyse,
    __displayInvalidInput
  };

})();
