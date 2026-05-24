# Pull Request Templates

*Instructions: Replace `<ISSUE_NUMBER>` with the actual ID of the GitHub Issue you create from the `issues.md` list (for example, `Closes #142`).*

---

## PR 1: Implement dark/light theme toggle for Provider Dashboard
**Branch:** `feat/issue-1-theme-toggle`

### 📝 PR Description
Closes #101

Added a glassmorphism-styled dark/light theme toggle on the Provider Dashboard. This allows users to switch between the default light theme and the premium dark mode smoothly without reloading the page.

---

## PR 2: Integrate Leaflet.js map for live rider tracking
**Branch:** `feat/issue-2-leaflet-map-tracking`

### 📝 PR Description
Closes #102

Integrated Leaflet.js into the Rider dashboard to display interactive maps. Added high-accuracy GPS detection and a draggable pin for route eligibility enforcement within the 50km service radius.

---

## PR 3: Add CO₂ offset calculator to Analytics page
**Branch:** `feat/issue-3-co2-offset-calculator`

### 📝 PR Description
Closes #103

Created a new CO₂ offset calculator component on the Impact & Analytics page. It calculates the offset per completed dispatch and updates the regional leaderboard dynamically using Chart.js.

---

## PR 4: Setup TensorFlow.js model for waste image analysis
**Branch:** `feat/issue-4-tfjs-waste-scanner`

### 📝 PR Description
Closes #104

Set up the TensorFlow.js + MobileNet model for real-time waste image analysis. This adds contamination detection and an organic percentage scoring feature to auto-fill dispatch form fields.

---

## PR 5: Build $RGX Token staking interface for Carbon Credit Fund
**Branch:** `feat/issue-5-rgx-token-staking`

### 📝 PR Description
Closes #105

Built the $RGX token economy dashboard interface. Added the ability for providers to stake tokens in the Carbon Credit Fund (12.5% APY) and trade tokens on the ReGen DeFi Exchange.

---

## PR 6: Integrate ESG Auditing & Reporting Module
**Branch:** `feat/issue-106-branch-1-esg-charts`

### 📝 PR Description
Closes #106

Refactored the ESG calculation engine inside `src/esg-reporter.js`. This PR implements standard carbon emission reduction algorithms, generates high-fidelity ESG impact reports, and adds dynamic Excel/PDF export capabilities for municipal and corporate eco-compliance.

---

## PR 7: Implement Cryptographic Trust Ledger Verification
**Branch:** `feat/issue-106-branch-2-trust-verification`

### 📝 PR Description
Closes #106

Introduced decentralized ledger verification in `src/trust.js`. This PR adds local SHA-256 dispatch hashing, zero-knowledge proofs (ZKP) simulator for waste volume claims, and a tamper-detection dashboard widget to guarantee data integrity across hotel dispatches.

---

## PR 8: Add Multi-Stop Route Optimization for Riders
**Branch:** `feat/issue-106-branch-3-route-optimization`

### 📝 PR Description
Closes #106

Upgraded the pathfinding logic in `src/route-optimizer.js`. Integrated vehicle volume/weight capacity constraints and implemented a multi-stop heuristic routing algorithm. The Leaflet.js interface now plots color-coded multi-stop routes to maximize fuel efficiency.

---

## PR 9: Setup Dynamic Storage & Cloud Sync Protocol
**Branch:** `feat/issue-106-branch-4-cloud-sync`

### 📝 PR Description
Closes #106

Engineered a resilient local-first architecture in `src/cloud-sync.js`. Added an IndexedDB fallback storage queue that records all offline scanned dispatches and automatically resolves data synchronicity conflicts upon internet reconnection.

---

## PR 10: Implement AI Next-Day Waste Volume Prediction Engine
**Branch:** `feat/issue-106-branch-5-ai-volume-prediction`

### 📝 PR Description
Closes #106

Integrated an intelligent moving average forecasting module in `src/intelligence.js`. The analytics dashboard now calculates dynamic daily averages based on LocalStorage historical data to visually predict next-day bio-waste volumes via Chart.js.

---

## PR 11: Build Glassmorphic Municipal Compliance Audit Portal
**Branch:** `feat/issue-106-branch-6-audit-trail`

### 📝 PR Description
Closes #106

Designed and built the municipal compliance dashboard in `src/audit-portal.js`. This features premium glassmorphism layouts, full public audit logs, interactive graphs showing regional waste diversion statistics, and high-impact visual performance indicators.

---

## PR 12: Integrate Composting Bio-Chemical Yield Optimizer
**Branch:** `feat/issue-106-branch-7-yield-forecast`

### 📝 PR Description
Closes #106

Developed a biochemical yield calculator in `src/yield-optimizer.js` for Processing Plant operators. This estimates organic compost output, methane production savings, and nutrient richness metrics based on bio-waste mass and contamination scores.

---

## PR 13: Implement WebSocket Realtime Reconnection Protocol
**Branch:** `feat/issue-106-branch-8-realtime-socket`

### 📝 PR Description
Closes #106

Stabilized multi-tab state sync inside `src/realtime-sync.js`. This adds a custom WebSocket heartbeat ping mechanism, automatic connection status badges, and exponential backoff retry algorithms to keep all dashboard views fully synchronized.

---

## PR 14: Upgrade AI Scanner with Visual Bounding-Boxes
**Branch:** `feat/issue-106-branch-9-pwa-offline`

### 📝 PR Description
Closes #106

Enhanced the MobileNet AI scanning flow in `src/scanner.js` and `src/vision-scanner.js`. ReGenX now renders real-time visual canvas overlays (bounding boxes) during video capture to draw region-of-interest indicators and filter low-light frames.

---

## PR 15: Enhance Glassmorphism Design System & CSS Micro-animations
**Branch:** `feat/issue-106-branch-10-glassmorphism-ux`

### 📝 PR Description
Closes #106

Overhauled styling in `src/styles.css` and `index.html`. Refined linear gradients, elevated the glassmorphic background-blur attributes, and added CSS keyframe micro-animations (pulsing stats, smooth hover scales) for a state-of-the-art interactive experience.
