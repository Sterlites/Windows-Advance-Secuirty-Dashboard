
// Mission Control Client State Engine
let latestTelemetry = null;
let isExecuting = false;
let executionStartTime = 0;
let tickerInterval = null;
let sseConnection = null;
const executionLedger = [];

// Micro-fault isolation boundary
function safeRender(containerId, renderFn, componentName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    renderFn(container);
  } catch (err) {
    console.error('[MICRO-FAULT ISOLATION] Component failure:', componentName, err);
    container.innerHTML =
      '<div class="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 font-mono text-xs space-y-2">' +
        '<div class="flex items-center justify-between">' +
          '<span class="font-bold flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>[MICRO-FAULT ISOLATED] ' + componentName + '</span>' +
          '<button onclick="fetchTelemetry(false)" class="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 cursor-pointer">Retry Feed</button>' +
        '</div>' +
        '<p class="text-rose-400/80 text-[11px]">Component telemetry schema anomaly isolated. Remainder of Mission Control Bridge remains fully operational.</p>' +
      '</div>';
  }
}

// Terminal Readout Engine
function appendTerminalLog(type, text) {
  const term = document.getElementById('terminalOutput');
  if (!term) return;

  const now = new Date().toTimeString().split(' ')[0];
  const div = document.createElement('div');
  div.className = 'py-0.5 flex gap-2 items-start font-mono text-xs leading-relaxed';

  let color = 'text-slate-300';
  let badge = 'INFO';
  let badgeColor = 'text-cyan-400 bg-cyan-950/60 border border-cyan-800/60';

  if (type === 'stderr' || type === 'error') {
    color = 'text-rose-300';
    badge = 'ERROR';
    badgeColor = 'text-rose-400 bg-rose-950/60 border border-rose-800/60';
  } else if (type === 'success') {
    color = 'text-emerald-300 font-semibold';
    badge = 'SETTLED';
    badgeColor = 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60';
  } else if (type === 'state') {
    color = 'text-amber-300';
    badge = 'STATE';
    badgeColor = 'text-amber-400 bg-amber-950/60 border border-amber-800/60';
  } else if (type === 'ai') {
    color = 'text-indigo-300';
    badge = 'AI';
    badgeColor = 'text-indigo-400 bg-indigo-950/60 border border-indigo-800/60';
  }

  div.innerHTML =
    '<span class="text-slate-600 select-none">' + now + '</span>' +
    '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold ' + badgeColor + '">' + badge + '</span>' +
    '<span class="' + color + ' whitespace-pre-wrap break-all flex-1">' + escapeHtml(text) + '</span>';

  term.appendChild(div);

  const autoScroll = document.getElementById('termAutoScroll')?.checked;
  if (autoScroll !== false) {
    term.scrollTop = term.scrollHeight;
  }
}

function clearTerminal() {
  const term = document.getElementById('terminalOutput');
  if (term) term.innerHTML = '';
  appendTerminalLog('state', '[TERMINAL] Console cleared by operator.');
}

function copyTerminalOutput() {
  const term = document.getElementById('terminalOutput');
  if (!term) return;
  navigator.clipboard.writeText(term.innerText).then(() => {
    appendTerminalLog('state', '[CLIPBOARD] Terminal stream copied to system clipboard.');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Server-Sent Events (SSE) Loopback Listener
function initSSE() {
  const sseBadge = document.getElementById('sseBadge');
  if (sseConnection) {
    try { sseConnection.close(); } catch {}
  }

  sseConnection = new EventSource('/api/stream');

  sseConnection.onopen = () => {
    if (sseBadge) {
      sseBadge.textContent = 'SSE: LINK ACTIVE';
      sseBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5';
    }
    appendTerminalLog('state', '[SSE LOOPBACK] Bi-directional telemetry stream established on /api/stream.');
  };

  sseConnection.addEventListener('connected', (e) => {
    if (sseBadge) {
      sseBadge.textContent = 'SSE: LINK ACTIVE';
      sseBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5';
    }
  });

  sseConnection.addEventListener('terminal_log', (e) => {
    try {
      const data = JSON.parse(e.data);
      appendTerminalLog(data.type, data.text);
    } catch {}
  });

  sseConnection.addEventListener('state_transition', (e) => {
    try {
      const data = JSON.parse(e.data);
      handleServerStateTransition(data);
    } catch {}
  });

  sseConnection.addEventListener('telemetry_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      latestTelemetry = data;
      renderAllComponents(data);
    } catch {}
  });

  sseConnection.onerror = () => {
    if (sseBadge) {
      sseBadge.textContent = 'SSE: RECONNECTING';
      sseBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5';
    }
  };
}

// Deterministic State Machine Transitions (Active ONLY during Remediation Execution)
function lockInteractiveControls(actionTitle, estimatedDurationMs = 2500) {
  isExecuting = true;
  executionStartTime = Date.now();

  const overlay = document.getElementById('freezeOverlay');
  const actionNameEl = document.getElementById('freezeActionName');
  const progressFill = document.getElementById('freezeProgressFill');
  const tickerEl = document.getElementById('freezeTicker');
  const pipelineBadge = document.getElementById('pipelineStateBadge');

  if (overlay) overlay.classList.remove('hidden');
  if (actionNameEl) actionNameEl.textContent = actionTitle;
  if (pipelineBadge) {
    pipelineBadge.textContent = 'STATE: LOCKED (EXECUTING)';
    pipelineBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40';
  }

  // Disable buttons globally to prevent race conditions during mutations
  document.querySelectorAll('button:not(#freezeCancelBtn)').forEach(btn => {
    btn.setAttribute('data-prev-disabled', btn.disabled);
    btn.disabled = true;
  });

  if (tickerInterval) clearInterval(tickerInterval);
  tickerInterval = setInterval(() => {
    const elapsed = Date.now() - executionStartTime;
    if (tickerEl) tickerEl.textContent = (elapsed / 1000).toFixed(2) + 's';
    if (progressFill) {
      const pct = Math.min(95, Math.round((elapsed / estimatedDurationMs) * 100));
      progressFill.style.width = pct + '%';
    }
  }, 50);
}

function unlockInteractiveControls(success = true, settlementMsg = '') {
  isExecuting = false;
  if (tickerInterval) clearInterval(tickerInterval);

  const overlay = document.getElementById('freezeOverlay');
  const pipelineBadge = document.getElementById('pipelineStateBadge');
  const progressFill = document.getElementById('freezeProgressFill');

  if (progressFill) progressFill.style.width = '100%';

  setTimeout(() => {
    if (overlay) overlay.classList.add('hidden');
    if (pipelineBadge) {
      pipelineBadge.textContent = 'STATE: IDLE (READY)';
      pipelineBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    }

    document.querySelectorAll('button').forEach(btn => {
      const prev = btn.getAttribute('data-prev-disabled');
      btn.disabled = prev === 'true';
      btn.removeAttribute('data-prev-disabled');
    });

    if (settlementMsg) {
      showSettlementBanner(settlementMsg, success);
    }
  }, 400);
}

function handleServerStateTransition(data) {
  if (data.state === 'EXECUTING') {
    lockInteractiveControls(data.title || data.actionId, data.estimatedMs || 2500);
  } else if (data.state === 'SETTLED_SUCCESS') {
    unlockInteractiveControls(true, 'Immutable deployment settled: ' + (data.title || data.actionId) + ' (0 errors, ' + data.durationMs + 'ms)');
    recordExecutionHistory(data.actionId, data.title, 'SUCCESS', data.durationMs);
  } else if (data.state === 'SETTLED_FAILURE') {
    unlockInteractiveControls(false, 'Execution fault: ' + (data.title || data.actionId) + ' exited with code ' + data.exitCode);
    recordExecutionHistory(data.actionId, data.title, 'FAILED', data.durationMs);
  }
}

function recordExecutionHistory(actionId, title, status, durationMs) {
  executionLedger.unshift({
    timestamp: new Date().toLocaleTimeString(),
    actionId,
    title: title || actionId,
    status,
    durationMs
  });
  if (executionLedger.length > 10) executionLedger.pop();
  safeRender('historyLedger', renderHistoryLedger, 'Audit History Ledger');
}

function showSettlementBanner(msg, isSuccess = true) {
  const banner = document.getElementById('settlementBanner');
  if (!banner) return;
  banner.classList.remove('hidden');
  banner.className = isSuccess
    ? 'glass rounded-xl p-3 border border-emerald-500/50 text-emerald-300 font-mono text-xs flex items-center justify-between shadow-[0_0_20px_rgba(16,185,129,0.2)]'
    : 'glass rounded-xl p-3 border border-rose-500/50 text-rose-300 font-mono text-xs flex items-center justify-between shadow-[0_0_20px_rgba(244,63,94,0.2)]';
  banner.innerHTML =
    '<div class="flex items-center gap-2">' +
      '<span class="w-2.5 h-2.5 rounded-full ' + (isSuccess ? 'bg-emerald-400' : 'bg-rose-400') + ' animate-pulse"></span>' +
      '<span>' + escapeHtml(msg) + '</span>' +
    '</div>' +
    '<button onclick="document.getElementById(\'settlementBanner\').classList.add(\'hidden\')" class="text-slate-400 hover:text-white text-sm cursor-pointer">✕</button>';
}

// Telemetry Fetcher (Non-blocking, sub-second)
async function fetchTelemetry(force = false) {
  if (isExecuting) return;
  const btn = document.getElementById('refreshBtn');
  const adminBadge = document.getElementById('adminBadge');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>Scanning...</span>';
  }
  if (adminBadge) adminBadge.textContent = 'Scanning Telemetry...';

  try {
    const res = await fetch('/api/telemetry' + (force ? '?force=1' : ''));
    const data = await res.json();
    if (!res.ok || data.error) {
      appendTerminalLog('error', '[TELEMETRY FAULT] ' + (data.error || 'Unknown scanner error'));
      return;
    }
    latestTelemetry = data;
    renderAllComponents(data);
  } catch (err) {
    appendTerminalLog('error', '[NETWORK FAULT] Connection to local Bun server failed: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>⟳</span><span>Rescan Host</span>';
    }
  }
}

// Master Render Orchestrator
function renderAllComponents(d) {
  if (!d) return;
  safeRender('sysHeaderDeck', () => renderSystemHeader(d), 'System Telemetry Deck');
  safeRender('anomalyDeck', () => renderAnomalyQueue(d), 'Anomaly Priority Queue');
  safeRender('secGrid', () => renderSecurityMatrix(d), 'Core Hardening Matrix');
  safeRender('diskList', () => renderDisks(d), 'Storage & BitLocker Matrix');
  safeRender('netTable', () => renderNetwork(d), 'Network Radar');
  safeRender('autorunList', () => renderAutoruns(d), 'Startup & Persistence Sentinel');
  safeRender('eventList', () => renderEvents(d), 'System Event Log');
  safeRender('historyLedger', renderHistoryLedger, 'Audit History Ledger');
}

function setElText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val !== undefined && val !== null ? val : '--';
}

function renderSystemHeader(d) {
  const sys = d.system || {};
  const s = d.security || {};

  setElText('hostVal', sys.hostname || 'UNKNOWN_HOST');
  setElText('osVal', (sys.osName || 'Windows 11') + ' • ' + (sys.osBuild || ''));
  setElText('cpuVal', (sys.cpu || 'CPU') + ' (' + (sys.cores || 0) + ' Cores)');
  setElText('gpuVal', sys.gpu || 'Standard Display');
  setElText('biosVal', 'BIOS: ' + (sys.bios || 'N/A'));
  setElText('uptimeVal', 'Uptime: ' + (sys.uptime || '0d 0h 0m'));

  const score = d.score ?? 0;
  setElText('scoreVal', score);
  const scoreFillEl = document.getElementById('scoreFill');
  if (scoreFillEl) {
    scoreFillEl.style.width = score + '%';
    scoreFillEl.className = 'h-full transition-all duration-700 ' +
      (score >= 80 ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : score >= 55 ? 'bg-amber-400 shadow-[0_0_12px_#fbbf24]' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]');
  }

  setElText('cpuLoadVal', (sys.cpuLoad ?? 0) + '%');
  setElText('ramLoadVal', (sys.ramPct ?? 0) + '%');
  setElText('ramDetails', (sys.ramFree ?? 0) + ' GB free of ' + (sys.ramTotal ?? 0) + ' GB');

  const adminBadge = document.getElementById('adminBadge');
  if (adminBadge) {
    adminBadge.textContent = (d.isAdmin ? 'ADMINISTRATOR MODE' : 'STANDARD OPERATOR') + ' (' + (d.scanTimeMs || 0) + 'ms)';
    adminBadge.className = d.isAdmin
      ? 'text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
      : 'text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40';
  }

  // Tickers
  const criticalCount = (d.anomalies || []).filter(a => a.priority === 'critical').length;
  const warningCount = (d.anomalies || []).filter(a => a.priority === 'warning').length;
  const netHighCount = (d.network || []).filter(n => n.risk === 'High').length;

  setElText('tickerCritical', criticalCount);
  setElText('tickerWarning', warningCount);
  setElText('tickerHighRiskPorts', netHighCount);
  setElText('tickerAutoruns', (d.autoruns || []).length);
}

function renderAnomalyQueue(d) {
  const container = document.getElementById('anomalyDeck');
  if (!container) return;
  const anomalies = d.anomalies || [];

  if (!anomalies.length) {
    container.innerHTML =
      '<div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center justify-between">' +
        '<span>✓ ZERO ACTIVE ANOMALIES DETECTED — SYSTEM POSTURE OPTIMAL</span>' +
        '<span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">HARDENED</span>' +
      '</div>';
    return;
  }

  container.innerHTML = anomalies.map(a => {
    let priorityBadge = '';
    let borderClass = '';
    if (a.priority === 'critical') {
      priorityBadge = '<span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">CRITICAL</span>';
      borderClass = 'border-rose-500/40 hover:border-rose-500/70 bg-rose-950/20';
    } else if (a.priority === 'warning') {
      priorityBadge = '<span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">WARNING</span>';
      borderClass = 'border-amber-500/40 hover:border-amber-500/70 bg-amber-950/20';
    } else {
      priorityBadge = '<span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">OPTIMIZING</span>';
      borderClass = 'border-cyan-500/40 hover:border-cyan-500/70 bg-cyan-950/20';
    }

    const actionBtn = a.actionId
      ? '<button onclick="triggerRemediation(\'' + a.actionId + '\')" class="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 transition cursor-pointer">Quick Enforce ⚡</button>'
      : '<span class="text-[11px] text-slate-500 font-mono">Manual Hardening</span>';

    return (
      '<div class="p-3 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ' + borderClass + '">' +
        '<div class="space-y-1">' +
          '<div class="flex items-center gap-2">' +
            priorityBadge +
            '<span class="text-xs font-bold text-white font-mono">' + escapeHtml(a.title) + '</span>' +
          '</div>' +
          '<div class="text-[11px] text-slate-400 leading-snug">' + escapeHtml(a.desc) + '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 self-end md:self-center">' + actionBtn + '</div>' +
      '</div>'
    );
  }).join('');
}

function pill(ok, trueText = 'SECURED', falseText = 'EXPOSED') {
  return ok
    ? '<span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' + trueText + '</span>'
    : '<span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>' + falseText + '</span>';
}

function renderSecurityMatrix(d) {
  const container = document.getElementById('secGrid');
  if (!container) return;
  const s = d.security || {};
  const items = [
    ['Defender Real-Time Protection', s.realTimeProtection, 'Kernel filesystem telemetry'],
    ['Tamper Protection Engine', s.tamperProtection, 'Service lock protection'],
    ['HVCI Memory Integrity', s.hvciEnabled, 'Hypervisor hardware isolation'],
    ['Virtualization-Based Security (VBS)', s.vbsEnabled, 'Isolated security enclave'],
    ['LSA RunAsPPL Credential Guard', s.lsaPPL, 'Mitigates LSASS memory dumping'],
    ['SMBv1 Legacy Protocol Disabled', !s.smb1Enabled, 'Blocks EternalBlue lateral spread'],
    ['SMB Packet Signing Required', s.smbSigning, 'Stops NTLM Relay attacks'],
    ['LLMNR Multicast Spoofing Disabled', s.llmnrDisabled, 'Mitigates LAN hash poisoning'],
    ['PUA / PUP Adware Blocking', s.puaProtection, 'Blocks bundleware & coin-miners'],
    ['Threat Signatures Freshness', (s.antivirusSigAge ?? 0) <= 2, (s.antivirusSigAge || 0) + ' days old']
  ];

  container.innerHTML = items.map(([label, ok, desc]) =>
    '<div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between">' +
      '<div>' +
        '<div class="text-xs font-semibold text-white">' + label + '</div>' +
        '<div class="text-[10px] text-slate-500 font-mono mt-0.5">' + desc + '</div>' +
      '</div>' +
      '<div>' + pill(ok) + '</div>' +
    '</div>'
  ).join('');
}

function renderDisks(d) {
  const container = document.getElementById('diskList');
  if (!container) return;
  container.innerHTML = (d.disks || []).map(disk =>
    '<div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">' +
      '<div class="flex justify-between items-center text-xs font-semibold">' +
        '<span class="text-white font-mono">' + disk.drive + ' (' + (disk.label || 'Local Disk') + ')</span>' +
        '<span class="text-slate-400 font-mono">' + disk.usedPct + '% USED</span>' +
      '</div>' +
      '<div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">' +
        '<div class="h-full bg-cyan-500" style="width: ' + disk.usedPct + '%"></div>' +
      '</div>' +
      '<div class="flex justify-between text-[11px] text-slate-400 font-mono">' +
        '<span>Free: ' + disk.freeGB + ' GB / ' + disk.totalGB + ' GB</span>' +
        '<span>BitLocker: <strong class="text-cyan-400">' + disk.bitlocker + '</strong></span>' +
      '</div>' +
    '</div>'
  ).join('');
}

function renderNetwork(d) {
  const container = document.getElementById('netTable');
  if (!container) return;
  const list = d.network || [];
  if (!list.length) {
    container.innerHTML = '<tr><td colspan="5" class="py-3 text-slate-500 text-center font-mono">No external TCP endpoints listening.</td></tr>';
    return;
  }
  container.innerHTML = list.map(n =>
    '<tr class="hover:bg-slate-800/40 transition">' +
      '<td class="py-2.5 text-white font-semibold font-mono text-xs">' + escapeHtml(n.process) + ' <span class="text-slate-500">(' + n.pid + ')</span></td>' +
      '<td class="py-2.5 text-slate-300 font-mono text-xs">' + escapeHtml(n.localAddress) + ':' + n.localPort + '</td>' +
      '<td class="py-2.5 text-slate-400 font-mono text-xs">' + escapeHtml(n.remoteAddress) + ':' + n.remotePort + '</td>' +
      '<td class="py-2.5 text-cyan-400 font-mono text-xs">' + escapeHtml(n.state) + '</td>' +
      '<td class="py-2.5">' +
        (n.risk === 'High'
          ? '<span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">HIGH EXPOSURE</span>'
          : n.risk === 'Medium'
          ? '<span class="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">LISTEN</span>'
          : '<span class="text-[10px] px-2 py-0.5 rounded font-mono text-slate-400">LOW</span>') +
      '</td>' +
    '</tr>'
  ).join('');
}

function renderAutoruns(d) {
  const container = document.getElementById('autorunList');
  if (!container) return;
  const list = d.autoruns || [];
  if (!list.length) {
    container.innerHTML = '<div class="text-xs text-slate-500 font-mono p-3">No startup persistence entries registered.</div>';
    return;
  }
  container.innerHTML = list.map(a =>
    '<div class="p-2.5 rounded-xl bg-slate-900/80 border ' + (a.suspicious ? 'border-rose-500/50 bg-rose-950/20' : 'border-slate-800') + ' space-y-1">' +
      '<div class="flex justify-between items-center text-xs font-semibold">' +
        '<span class="text-white">' + escapeHtml(a.name) + '</span>' +
        (a.suspicious
          ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold">SUSPICIOUS PATH</span>'
          : '<span class="text-[10px] text-slate-500 font-mono">' + escapeHtml(a.user) + '</span>') +
      '</div>' +
      '<div class="text-[11px] text-slate-400 font-mono truncate" title="' + escapeHtml(a.command) + '">' + escapeHtml(a.command) + '</div>' +
    '</div>'
  ).join('');
}

function renderEvents(d) {
  const container = document.getElementById('eventList');
  if (!container) return;
  const events = d.events || [];
  if (!events.length) {
    container.innerHTML = '<div class="text-xs text-slate-500 font-mono p-3">No recent warning or error system events detected.</div>';
    return;
  }
  container.innerHTML = events.map(e =>
    '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">' +
      '<div class="flex justify-between items-center text-xs font-mono font-semibold">' +
        '<span class="text-rose-400">Event ID ' + e.id + ' • ' + escapeHtml(e.level) + '</span>' +
        '<span class="text-slate-500 text-[10px]">' + escapeHtml(e.time) + '</span>' +
      '</div>' +
      '<div class="text-[11px] text-slate-300 leading-snug">' + escapeHtml(e.message) + '</div>' +
    '</div>'
  ).join('');
}

function renderHistoryLedger() {
  const container = document.getElementById('historyLedger');
  if (!container) return;

  if (!executionLedger.length) {
    container.innerHTML = '<div class="text-xs text-slate-500 font-mono p-3">No actions executed in this session yet.</div>';
    return;
  }

  container.innerHTML = executionLedger.map(item =>
    '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">' +
      '<div class="flex items-center gap-2">' +
        '<span class="text-slate-500 text-[10px]">' + item.timestamp + '</span>' +
        '<span class="font-semibold text-white">' + escapeHtml(item.title) + '</span>' +
        '<span class="text-[10px] text-slate-400">(' + item.durationMs + 'ms)</span>' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        (item.status === 'SUCCESS'
          ? '<span class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">SUCCESS</span>'
          : '<span class="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">FAILED</span>') +
        (item.actionId && !item.actionId.startsWith('disable_') && item.actionId !== 'flush_dns' && item.actionId !== 'update_signatures'
          ? '<button onclick="triggerRemediation(\'disable_' + item.actionId.replace('enable_', '') + '\')" class="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer">Revert ↺</button>'
          : '') +
      '</div>' +
    '</div>'
  ).join('');
}

// Action Dispatcher (Engages Deterministic State Machine)
async function triggerRemediation(actionId) {
  if (isExecuting) return;

  const btn = event?.currentTarget;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/remediate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      appendTerminalLog('error', '[EXECUTION ERROR] ' + (data.error || 'Unknown remediation failure'));
    }
  } catch (err) {
    appendTerminalLog('error', '[NETWORK FAULT] Failed to dispatch action: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// AI Neural Audit Engine
async function runAiAudit() {
  if (isExecuting) return;
  if (!latestTelemetry) {
    alert('Wait for telemetry scan to finish before launching AI audit.');
    return;
  }

  const btn = document.getElementById('aiBtn');
  const panel = document.getElementById('aiPanel');
  const output = document.getElementById('aiOutput');
  const keyInput = document.getElementById('apiKeyInput');

  if (panel) panel.classList.remove('hidden');
  if (output) output.textContent = 'Ingesting sanitized machine telemetry and querying Gemini Neural Engine...';
  if (btn) btn.disabled = true;

  appendTerminalLog('ai', '[AI AUDIT] Sanitizing telemetry payload and invoking Gemini...');

  try {
    const res = await fetch('/api/ai-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telemetry: latestTelemetry,
        apiKey: keyInput ? keyInput.value.trim() : ''
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      if (output) output.textContent = 'AI Audit Error:
' + (data.error || 'Failed to complete analysis.');
      appendTerminalLog('error', '[AI FAULT] ' + (data.error || 'API request error'));
    } else {
      if (output) output.textContent = data.analysis;
      appendTerminalLog('ai', '[AI SETTLED] Neural recommendations generated successfully.');
    }
  } catch (err) {
    if (output) output.textContent = 'Connection error: ' + err.message;
    appendTerminalLog('error', '[AI NETWORK FAULT] ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Resilient Bootstrap Runner (Executes immediately even if DOMContentLoaded already fired)
function bootstrapSentinel() {
  initSSE();
  fetchTelemetry(false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapSentinel);
} else {
  bootstrapSentinel();
}
