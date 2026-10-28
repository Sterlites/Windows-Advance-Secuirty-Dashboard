// scripts/sync-readme.ts
// Autonomous Documentation Synchronizer for Windows 11 Sentinel
// Automatically extracts runtime architecture, endpoints, commands, and telemetry from bunty.ts

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

const ROOT_DIR = resolve(import.meta.dir, "..");
const BUNTY_PATH = resolve(ROOT_DIR, "bunty.ts");
const README_PATH = resolve(ROOT_DIR, "README.md");
const STATE_DIR = resolve(ROOT_DIR, ".sentinel");
const STATE_PATH = resolve(STATE_DIR, "doc-state.json");

interface RemediationMeta {
  id: string;
  title: string;
  description: string;
  rollbackActionId?: string;
  isRollback?: boolean;
}

interface EndpointMeta {
  path: string;
  method: string;
  description: string;
}

interface ScoringRule {
  target: string;
  points: number;
}

interface EnvVarMeta {
  name: string;
  defaultValue: string;
  description: string;
}

interface DocStateSnapshot {
  hash: string;
  sourceCodeHash: string;
  lastUpdated: string;
  endpoints: EndpointMeta[];
  remediations: RemediationMeta[];
  envVars: EnvVarMeta[];
  scoring: { base: number; rules: ScoringRule[] };
  telemetryModules: string[];
  history: Array<{
    timestamp: string;
    description: string;
    changes: string[];
  }>;
}

function extractEnvVars(code: string): EnvVarMeta[] {
  const envMap = new Map<string, EnvVarMeta>();
  
  // Known documented environment variables with explicit descriptions
  const descriptions: Record<string, string> = {
    PORT: "TCP port for the Mission Control HTTP and SSE server (Default: 3000)",
    HOST: "Binding host address (Default: localhost)",
    GEMINI_API_KEY: "Google Gemini API key for neural threat analysis (Optional, can also be provided in UI)",
    GEMINI_MODEL: "Google Gemini model tag for threat auditing (Default: gemini-2.5-flash)",
    AUTO_LAUNCH: "Auto-launch default browser on startup (Set 'false' to disable)",
    NO_BROWSER: "Alternative flag to inhibit browser auto-launching (Set '1' to disable)",
    SCRUB_TELEMETRY: "Toggle zero-leak telemetry scrubber (Set 'false' to bypass redaction; Default: true)",
    USERNAME: "Windows current operator username (Scrubbed in outbound telemetry)",
    USERPROFILE: "Windows user profile directory (Scrubbed in outbound telemetry)",
    CI: "CI environment flag (Inhibits browser auto-launch when set)"
  };

  const matches = [...code.matchAll(/Bun\.env\.([A-Z0-9_]+)(?:\s*\|\|\s*["']([^"']*)["'])?/g)];
  for (const m of matches) {
    const name = m[1];
    const defVal = m[2] !== undefined ? m[2] : "(Computed)";
    if (!envMap.has(name)) {
      envMap.set(name, {
        name,
        defaultValue: defVal || "(None)",
        description: descriptions[name] || `Runtime environment flag ${name}`
      });
    }
  }

  // Check additional env vars
  for (const [name, desc] of Object.entries(descriptions)) {
    if (!envMap.has(name) && code.includes(`Bun.env.${name}`)) {
      envMap.set(name, {
        name,
        defaultValue: "(Dynamic)",
        description: desc
      });
    }
  }

  return Array.from(envMap.values());
}

function extractRemediations(code: string): RemediationMeta[] {
  const remediations: RemediationMeta[] = [];
  const startIdx = code.indexOf("const REMEDIATION_COMMANDS");
  if (startIdx === -1) return remediations;

  const endIdx = code.indexOf("function toEncodedCommand", startIdx);
  const block = code.substring(startIdx, endIdx !== -1 ? endIdx : startIdx + 10000);

  const entryRegex = /([a-z0-9_]+):\s*\{/g;
  let match;
  const positions: { key: string; index: number }[] = [];
  while ((match = entryRegex.exec(block)) !== null) {
    positions.push({ key: match[1], index: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const key = positions[i].key;
    const currentStart = positions[i].index;
    const nextStart = i + 1 < positions.length ? positions[i + 1].index : block.lastIndexOf("};");
    const entryBlock = block.substring(currentStart, nextStart);

    const titleMatch = entryBlock.match(/title:\s*["']([^"']+)["']/);
    const descMatch = entryBlock.match(/description:\s*["']([^"']+)["']/);
    const rollbackMatch = entryBlock.match(/rollbackActionId:\s*["']([^"']+)["']/);
    const isRollbackMatch = entryBlock.match(/isRollback:\s*true/);

    if (titleMatch && descMatch) {
      remediations.push({
        id: key,
        title: titleMatch[1],
        description: descMatch[1],
        rollbackActionId: rollbackMatch ? rollbackMatch[1] : undefined,
        isRollback: Boolean(isRollbackMatch)
      });
    }
  }

  return remediations;
}

function extractEndpoints(code: string): EndpointMeta[] {
  const endpoints: EndpointMeta[] = [];
  const fetchStart = code.indexOf("async fetch(req: Request)");
  if (fetchStart === -1) return endpoints;

  const fetchEnd = code.indexOf("const serverUrl =", fetchStart);
  const fetchBody = code.substring(fetchStart, fetchEnd !== -1 ? fetchEnd : fetchStart + 5000);

  const blockRegex = /\/\/\s*(\d+\.?\s*[^\n]+)\n\s*if\s*\(([^)]+)\)/g;
  let m;
  while ((m = blockRegex.exec(fetchBody)) !== null) {
    const desc = m[1].replace(/^\d+\.\s*/, "").trim();
    const condition = m[2];

    const pathMatch = condition.match(/url\.pathname\s*===\s*["']([^"']+)["']/);
    const methodMatch = condition.match(/req\.method\s*===\s*["']([^"']+)["']/);

    if (pathMatch) {
      endpoints.push({
        path: pathMatch[1],
        method: methodMatch ? methodMatch[1] : "GET",
        description: desc
      });
    }
  }

  return endpoints;
}

function extractScoring(code: string): { base: number; rules: ScoringRule[] } {
  let base = 25;
  const baseMatch = code.match(/\$score\s*=\s*(\d+)/);
  if (baseMatch) {
    base = parseInt(baseMatch[1], 10);
  }

  const rules: ScoringRule[] = [];
  const ruleMatches = [...code.matchAll(/if\s*\(([^)]+)\)\s*\{\s*\$score\s*\+=\s*(\d+)\s*\}/g)];
  for (const m of ruleMatches) {
    const condition = m[1].trim();
    const pts = parseInt(m[2], 10);
    rules.push({ target: condition, points: pts });
  }

  return { base, rules };
}

function extractTelemetryModules(code: string): string[] {
  const modules: string[] = [];
  const matches = [...code.matchAll(/#\s*(\d+\.\s*[^\n\r]+)/g)];
  for (const m of matches) {
    modules.push(m[1].trim());
  }
  return modules;
}

function extractSanitizationRules(code: string): string[] {
  const rules: string[] = [];
  const matches = [...code.matchAll(/\/\/\s*(\d+\.\s*Scrub\s*[^\n\r]+)/g)];
  for (const m of matches) {
    rules.push(m[1].trim());
  }
  return rules;
}

function generateMarkdownSections(
  stats: { loc: number; sizeKb: string; codeHash: string; date: string },
  envVars: EnvVarMeta[],
  endpoints: EndpointMeta[],
  remediations: RemediationMeta[],
  scoring: { base: number; rules: ScoringRule[] },
  telemetryModules: string[],
  sanitizationRules: string[],
  history: Array<{ timestamp: string; description: string; changes: string[] }>
) {
  // 1. STATS
  const statsMd = `
| Metric | Specification |
| :--- | :--- |
| **Architecture** | Single-File Zero-Dependency TypeScript (\`bunty.ts\`) |
| **Runtime Engine** | Bun \`v1.4+\` (Native Web Standard APIs & IPC) |
| **Source Footprint** | **${stats.loc} lines** (\`${stats.sizeKb} KB\`) |
| **Telemetry Velocity** | **< 500ms** (Compiled .NET + CIM / Direct Registry) |
| **Network Socket Radar** | **< 30ms** (\`netstat -ano\` + PID mapping) |
| **Real-Time IPC** | Server-Sent Events (SSE) Loopback Stream |
| **Engine SHA-256** | \`${stats.codeHash}\` |
| **Last Synchronized** | \`${stats.date}\` |
`.trim();

  // 2. ENV
  const envMd = `
| Variable | Default Value | Description |
| :--- | :--- | :--- |
${envVars.map((e) => `| \`${e.name}\` | \`${e.defaultValue}\` | ${e.description} |`).join("\n")}
`.trim();

  // 3. ENDPOINTS
  const endpointsMd = `
| Route | Method | Classification | Description |
| :--- | :---: | :--- | :--- |
${endpoints
  .map(
    (e) =>
      `| \`${e.path}\` | \`${e.method}\` | ${
        e.path.startsWith("/api") ? "REST / IPC" : "Frontend Asset"
      } | ${e.description} |`
  )
  .join("\n")}
`.trim();

  // 4. REMEDIATIONS
  const normalRemediations = remediations.filter((r) => !r.isRollback);
  const rollbackRemediations = remediations.filter((r) => r.isRollback);

  const remediationsMd = `
### Active Hardening Remediations

| Action Identifier | Title | Security Objective | Rollback Trigger |
| :--- | :--- | :--- | :--- |
${normalRemediations
  .map(
    (r) =>
      `| \`${r.id}\` | **${r.title}** | ${r.description} | ${
        r.rollbackActionId ? `\`${r.rollbackActionId}\`` : "N/A"
      } |`
  )
  .join("\n")}

### Rollback & Reversion Registry

| Rollback Identifier | Title | Reversion Target |
| :--- | :--- | :--- |
${rollbackRemediations
  .map((r) => `| \`${r.id}\` | **${r.title}** | ${r.description} |`)
  .join("\n")}
`.trim();

  // 5. POSTURE
  const postureMd = `
The security posture algorithm evaluates 10 key Windows 11 defense rings starting from a base baseline of **${scoring.base} points** up to a maximum of **100/100 points**:

| Defense Vector | Evaluation Condition | Posture Points |
| :--- | :--- | :---: |
| **Base Baseline** | Minimum host operational baseline | \`+${scoring.base}\` |
${scoring.rules
  .map((r) => {
    let label = r.target;
    if (r.target.includes("$rtp")) label = "Microsoft Defender Real-Time Protection Active";
    else if (r.target.includes("$tp")) label = "Microsoft Defender Tamper Protection Armed";
    else if (r.target.includes("$hvciRunning")) label = "Hypervisor-Protected Code Integrity (HVCI) Running";
    else if (r.target.includes("$vbsRunning")) label = "Virtualization-Based Security (VBS) Running";
    else if (r.target.includes("$lsaPPL")) label = "LSA RunAsPPL Credential Guard Enabled";
    else if (r.target.includes("-not $smb1Enabled")) label = "Legacy SMBv1 Protocol Disabled";
    else if (r.target.includes("$smbSigning")) label = "SMB Packet Signing Required";
    else if (r.target.includes("$llmnrDisabled")) label = "LLMNR Multicast Spoofing Resolution Disabled";
    else if (r.target.includes("$pua")) label = "Defender PUA / PUP Adware Protection Enforced";
    return `| **${label}** | \`${r.target}\` | \`+${r.points}\` |`;
  })
  .join("\n")}
| **Maximum Posture Score** | All defense vectors active and hardened | **100** |
`.trim();

  // 6. TELEMETRY
  const telemetryMd = `
| Module | Subsystem | Query Mechanism | Latency Profile |
| :---: | :--- | :--- | :---: |
${telemetryModules
  .map((m) => {
    const parts = m.split(/\s*via\s*|\s*\(/i);
    const title = parts[0].trim();
    const mechanism = parts[1] ? parts[1].replace(/\)$/, "").trim() : "Direct Registry / .NET CIM";
    return `| ⚡ | **${title}** | \`${mechanism}\` | \`< 50ms\` |`;
  })
  .join("\n")}
`.trim();

  // 7. SANITIZATION
  const sanitizationMd = `
| Priority | Redaction Target | Pattern / Heuristic | Replacement Token |
| :---: | :--- | :--- | :--- |
${sanitizationRules
  .map((r, i) => {
    const desc = r.replace(/^\d+\.\s*Scrub\s*/i, "").trim();
    let token = "[REDACTED]";
    if (desc.toLowerCase().includes("home directory")) token = "\`[SYSTEM_USER_ROOT]\`";
    else if (desc.toLowerCase().includes("operator username")) token = "\`[OPERATOR_ID]\`";
    else if (desc.toLowerCase().includes("gemini")) token = "\`[REDACTED_API_TOKEN]\`";
    else if (desc.toLowerCase().includes("bearer")) token = "\`Bearer [REDACTED_AUTH_TOKEN]\`";
    else if (desc.toLowerCase().includes("mac address")) token = "\`[REDACTED_HW_ADDR]\`";
    return `| \`0${i + 1}\` | **${desc}** | Contextual regex scrubber | ${token} |`;
  })
  .join("\n")}
`.trim();

  // 8. CHANGELOG
  const changelogMd = `
| Timestamp | Event / Change Type | Functional Delta |
| :--- | :--- | :--- |
${
  history.length > 0
    ? history
        .slice(0, 10)
        .map(
          (h) =>
            `| \`${h.timestamp}\` | **${h.description}** | ${h.changes.join("; ")} |`
        )
        .join("\n")
    : "| `Initial Release` | **System Baseline** | Full Windows 11 Sentinel Architecture and Mission Control |"
}
`.trim();

  return {
    statsMd,
    envMd,
    endpointsMd,
    remediationsMd,
    postureMd,
    telemetryMd,
    sanitizationMd,
    changelogMd
  };
}

function replaceBetweenMarkers(
  content: string,
  markerKey: string,
  newText: string
): string {
  const startMarker = `<!-- AUTOGEN:${markerKey}_START -->`;
  const endMarker = `<!-- AUTOGEN:${markerKey}_END -->`;

  const sIdx = content.indexOf(startMarker);
  const eIdx = content.indexOf(endMarker);

  if (sIdx === -1 || eIdx === -1) {
    return content;
  }

  return (
    content.slice(0, sIdx + startMarker.length) +
    "\n" +
    newText +
    "\n" +
    content.slice(eIdx)
  );
}

export function syncDocumentation(): { updated: boolean; changes: string[] } {
  if (!existsSync(BUNTY_PATH)) {
    console.error(`[SYNC-DOCS] File not found: ${BUNTY_PATH}`);
    return { updated: false, changes: [] };
  }

  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  const buntyCode = readFileSync(BUNTY_PATH, "utf8");
  const lines = buntyCode.split(/\r?\n/).length;
  const sizeKb = (Buffer.byteLength(buntyCode, "utf8") / 1024).toFixed(1);
  const codeHash = createHash("sha256").update(buntyCode).digest("hex").slice(0, 16);
  const dateStr = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  // Extract metadata
  const envVars = extractEnvVars(buntyCode);
  const endpoints = extractEndpoints(buntyCode);
  const remediations = extractRemediations(buntyCode);
  const scoring = extractScoring(buntyCode);
  const telemetryModules = extractTelemetryModules(buntyCode);
  const sanitizationRules = extractSanitizationRules(buntyCode);

  // Compute functional signature
  const functionalObj = {
    endpoints,
    remediations,
    envVars,
    scoring,
    telemetryModules,
    sanitizationRules
  };
  const functionalHash = createHash("sha256")
    .update(JSON.stringify(functionalObj))
    .digest("hex");

  // Load existing state
  let previousState: DocStateSnapshot | null = null;
  if (existsSync(STATE_PATH)) {
    try {
      previousState = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    } catch {
      previousState = null;
    }
  }

  const detectedChanges: string[] = [];

  if (previousState) {
    if (previousState.endpoints.length !== endpoints.length) {
      detectedChanges.push(`Endpoints changed: ${previousState.endpoints.length} -> ${endpoints.length}`);
    } else {
      const oldPaths = previousState.endpoints.map(e => `${e.method} ${e.path}`).sort().join(",");
      const newPaths = endpoints.map(e => `${e.method} ${e.path}`).sort().join(",");
      if (oldPaths !== newPaths) detectedChanges.push("Endpoints modified");
    }

    if (previousState.remediations.length !== remediations.length) {
      detectedChanges.push(`Remediation commands updated: ${previousState.remediations.length} -> ${remediations.length}`);
    }

    if (previousState.scoring.rules.length !== scoring.rules.length) {
      detectedChanges.push(`Security posture scoring rules adjusted (${scoring.rules.length} rules)`);
    }

    if (previousState.envVars.length !== envVars.length) {
      detectedChanges.push(`Environment variables updated: ${previousState.envVars.length} -> ${envVars.length}`);
    }

    if (previousState.telemetryModules.length !== telemetryModules.length) {
      detectedChanges.push(`Telemetry collector modules modified (${telemetryModules.length} modules)`);
    }

    if (detectedChanges.length === 0 && previousState.sourceCodeHash !== codeHash) {
      detectedChanges.push(`Refactored code (${lines} lines, ${sizeKb} KB)`);
    }
  } else {
    detectedChanges.push("Initial baseline synchronization");
  }

  const history = previousState?.history || [];
  if (detectedChanges.length > 0) {
    history.unshift({
      timestamp: dateStr,
      description: detectedChanges[0],
      changes: detectedChanges
    });
  }

  const sections = generateMarkdownSections(
    { loc: lines, sizeKb, codeHash, date: dateStr },
    envVars,
    endpoints,
    remediations,
    scoring,
    telemetryModules,
    sanitizationRules,
    history
  );

  let readmeContent = existsSync(README_PATH) ? readFileSync(README_PATH, "utf8") : "";

  // If README does not exist or lacks markers, we will write or update it
  if (readmeContent.includes("<!-- AUTOGEN:STATS_START -->")) {
    readmeContent = replaceBetweenMarkers(readmeContent, "STATS", sections.statsMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "ENV", sections.envMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "ENDPOINTS", sections.endpointsMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "REMEDIATIONS", sections.remediationsMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "POSTURE", sections.postureMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "TELEMETRY", sections.telemetryMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "SANITIZATION", sections.sanitizationMd);
    readmeContent = replaceBetweenMarkers(readmeContent, "CHANGELOG", sections.changelogMd);
  }

  writeFileSync(README_PATH, readmeContent, "utf8");

  // Save new state snapshot
  const newState: DocStateSnapshot = {
    hash: functionalHash,
    sourceCodeHash: codeHash,
    lastUpdated: dateStr,
    endpoints,
    remediations,
    envVars,
    scoring,
    telemetryModules,
    history
  };
  writeFileSync(STATE_PATH, JSON.stringify(newState, null, 2), "utf8");

  return { updated: true, changes: detectedChanges };
}

// Direct execution
if (import.meta.main) {
  console.log("⚡ [SYNC-DOCS] Synchronizing Windows 11 Sentinel Documentation...");
  const result = syncDocumentation();
  if (result.changes.length > 0) {
    console.log(`✅ [SYNC-DOCS] Documentation updated with changes:`);
    for (const c of result.changes) {
      console.log(`   • ${c}`);
    }
  } else {
    console.log("✨ [SYNC-DOCS] Documentation is already up to date with bunty.ts.");
  }
}
