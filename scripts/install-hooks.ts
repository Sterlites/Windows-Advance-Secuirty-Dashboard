// scripts/install-hooks.ts
// Installs Git hooks to automatically synchronize README.md whenever bunty.ts undergoes functional changes

import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT_DIR = resolve(import.meta.dir, "..");
const GITHOOKS_DIR = resolve(ROOT_DIR, ".githooks");
const DOT_GIT_HOOKS_DIR = resolve(ROOT_DIR, ".git", "hooks");

const PRE_COMMIT_HOOK_SH = `#!/bin/sh
# Windows 11 Sentinel — Autonomous Documentation Sync Pre-Commit Hook
# Automatically syncs README.md when bunty.ts has functional changes

echo "⚡ [SENTINEL-HOOK] Checking for functional changes in bunty.ts..."

# Run the Bun documentation synchronizer
bun run scripts/sync-readme.ts

# If README.md or state was updated, stage them automatically into this commit
if [ -f README.md ]; then
  git add README.md .sentinel/doc-state.json 2>/dev/null
  echo "✅ [SENTINEL-HOOK] README.md and documentation state synchronized and staged."
fi

exit 0
`;

const PRE_COMMIT_HOOK_BAT = `@echo off
rem Windows 11 Sentinel — Autonomous Documentation Sync Pre-Commit Hook (CMD / Windows)
echo ⚡ [SENTINEL-HOOK] Checking for functional changes in bunty.ts...
bun run scripts/sync-readme.ts
git add README.md .sentinel/doc-state.json >nul 2>&1
echo ✅ [SENTINEL-HOOK] README.md and documentation state synchronized and staged.
exit /b 0
`;

function installHooks() {
  console.log("⚡ [INSTALL-HOOKS] Setting up Git pre-commit hooks for autonomous README updates...");

  // 1. Create .githooks directory (version-controlled)
  if (!existsSync(GITHOOKS_DIR)) {
    mkdirSync(GITHOOKS_DIR, { recursive: true });
  }

  const hookShPath = resolve(GITHOOKS_DIR, "pre-commit");
  writeFileSync(hookShPath, PRE_COMMIT_HOOK_SH, "utf8");
  try {
    chmodSync(hookShPath, 0o755);
  } catch {}

  // 2. Also write directly to .git/hooks if .git exists
  if (existsSync(DOT_GIT_HOOKS_DIR)) {
    const dotGitHookSh = resolve(DOT_GIT_HOOKS_DIR, "pre-commit");
    writeFileSync(dotGitHookSh, PRE_COMMIT_HOOK_SH, "utf8");
    try {
      chmodSync(dotGitHookSh, 0o755);
    } catch {}
  }

  // 3. Configure git core.hooksPath to point to .githooks
  try {
    execSync("git config core.hooksPath .githooks", { stdio: "inherit", cwd: ROOT_DIR });
    console.log("✅ [INSTALL-HOOKS] Configured git core.hooksPath = .githooks");
  } catch (err: any) {
    console.warn("⚠️ [INSTALL-HOOKS] Could not set core.hooksPath directly (non-fatal):", err.message);
  }

  console.log("✨ [INSTALL-HOOKS] Git hooks active! Every commit will now automatically update README.md.");
}

if (import.meta.main) {
  installHooks();
}

