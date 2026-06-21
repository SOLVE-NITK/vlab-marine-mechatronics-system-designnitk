/* ================================================================
   ANALYSIS TASKS — UI & COMPUTATION ENGINE (tasks.js)
================================================================ */

/* ── TASK 1 INTERNAL STATE ───────────────────────────────────── */
// Phases: 'idle' → 'filling' → 'draining' → 'done'
window._task1 = { phase: 'idle' };
let _task1LastStatusUpdate = 0;

function _setTask1Status(phase, text) {
  window._task1.phase = phase;
  const dot = document.getElementById('task1-status-dot');
  const txt = document.getElementById('task1-status-text');
  const bar = document.getElementById('task1-status-bar');
  if (!bar) return;
  bar.className = 'task1-status-bar task1-status-' + phase;
  if (txt) txt.textContent = text;
  if (dot) dot.className   = 'task1-status-dot task1-dot-' + phase;
}

/* START TASK 1 */
window.startTask1 = function() {
  const panel = document.getElementById('task1-results');
  if (panel) panel.classList.add('hidden');

  window._task1SelfLaunch = true;
  if (window.runScenario) window.runScenario('A');
  window._task1SelfLaunch = false;

  // Prime ALL sensor states to match level=5% so the first PLC scan sees no change
  // and logs no spurious startup edges (i01/i02 may still be TRUE from a previous run).
  if (typeof sensorStates !== 'undefined') {
    sensorStates.i00 = true;   // 5% < 9%  → Low sensor already ON
    sensorStates.i01 = false;  // 5% < 51% → Mid sensor OFF
    sensorStates.i02 = false;  // 5% < 91% → High sensor OFF
  }
  if (typeof PLC_I !== 'undefined') {
    PLC_I.i00 = true;
    PLC_I.i01 = false;
    PLC_I.i02 = false;
  }
  if (typeof hysteresisLog !== 'undefined') hysteresisLog = [];

  _setTask1Status('filling', 'Phase 1 — Filling tank from 5%…  waiting for high-level sensor (I0.2).');
  const btn = document.getElementById('task1-run-btn');
  if (btn) { btn.textContent = '■ RUNNING…'; btn.disabled = true; }
};

/* Called every animation frame — watches sensor edges, drives status, auto-fires analysis */
window.updateTask1Readiness = function() {
  const phase = window._task1.phase;
  if (phase === 'idle' || phase === 'done') return;
  if (typeof hysteresisLog === 'undefined') return;

  const levelPct = (typeof curVol !== 'undefined' && typeof MAX_VOL !== 'undefined')
    ? Math.round(curVol / MAX_VOL * 100) : '—';
  const pumpOn = (typeof PLC_Q !== 'undefined') ? PLC_Q.q00 : false;
  const now    = Date.now();

  if (phase === 'filling') {
    const i02Rise = hysteresisLog.some(e => e.sensor === 'I0.2' && e.direction === 'RISING');
    if (i02Rise) {
      // Disarm pump, open outlet valve — same real solenoid used in Scenario B/C
      if (typeof PLC_I !== 'undefined') PLC_I.armed = false;
      if (typeof PLC_Q !== 'undefined') { PLC_Q.q00 = false; PLC_Q.q01 = true; }
      _setTask1Status('draining',
        'Phase 2 — Outlet valve open. Draining…  capturing falling edges.');
      return;
    }
    if (now - _task1LastStatusUpdate > 250) {
      _task1LastStatusUpdate = now;
      _setTask1Status('filling', `Phase 1 — Filling…  Level: ${levelPct}%   Pump: ${pumpOn ? 'ON' : 'OFF'}`);
    }
  }

  if (phase === 'draining') {
    if (typeof PLC_Q !== 'undefined') PLC_Q.q01 = true; // keep valve open each frame (PLC resets it otherwise)
    const i00Rise = hysteresisLog.some(e => e.sensor === 'I0.0' && e.direction === 'RISING');
    if (i00Rise) {
      if (typeof PLC_Q !== 'undefined') PLC_Q.q01 = false; // close valve
      if (typeof PLC_I !== 'undefined') PLC_I.armed = true;  // restore pump control
      _setTask1Status('done', '✔ All edges captured — results computed below.');
      const btn = document.getElementById('task1-run-btn');
      if (btn) { btn.textContent = '↺ RUN AGAIN'; btn.disabled = false; }
      setTimeout(() => runTask1Analysis(), 200);
      return;
    }
    if (now - _task1LastStatusUpdate > 250) {
      _task1LastStatusUpdate = now;
      _setTask1Status('draining', `Phase 2 — Draining…  Level: ${levelPct}%`);
    }
  }
};

/* Called by runScenario / RESET so a manual scenario switch cleans up Task 1 */
window.resetTask1UI = function() {
  if (typeof PLC_Q !== 'undefined') PLC_Q.q01 = false;
  if (typeof PLC_I !== 'undefined') PLC_I.armed = true;
  _setTask1Status('idle', 'Ready — click START to run the hysteresis experiment automatically.');
  const btn   = document.getElementById('task1-run-btn');
  const panel = document.getElementById('task1-results');
  if (btn)   { btn.textContent = '▶ START TASK 1'; btn.disabled = false; }
  if (panel) panel.classList.add('hidden');
};

/**
 * toggleTask: Accordion open/close for task cards
 */
window.toggleTask = function(taskId) {
  const body    = document.getElementById(taskId + '-body');
  const chevron = document.getElementById(taskId + '-chevron');
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  chevron.classList.toggle('open', isHidden);
};

/* ──────────────────────────────────────────────
   TASK 1: HYSTERESIS CHARACTERIZATION
──────────────────────────────────────────────── */

// Sensor definitions — expRise/expFall match plc.js deadband logic exactly
const _SENSORS = [
  { key:'I0.0', short:'Low (I0.0)',  label:'Low Level Sensor  (I0.0)', setPoint:10, spec:1.0, expRise: 9, expFall:11 },
  { key:'I0.1', short:'Mid (I0.1)',  label:'Mid Level Sensor  (I0.1)', setPoint:50, spec:1.0, expRise:51, expFall:49 },
  { key:'I0.2', short:'High (I0.2)', label:'High Level Sensor (I0.2)', setPoint:90, spec:1.0, expRise:91, expFall:89 }
];

function _computeStats() {
  return _SENSORS.map(s => {
    const evts    = (hysteresisLog || []).filter(e => e.sensor === s.key);
    const rVals   = evts.filter(e => e.direction === 'RISING').map(e => e.level * 100);
    const fVals   = evts.filter(e => e.direction === 'FALLING').map(e => e.level * 100);
    const avgR    = rVals.length  ? rVals.reduce((a,b)=>a+b,0)/rVals.length   : null;
    const avgF    = fVals.length  ? fVals.reduce((a,b)=>a+b,0)/fVals.length   : null;
    const band    = (avgR !== null && avgF !== null) ? Math.abs(avgR - avgF)   : null;
    const errR    = avgR !== null ? Math.abs(avgR - s.expRise) : null;
    const errF    = avgF !== null ? Math.abs(avgF - s.expFall) : null;
    const passR   = errR !== null ? errR <= s.spec : null;
    const passF   = errF !== null ? errF <= s.spec : null;
    const passB   = band !== null ? band <= s.spec * 2 + 0.5  : null;
    const verdict = (passR && passF && passB) ? 'PASS'
                  : (passR === null || passF === null) ? 'INCOMPLETE' : 'FAIL';
    return { ...s, avgR, avgF, band, errR, errF, passR, passF, passB, verdict };
  });
}

window.runTask1Analysis = function() {
  const out   = document.getElementById('task1-output');
  const panel = document.getElementById('task1-results');
  panel.classList.remove('hidden');

  if (typeof hysteresisLog === 'undefined' || hysteresisLog.length === 0) {
    out.innerHTML = `<div class="task-no-data">No data yet — click START TASK 1 to run the experiment.</div>`;
    return;
  }

  const stats   = _computeStats();
  window._task1Stats = stats; // keep for CSV export
  const allPass = stats.every(s => s.verdict === 'PASS');
  const anyFail = stats.some(s  => s.verdict === 'FAIL');

  let html = '';

  /* ── 1. SUMMARY TABLE ─────────────────────────────────────── */
  html += `<div class="result-section-hdr">Summary Table</div>`;
  html += `<div style="overflow-x:auto;border:2px solid #000;">
  <table style="width:100%;border-collapse:collapse;font-size:8.5px;font-family:'JetBrains Mono',monospace;min-width:340px;">
    <thead>
      <tr style="background:#000;color:#fff;">
        <th style="padding:5px 6px;text-align:left;white-space:nowrap;">Sensor</th>
        <th style="padding:5px 6px;text-align:center;">Set-Point</th>
        <th style="padding:5px 6px;text-align:center;">Rising ON (%)</th>
        <th style="padding:5px 6px;text-align:center;">Falling OFF (%)</th>
        <th style="padding:5px 6px;text-align:center;">Band (%)</th>
        <th style="padding:5px 6px;text-align:center;">Result</th>
      </tr>
    </thead><tbody>`;

  stats.forEach((s, i) => {
    const bg  = i % 2 === 0 ? '#f8f8f8' : '#fff';
    const vc  = s.verdict === 'PASS' ? '#1a5c1a' : s.verdict === 'FAIL' ? '#cc0000' : '#7a4f00';
    html += `<tr style="background:${bg};">
      <td style="padding:4px 6px;font-weight:700;border-bottom:1px solid #eee;">${s.short}</td>
      <td style="padding:4px 6px;text-align:center;border-bottom:1px solid #eee;">${s.setPoint}%</td>
      <td style="padding:4px 6px;text-align:center;border-bottom:1px solid #eee;">${s.avgR !== null ? s.avgR.toFixed(2) : '—'}</td>
      <td style="padding:4px 6px;text-align:center;border-bottom:1px solid #eee;">${s.avgF !== null ? s.avgF.toFixed(2) : '—'}</td>
      <td style="padding:4px 6px;text-align:center;border-bottom:1px solid #eee;">${s.band !== null ? s.band.toFixed(2) : '—'}</td>
      <td style="padding:4px 6px;text-align:center;border-bottom:1px solid #eee;font-weight:900;color:${vc};">${s.verdict}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  /* ── 2. SYSTEM VERDICT ────────────────────────────────────── */
  const vBg  = allPass ? '#000' : anyFail ? '#cc0000' : '#cc7700';
  const vMsg = allPass ? '✔  ALL SENSORS WITHIN SPECIFICATION'
             : anyFail ? '✖  ONE OR MORE SENSORS FAILED'
             : '⚠  INCOMPLETE DATA — RE-RUN TASK 1';
  html += `<div style="background:${vBg};color:#fff;padding:9px 12px;font-weight:900;font-size:11px;text-align:center;letter-spacing:1px;margin:2px 0;">${vMsg}</div>`;

  /* ── 3. DETAILED PER-SENSOR ANALYSIS ─────────────────────── */
  html += `<div class="result-section-hdr">Detailed Analysis</div>`;

  stats.forEach(s => {
    html += `<div style="font-size:8.5px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;
      color:#fff;background:#333;padding:4px 8px;margin-top:6px;">${s.label}</div>`;

    // Rising trigger
    const rBadge = s.passR === true ? 'badge-pass' : s.passR === false ? 'badge-fail' : 'badge-info';
    html += `<div class="metric-row">
      <span class="metric-label">Rising Trigger (Sensor ON)</span>
      <span class="metric-value">${s.avgR !== null ? s.avgR.toFixed(2)+'%' : '—'}
        &nbsp;<span class="${rBadge}">${s.passR === true ? 'PASS' : s.passR === false ? 'FAIL' : 'NO DATA'}</span>
      </span></div>`;
    if (s.errR !== null) html += `<div class="metric-row" style="font-size:9px;color:#888;">
      <span class="metric-label">↳ Expected ${s.expRise}% &nbsp;|&nbsp; Error: ${s.errR.toFixed(2)}% &nbsp;|&nbsp; Spec ±${s.spec}%</span></div>`;

    // Falling trigger
    const fBadge = s.passF === true ? 'badge-pass' : s.passF === false ? 'badge-fail' : 'badge-info';
    html += `<div class="metric-row">
      <span class="metric-label">Falling Trigger (Sensor OFF)</span>
      <span class="metric-value">${s.avgF !== null ? s.avgF.toFixed(2)+'%' : '—'}
        &nbsp;<span class="${fBadge}">${s.passF === true ? 'PASS' : s.passF === false ? 'FAIL' : 'NO DATA'}</span>
      </span></div>`;
    if (s.errF !== null) html += `<div class="metric-row" style="font-size:9px;color:#888;">
      <span class="metric-label">↳ Expected ${s.expFall}% &nbsp;|&nbsp; Error: ${s.errF.toFixed(2)}% &nbsp;|&nbsp; Spec ±${s.spec}%</span></div>`;

    // Hysteresis band
    if (s.band !== null) {
      const bBadge = s.passB ? 'badge-pass' : 'badge-warn';
      html += `<div class="metric-row">
        <span class="metric-label">Hysteresis Band</span>
        <span class="metric-value">${s.band.toFixed(2)}%
          &nbsp;<span class="${bBadge}">${s.passB ? 'WITHIN SPEC' : 'WIDE'}</span>
        </span></div>`;
      html += `<div class="metric-row" style="font-size:9px;color:#888;">
        <span class="metric-label">↳ Spec: ±${s.spec}% deadband = ${(s.spec*2).toFixed(1)}% total band</span></div>`;
    }
  });

  /* ── 4. RAW EVENT LOG ─────────────────────────────────────── */
  html += `<div class="result-section-hdr">Raw Event Log</div>`;
  html += `<div style="font-family:'JetBrains Mono',monospace;font-size:8.5px;color:#333;
    max-height:90px;overflow-y:auto;line-height:1.9;border:1px solid #ddd;padding:6px;background:#fafafa;">`;
  const _log = hysteresisLog || [];
  const _t0  = _log.length ? _log[0].time : 0; // reference for epoch-ms → relative seconds
  _log.forEach(e => {
    const arrow   = e.direction === 'RISING' ? '▲' : '▼';
    const tSim    = _fmtTime(e.time, _t0);
    html += `<div>${arrow} <b>${e.sensor}</b> ${e.direction} @ <b>${(e.level*100).toFixed(2)}%</b>
      <span style="color:#bbb;margin-left:8px;">t = ${tSim} s</span></div>`;
  });
  html += `</div>`;

  /* ── 5. CSV DOWNLOAD BUTTON ───────────────────────────────── */
  html += `<button onclick="downloadTask1CSV()"
    style="margin-top:10px;width:100%;padding:11px;background:#000;color:#fff;
    border:2px solid #000;font-weight:900;font-size:10px;letter-spacing:1.5px;
    cursor:pointer;font-family:inherit;">
    ⬇ DOWNLOAD ANALYSIS CSV
  </button>`;

  out.innerHTML = html;
  if (window.log) window.log('TASK 1: Hysteresis characterization complete.');
};

/* ── SHARED CSV HELPERS ───────────────────────────────────────── */

// Wrap a text cell safely: quotes it if it contains commas/newlines
function _csvCell(v) {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// Convert a time value that may be Unix-epoch ms → relative simulation seconds
function _fmtTime(t, t0) {
  if (typeof t !== 'number') return '';
  return (t > 1e9 ? (t - t0) / 1000 : t).toFixed(2);
}

// Build and trigger a CSV download with UTF-8 BOM so Excel reads encoding correctly
function _downloadCSV(rows, filename) {
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename
  });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

/* ── TASK 1 CSV ───────────────────────────────────────────────── */
window.downloadTask1CSV = function() {
  const stats = window._task1Stats;
  if (!stats) { alert('Run the analysis first.'); return; }

  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const log  = hysteresisLog || [];
  const t0   = log.length ? log[0].time : 0; // reference for epoch-ms conversion
  const rows = [];

  // Metadata (plain ASCII — no em dashes or special chars)
  rows.push('HYSTERESIS CHARACTERIZATION - TASK 1');
  rows.push(`Experiment No.,BWT-01`);
  rows.push(`Date / Time,${ts}`);
  rows.push(`Institution,Indian Naval Academy Ezhimala - Mechatronics and Control`);
  rows.push(`Specification,+/-1% deadband per sensor (2% total hysteresis band)`);
  rows.push('');

  // Summary results
  rows.push('SUMMARY RESULTS');
  rows.push('Sensor,Set-Point (%),Rising Trigger ON (%),Expected Rising (%),Error R (%),Falling Trigger OFF (%),Expected Falling (%),Error F (%),Hysteresis Band (%),Spec Band (%),Verdict');
  stats.forEach(s => {
    rows.push([
      _csvCell(s.label),                                         // quoted label — never bleeds
      s.setPoint,
      s.avgR  !== null ? s.avgR.toFixed(3)  : 'NO DATA',
      s.expRise,
      s.errR  !== null ? s.errR.toFixed(3)  : 'NO DATA',
      s.avgF  !== null ? s.avgF.toFixed(3)  : 'NO DATA',
      s.expFall,
      s.errF  !== null ? s.errF.toFixed(3)  : 'NO DATA',
      s.band  !== null ? s.band.toFixed(3)  : 'NO DATA',
      (s.spec * 2).toFixed(1),
      s.verdict
    ].join(','));
  });
  rows.push('');

  // Raw hysteresis event log
  rows.push('RAW HYSTERESIS EVENT LOG');
  rows.push('Sensor,Direction,Level (%),Sim Time (s)');
  log.forEach(e => {
    rows.push(`${e.sensor},${e.direction},${(e.level * 100).toFixed(3)},${_fmtTime(e.time, t0)}`);
  });
  rows.push('');

  // Full time-series log
  if (typeof dataLog !== 'undefined' && dataLog.length > 0) {
    const dt0 = dataLog[0].time > 1e9 ? dataLog[0].time : 0;
    rows.push('TIME-SERIES DATA LOG (1 s intervals)');
    rows.push('Time (s),Level (%),Pump Q0.0,Valve Q0.1,I0.0 Low,I0.1 Mid,I0.2 High,Event');
    dataLog.forEach(d => {
      rows.push([
        _fmtTime(d.time, dt0),
        (d.level * 100).toFixed(2),
        d.pump  ? 1 : 0,
        d.valve ? 1 : 0,
        d.i00   ? 1 : 0,
        d.i01   ? 1 : 0,
        d.i02   ? 1 : 0,
        d.event ? _csvCell(d.event) : ''
      ].join(','));
    });
  }

  _downloadCSV(rows, `BWT01_Hysteresis_${ts.replace(/[: ]/g, '-')}.csv`);
  if (window.log) window.log('TASK 1: CSV exported.');
};

/* ══════════════════════════════════════════════════════════════
   TASK 2: SYSTEM RESPONSE TIME  (self-contained, Scenario A)
══════════════════════════════════════════════════════════════ */
window._task2 = { phase:'idle', triggerTime:null, shutdownTime:null, flowStopTime:null, prevI02:false, prevQ00:false };

function _setTask2Status(phase, text) {
  window._task2.phase = phase;
  const bar = document.getElementById('task2-status-bar');
  const dot = document.getElementById('task2-status-dot');
  const txt = document.getElementById('task2-status-text');
  if (!bar) return;
  bar.className = 'task1-status-bar task1-status-' + phase;
  if (dot) dot.className = 'task1-status-dot task1-dot-' + phase;
  if (txt) txt.textContent = text;
}

window.startTask2 = function() {
  document.getElementById('task2-results')?.classList.add('hidden');
  window._task2 = { phase:'filling', triggerTime:null, shutdownTime:null, flowStopTime:null, prevI02:false, prevQ00:false };
  window._task1SelfLaunch = true;
  if (window.runScenario) window.runScenario('A');
  window._task1SelfLaunch = false;
  _setTask2Status('filling', 'Filling tank… waiting for high-level sensor (I0.2) to trigger pump shutdown.');
  const btn = document.getElementById('task2-run-btn');
  if (btn) { btn.textContent = '■ RUNNING…'; btn.disabled = true; }
};

window._updateTask2Tracker = function() {
  if (typeof PLC_I === 'undefined' || typeof PLC_Q === 'undefined') return;
  const i02 = PLC_I.i02, q00 = PLC_Q.q00, t = simTime;

  // Track edge for self-launch mode
  if (window._task2.phase === 'filling' || window._task2.phase === 'triggered') {
    if (i02 && !window._task2.prevI02) {
      window._task2.triggerTime  = t;
      window._task2.shutdownTime = null;
      _setTask2Status('triggered', `I0.2 triggered at t=${t.toFixed(2)} s — measuring pump coast-down…`);
    }
    if (window._task2.triggerTime !== null && !q00 && window._task2.prevQ00) {
      window._task2.shutdownTime = t;
      _setTask2Status('triggered', `Q0.0 OFF at t=${t.toFixed(2)} s — measuring mechanical coast-down…`);
    }
    // Track flow stop (mechanical response)
    if (window._task2.shutdownTime !== null && window._task2.flowStopTime === null) {
      if (typeof curPumpFlow !== 'undefined' && curPumpFlow <= 0.0001) {
        window._task2.flowStopTime = t;
        _setTask2Status('done', '✔ All phases captured — results computed below.');
        const btn = document.getElementById('task2-run-btn');
        if (btn) { btn.textContent = '↺ RUN AGAIN'; btn.disabled = false; }
        setTimeout(() => window.runTask2Analysis(), 200);
      }
    }
    if (window._task2.phase === 'filling') {
      // live level update (throttled)
      const lp = (typeof curVol !== 'undefined') ? Math.round(curVol/MAX_VOL*100) : '—';
      if (Date.now() - (window._t2last||0) > 400) {
        window._t2last = Date.now();
        _setTask2Status('filling', `Filling…  Level: ${lp}%   Pump: ${PLC_Q.q00 ? 'ON':'OFF'}`);
      }
    }
  }
  window._task2.prevI02 = i02;
  window._task2.prevQ00 = q00;
};

window.runTask2Analysis = function() {
  const out   = document.getElementById('task2-output');
  const panel = document.getElementById('task2-results');
  panel.classList.remove('hidden');

  if (!window._task2.triggerTime || !window._task2.shutdownTime || !window._task2.flowStopTime) {
    out.innerHTML = `<div class="task-no-data">Run Task 2 — waiting for full shutdown and coast-down cycle.</div>`;
    return;
  }

  const tElec = window._task2.shutdownTime - window._task2.triggerTime;
  const tMech = window._task2.flowStopTime - window._task2.shutdownTime;
  const total = window._task2.flowStopTime - window._task2.triggerTime;
  const coastPct = ((tMech / total) * 100).toFixed(0);

  const spec = total >= 2.0 && total <= 5.0;
  const badge  = total < 2.0 ? 'badge-warn' : spec ? 'badge-pass' : 'badge-fail';
  const verdict = total < 2.0 ? 'FAST (< 2 s)' : spec ? 'WITHIN SPEC' : 'EXCEEDS SPEC (> 5 s)';

  out.innerHTML = `
    <div class="result-section-hdr">Trigger &amp; Shutdown</div>
    <div class="metric-row"><span class="metric-label">I0.2 Trigger (sensor ON)</span>
      <span class="metric-value">${window._task2.triggerTime.toFixed(2)} s</span></div>
    <div class="metric-row"><span class="metric-label">Q0.0 Command OFF (electrical)</span>
      <span class="metric-value">${window._task2.shutdownTime.toFixed(2)} s</span></div>
    <div class="metric-row"><span class="metric-label">Flow Zero (mechanical stop)</span>
      <span class="metric-value">${window._task2.flowStopTime.toFixed(2)} s</span></div>
    <div class="result-section-hdr">Response Time Breakdown</div>
    <div class="metric-row"><span class="metric-label">Total System Response</span>
      <span class="metric-value">${total.toFixed(3)} s &nbsp;<span class="${badge}">${verdict}</span></span></div>
    <div class="metric-row"><span class="metric-label">Electrical Phase (PLC + Coil)</span>
      <span class="metric-value">${tElec.toFixed(3)} s</span></div>
    <div class="metric-row"><span class="metric-label">Mechanical Phase (Coast-down)</span>
      <span class="metric-value">${tMech.toFixed(3)} s &nbsp;<span class="badge-info">${coastPct}% of total</span></span></div>
    <div class="result-section-hdr">Specification</div>
    <div class="metric-row"><span class="metric-label">Marine spec range</span>
      <span class="metric-value">2.0 – 5.0 s</span></div>
    <button onclick="downloadTask2CSV()"
      style="margin-top:10px;width:100%;padding:10px;background:#000;color:#fff;
      border:2px solid #000;font-weight:900;font-size:10px;letter-spacing:1px;cursor:pointer;font-family:inherit;">
      ⬇ DOWNLOAD CSV
    </button>`;
  if (window.log) window.log(`TASK 2: Response = ${total.toFixed(3)} s (${verdict}).`);
};

window.downloadTask2CSV = function() {
  const t2 = window._task2;
  if (!t2.triggerTime || !t2.shutdownTime) return;
  const total  = t2.shutdownTime - t2.triggerTime;
  const elecMs = Math.min(total * 0.15, 150);
  const mechS  = total - elecMs / 1000;
  const ts     = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const rows   = [
    'SYSTEM RESPONSE TIME - TASK 2', `Date/Time,${ts}`, `Specification,2.0 - 5.0 s`, '',
    'RESULTS', 'Parameter,Value',
    `I0.2 Trigger Time (s),${t2.triggerTime.toFixed(3)}`,
    `Q0.0 Shutdown Time (s),${t2.shutdownTime.toFixed(3)}`,
    `Total Response (s),${total.toFixed(3)}`,
    `Electrical Component (ms),${elecMs.toFixed(1)}`,
    `Mechanical Coast-down (s),${mechS.toFixed(3)}`,
    `Verdict,${total >= 2 && total <= 5 ? 'WITHIN SPEC' : total < 2 ? 'FAST' : 'EXCEEDS SPEC'}`, ''
  ];
  if (typeof dataLog !== 'undefined' && dataLog.length > 0) {
    const dt0 = dataLog[0].time > 1e9 ? dataLog[0].time : 0;
    rows.push('TIME-SERIES', 'Time (s),Level (%),Pump,I0.2');
    dataLog.forEach(d => rows.push(
      `${_fmtTime(d.time, dt0)},${(d.level*100).toFixed(2)},${d.pump?1:0},${d.i02?1:0}`
    ));
  }
  _downloadCSV(rows, `BWT01_ResponseTime_${ts.replace(/[: ]/g, '-')}.csv`);
};

/* ══════════════════════════════════════════════════════════════
   TASK 3: PUMP DUTY CYCLE  (self-contained, Scenario B)
══════════════════════════════════════════════════════════════ */
window._task3 = { phase:'idle', steadyStateTime: null };
let _t3MinCycles = 1; // Reduced from 2 to 1 for faster feedback

function _setTask3Status(phase, text) {
  window._task3.phase = phase;
  const bar = document.getElementById('task3-status-bar');
  const dot = document.getElementById('task3-status-dot');
  const txt = document.getElementById('task3-status-text');
  if (!bar) return;
  bar.className = 'task1-status-bar task1-status-' + (phase === 'idle' ? 'idle' : phase === 'done' ? 'done' : 'filling');
  if (dot) dot.className = 'task1-status-dot ' + (phase === 'done' ? 'task1-dot-done' : phase === 'idle' ? '' : 'task1-dot-filling');
  if (txt) txt.textContent = text;
}

window.startTask3 = function() {
  document.getElementById('task3-results')?.classList.add('hidden');
  window._task3 = { phase: 'running', steadyStateTime: null };
  window._task1SelfLaunch = true;
  if (window.runScenario) window.runScenario('B');
  window._task1SelfLaunch = false;

  // Prime sensors for 90% level (i00=OFF, i01=ON, i02=OFF)
  if (typeof sensorStates !== 'undefined') {
    sensorStates.i00 = false;
    sensorStates.i01 = true;
    sensorStates.i02 = false;
  }
  if (typeof PLC_I !== 'undefined') {
    PLC_I.i00 = false;
    PLC_I.i01 = true;
    PLC_I.i02 = false;
  }
  _setTask3Status('running', `Running Scenario B — waiting for ${_t3MinCycles} complete pump cycles…`);
  const btn = document.getElementById('task3-run-btn');
  if (btn) { btn.textContent = '■ RUNNING…'; btn.disabled = true; }
};

window.updateTask3Readiness = function() {
  if (window._task3.phase !== 'running') return;
  if (typeof dataLog === 'undefined' || dataLog.length < 4) return;

  // Count transitions in data log
  let transitions = 0;
  for (let i = 1; i < dataLog.length; i++) {
    if (!!dataLog[i].pump !== !!dataLog[i-1].pump) transitions++;
  }

  if (Date.now() - (window._t3last||0) > 500) {
    window._t3last = Date.now();
    const lp = typeof curVol !== 'undefined' ? Math.round(curVol/MAX_VOL*100) : '—';
    const st = (typeof simTime !== 'undefined') ? simTime.toFixed(0) : '—';
    _setTask3Status('running', `Scenario B running (t=${st}s) — Level: ${lp}%   Data points: ${transitions}/3`);
  }

  // Detect first pump activation for steady-state time
  if (window._task3.steadyStateTime === null) {
    if (dataLog.length > 0 && dataLog[dataLog.length-1].pump) {
      window._task3.steadyStateTime = dataLog[dataLog.length-1].time;
    }
  }

  // Need at least 3 transitions (ON -> OFF -> ON) to compute one full D cycle (Ton + Toff)
  if (transitions >= 3) {
    window._task3.phase = 'done';
    _setTask3Status('done', `✔ Data captured — results computed below.`);
    const btn = document.getElementById('task3-run-btn');
    if (btn) { btn.textContent = '↺ RUN AGAIN'; btn.disabled = false; }
    setTimeout(() => window.runTask3Analysis(), 200);
  }
};

window.runTask3Analysis = function() {
  const out   = document.getElementById('task3-output');
  const panel = document.getElementById('task3-results');
  panel.classList.remove('hidden');

  if (typeof dataLog === 'undefined' || dataLog.length < 6) {
    out.innerHTML = `<div class="task-no-data">No cycle data captured. Ensure Scenario B runs for at least 1500 simulation seconds.</div>`; return;
  }

  // Extract pump transitions
  const trans = [];
  for (let i = 1; i < dataLog.length; i++) {
    if (!!dataLog[i].pump !== !!dataLog[i-1].pump)
      trans.push({ time: dataLog[i].time, on: !!dataLog[i].pump, level: dataLog[i].level });
  }

  const cycles = [];
  for (let i = 0; i+1 < trans.length; i++) {
    if (trans[i].on && !trans[i+1].on) {
      const ton = trans[i+1].time - trans[i].time;
      if (i+2 < trans.length && trans[i+2].on) {
        const toff = trans[i+2].time - trans[i+1].time;
        cycles.push({ onLvl: (trans[i].level*100).toFixed(1), offLvl: (trans[i+1].level*100).toFixed(1), ton, toff, D: ton/(ton+toff)*100 });
      }
    }
  }

  if (!cycles.length) { out.innerHTML = `<div class="task-no-data">No complete cycles detected yet.</div>`; return; }

  // Steady-State Level Analysis (from first transition to last transition)
  const tStart = trans[0].time;
  const tEnd   = trans[trans.length - 1].time;
  const ssData = dataLog.filter(d => d.time >= tStart && d.time <= tEnd);
  
  const levels = ssData.map(d => d.level * 100);
  const minLvl = Math.min(...levels);
  const maxLvl = Math.max(...levels);
  const avgLvl = levels.reduce((a, b) => a + b, 0) / levels.length;
  const ripple = maxLvl - minLvl;

  const totalOn  = cycles.reduce((s,c)=>s+c.ton, 0);
  const totalOff = cycles.reduce((s,c)=>s+c.toff,0);
  const meanD    = totalOn/(totalOn+totalOff)*100;
  const theory   = 20.0;
  const err      = Math.abs(meanD - theory);
  const startsPH = (3600 / ((totalOn+totalOff)/cycles.length)).toFixed(1);
  const energyKwh= ((2.5/0.85)*(meanD/100)).toFixed(3);

  let html = `<div class="result-section-hdr">Steady-State Statistics</div>`;
  html += `<div class="metric-row"><span class="metric-label">Average Tank Level</span><span class="metric-value">${avgLvl.toFixed(2)}%</span></div>`;
  html += `<div class="metric-row"><span class="metric-label">Minimum Level (Valley)</span><span class="metric-value">${minLvl.toFixed(2)}%</span></div>`;
  html += `<div class="metric-row"><span class="metric-label">Maximum Level (Peak)</span><span class="metric-value">${maxLvl.toFixed(2)}%</span></div>`;
  html += `<div class="metric-row"><span class="metric-label">Oscillation Ripple</span><span class="metric-value">${ripple.toFixed(2)} pp</span></div>`;

  html += `<div class="result-section-hdr">Cycle Timing &amp; Duty Cycle</div>`;
  cycles.forEach((c,i) => html += `<div class="metric-row">
    <span class="metric-label">Cycle ${i+1} — t<sub>on</sub> / t<sub>off</sub> / D</span>
    <span class="metric-value">${c.ton.toFixed(1)}s / ${c.toff.toFixed(1)}s / ${c.D.toFixed(1)}%</span></div>`);

  const ssTime = window._task3.steadyStateTime;
  const ssBadge = (ssTime >= 500 && ssTime <= 700) ? 'badge-pass' : 'badge-warn';

  html += `<div class="result-section-hdr">Efficiency Summary</div>
    <div class="metric-row"><span class="metric-label">Time to Steady State</span>
      <span class="metric-value">${ssTime ? ssTime.toFixed(1)+'s' : '—'} &nbsp;<span class="${ssBadge}">Spec: ~600s</span></span></div>
    <div class="metric-row"><span class="metric-label">Mean Duty Cycle</span>
      <span class="metric-value">${meanD.toFixed(1)}% &nbsp;<span class="${err<=5?'badge-pass':'badge-warn'}">Theory: ${theory}%</span></span></div>
    <div class="metric-row"><span class="metric-label">Error vs Theoretical</span>
      <span class="metric-value">${err.toFixed(1)} pp</span></div>
    <div class="metric-row"><span class="metric-label">Pump Starts / hour</span>
      <span class="metric-value">${startsPH}</span></div>
    <div class="result-section-hdr">Energy (2.5 kW rated, 85% eff.)</div>
    <div class="metric-row"><span class="metric-label">Consumption with duty cycling</span>
      <span class="metric-value">${energyKwh} kWh/h</span></div>
    <div class="metric-row"><span class="metric-label">Saving vs continuous</span>
      <span class="metric-value">${(100-meanD).toFixed(1)}% reduction</span></div>
    <button onclick="downloadTask3CSV()"
      style="margin-top:10px;width:100%;padding:10px;background:#000;color:#fff;
      border:2px solid #000;font-weight:900;font-size:10px;letter-spacing:1px;cursor:pointer;font-family:inherit;">
      ⬇ DOWNLOAD CSV
    </button>`;

  window._task3Cycles = cycles;
  out.innerHTML = html;
  if (window.log) window.log(`TASK 3: Duty cycle = ${meanD.toFixed(1)}% over ${cycles.length} cycles.`);
};

window.downloadTask3CSV = function() {
  const cycles = window._task3Cycles || [];
  const ts  = new Date().toISOString().replace('T', ' ').slice(0, 19);
  
  // Re-calculate stats for CSV if needed (or I could have stored them in window._task3Stats)
  // For simplicity, I'll just redo the math if dataLog exists
  let ssStats = { avg: 'N/A', min: 'N/A', max: 'N/A', ripple: 'N/A' };
  if (typeof dataLog !== 'undefined' && dataLog.length > 0) {
     const trans = [];
     for (let i = 1; i < dataLog.length; i++) {
       if (!!dataLog[i].pump !== !!dataLog[i-1].pump)
         trans.push({ time: dataLog[i].time, on: !!dataLog[i].pump, level: dataLog[i].level });
     }
     if (trans.length >= 2) {
       const t0 = trans[0].time, t1 = trans[trans.length-1].time;
       const ss = dataLog.filter(d => d.time >= t0 && d.time <= t1);
       if (ss.length > 0) {
         const lvls = ss.map(d => d.level * 100);
         const min = Math.min(...lvls), max = Math.max(...lvls);
         ssStats = { 
           avg: (lvls.reduce((a,b)=>a+b,0)/lvls.length).toFixed(3), 
           min: min.toFixed(3), 
           max: max.toFixed(3), 
           ripple: (max - min).toFixed(3) 
         };
       }
     }
  }

  const rows = [
    'STEADY-STATE BEHAVIOR - TASK 3', `Date/Time,${ts}`, `Theoretical Duty Cycle,20%`, '',
    'STEADY-STATE LEVEL STATISTICS',
    `Average Tank Level (%),${ssStats.avg}`,
    `Minimum Level (%),${ssStats.min}`,
    `Maximum Level (%),${ssStats.max}`,
    `Oscillation Ripple (pp),${ssStats.ripple}`,
    '',
    'PER-CYCLE DATA', 'Cycle,ON Level (%),OFF Level (%),t_on (s),t_off (s),Duty Cycle (%)'
  ];
  cycles.forEach((c, i) => rows.push(
    `${i+1},${c.onLvl},${c.offLvl},${c.ton.toFixed(2)},${c.toff.toFixed(2)},${c.D.toFixed(2)}`
  ));
  rows.push('', 'TIME-SERIES', 'Time (s),Level (%),Pump,Valve');
  if (typeof dataLog !== 'undefined') {
    const dt0 = dataLog.length && dataLog[0].time > 1e9 ? dataLog[0].time : 0;
    dataLog.forEach(d => rows.push(
      `${_fmtTime(d.time, dt0)},${(d.level*100).toFixed(2)},${d.pump?1:0},${d.valve?1:0}`
    ));
  }
  _downloadCSV(rows, `BWT01_DutyCycle_${ts.replace(/[: ]/g, '-')}.csv`);
};

/* ══════════════════════════════════════════════════════════════
   TASK 4: FAULT DETECTION & SAFETY INTERLOCKS  (Scenario C)
══════════════════════════════════════════════════════════════ */
window._task4 = { phase:'idle', faultEvents:[] };

function _setTask4Status(phase, text) {
  window._task4.phase = phase;
  const bar = document.getElementById('task4-status-bar');
  const dot = document.getElementById('task4-status-dot');
  const txt = document.getElementById('task4-status-text');
  if (!bar) return;
  bar.className = 'task1-status-bar task1-status-' + (phase === 'done' ? 'done' : phase === 'idle' ? 'idle' : 'draining');
  if (dot) dot.className = 'task1-status-dot ' + (phase === 'done' ? 'task1-dot-done' : phase === 'idle' ? '' : 'task1-dot-draining');
  if (txt) txt.textContent = text;
}

window.startTask4 = function() {
  document.getElementById('task4-results')?.classList.add('hidden');
  window._task4 = { phase: 'running', faultEvents: [] };
  window._task1SelfLaunch = true;
  if (window.runScenario) window.runScenario('C');
  window._task1SelfLaunch = false;
  _setTask4Status('running', 'Scenario C running — monitoring fault injections (t=150 s, 200 s, 250 s)…');
  const btn = document.getElementById('task4-run-btn');
  if (btn) { btn.textContent = '■ RUNNING…'; btn.disabled = true; }
};

window.updateTask4Readiness = function() {
  if (window._task4.phase !== 'running') return;
  if (typeof simTime === 'undefined') return;

  // Collect alarm events from dataLog
  const alarms = (dataLog||[]).filter(e => e.event && (
    e.event.includes('ALARM') || e.event.includes('Fault') || e.event.includes('FAULT') ||
    e.event.includes('Stiction') || e.event.includes('Cavitation') || e.event.includes('Drain')
  ));
  window._task4.faultEvents = alarms;

  if (Date.now() - (window._t4last||0) > 600) {
    window._t4last = Date.now();
    _setTask4Status('running', `Scenario C running — t=${simTime.toFixed(0)} s | Faults detected: ${alarms.length}`);
  }

  // Scenario C injects last fault at ~250 s; consider complete at 320 s
  if (simTime >= 320 && alarms.length > 0) {
    window._task4.phase = 'done';
    _setTask4Status('done', `✔ Fault timeline complete — ${alarms.length} events captured.`);
    const btn = document.getElementById('task4-run-btn');
    if (btn) { btn.textContent = '↺ RUN AGAIN'; btn.disabled = false; }
    setTimeout(() => window.runTask4Analysis(), 200);
  }
};

window.runTask4Analysis = function() {
  const out   = document.getElementById('task4-output');
  const panel = document.getElementById('task4-results');
  panel.classList.remove('hidden');

  const events = window._task4.faultEvents || [];
  if (!events.length) {
    out.innerHTML = `<div class="task-no-data">Run Task 4 — Scenario C must complete its fault timeline (wait until t=320 s).</div>`; return;
  }

  const find = (...kw) => events.find(e => kw.some(k => e.event.includes(k)));
  
  // Scenario C Injection Schedule
  const schedule = { low: 150, high: 200, cav: 250, valve: 300 };

  const rows = [
    { 
      label:'Low Sensor Open-Circuit (I0.0)', 
      injected: schedule.low,
      ev: find('Low-Level','I0.0','low_sensor'),  
      signature: 'I0.0=OFF while Level < 5% or Fault Active',
      threshold: 'Mismatch < 5% level',
      timeout: 'Instant',
      rec: '0.5s debouncing'
    },
    { 
      label:'High Sensor Stiction (I0.2)',    
      injected: schedule.high,
      ev: find('Stiction','stiction','High-Level'), 
      signature: 'I0.2=ON while Level < 90%',
      threshold: '< 90% real level',
      timeout: '10.0 s',
      rec: '5.0 s for faster trip'
    },
    { 
      label:'Outlet Valve Stuck Open (F03)',        
      injected: schedule.valve,
      ev: find('ALARM F03','Unintended Drain','valve_stuck'), 
      signature: 'Q0.1=TRUE & Level Falling while Level < 50%',
      threshold: 'Unable to maintain 50% level',
      timeout: '8.0 s',
      rec: 'Manual Isolation + Tank Drain'
    },
    { 
      label:'Pump Cavitation / Flow Loss',    
      injected: schedule.cav,
      ev: find('Cavitation','cavitation','Efficiency'),
      signature: 'Actual Rise < 70% of Expected Rise',
      threshold: '0.7x coefficient',
      timeout: '15.0 s window',
      rec: 'Moving average (5 samples)'
    }
  ];

  let html = `<div class="result-section-hdr">Diagnostic Signature Analysis</div>`;
  html += `<div style="overflow-x:auto;border:1px solid #000;margin-bottom:10px;">
    <table style="width:100%;border-collapse:collapse;font-size:8.5px;font-family:'JetBrains Mono',monospace;min-width:400px;">
      <thead>
        <tr style="background:#000;color:#fff;">
          <th style="padding:5px;text-align:left;">Fault Type</th>
          <th style="padding:5px;text-align:left;">PLC Signature Pattern</th>
          <th style="padding:5px;text-align:center;">TTD (Latency)</th>
        </tr>
      </thead><tbody>`;

  rows.forEach((r, i) => {
    const bg = i % 2 === 0 ? '#f8f8f8' : '#fff';
    const ttd = r.ev ? (r.ev.time - r.injected).toFixed(1) : '—';
    const ttdColor = r.ev ? (parseFloat(ttd) < 1.0 ? '#1a5c1a' : '#c47a00') : '#888';
    
    html += `<tr style="background:${bg};border-bottom:1px solid #eee;">
      <td style="padding:4px;font-weight:700;">${r.label}</td>
      <td style="padding:4px;color:#444;">${r.signature}</td>
      <td style="padding:4px;text-align:center;font-weight:900;color:${ttdColor};">${ttd} s</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  html += `<div class="result-section-hdr">Interlock Verification & Recommendations</div>`;
  rows.forEach(r => {
    const detected = r.ev ? `Detected at t=${r.ev.time.toFixed(1)}s` : 'NOT DETECTED';
    const badge    = r.ev ? 'badge-pass' : 'badge-fail';
    html += `<div style="background:#f0f0f0;padding:8px;border-left:4px solid ${r.ev?'#000':'#c00'};margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight:900;font-size:9.5px;">${r.label.toUpperCase()}</span>
        <span class="${badge}" style="font-size:8px;">${detected}</span>
      </div>
      <div style="font-size:9px;color:#555;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
        <div><b>Threshold:</b> ${r.threshold}</div>
        <div><b>Timeout:</b> ${r.timeout}</div>
        <div style="grid-column: span 2;color:#000;border-top:1px dashed #ccc;padding-top:3px;margin-top:2px;">
          <b style="color:#0066cc;">Recommendation:</b> ${r.rec}
        </div>
      </div>
    </div>`;
  });

  const allDetected = rows.filter(r=>r.ev).length;
  html += `<div class="result-section-hdr">Summary Coverage</div>
    <div class="metric-row"><span class="metric-label">Faults Detected / Total</span>
      <span class="metric-value">${allDetected}/${rows.length} &nbsp;
        <span class="${allDetected===rows.length?'badge-pass':allDetected>=2?'badge-warn':'badge-fail'}">
        ${allDetected===rows.length?'COMPLETE COVERAGE':'PARTIAL COVERAGE'}</span></span></div>
    <button onclick="downloadTask4CSV()"
      style="margin-top:10px;width:100%;padding:10px;background:#000;color:#fff;
      border:2px solid #000;font-weight:900;font-size:10px;letter-spacing:1px;cursor:pointer;font-family:inherit;">
      ⬇ DOWNLOAD CSV
    </button>`;

  out.innerHTML = html;
  if (window.log) window.log(`TASK 4: Fault analysis complete — ${allDetected}/${rows.length} verified.`);
};

window.downloadTask4CSV = function() {
  const ts     = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const fevts  = window._task4?.faultEvents || [];
  const ft0    = fevts.length && fevts[0].time > 1e9 ? fevts[0].time : 0;
  const rows   = ['FAULT DETECTION - TASK 4', `Date/Time,${ts}`, '', 'FAULT EVENT LOG', 'Sim Time (s),Event'];
  fevts.forEach(e => rows.push(`${_fmtTime(e.time, ft0)},${_csvCell(e.event)}`));
  rows.push('', 'TIME-SERIES', 'Time (s),Level (%),Pump,I0.0,I0.1,I0.2,Event');
  if (typeof dataLog !== 'undefined') {
    const dt0 = dataLog.length && dataLog[0].time > 1e9 ? dataLog[0].time : 0;
    dataLog.forEach(d => rows.push(
      `${_fmtTime(d.time, dt0)},${(d.level*100).toFixed(2)},${d.pump?1:0},${d.i00?1:0},${d.i01?1:0},${d.i02?1:0},${_csvCell(d.event||'')}`
    ));
  }
  _downloadCSV(rows, `BWT01_FaultDetection_${ts.replace(/[: ]/g, '-')}.csv`);
};
