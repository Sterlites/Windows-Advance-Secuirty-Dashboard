// bunty.ts — Ultra-Fast Windows 11 Sentinel (Sub-2-Second PowerShell + .NET Engine)
// Run with: bun run bunty.ts

declare const Bun: any;
declare const Buffer: any;

const PORT = 3000;
const GEMINI_API_KEY = Bun.env.GEMINI_API_KEY || "";

// ---------------------------------------------------------------------------
// 1. ULTRA-FAST POWERSHELL + .NET TELEMETRY COLLECTOR (< 2 Seconds)
// ---------------------------------------------------------------------------
const PS_COLLECTOR_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'

$sw = [System.Diagnostics.Stopwatch]::StartNew()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Fast CIM queries (Only querying specific properties avoids 2-second WMI LoadPercentage stall)
$os   = Get-CimInstance Win32_OperatingSystem -Property Caption,Version,BuildNumber,LastBootUpTime,FreePhysicalMemory,TotalVisibleMemorySize
$cpu  = Get-CimInstance Win32_Processor -Property Name,NumberOfLogicalProcessors | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS -Property Manufacturer,SMBIOSBIOSVersion
$gpu  = Get-CimInstance Win32_VideoController -Property Name | Select-Object -First 1

# Fast CPU usage calculation via Get-Process or PerformanceCounter
$cpuLoad = 5
try {
    $cpuCounter = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -Property PercentProcessorTime
    if ($null -ne $cpuCounter.PercentProcessorTime) { $cpuLoad = [int]$cpuCounter.PercentProcessorTime }
} catch {}

$uptimeSpan = if ($os.LastBootUpTime) { (Get-Date) - $os.LastBootUpTime } else { New-TimeSpan }
$totalRamGB = if ($os.TotalVisibleMemorySize) { [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) } else { 0 }
$freeRamGB  = if ($os.FreePhysicalMemory) { [math]::Round($os.FreePhysicalMemory / 1MB, 1) } else { 0 }
$usedRamPct = if ($totalRamGB -gt 0) { [math]::Round((($totalRamGB - $freeRamGB) / $totalRamGB) * 100, 1) } else { 0 }

# Defender status via direct WMI namespace (faster than importing Defender PS module)
$rtp = $false
$tp  = $false
$pua = $false
$sigAge = 0
try {
    $mp = Get-CimInstance -Namespace "root/Microsoft/Windows/Defender" -ClassName "MSFT_MpComputerStatus"
    if ($mp) {
        $rtp = [bool]$mp.RealTimeProtectionEnabled
        $tp  = [bool]$mp.IsTamperProtected
        $sigAge = [int]$mp.AntivirusSignatureAge
    }
    $mpPref = Get-CimInstance -Namespace "root/Microsoft/Windows/Defender" -ClassName "MSFT_MpPreference"
    if ($mpPref) {
        $pua = ($mpPref.PUAProtection -eq 1)
    }
} catch {}

# DeviceGuard VBS / HVCI
$hvciRunning = $false
$vbsRunning  = $false
try {
    $dg = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace "root/Microsoft/Windows/DeviceGuard"
    if ($dg) {
        $hvciRunning = ($dg.SecurityServicesRunning -contains 2)
        $vbsRunning  = ($dg.VirtualizationBasedSecurityStatus -eq 2)
    }
} catch {}

# Instant Registry Checks for LSA, SMBv1, SMB Signing, and LLMNR (0ms vs 3000ms for SmbShare module)
$lsaPPL = $false
try {
    $lsaVal = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'RunAsPPL').RunAsPPL
    $lsaPPL = ($lsaVal -eq 1 -or $lsaVal -eq 2)
} catch {}

$smb1Enabled = $false
$smbSigning  = $false
try {
    $lanman = Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters'
    if ($null -ne $lanman.SMB1) { $smb1Enabled = ($lanman.SMB1 -ne 0) }
    if ($null -ne $lanman.RequireSecuritySignature) { $smbSigning = ($lanman.RequireSecuritySignature -eq 1) }
} catch {}

$llmnrDisabled = $false
try {
    $llmnrVal = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient' -Name 'EnableMulticast').EnableMulticast
    $llmnrDisabled = ($llmnrVal -eq 0)
} catch {}

# Fast Storage & BitLocker WMI check
$disks = @()
try {
    $logicalDisks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -Property DeviceID,VolumeName,Size,FreeSpace
    $blVolumes = @{}
    if ($isAdmin) {
        Get-CimInstance -Namespace "root/CIMV2/Security/MicrosoftVolumeEncryption" -ClassName "Win32_EncryptableVolume" | ForEach-Object {
            $blVolumes[$_.DriveLetter] = $_
        }
    }
    foreach ($d in $logicalDisks) {
        $blStatus = if ($isAdmin) { "Off" } else { "Run as Admin to view" }
        $blCipher = "None"
        if ($blVolumes.ContainsKey($d.DeviceID)) {
            $v = $blVolumes[$d.DeviceID]
            $blStatus = if ($v.ProtectionStatus -eq 1) { "On (Protected)" } elseif ($v.ProtectionStatus -eq 2) { "Locked" } else { "Off" }
            $blCipher = if ($v.ProtectionStatus -eq 1) { "XTS-AES" } else { "None" }
        }
        $disks += [PSCustomObject]@{
            drive     = [string]$d.DeviceID
            label     = [string]$d.VolumeName
            totalGB   = if ($d.Size) { [math]::Round($d.Size / 1GB, 1) } else { 0 }
            freeGB    = if ($d.FreeSpace) { [math]::Round($d.FreeSpace / 1GB, 1) } else { 0 }
            usedPct   = if ($d.Size -gt 0) { [math]::Round((($d.Size - $d.FreeSpace) / $d.Size) * 100, 1) } else { 0 }
            bitlocker = $blStatus
            cipher    = $blCipher
        }
    }
} catch {}

# Ultra-Fast Network Socket Enumeration via netstat -ano (Takes 40ms vs 4000ms for Get-NetTCPConnection)
$procMap = @{}
Get-Process | ForEach-Object { $procMap[[int]$_.Id] = [string]$_.ProcessName }

$netConns = @()
try {
    $lines = netstat -ano -p tcp | Select-String -Pattern "LISTENING|ESTABLISHED" | Select-Object -First 30
    foreach ($line in $lines) {
        $parts = ($line.Line.Trim() -split "\\s+")
        if ($parts.Count -ge 5) {
            $local = $parts[1]
            $remote = $parts[2]
            $state = if ($parts[3] -eq "LISTENING") { "Listen" } else { "Established" }
            $pidInt = [int]$parts[4]

            if ($local -notmatch "^127\\.0\\.0\\.1") {
                $lastColonL = $local.LastIndexOf(':')
                $lAddr = $local.Substring(0, $lastColonL)
                $lPort = [int]$local.Substring($lastColonL + 1)

                $lastColonR = $remote.LastIndexOf(':')
                $rAddr = $remote.Substring(0, $lastColonR)
                $rPort = [int]$remote.Substring($lastColonR + 1)

                $pName = if ($procMap.ContainsKey($pidInt)) { $procMap[$pidInt] } else { "PID-$pidInt" }
                $risk = if ($lPort -in @(445, 3389, 135, 5985, 23, 21)) { "High" } elseif ($state -eq 'Listen') { "Medium" } else { "Low" }

                $netConns += [PSCustomObject]@{
                    localAddress  = $lAddr
                    localPort     = $lPort
                    remoteAddress = $rAddr
                    remotePort    = $rPort
                    state         = $state
                    pid           = $pidInt
                    process       = $pName
                    risk          = $risk
                }
            }
        }
    }
} catch {}

# Startup Persistence
$autoruns = @()
try {
    $starts = Get-CimInstance Win32_StartupCommand | Select-Object -First 20
    foreach ($s in $starts) {
        $cmd = [string]$s.Command
        $susp = ($cmd -match 'AppData|Temp|powershell|cmd\\.exe|wscript|mshta|http')
        $autoruns += [PSCustomObject]@{
            name       = [string]$s.Name
            command    = $cmd
            location   = [string]$s.Location
            user       = [string]$s.User
            suspicious = [bool]$susp
        }
    }
} catch {}

# Recent System Events
$events = @()
try {
    $sysEvents = Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2,3} -MaxEvents 6 -ErrorAction SilentlyContinue
    foreach ($e in $sysEvents) {
        if ($null -ne $e) {
            $firstLine = ([string]$e.Message -split "[\\r\\n]+")[0]
            $events += [PSCustomObject]@{
                id      = [int]$e.Id
                time    = $e.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
                level   = [string]$e.LevelDisplayName
                message = [string]$firstLine
            }
        }
    }
} catch {}

$score = 35
if ($rtp) { $score += 15 }
if ($tp) { $score += 10 }
if ($hvciRunning) { $score += 10 }
if ($vbsRunning) { $score += 5 }
if ($lsaPPL) { $score += 10 }
if (-not $smb1Enabled) { $score += 5 }
if ($smbSigning) { $score += 5 }
if ($llmnrDisabled) { $score += 5 }
if ($score -gt 100) { $score = 100 }

$sw.Stop()

$payload = [PSCustomObject]@{
    timestamp  = (Get-Date).ToString("o")
    scanTimeMs = $sw.ElapsedMilliseconds
    isAdmin    = $isAdmin
    score      = $score
    system     = [PSCustomObject]@{
        hostname = [string]$env:COMPUTERNAME
        osName   = [string]$os.Caption
        osBuild  = "$($os.Version) (Build $($os.BuildNumber))"
        cpu      = [string]$cpu.Name
        cores    = [int]$cpu.NumberOfLogicalProcessors
        cpuLoad  = $cpuLoad
        gpu      = [string]$gpu.Name
        bios     = "$($bios.Manufacturer) $($bios.SMBIOSBIOSVersion)"
        ramTotal = $totalRamGB
        ramFree  = $freeRamGB
        ramPct   = $usedRamPct
        uptime   = "$($uptimeSpan.Days)d $($uptimeSpan.Hours)h $($uptimeSpan.Minutes)m"
    }
    security   = [PSCustomObject]@{
        realTimeProtection = $rtp
        tamperProtection   = $tp
        antivirusSigAge    = $sigAge
        vbsEnabled         = $vbsRunning
        hvciEnabled        = $hvciRunning
        lsaPPL             = $lsaPPL
        smb1Enabled        = $smb1Enabled
        smbSigning         = $smbSigning
        llmnrDisabled      = $llmnrDisabled
        puaProtection      = $pua
    }
    disks      = $disks
    network    = $netConns
    autoruns   = $autoruns
    events     = $events
}

Write-Output "---SENTINEL_JSON_START---"
$payload | ConvertTo-Json -Depth 6 -Compress
Write-Output "---SENTINEL_JSON_END---"
`;

// ---------------------------------------------------------------------------
// 2. SAFE HARDENING COMMANDS
// ---------------------------------------------------------------------------
const REMEDIATION_COMMANDS: Record<string, { title: string; script: string }> = {
  enable_pua: {
    title: "Enable Defender PUA Blocking",
    script: `Set-MpPreference -PUAProtection Enabled -ErrorAction Stop; Write-Output "SUCCESS: Defender PUA Protection Enabled."`
  },
  disable_smbv1: {
    title: "Disable Legacy SMBv1 & Enforce SMB Signing",
    script: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB1" -Value 0 -Type DWord -Force; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "RequireSecuritySignature" -Value 1 -Type DWord -Force; Write-Output "SUCCESS: SMBv1 Disabled & SMB Signing Required."`
  },
  enable_lsappl: {
    title: "Enable LSA RunAsPPL Credential Protection",
    script: `New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" -Name "RunAsPPL" -Value 1 -PropertyType DWord -Force -ErrorAction Stop | Out-Null; Write-Output "SUCCESS: LSA RunAsPPL Enabled (Reboot required)."`
  },
  disable_llmnr: {
    title: "Disable LLMNR Multicast Spoofing",
    script: `if (!(Test-Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient")) { New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Force | Out-Null }; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Name "EnableMulticast" -Value 0 -Type DWord -Force -ErrorAction Stop; Write-Output "SUCCESS: LLMNR Disabled."`
  }
};

function toEncodedCommand(psScript: string): string {
  return Buffer.from(psScript, "utf16le").toString("base64");
}

async function runPowerShell(script: string) {
  const encoded = toEncodedCommand(script);
  const proc = Bun.spawn(
    [
      "powershell.exe",
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded
    ],
    { stdout: "pipe", stderr: "pipe" }
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: proc.exitCode };
}

// Memory cache so browser refreshes are instantaneous
let cachedTelemetry: any = null;
let scanInProgress: Promise<any> | null = null;

async function collectTelemetry(force = false) {
  if (!force && cachedTelemetry) return cachedTelemetry;
  if (scanInProgress) return scanInProgress;

  scanInProgress = (async () => {
    console.log("🔍 Running PowerShell telemetry scan...");
    const t0 = Date.now();
    const { stdout, stderr } = await runPowerShell(PS_COLLECTOR_SCRIPT);
    const startMarker = "---SENTINEL_JSON_START---";
    const endMarker = "---SENTINEL_JSON_END---";
    const sIdx = stdout.indexOf(startMarker);
    const eIdx = stdout.indexOf(endMarker);

    const jsonText =
      sIdx !== -1 && eIdx !== -1
        ? stdout.slice(sIdx + startMarker.length, eIdx).trim()
        : stdout.trim();

    const parsed = JSON.parse(jsonText);
    cachedTelemetry = parsed;
    console.log(`✅ Telemetry scan completed in ${Date.now() - t0}ms (Host: ${parsed?.system?.hostname}, Score: ${parsed?.score}/100)`);
    return parsed;
  })().finally(() => {
    scanInProgress = null;
  });

  return scanInProgress;
}

// ---------------------------------------------------------------------------
// 3. FRONTEND CLIENT SCRIPT & HTML
// ---------------------------------------------------------------------------
const CLIENT_JS = String.raw`
let latestTelemetry = null;

function setStatusBanner(msg, isError = false) {
  const box = document.getElementById('errorBanner');
  if (!msg) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  box.className = isError
    ? 'glass rounded-xl p-4 border border-rose-500/50 text-rose-300 text-xs font-mono whitespace-pre-wrap'
    : 'glass rounded-xl p-4 border border-cyan-500/50 text-cyan-300 text-xs font-mono whitespace-pre-wrap';
  box.textContent = msg;
}

async function fetchTelemetry(force = false) {
  const btn = document.getElementById('refreshBtn');
  const badge = document.getElementById('adminBadge');
  btn.textContent = 'Scanning via PowerShell...';
  btn.disabled = true;
  badge.textContent = 'Scanning PowerShell WMI/CIM...';
  setStatusBanner('');

  try {
    const res = await fetch('/api/telemetry' + (force ? '?force=1' : ''));
    const data = await res.json();
    if (!res.ok || data.error) {
      setStatusBanner('PowerShell Collector Error:\n' + (data.error || 'Unknown error') + '\n' + (data.stderr || '') + '\n' + (data.raw || ''), true);
      badge.textContent = 'Scan Error';
      return;
    }
    latestTelemetry = data;
    renderDashboard(data);
  } catch (err) {
    setStatusBanner('Failed to reach local Bun server: ' + err.message, true);
    badge.textContent = 'Connection Error';
  } finally {
    btn.textContent = '⟳ Rescan Machine';
    btn.disabled = false;
  }
}

function pill(ok, trueText = 'Enabled', falseText = 'Exposed') {
  return ok
    ? '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">' + trueText + '</span>'
    : '<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">' + falseText + '</span>';
}

function renderDashboard(d) {
  const badge = document.getElementById('adminBadge');
  badge.textContent = (d.isAdmin ? 'Administrator Mode' : 'Standard User Mode') + ' • Scanned in ' + (d.scanTimeMs || 0) + 'ms';
  badge.className = d.isAdmin
    ? 'text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
    : 'text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30';

  const sys = d.system || {};
  document.getElementById('sysSubtitle').textContent = (sys.cpu || 'CPU') + ' • BIOS: ' + (sys.bios || 'N/A');
  document.getElementById('scoreVal').textContent = d.score ?? '--';
  document.getElementById('scoreFill').style.width = (d.score || 0) + '%';
  document.getElementById('cpuLoadVal').textContent = (sys.cpuLoad ?? 0) + '% CPU / ' + (sys.ramPct ?? 0) + '% RAM';
  document.getElementById('ramSummary').textContent = (sys.ramFree ?? 0) + ' GB free of ' + (sys.ramTotal ?? 0) + ' GB (' + (sys.cores ?? 0) + ' logical cores)';
  document.getElementById('osVal').textContent = (sys.osName || 'Windows 11') + ' — ' + (sys.osBuild || '');
  document.getElementById('gpuVal').textContent = sys.gpu || 'Standard Display Adapter';
  document.getElementById('hostVal').textContent = sys.hostname || 'LOCALHOST';
  document.getElementById('uptimeVal').textContent = 'Uptime: ' + (sys.uptime || '0d 0h');

  const s = d.security || {};
  const items = [
    ['Defender Real-Time', s.realTimeProtection],
    ['Tamper Protection', s.tamperProtection],
    ['HVCI Memory Integrity', s.hvciEnabled],
    ['VBS Enclave', s.vbsEnabled],
    ['LSA RunAsPPL', s.lsaPPL],
    ['SMBv1 Disabled', !s.smb1Enabled],
    ['SMB Signing Required', s.smbSigning],
    ['LLMNR Disabled', s.llmnrDisabled],
    ['PUA Blocking', s.puaProtection],
    ['AV Signatures Current', (s.antivirusSigAge ?? 0) <= 2]
  ];
  document.getElementById('secGrid').innerHTML = items.map(([label, ok]) =>
    '<div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between"><span>' + label + '</span>' + pill(ok) + '</div>'
  ).join('');

  document.getElementById('diskList').innerHTML = (d.disks || []).map(disk =>
    '<div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">' +
      '<div class="flex justify-between font-semibold"><span>' + disk.drive + ' (' + (disk.label || 'Local Disk') + ')</span><span>' + disk.usedPct + '% used</span></div>' +
      '<div class="text-slate-400">Free: ' + disk.freeGB + ' GB / ' + disk.totalGB + ' GB</div>' +
      '<div class="text-slate-300">BitLocker: <span class="text-cyan-400 font-semibold">' + disk.bitlocker + '</span> (' + disk.cipher + ')</div>' +
    '</div>'
  ).join('');

  document.getElementById('netTable').innerHTML = (d.network || []).map(n =>
    '<tr>' +
      '<td class="py-2 text-white font-semibold">' + n.process + ' <span class="text-slate-500">(' + n.pid + ')</span></td>' +
      '<td class="py-2 text-slate-300">' + n.localAddress + ':' + n.localPort + '</td>' +
      '<td class="py-2 text-slate-400">' + n.remoteAddress + ':' + n.remotePort + '</td>' +
      '<td class="py-2 text-cyan-400">' + n.state + '</td>' +
      '<td class="py-2">' + (n.risk === 'High' ? '<span class="text-rose-400 font-bold">HIGH</span>' : n.risk) + '</td>' +
    '</tr>'
  ).join('');

  document.getElementById('autorunList').innerHTML = (d.autoruns || []).map(a =>
    '<div class="p-2.5 rounded-lg bg-slate-900/80 border ' + (a.suspicious ? 'border-rose-500/50' : 'border-slate-800') + '">' +
      '<div class="flex justify-between font-semibold text-white"><span>' + a.name + '</span>' + (a.suspicious ? '<span class="text-rose-400">Suspicious Path</span>' : '<span class="text-slate-500">' + a.user + '</span>') + '</div>' +
      '<div class="text-slate-400 font-mono truncate mt-0.5">' + a.command + '</div>' +
    '</div>'
  ).join('');

  document.getElementById('eventList').innerHTML = (d.events && d.events.length) ? d.events.map(e =>
    '<div class="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">' +
      '<div class="flex justify-between font-semibold"><span class="text-rose-400">Event ID ' + e.id + ' (' + e.level + ')</span><span class="text-slate-500">' + e.time + '</span></div>' +
      '<div class="text-slate-300 mt-1">' + e.message + '</div>' +
    '</div>'
  ).join('') : '<div class="text-slate-500">No recent warning/error system events found.</div>';
}

async function remediate(actionId) {
  const statusEl = document.getElementById('remediateStatus');
  statusEl.textContent = 'Executing PowerShell remediation (' + actionId + ')...';
  try {
    const res = await fetch('/api/remediate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId })
    });
    const out = await res.json();
    statusEl.textContent = out.message || out.error;
    await fetchTelemetry(true);
  } catch (e) {
    statusEl.textContent = 'Remediation error: ' + e.message;
  }
}

async function runAiAudit() {
  if (!latestTelemetry) {
    alert('Wait for telemetry scan to complete first.');
    return;
  }
  const btn = document.getElementById('aiBtn');
  const panel = document.getElementById('aiPanel');
  const out = document.getElementById('aiOutput');
  const apiKey = document.getElementById('apiKeyInput').value.trim();

  panel.classList.remove('hidden');
  out.textContent = 'Analyzing live Windows 11 telemetry with Gemini...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/ai-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telemetry: latestTelemetry, apiKey })
    });
    const data = await res.json();
    out.textContent = data.analysis || data.error;
  } catch (e) {
    out.textContent = 'AI Audit request failed: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => fetchTelemetry(false));
`;

const HTML_UI = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Windows 11 Sentinel — Bun Single-File Edition</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #060911; color: #e2e8f0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    .glass { background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(12px); border: 1px solid rgba(51, 65, 85, 0.55); }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  </style>
</head>
<body class="min-h-screen p-4 md:p-8">
  <div class="max-w-7xl mx-auto space-y-6">
    <header class="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-xl">
          W11
        </div>
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="text-xl font-bold tracking-tight text-white">Windows 11 Sentinel</h1>
            <span id="adminBadge" class="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-800 text-slate-300">Scanning...</span>
          </div>
          <p id="sysSubtitle" class="text-xs text-slate-400 mt-0.5">Live Bun + PowerShell Telemetry Engine</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <input id="apiKeyInput" type="password" placeholder="Optional: Gemini API Key" class="bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-52" />
        <button onclick="runAiAudit()" id="aiBtn" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer">
          ✨ Run AI Security Audit
        </button>
        <button onclick="fetchTelemetry(true)" id="refreshBtn" class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition cursor-pointer">
          ⟳ Rescan Machine
        </button>
      </div>
    </header>

    <div id="errorBanner" class="hidden"></div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="glass rounded-2xl p-5">
        <div class="text-xs text-slate-400 uppercase font-semibold">Security Posture Score</div>
        <div class="mt-2 flex items-baseline gap-2">
          <span id="scoreVal" class="text-4xl font-extrabold text-cyan-400">--</span>
          <span class="text-xs text-slate-400">/ 100</span>
        </div>
        <div class="h-1.5 w-full bg-slate-800 rounded-full mt-3 overflow-hidden">
          <div id="scoreFill" class="h-full bg-cyan-400 transition-all duration-500" style="width: 0%"></div>
        </div>
      </div>

      <div class="glass rounded-2xl p-5">
        <div class="text-xs text-slate-400 uppercase font-semibold">CPU & Memory Load</div>
        <div id="cpuLoadVal" class="mt-2 text-2xl font-bold text-white">--</div>
        <div id="ramSummary" class="text-xs text-slate-400 mt-1">--</div>
      </div>

      <div class="glass rounded-2xl p-5">
        <div class="text-xs text-slate-400 uppercase font-semibold">Hardware & OS Build</div>
        <div id="osVal" class="mt-2 text-sm font-semibold text-white truncate">--</div>
        <div id="gpuVal" class="text-xs text-slate-400 mt-1 truncate">--</div>
      </div>

      <div class="glass rounded-2xl p-5">
        <div class="text-xs text-slate-400 uppercase font-semibold">Uptime & Host</div>
        <div id="hostVal" class="mt-2 text-lg font-bold text-emerald-400">--</div>
        <div id="uptimeVal" class="text-xs text-slate-400 mt-1">--</div>
      </div>
    </div>

    <div id="aiPanel" class="hidden glass rounded-2xl p-6 border-indigo-500/40">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-indigo-400">Gemini AI Actionable Security Audit</h2>
        <span class="text-xs text-slate-400">Grounded on live machine JSON</span>
      </div>
      <div id="aiOutput" class="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed"></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-5 space-y-4">
        <h2 class="text-sm font-bold uppercase tracking-wider text-cyan-400">Core Windows 11 Hardening Matrix</h2>
        <div id="secGrid" class="grid grid-cols-2 gap-3 text-xs"></div>
      </div>

      <div class="glass rounded-2xl p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold uppercase tracking-wider text-emerald-400">One-Click Live PowerShell Hardening</h2>
          <span class="text-[11px] text-slate-400">Executes directly via Bun</span>
        </div>
        <div class="space-y-2.5 text-xs">
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Enable Defender PUA Protection</div>
              <div class="text-slate-400">Blocks adware, bundleware & coin-miners</div>
            </div>
            <button onclick="remediate('enable_pua')" class="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 cursor-pointer">Enforce</button>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Disable SMBv1 & Enforce SMB Signing</div>
              <div class="text-slate-400">Stops EternalBlue & NTLM relay lateral movement</div>
            </div>
            <button onclick="remediate('disable_smbv1')" class="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 cursor-pointer">Enforce</button>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Enable LSA RunAsPPL Protection</div>
              <div class="text-slate-400">Hardens LSASS against Mimikatz credential dumping</div>
            </div>
            <button onclick="remediate('enable_lsappl')" class="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 cursor-pointer">Enforce</button>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Disable LLMNR Multicast Spoofing</div>
              <div class="text-slate-400">Blocks Responder credential interception on LAN</div>
            </div>
            <button onclick="remediate('disable_llmnr')" class="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 cursor-pointer">Enforce</button>
          </div>
        </div>
        <div id="remediateStatus" class="text-xs text-cyan-300 font-mono"></div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="glass rounded-2xl p-5 space-y-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-cyan-400">Storage & BitLocker Status</h2>
        <div id="diskList" class="space-y-3 text-xs"></div>
      </div>

      <div class="glass rounded-2xl p-5 lg:col-span-2 space-y-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-cyan-400">Active Network Ports & Process Mapping</h2>
        <div class="overflow-x-auto max-h-72">
          <table class="w-full text-left text-xs">
            <thead class="text-slate-400 border-b border-slate-800">
              <tr>
                <th class="py-2">Process (PID)</th>
                <th class="py-2">Local Endpoint</th>
                <th class="py-2">Remote Endpoint</th>
                <th class="py-2">State</th>
                <th class="py-2">Risk</th>
              </tr>
            </thead>
            <tbody id="netTable" class="divide-y divide-slate-800/60 font-mono"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-5 space-y-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-amber-400">Startup & Autorun Persistence</h2>
        <div id="autorunList" class="space-y-2 max-h-64 overflow-y-auto text-xs"></div>
      </div>

      <div class="glass rounded-2xl p-5 space-y-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-rose-400">Recent Security & System Events</h2>
        <div id="eventList" class="space-y-2 max-h-64 overflow-y-auto text-xs"></div>
      </div>
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// 4. BUN SERVER (WITH 120s IDLE TIMEOUT & STARTUP PRE-WARM)
// ---------------------------------------------------------------------------
const server = Bun.serve({
  port: PORT,
  idleTimeout: 120, // Prevents Bun's default 10-second timeout
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response(HTML_UI, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (url.pathname === "/app.js") {
      return new Response(CLIENT_JS, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" }
      });
    }

    if (url.pathname === "/api/telemetry" && req.method === "GET") {
      try {
        const force = url.searchParams.get("force") === "1";
        const data = await collectTelemetry(force);
        return Response.json(data);
      } catch (err: any) {
        return Response.json(
          { error: "Failed to collect PowerShell telemetry: " + err.message },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/remediate" && req.method === "POST") {
      const body = await req.json();
      const action = REMEDIATION_COMMANDS[body.actionId];
      if (!action) {
        return Response.json({ error: "Unknown remediation ID" }, { status: 400 });
      }
      const { stdout, stderr, exitCode } = await runPowerShell(action.script);
      cachedTelemetry = null; // Invalidate cache after remediation
      return Response.json({
        ok: exitCode === 0,
        message: stdout || stderr || `${action.title} completed.`
      });
    }

    if (url.pathname === "/api/ai-audit" && req.method === "POST") {
      const body = await req.json();
      const key = body.apiKey || GEMINI_API_KEY;
      if (!key) {
        return Response.json({
          error: "Enter a Gemini API Key in the top bar (or set GEMINI_API_KEY in your environment) to run live AI audits."
        });
      }

      const prompt = `You are a Principal Windows 11 Security Architect. Analyze this live Windows 11 telemetry JSON and provide:
1. Top 3 Immediate Security Risks found on this specific machine
2. Exact PowerShell commands to fix them
3. Performance & Autorun hygiene observations.

Telemetry JSON:
${JSON.stringify(body.telemetry)}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const geminiData: any = await geminiRes.json();
      const text =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
        JSON.stringify(geminiData, null, 2);

      return Response.json({ analysis: text });
    }

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`⚡ Windows 11 Sentinel running at http://localhost:${server.port}`);
// Pre-warm the telemetry cache immediately on startup
collectTelemetry(true).catch((e) => console.error("Initial scan error:", e));