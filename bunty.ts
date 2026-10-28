// bunty.ts — Ultra-Fast Windows 11 Sentinel: Live Mission Control Center (Single-File Architecture)
// Run with: bun run bunty.ts

declare const Bun: any;
declare const Buffer: any;
declare const process: any;

// ---------------------------------------------------------------------------
// 1. DYNAMIC ZERO-LEAK ENVIRONMENT SCANNING & CONFIGURATION
// ---------------------------------------------------------------------------
const PORT = parseInt(Bun.env.PORT || "3000", 10);
const HOST = Bun.env.HOST || "localhost";
const GEMINI_API_KEY = Bun.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = Bun.env.GEMINI_MODEL || "gemini-2.5-flash";
const AUTO_LAUNCH = Bun.env.AUTO_LAUNCH !== "false" && Bun.env.NO_BROWSER !== "1" && !Bun.env.CI;
const SCRUB_ENABLED = Bun.env.SCRUB_TELEMETRY !== "false";

const CURRENT_OPERATOR = (Bun.env.USERNAME || Bun.env.USER || Bun.env.LOGNAME || "").trim();
const USER_ROOT_PATH = (Bun.env.USERPROFILE || Bun.env.HOME || "").trim();

// ---------------------------------------------------------------------------
// 2. ZERO-LEAK SANITIZER & SYSTEM DATA SCRUBBER
// ---------------------------------------------------------------------------
function sanitizeString(str: string): string {
  if (!str || typeof str !== "string" || !SCRUB_ENABLED) return str || "";

  let out = str;

  // 1. Scrub Windows user home directory paths (e.g., C:\Users\operator\...)
  out = out.replace(/[A-Za-z]:\\Users\\[a-zA-Z0-9_\-\.]+/gi, "[SYSTEM_USER_ROOT]");

  // 2. Scrub Unix/macOS user home directory paths (e.g., /home/user or /Users/user)
  out = out.replace(/\/(?:home|Users)\/[a-zA-Z0-9_\-\.]+/g, "[SYSTEM_USER_ROOT]");

  // 3. Scrub exact detected USER_ROOT_PATH
  if (USER_ROOT_PATH) {
    const escapedRoot = USER_ROOT_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escapedRoot, "gi"), "[SYSTEM_USER_ROOT]");
  }

  // 4. Scrub operator username if present in strings, process arguments, or logs
  if (CURRENT_OPERATOR && CURRENT_OPERATOR.length > 1) {
    const escapedUser = CURRENT_OPERATOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escapedUser, "gi"), "[OPERATOR_ID]");
  }

  // 5. Scrub Google Gemini API Keys (AIzaSy...)
  out = out.replace(/AIza[0-9A-Za-z\-_]{35}/g, "[REDACTED_API_TOKEN]");

  // 6. Scrub Authorization Bearer tokens & session hashes
  out = out.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{16,}/gi, "Bearer [REDACTED_AUTH_TOKEN]");

  // 7. Scrub Hardware MAC Addresses
  out = out.replace(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g, "[REDACTED_HW_ADDR]");

  return out;
}

function sanitizeData<T>(val: T): T {
  if (!SCRUB_ENABLED || val === null || val === undefined) return val;
  if (typeof val === "string") {
    return sanitizeString(val) as any;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeData(item)) as any;
  }
  if (typeof val === "object") {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(val)) {
      cleaned[k] = sanitizeData(v);
    }
    return cleaned;
  }
  return val;
}

// ---------------------------------------------------------------------------
// 3. SERVER-SENT EVENTS (SSE) REAL-TIME HUB
// ---------------------------------------------------------------------------
class SSEHub {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private encoder = new TextEncoder();

  add(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.clients.add(controller);
  }

  remove(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.clients.delete(controller);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  broadcast(event: string, data: any) {
    const sanitized = sanitizeData(data);
    const message = `event: ${event}\ndata: ${JSON.stringify(sanitized)}\n\n`;
    const bytes = this.encoder.encode(message);

    for (const client of this.clients) {
      try {
        client.enqueue(bytes);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  sendHeartbeat() {
    this.broadcast("ping", { time: Date.now(), activeClients: this.clientCount });
  }
}

const sseHub = new SSEHub();
setInterval(() => sseHub.sendHeartbeat(), 12000);

// ---------------------------------------------------------------------------
// 4. ULTRA-FAST ZERO-STALL POWERSHELL + .NET ENGINE (< 500ms)
// ---------------------------------------------------------------------------
const PS_COLLECTOR_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# 1. OS & Platform (0ms via Registry & Environment)
$regWin = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$osName = if ($regWin.ProductName) { [string]$regWin.ProductName } else { "Windows 11" }
if ($osName -match "Windows 10" -and [int]$regWin.CurrentBuildNumber -ge 22000) {
    $osName = $osName.Replace("Windows 10", "Windows 11")
}
$osBuild = "$($regWin.DisplayVersion) (Build $($regWin.CurrentBuildNumber).$($regWin.UBR))"
$cores = [System.Environment]::ProcessorCount
$hostname = [System.Environment]::MachineName

# 2. CPU Name (0ms via Registry)
$cpuName = "Intel/AMD Processor"
try {
    $cpuReg = Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0'
    if ($cpuReg.ProcessorNameString) { $cpuName = $cpuReg.ProcessorNameString.Trim() }
} catch {}

# 3. GPU Controller Name (0ms via Registry)
$gpuName = "Standard Display Adapter"
try {
    $gpuReg = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000' -ErrorAction SilentlyContinue
    if ($gpuReg.DriverDesc) { $gpuName = $gpuReg.DriverDesc }
} catch {}

# 4. BIOS Details (0ms via Registry)
$biosStr = "UEFI System"
try {
    $bReg = Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\BIOS'
    $biosStr = "$($bReg.BIOSVendor) $($bReg.BIOSVersion)".Trim()
} catch {}

# 5. Memory Metrics (0ms via .NET ComputerInfo)
$totalRamGB = 0
$freeRamGB  = 0
$usedRamPct = 0
try {
    Add-Type -AssemblyName Microsoft.VisualBasic
    $comp = New-Object Microsoft.VisualBasic.Devices.ComputerInfo
    $totalRamGB = [math]::Round($comp.TotalPhysicalMemory / 1GB, 1)
    $freeRamGB  = [math]::Round($comp.AvailablePhysicalMemory / 1GB, 1)
    if ($totalRamGB -gt 0) {
        $usedRamPct = [math]::Round((($totalRamGB - $freeRamGB) / $totalRamGB) * 100, 1)
    }
} catch {}

# 6. Instant Uptime
$uptimeSpan = [System.TimeSpan]::FromMilliseconds([System.Environment]::TickCount64)
$uptimeStr = "$($uptimeSpan.Days)d $($uptimeSpan.Hours)h $($uptimeSpan.Minutes)m"

# 7. CPU Load Calculation
$cpuLoad = 5
try {
    $p1 = (Get-Process | Measure-Object -Property CPU -Sum).Sum
    Start-Sleep -Milliseconds 50
    $p2 = (Get-Process | Measure-Object -Property CPU -Sum).Sum
    $calc = [math]::Round((($p2 - $p1) / (0.05 * $cores)) * 100)
    if ($calc -ge 0 -and $calc -le 100) { $cpuLoad = [int]$calc }
} catch {}

# 8. Defender & Security Enclaves (Fast WMI & Direct Registry)
$rtp = $true
$tp  = $false
$pua = $false
$sigAge = 0
try {
    $mp = Get-CimInstance -Namespace "root/Microsoft/Windows/Defender" -ClassName "MSFT_MpComputerStatus" -ErrorAction SilentlyContinue
    if ($mp) {
        $rtp = [bool]$mp.RealTimeProtectionEnabled
        $tp  = [bool]$mp.IsTamperProtected
        $sigAge = [int]$mp.AntivirusSignatureAge
    }
    $mpPref = Get-CimInstance -Namespace "root/Microsoft/Windows/Defender" -ClassName "MSFT_MpPreference" -ErrorAction SilentlyContinue
    if ($mpPref -and ($mpPref.PUAProtection -eq 1 -or $mpPref.PUAProtection -eq 2)) {
        $pua = $true
    }
    if (-not $pua) {
        $puaReg = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Defender\\MpEngine' -ErrorAction SilentlyContinue).MpEnablePus
        if ($puaReg -eq 1) { $pua = $true }
    }
    if (-not $pua) {
        $puaPol = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\MpEngine' -ErrorAction SilentlyContinue).MpEnablePus
        if ($puaPol -eq 1) { $pua = $true }
    }
    if (-not $pua) {
        $puaPol2 = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender' -ErrorAction SilentlyContinue).PUAProtection
        if ($puaPol2 -eq 1) { $pua = $true }
    }
} catch {}

# 9. VBS / HVCI
$hvciRunning = $false
$vbsRunning  = $false
try {
    $dg = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace "root/Microsoft/Windows/DeviceGuard" -ErrorAction SilentlyContinue
    if ($dg) {
        $hvciRunning = ($dg.SecurityServicesRunning -contains 2)
        $vbsRunning  = ($dg.VirtualizationBasedSecurityStatus -eq 2)
    }
} catch {}

# 10. LSA, SMBv1, SMB Signing, LLMNR (0ms Registry)
$lsaPPL = $false
try {
    $lsaVal = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'RunAsPPL' -ErrorAction SilentlyContinue).RunAsPPL
    $lsaPPL = ($lsaVal -eq 1 -or $lsaVal -eq 2)
} catch {}

$smb1Enabled = $false
$smbSigning  = $false
try {
    $lanman = Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters' -ErrorAction SilentlyContinue
    if ($null -ne $lanman.SMB1) { $smb1Enabled = ($lanman.SMB1 -ne 0) }
    if ($null -ne $lanman.RequireSecuritySignature) { $smbSigning = ($lanman.RequireSecuritySignature -eq 1) }
} catch {}

$llmnrDisabled = $false
try {
    $llmnrVal = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient' -Name 'EnableMulticast' -ErrorAction SilentlyContinue).EnableMulticast
    $llmnrDisabled = ($llmnrVal -eq 0)
} catch {}

# 11. Disks & BitLocker (0ms via .NET DriveInfo)
$disks = @()
try {
    $blVols = @{}
    if ($isAdmin) {
        Get-CimInstance -Namespace "root/CIMV2/Security/MicrosoftVolumeEncryption" -ClassName "Win32_EncryptableVolume" -ErrorAction SilentlyContinue | ForEach-Object {
            $blVols[$_.DriveLetter] = $_
        }
    }
    foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
        if ($d.DriveType -eq [System.IO.DriveType]::Fixed -and $d.IsReady) {
            $dLetter = $d.Name.TrimEnd([char]92)
            $blStatus = if ($isAdmin) { "Off" } else { "Admin Required" }
            $blCipher = "None"
            if ($blVols.ContainsKey($dLetter)) {
                $v = $blVols[$dLetter]
                $blStatus = if ($v.ProtectionStatus -eq 1) { "On (Protected)" } elseif ($v.ProtectionStatus -eq 2) { "Locked" } else { "Off" }
                $blCipher = if ($v.ProtectionStatus -eq 1) { "XTS-AES" } else { "None" }
            }
            $tGB = [math]::Round($d.TotalSize / 1GB, 1)
            $fGB = [math]::Round($d.AvailableFreeSpace / 1GB, 1)
            $uPct = if ($tGB -gt 0) { [math]::Round((($tGB - $fGB) / $tGB) * 100, 1) } else { 0 }
            $disks += [PSCustomObject]@{
                drive     = $dLetter
                label     = if ($d.VolumeLabel) { $d.VolumeLabel } else { "Local Disk" }
                totalGB   = $tGB
                freeGB    = $fGB
                usedPct   = $uPct
                bitlocker = $blStatus
                cipher    = $blCipher
            }
        }
    }
} catch {}

# 12. Network Socket Enumeration via netstat -ano (< 30ms)
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

# 13. Startup Persistence (0ms via Registry)
$autoruns = @()
try {
    $runKeys = @(
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
    )
    foreach ($rk in $runKeys) {
        $item = Get-ItemProperty -Path $rk -ErrorAction SilentlyContinue
        if ($item) {
            foreach ($prop in $item.PSObject.Properties) {
                if ($prop.Name -notmatch '^PS.*') {
                    $cmdStr = [string]$prop.Value
                    $susp = ($cmdStr -match 'AppData|Temp|powershell|cmd\\.exe|wscript|mshta|http')
                    $autoruns += [PSCustomObject]@{
                        name       = [string]$prop.Name
                        command    = $cmdStr
                        location   = $rk
                        user       = if ($rk -match 'HKCU') { "Current User" } else { "All Users" }
                        suspicious = [bool]$susp
                    }
                }
            }
        }
    }
} catch {}

# 14. System Events (Fast Get-WinEvent)
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

$score = 25
if ($rtp) { $score += 15 }
if ($tp) { $score += 10 }
if ($hvciRunning) { $score += 10 }
if ($vbsRunning) { $score += 5 }
if ($lsaPPL) { $score += 10 }
if (-not $smb1Enabled) { $score += 5 }
if ($smbSigning) { $score += 5 }
if ($llmnrDisabled) { $score += 5 }
if ($pua) { $score += 15 }
if ($score -gt 100) { $score = 100 }

$sw.Stop()

$payload = [PSCustomObject]@{
    timestamp  = (Get-Date).ToString("o")
    scanTimeMs = $sw.ElapsedMilliseconds
    isAdmin    = $isAdmin
    score      = $score
    system     = [PSCustomObject]@{
        hostname = $hostname
        osName   = $osName
        osBuild  = $osBuild
        cpu      = $cpuName
        cores    = $cores
        cpuLoad  = $cpuLoad
        gpu      = $gpuName
        bios     = $biosStr
        ramTotal = $totalRamGB
        ramFree  = $freeRamGB
        ramPct   = $usedRamPct
        uptime   = $uptimeStr
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
// 5. HARDENING ACTIONS & ROLLBACK COMMAND REGISTRY
// ---------------------------------------------------------------------------
interface RemediationAction {
  title: string;
  description: string;
  script: string;
  rollbackActionId?: string;
  isRollback?: boolean;
}

const REMEDIATION_COMMANDS: Record<string, RemediationAction> = {
  enable_pua: {
    title: "Enable Defender PUA Protection",
    description: "Blocks adware, coin-miners, and unwanted bundleware",
    script: `Set-MpPreference -PUAProtection Enabled -ErrorAction Stop; if (!(Test-Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\MpEngine")) { New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\MpEngine" -Force -ErrorAction SilentlyContinue | Out-Null }; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\MpEngine" -Name "MpEnablePus" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Write-Output "SUCCESS: Defender PUA Protection Enabled."`,
    rollbackActionId: "disable_pua"
  },
  disable_pua: {
    title: "Rollback Defender PUA Protection",
    description: "Reverts PUA protection to standard disabled state",
    script: `Set-MpPreference -PUAProtection Disabled -ErrorAction Stop; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\MpEngine" -Name "MpEnablePus" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue; Write-Output "ROLLBACK: Defender PUA Protection Disabled."`,
    isRollback: true
  },
  disable_smbv1: {
    title: "Disable SMBv1 & Require SMB Signing",
    description: "Stops EternalBlue and NTLM relay lateral movements",
    script: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB1" -Value 0 -Type DWord -Force; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "RequireSecuritySignature" -Value 1 -Type DWord -Force; Write-Output "SUCCESS: SMBv1 Disabled & SMB Signing Required."`,
    rollbackActionId: "enable_smbv1"
  },
  enable_smbv1: {
    title: "Rollback SMBv1 Configuration",
    description: "Re-enables legacy SMBv1 networking parameter",
    script: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters" -Name "SMB1" -Value 1 -Type DWord -Force; Write-Output "ROLLBACK: SMBv1 Re-enabled."`,
    isRollback: true
  },
  enable_lsappl: {
    title: "Enable LSA RunAsPPL Protection",
    description: "Hardens LSASS against Mimikatz credential dumping",
    script: `New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" -Name "RunAsPPL" -Value 1 -PropertyType DWord -Force -ErrorAction Stop | Out-Null; Write-Output "SUCCESS: LSA RunAsPPL Enabled (System reboot required to take effect)."`,
    rollbackActionId: "disable_lsappl"
  },
  disable_lsappl: {
    title: "Rollback LSA RunAsPPL Protection",
    description: "Disables LSA RunAsPPL credential protection",
    script: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" -Name "RunAsPPL" -Value 0 -Type DWord -Force -ErrorAction Stop; Write-Output "ROLLBACK: LSA RunAsPPL Disabled."`,
    isRollback: true
  },
  disable_llmnr: {
    title: "Disable LLMNR Multicast Spoofing",
    description: "Blocks Responder and LLMNR/NBT-NS rogue poisoners on LAN",
    script: `if (!(Test-Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient")) { New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Force | Out-Null }; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Name "EnableMulticast" -Value 0 -Type DWord -Force -ErrorAction Stop; Write-Output "SUCCESS: LLMNR Multicast Disabled."`,
    rollbackActionId: "enable_llmnr"
  },
  enable_llmnr: {
    title: "Rollback LLMNR Multicast Configuration",
    description: "Restores LLMNR multicast resolution",
    script: `Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient" -Name "EnableMulticast" -Value 1 -Type DWord -Force -ErrorAction Stop; Write-Output "ROLLBACK: LLMNR Multicast Enabled."`,
    isRollback: true
  },
  flush_dns: {
    title: "Flush DNS Resolver Cache",
    description: "Purges client-side DNS cache entries",
    script: `Clear-DnsClientCache; Write-Output "SUCCESS: DNS Resolver Cache Flushed."`
  },
  update_signatures: {
    title: "Update Defender Antivirus Signatures",
    description: "Pulls the latest threat intelligence signatures directly from Microsoft",
    script: `Update-MpSignature -ErrorAction Stop; Write-Output "SUCCESS: Microsoft Defender Antivirus Signatures Updated."`
  }
};

function toEncodedCommand(psScript: string): string {
  return Buffer.from(psScript, "utf16le").toString("base64");
}

function cleanPowerShellStderr(rawStderr: string): { text: string; isError: boolean } | null {
  const trimmed = rawStderr.trim();
  if (!trimmed) return null;

  // Check if stderr contains PowerShell CLIXML stream data
  if (trimmed.startsWith("#< CLIXML") || trimmed.includes("<Objs Version=") || trimmed.includes("<Obj S=")) {
    const hasError = /<S S="[Ee]rror">|<Obj S="[Ee]rror"/i.test(trimmed);
    const hasWarning = /<S S="[Ww]arning">|<Obj S="[Ww]arning"/i.test(trimmed);

    // Suppress pure progress records (e.g. "Preparing modules for first use", download percent)
    if (!hasError && !hasWarning) {
      return null;
    }

    // Extract error text from CLIXML
    const errorMatches = [...trimmed.matchAll(/<S S="[Ee]rror">([^<]+)<\/S>/g)];
    if (errorMatches.length > 0) {
      const combined = errorMatches
        .map((m) => m[1])
        .join("")
        .replace(/_x000D__x000A_/g, "\n")
        .replace(/_x000D_/g, "\r")
        .replace(/_x000A_/g, "\n")
        .replace(/_x0009_/g, "\t")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      return combined ? { text: combined, isError: true } : null;
    }

    // Extract warning text from CLIXML
    const warnMatches = [...trimmed.matchAll(/<S S="[Ww]arning">([^<]+)<\/S>/g)];
    if (warnMatches.length > 0) {
      const combined = warnMatches
        .map((m) => m[1])
        .join("")
        .replace(/_x000D__x000A_/g, "\n")
        .replace(/_x000D_/g, "\r")
        .replace(/_x000A_/g, "\n")
        .replace(/_x0009_/g, "\t")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim();
      return combined ? { text: combined, isError: false } : null;
    }

    // Fallback for custom Message tags
    const msgMatches = [...trimmed.matchAll(/<S N="Message">([^<]+)<\/S>/g)];
    if (msgMatches.length > 0) {
      const combined = msgMatches.map((m) => m[1]).join("\n").trim();
      return { text: combined, isError: true };
    }

    return null;
  }

  return { text: trimmed, isError: true };
}

// ---------------------------------------------------------------------------
// 6. STREAMING EXECUTION ENGINE & STATE MACHINE MUTEX
// ---------------------------------------------------------------------------
let executionMutex = false;
let cachedTelemetry: any = null;
let scanInProgress: Promise<any> | null = null;

async function executeAndStreamCommand(
  actionId: string,
  title: string,
  psScript: string
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const startTime = Date.now();

  sseHub.broadcast("state_transition", {
    state: "EXECUTING",
    actionId,
    title,
    startTime,
    estimatedMs: 2500
  });

  sseHub.broadcast("terminal_log", {
    type: "state",
    text: `[STATE MACHINE] Dispatched '${title}' (${actionId}) to PowerShell IPC pipe...`
  });

  // Prepend preference variables to silence internal progress CLIXML stream
  const wrappedScript = `$ProgressPreference = 'SilentlyContinue'; $WarningPreference = 'SilentlyContinue'; $InformationPreference = 'Continue';\n${psScript}`;
  const encoded = toEncodedCommand(wrappedScript);
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

  let fullStdout = "";
  let fullStderr = "";

  let stdoutBuffer = "";
  const readStdout = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) {
          fullStdout += text;
          stdoutBuffer += text;
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              sseHub.broadcast("terminal_log", {
                type: "stdout",
                actionId,
                text: sanitizeString(trimmed)
              });
            }
          }
        }
      }
      if (stdoutBuffer.trim()) {
        sseHub.broadcast("terminal_log", {
          type: "stdout",
          actionId,
          text: sanitizeString(stdoutBuffer.trim())
        });
      }
    } catch {
      // Reader closed cleanly
    } finally {
      reader.releaseLock();
    }
  };

  const readStderr = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) {
          fullStderr += text;
        }
      }
    } catch {
      // Reader closed cleanly
    } finally {
      reader.releaseLock();
    }
  };

  await Promise.all([readStdout(proc.stdout), readStderr(proc.stderr), proc.exited]);

  // Clean and parse stderr to remove progress XML blobs
  const cleanedErr = cleanPowerShellStderr(fullStderr);
  if (cleanedErr && cleanedErr.text) {
    sseHub.broadcast("terminal_log", {
      type: cleanedErr.isError ? "stderr" : "state",
      actionId,
      text: sanitizeString(cleanedErr.text)
    });
  }

  const durationMs = Date.now() - startTime;
  const exitCode = proc.exitCode ?? 0;
  const ok = exitCode === 0;

  sseHub.broadcast("state_transition", {
    state: ok ? "SETTLED_SUCCESS" : "SETTLED_FAILURE",
    actionId,
    title,
    durationMs,
    exitCode,
    timestamp: Date.now()
  });

  sseHub.broadcast("terminal_log", {
    type: ok ? "success" : "error",
    text: ok
      ? `[SETTLED_SUCCESS] '${title}' completed cleanly in ${durationMs}ms (ExitCode: 0).`
      : `[SETTLED_FAILURE] '${title}' exited with code ${exitCode} after ${durationMs}ms.`
  });

  return {
    ok,
    stdout: sanitizeString(fullStdout.trim()),
    stderr: sanitizeString(cleanedErr ? cleanedErr.text : ""),
    exitCode,
    durationMs
  };
}

async function collectTelemetry(force = false) {
  if (!force && cachedTelemetry) return cachedTelemetry;
  if (scanInProgress) return scanInProgress;

  scanInProgress = (async () => {
    sseHub.broadcast("terminal_log", {
      type: "state",
      text: "[TELEMETRY] Starting ultra-fast registry & .NET hardware scan..."
    });

    const t0 = Date.now();
    const encoded = toEncodedCommand(PS_COLLECTOR_SCRIPT);
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

    const stdoutRaw = await new Response(proc.stdout).text();
    const stderrRaw = await new Response(proc.stderr).text();
    await proc.exited;

    const startMarker = "---SENTINEL_JSON_START---";
    const endMarker = "---SENTINEL_JSON_END---";
    const sIdx = stdoutRaw.indexOf(startMarker);
    const eIdx = stdoutRaw.indexOf(endMarker);

    const jsonText =
      sIdx !== -1 && eIdx !== -1
        ? stdoutRaw.slice(sIdx + startMarker.length, eIdx).trim()
        : stdoutRaw.trim();

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Failed to parse telemetry JSON output from PowerShell: " + sanitizeString(stderrRaw || stdoutRaw));
    }

    // Process and enrich anomaly queue dynamically
    const anomalies: Array<{ id: string; title: string; desc: string; priority: "critical" | "warning" | "optimizing"; actionId?: string }> = [];
    const sec = parsed?.security || {};

    if (!sec.realTimeProtection) {
      anomalies.push({
        id: "rtp_off",
        title: "Real-Time Protection Disabled",
        desc: "Active kernel file system monitoring is disarmed.",
        priority: "critical"
      });
    }
    if (!sec.tamperProtection) {
      anomalies.push({
        id: "tp_off",
        title: "Tamper Protection Offline",
        desc: "Defender registry keys and services are vulnerable to direct modification.",
        priority: "critical"
      });
    }
    if (sec.smb1Enabled) {
      anomalies.push({
        id: "smbv1_on",
        title: "Legacy SMBv1 Protocol Active",
        desc: "Exposed to remote code execution (MS17-010 EternalBlue).",
        priority: "critical",
        actionId: "disable_smbv1"
      });
    }
    if (!sec.lsaPPL) {
      anomalies.push({
        id: "lsa_off",
        title: "LSA Credential Isolation Disabled",
        desc: "LSASS process memory can be dumped by Mimikatz/ProcDump.",
        priority: "warning",
        actionId: "enable_lsappl"
      });
    }
    if (!sec.llmnrDisabled) {
      anomalies.push({
        id: "llmnr_on",
        title: "LLMNR Multicast Poisoning Enabled",
        desc: "Local network attacker can intercept Windows NTLM hashes.",
        priority: "warning",
        actionId: "disable_llmnr"
      });
    }
    if (!sec.smbSigning) {
      anomalies.push({
        id: "smb_sign_off",
        title: "SMB Packet Signing Not Enforced",
        desc: "Vulnerable to NTLM relay and Man-in-the-Middle spoofing.",
        priority: "warning",
        actionId: "disable_smbv1"
      });
    }
    if ((sec.antivirusSigAge || 0) > 2) {
      anomalies.push({
        id: "sig_stale",
        title: `Defender Signatures ${sec.antivirusSigAge} Days Stale`,
        desc: "Local malware database is behind current threat vectors.",
        priority: "warning",
        actionId: "update_signatures"
      });
    }
    if (!sec.puaProtection) {
      anomalies.push({
        id: "pua_off",
        title: "PUA/PUP Blocking Disabled",
        desc: "Potentially unwanted applications and adware are permitted to install.",
        priority: "optimizing",
        actionId: "enable_pua"
      });
    }

    parsed.anomalies = anomalies;

    // Apply zero-leak sanitizer on entire telemetry payload
    const sanitizedTelemetry = sanitizeData(parsed);
    cachedTelemetry = sanitizedTelemetry;

    const elapsed = Date.now() - t0;
    console.log(`[TELEMETRY] Scanned host '${sanitizedTelemetry?.system?.hostname}' in ${elapsed}ms | Score: ${sanitizedTelemetry?.score}/100 | Anomalies: ${anomalies.length}`);

    sseHub.broadcast("telemetry_update", sanitizedTelemetry);
    sseHub.broadcast("terminal_log", {
      type: "success",
      text: `[TELEMETRY] Scanned host '${sanitizedTelemetry?.system?.hostname}' in ${elapsed}ms | Score: ${sanitizedTelemetry?.score}/100 | Anomalies: ${anomalies.length}`
    });

    return sanitizedTelemetry;
  })().finally(() => {
    scanInProgress = null;
  });

  return scanInProgress;
}

// ---------------------------------------------------------------------------
// 7. ZERO-TOUCH BOOTSTRAPPING (CROSS-PLATFORM AUTO-LAUNCH)
// ---------------------------------------------------------------------------
async function autoLaunchBrowser(targetUrl: string): Promise<void> {
  if (!AUTO_LAUNCH) {
    console.log(`[BOOTSTRAP] Browser auto-launch bypassed (AUTO_LAUNCH=${AUTO_LAUNCH})`);
    return;
  }

  try {
    const platform = process.platform;
    let proc: any;

    if (platform === "win32") {
      proc = Bun.spawn(["cmd.exe", "/c", "start", "", targetUrl], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore"
      });
    } else if (platform === "darwin") {
      proc = Bun.spawn(["open", targetUrl], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore"
      });
    } else {
      proc = Bun.spawn(["xdg-open", targetUrl], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore"
      });
    }

    if (proc && typeof proc.unref === "function") {
      proc.unref();
    }
    console.log(`[BOOTSTRAP] Operator browser auto-launched to ${targetUrl} [OS: ${platform}]`);
  } catch (err: any) {
    console.warn(`[BOOTSTRAP] Auto-launch handled gracefully: ${sanitizeString(err?.message || "Non-fatal")}`);
  }
}

// ---------------------------------------------------------------------------
// 8. FRONTEND CLIENT JAVASCRIPT (STATE MACHINE & SSE CONSUMER)
// ---------------------------------------------------------------------------
const CLIENT_JS = String.raw`
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
  if (!term || !text) return;

  // Suppress raw PowerShell CLIXML serialization XML tags
  if (typeof text === 'string' && (text.includes('#< CLIXML') || text.includes('<Objs Version=') || text.includes('<Obj S='))) {
    return;
  }

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
    '<button onclick="document.getElementById(&quot;settlementBanner&quot;).classList.add(&quot;hidden&quot;)" class="text-slate-400 hover:text-white text-sm cursor-pointer">✕</button>';
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
      ? '<button onclick="triggerRemediation(&quot;' + a.actionId + '&quot;)" class="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 transition cursor-pointer">Quick Enforce ⚡</button>'
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
          ? '<button onclick="triggerRemediation(&quot;disable_' + item.actionId.replace('enable_', '') + '&quot;)" class="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer">Revert ↺</button>'
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
      if (output) output.textContent = 'AI Audit Error: ' + (data.error || 'Failed to complete analysis.');
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
`;

// ---------------------------------------------------------------------------
// 9. FRONTEND HTML & DARK-MODE MATRIX MISSION CONTROL LAYOUT
// ---------------------------------------------------------------------------
const HTML_UI = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Windows 11 Sentinel — SoTA Mission Control Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --matrix-bg: #050811;
      --card-bg: rgba(11, 17, 33, 0.75);
      --card-border: rgba(30, 41, 59, 0.8);
      --accent-cyan: #06b6d4;
      --accent-emerald: #10b981;
    }
    body {
      background-color: var(--matrix-bg);
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.08), transparent 45%),
        linear-gradient(rgba(15, 23, 42, 0.3) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 23, 42, 0.3) 1px, transparent 1px);
      background-size: 100% 100%, 32px 32px, 32px 32px;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .glass {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
    }
    .glass:hover {
      border-color: rgba(56, 189, 248, 0.3);
    }
    .glow-cyan {
      box-shadow: 0 0 25px rgba(6, 182, 212, 0.15);
    }
    .glow-emerald {
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.15);
    }
    .scanline {
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03));
      background-size: 100% 3px, 3px 100%;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #070d19; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }
  </style>
</head>
<body class="min-h-screen p-4 md:p-8 flex flex-col justify-between">

  <!-- DETERMINISTIC STATE MACHINE GLOBAL FREEZE OVERLAY (MUTATIONS ONLY) -->
  <div id="freezeOverlay" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center hidden">
    <div class="glass max-w-md w-full mx-4 p-6 rounded-2xl border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.25)] space-y-4 text-center">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-2xl font-bold animate-pulse">
        🔒
      </div>
      <div class="space-y-1">
        <h3 class="text-sm font-mono uppercase tracking-widest text-cyan-400 font-bold">STATE MACHINE LOCKED</h3>
        <p class="text-base font-semibold text-white" id="freezeActionName">Executing Security Remediation...</p>
        <p class="text-xs text-slate-400 font-mono">Controls globally isolated to ensure atomic execution idempotency.</p>
      </div>

      <div class="space-y-1.5 pt-2">
        <div class="flex justify-between text-xs font-mono text-slate-400">
          <span>IPC Execution Active</span>
          <span id="freezeTicker" class="text-cyan-300 font-bold">0.00s</span>
        </div>
        <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div id="freezeProgressFill" class="h-full bg-cyan-400 transition-all duration-100 shadow-[0_0_12px_#38bdf8]" style="width: 15%"></div>
        </div>
      </div>

      <div class="pt-2 text-[11px] font-mono text-slate-500 flex items-center justify-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span>Streaming stdout/stderr directly via SSE Loopback...</span>
      </div>
    </div>
  </div>

  <div class="max-w-7xl mx-auto w-full space-y-6">

    <!-- TOP BRIDGE BAR -->
    <header class="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border-slate-800 glow-cyan">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-xl shadow-[0_0_15px_rgba(6,182,212,0.2)]">
          W11
        </div>
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold tracking-tight text-white font-mono">WINDOWS 11 SENTINEL</h1>
            <span id="adminBadge" class="text-xs px-2.5 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300">Scanning Host...</span>
            <span id="sseBadge" class="text-xs px-2.5 py-0.5 rounded-full font-mono bg-slate-800 text-slate-400">SSE: CONNECTING</span>
          </div>
          <p class="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
            <span>LIVE MISSION CONTROL CENTER</span>
            <span>•</span>
            <span id="pipelineStateBadge" class="text-emerald-400">STATE: IDLE (READY)</span>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <input id="apiKeyInput" type="password" placeholder="Gemini API Key (or set GEMINI_API_KEY)" class="bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-56 font-mono" />
        <button onclick="runAiAudit()" id="aiBtn" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
          <span>✨</span>
          <span>Run AI Audit</span>
        </button>
        <button onclick="fetchTelemetry(true)" id="refreshBtn" class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <span>⟳</span>
          <span>Rescan Host</span>
        </button>
      </div>
    </header>

    <!-- SETTLEMENT NOTICE BANNER -->
    <div id="settlementBanner" class="hidden"></div>

    <!-- HIGH REFRESH RATE STATUS CONTAINERS & SCORE METRICS -->
    <div id="sysHeaderDeck" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="glass rounded-2xl p-5 border-slate-800 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center">
            <span class="text-xs font-mono uppercase text-slate-400 font-semibold tracking-wider">Security Posture</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">Sub-500ms</span>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span id="scoreVal" class="text-4xl font-extrabold text-cyan-400 font-mono tracking-tight">--</span>
            <span class="text-xs text-slate-400 font-mono">/ 100</span>
          </div>
        </div>
        <div class="h-2 w-full bg-slate-800/80 rounded-full mt-3 overflow-hidden">
          <div id="scoreFill" class="h-full bg-cyan-400 transition-all duration-700" style="width: 0%"></div>
        </div>
      </div>

      <div class="glass rounded-2xl p-5 border-slate-800 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center">
            <span class="text-xs font-mono uppercase text-slate-400 font-semibold tracking-wider">Compute & RAM</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">Live Load</span>
          </div>
          <div class="mt-2 flex items-baseline gap-3">
            <span id="cpuLoadVal" class="text-3xl font-bold text-white font-mono">--%</span>
            <span class="text-xs text-slate-500 font-mono">CPU</span>
            <span id="ramLoadVal" class="text-2xl font-bold text-cyan-300 font-mono">--%</span>
            <span class="text-xs text-slate-500 font-mono">RAM</span>
          </div>
        </div>
        <div class="mt-2 space-y-0.5">
          <div id="cpuVal" class="text-xs font-mono text-slate-300 truncate">--</div>
          <div id="ramDetails" class="text-[11px] text-slate-400 font-mono truncate">--</div>
        </div>
      </div>

      <div class="glass rounded-2xl p-5 border-slate-800 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center">
            <span class="text-xs font-mono uppercase text-slate-400 font-semibold tracking-wider">Host Platform</span>
            <span id="uptimeVal" class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">Uptime: --</span>
          </div>
          <div id="hostVal" class="mt-2 text-xl font-bold text-emerald-400 font-mono truncate">--</div>
        </div>
        <div class="mt-2 space-y-0.5">
          <div id="osVal" class="text-xs text-slate-300 font-mono truncate">--</div>
          <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span id="gpuVal" class="truncate max-w-[140px]">--</span>
            <span id="biosVal" class="truncate max-w-[120px]">--</span>
          </div>
        </div>
      </div>

      <div class="glass rounded-2xl p-5 border-slate-800 flex flex-col justify-between">
        <div class="flex justify-between items-center">
          <span class="text-xs font-mono uppercase text-slate-400 font-semibold tracking-wider">Anomaly Tickers</span>
          <span class="text-[10px] font-mono text-slate-400">Real-Time</span>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-2 font-mono text-center">
          <div class="p-2 rounded-lg bg-rose-950/30 border border-rose-500/30">
            <div id="tickerCritical" class="text-xl font-bold text-rose-400">0</div>
            <div class="text-[10px] text-rose-300">CRITICAL</div>
          </div>
          <div class="p-2 rounded-lg bg-amber-950/30 border border-amber-500/30">
            <div id="tickerWarning" class="text-xl font-bold text-amber-400">0</div>
            <div class="text-[10px] text-amber-300">WARNINGS</div>
          </div>
          <div class="p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/30">
            <div id="tickerHighRiskPorts" class="text-xl font-bold text-cyan-400">0</div>
            <div class="text-[10px] text-cyan-300">HIGH PORTS</div>
          </div>
          <div class="p-2 rounded-lg bg-slate-900 border border-slate-800">
            <div id="tickerAutoruns" class="text-xl font-bold text-slate-300">0</div>
            <div class="text-[10px] text-slate-400">AUTORUNS</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ANOMALY PRIORITY QUEUE (TACTICAL TRIAGE DECK) -->
    <div class="glass rounded-2xl p-5 border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-white">ANOMALY PRIORITY QUEUE // TRIAGE DECK</h2>
        </div>
        <span class="text-[11px] font-mono text-slate-400">Prioritized by Threat Velocity</span>
      </div>
      <div id="anomalyDeck" class="space-y-2">
        <div class="p-4 rounded-xl bg-slate-900/60 text-slate-500 font-mono text-xs">Evaluating anomaly matrix...</div>
      </div>
    </div>

    <!-- AI NEURAL AUDIT PANEL -->
    <div id="aiPanel" class="hidden glass rounded-2xl p-6 border-indigo-500/40 glow-emerald space-y-3">
      <div class="flex items-center justify-between border-b border-indigo-500/20 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-lg">✨</span>
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-indigo-400">GEMINI NEURAL THREAT ASSESSMENT</h2>
        </div>
        <span class="text-xs text-slate-400 font-mono">Zero-Leak Tokenized Sanitization Active</span>
      </div>
      <div id="aiOutput" class="text-xs text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto"></div>
    </div>

    <!-- CORE HARDENING MATRIX & LIVE REMEDIATION DISPATCHER -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-5 space-y-4 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Core Windows 11 Hardening Matrix</h2>
          <span class="text-[11px] font-mono text-slate-500">Kernel & LSA Enclaves</span>
        </div>
        <div id="secGrid" class="space-y-2.5"></div>
      </div>

      <div class="glass rounded-2xl p-5 space-y-4 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">Mission Control Remediation Console</h2>
          <span class="text-[11px] font-mono text-slate-500">Atomic Rollback Enabled</span>
        </div>
        
        <div class="space-y-2.5 text-xs font-mono">
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Defender PUA Adware Blocking</div>
              <div class="text-[10px] text-slate-400">Blocks coin-miners & bundled junkware</div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="triggerRemediation('enable_pua')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer">Enforce</button>
              <button onclick="triggerRemediation('disable_pua')" class="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer" title="Rollback">↺</button>
            </div>
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Disable SMBv1 & Require Signing</div>
              <div class="text-[10px] text-slate-400">Neutralizes EternalBlue & NTLM relays</div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="triggerRemediation('disable_smbv1')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer">Enforce</button>
              <button onclick="triggerRemediation('enable_smbv1')" class="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer" title="Rollback">↺</button>
            </div>
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Enable LSA RunAsPPL Protection</div>
              <div class="text-[10px] text-slate-400">Stops Mimikatz memory credential dumps</div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="triggerRemediation('enable_lsappl')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer">Enforce</button>
              <button onclick="triggerRemediation('disable_lsappl')" class="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer" title="Rollback">↺</button>
            </div>
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div>
              <div class="font-semibold text-white">Disable LLMNR Multicast Spoofing</div>
              <div class="text-[10px] text-slate-400">Blocks Responder credential spoofing on LAN</div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="triggerRemediation('disable_llmnr')" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer">Enforce</button>
              <button onclick="triggerRemediation('enable_llmnr')" class="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer" title="Rollback">↺</button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <button onclick="triggerRemediation('flush_dns')" class="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 text-left cursor-pointer transition">
              <div class="font-semibold text-cyan-400">Flush DNS Cache</div>
              <div class="text-[10px] text-slate-500">Purge local client cache</div>
            </button>
            <button onclick="triggerRemediation('update_signatures')" class="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 text-left cursor-pointer transition">
              <div class="font-semibold text-emerald-400">Update Signatures</div>
              <div class="text-[10px] text-slate-500">Fetch latest Defender intel</div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- LIVE MISSION CONTROL TERMINAL (STREAMING POWERSHELL IPC & SSE READOUT) -->
    <div class="glass rounded-2xl p-5 border-slate-800 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">MISSION CONTROL TERMINAL // REAL-TIME POWERSHELL IPC STREAM</h2>
        </div>
        <div class="flex items-center gap-3 text-xs font-mono">
          <label class="flex items-center gap-1.5 text-slate-400 cursor-pointer select-none">
            <input id="termAutoScroll" type="checkbox" checked class="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0" />
            <span>Auto-Scroll</span>
          </label>
          <button onclick="copyTerminalOutput()" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition">
            Copy
          </button>
          <button onclick="clearTerminal()" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition">
            Clear
          </button>
        </div>
      </div>

      <div class="relative">
        <div id="terminalOutput" class="h-64 overflow-y-auto bg-slate-950/90 rounded-xl p-4 border border-slate-800/80 scanline font-mono text-xs space-y-1">
          <div class="text-slate-500">[TERMINAL] Initialized. Awaiting telemetry scan or remediation triggers...</div>
        </div>
      </div>
    </div>

    <!-- TELEMETRY GRIDS: NETWORK RADAR & STORAGE -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="glass rounded-2xl p-5 space-y-3 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Storage & BitLocker</h2>
          <span class="text-[11px] font-mono text-slate-500">System Volume State</span>
        </div>
        <div id="diskList" class="space-y-3 text-xs"></div>
      </div>

      <div class="glass rounded-2xl p-5 lg:col-span-2 space-y-3 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Network Radar & Socket Port Mapping</h2>
          <span class="text-[11px] font-mono text-slate-500">netstat -ano (Sub-30ms)</span>
        </div>
        <div class="overflow-x-auto max-h-72">
          <table class="w-full text-left text-xs">
            <thead class="text-slate-400 border-b border-slate-800 font-mono text-[11px]">
              <tr>
                <th class="py-2">Process (PID)</th>
                <th class="py-2">Local Endpoint</th>
                <th class="py-2">Remote Endpoint</th>
                <th class="py-2">State</th>
                <th class="py-2">Exposure Risk</th>
              </tr>
            </thead>
            <tbody id="netTable" class="divide-y border-slate-800/60 font-mono"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- STARTUP PERSISTENCE, SYSTEM EVENTS & AUDIT LEDGER -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="glass rounded-2xl p-5 space-y-3 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">Persistence Sentinel</h2>
          <span class="text-[11px] font-mono text-slate-500">Registry Run Keys</span>
        </div>
        <div id="autorunList" class="space-y-2 max-h-64 overflow-y-auto text-xs"></div>
      </div>

      <div class="glass rounded-2xl p-5 space-y-3 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">Recent System Events</h2>
          <span class="text-[11px] font-mono text-slate-500">WinEvent System Log</span>
        </div>
        <div id="eventList" class="space-y-2 max-h-64 overflow-y-auto text-xs"></div>
      </div>

      <div class="glass rounded-2xl p-5 space-y-3 border-slate-800">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Audit History Ledger</h2>
          <span class="text-[11px] font-mono text-slate-500">Session Snapshots</span>
        </div>
        <div id="historyLedger" class="space-y-2 max-h-64 overflow-y-auto text-xs"></div>
      </div>
    </div>

    <!-- SYSTEM FOOTER INFO -->
    <div class="text-center text-xs font-mono text-slate-600 py-2">
      Windows 11 Sentinel Live Mission Control • Bun Native Engine • Zero-Leak Sandbox Security
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// 10. BUN HTTP SERVER & ROUTE DISPATCHER
// ---------------------------------------------------------------------------
const server = Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req: Request) {
    const url = new URL(req.url);

    try {
      // 1. Dashboard Landing Page
      if (url.pathname === "/") {
        return new Response(HTML_UI, {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      // 2. Client Application Bundle
      if (url.pathname === "/app.js") {
        return new Response(CLIENT_JS, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" }
        });
      }

      // 3. Server-Sent Events (SSE) Loopback Stream
      if (url.pathname === "/api/stream" && req.method === "GET") {
        let clientController: ReadableStreamDefaultController<Uint8Array>;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            clientController = controller;
            sseHub.add(controller);

            // Emit initial connect greeting
            const connectMsg = `event: connected\ndata: ${JSON.stringify({ status: "STREAM_ONLINE", time: Date.now() })}\n\n`;
            controller.enqueue(new TextEncoder().encode(connectMsg));

            // Immediately pipe cached telemetry to the newly connected client
            if (cachedTelemetry) {
              const telMsg = `event: telemetry_update\ndata: ${JSON.stringify(cachedTelemetry)}\n\n`;
              controller.enqueue(new TextEncoder().encode(telMsg));
            }
          },
          cancel() {
            if (clientController) sseHub.remove(clientController);
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
          }
        });
      }

      // 4. Telemetry Endpoint
      if (url.pathname === "/api/telemetry" && req.method === "GET") {
        const force = url.searchParams.get("force") === "1";
        const data = await collectTelemetry(force);
        return Response.json(data);
      }

      // 5. Remediation Execution Endpoint (Atomic Mutex Guarded)
      if (url.pathname === "/api/remediate" && req.method === "POST") {
        if (executionMutex) {
          return Response.json(
            { error: "State Machine Locked: Another remediation command is currently in-flight." },
            { status: 409 }
          );
        }

        const body = await req.json();
        const actionId = body?.actionId;
        const action = REMEDIATION_COMMANDS[actionId];

        if (!action) {
          return Response.json({ error: "Unknown remediation identifier: " + actionId }, { status: 400 });
        }

        executionMutex = true;
        try {
          const result = await executeAndStreamCommand(actionId, action.title, action.script);
          cachedTelemetry = null; // Invalidate cache to force fresh telemetry refresh
          
          // Trigger asynchronous background rescan to refresh UI
          collectTelemetry(true).catch(() => {});

          return Response.json({
            ok: result.ok,
            actionId,
            message: result.stdout || result.stderr || `${action.title} completed.`,
            durationMs: result.durationMs
          });
        } finally {
          executionMutex = false;
        }
      }

      // 6. Gemini AI Neural Threat Audit Endpoint
      if (url.pathname === "/api/ai-audit" && req.method === "POST") {
        const body = await req.json();
        const effectiveKey = (body.apiKey || GEMINI_API_KEY || "").trim();

        if (!effectiveKey) {
          return Response.json(
            { error: "No Gemini API Key provided. Supply an API key in the top bar or set GEMINI_API_KEY environment variable." },
            { status: 400 }
          );
        }

        // Scrub telemetry data before sending outward
        const sanitizedTelemetry = sanitizeData(body.telemetry || cachedTelemetry);

        const prompt = `You are a Principal Windows 11 Security Architect. Analyze this live Windows 11 machine telemetry JSON and produce:
1. Top 3 Immediate Critical Vulnerabilities found on this specific host.
2. Exact hardened PowerShell remediation commands to neutralize each risk.
3. Autorun, socket hygiene, and memory protection observations.

Machine Telemetry:
${JSON.stringify(sanitizedTelemetry, null, 2)}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${effectiveKey}`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const geminiData: any = await geminiRes.json();
        if (!geminiRes.ok || geminiData.error) {
          return Response.json(
            { error: sanitizeString(geminiData?.error?.message || "Gemini API rejected request.") },
            { status: geminiRes.status || 500 }
          );
        }

        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated.";
        const sanitizedReport = sanitizeString(rawText);

        return Response.json({ analysis: sanitizedReport });
      }

      return new Response("Endpoint Not Found", { status: 404 });
    } catch (err: any) {
      const sanitizedError = sanitizeString(err?.message || "Internal server fault.");
      return Response.json({ error: "[SANITIZED_EXCEPTION] " + sanitizedError }, { status: 500 });
    }
  }
});

const serverUrl = `http://localhost:${server.port}`;
console.log(`⚡ Windows 11 Sentinel Mission Control operational at ${serverUrl}`);

// ---------------------------------------------------------------------------
// 11. ZERO-TOUCH BOOTSTRAPPING & STARTUP PRE-WARM
// ---------------------------------------------------------------------------
autoLaunchBrowser(serverUrl);
collectTelemetry(true).catch((e) => console.error("[STARTUP] Initial telemetry scan fault:", sanitizeString(e?.message)));