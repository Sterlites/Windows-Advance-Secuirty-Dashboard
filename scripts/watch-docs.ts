// scripts/watch-docs.ts
// Live File Watcher for Windows 11 Sentinel
// Automatically synchronizes README.md in real-time as bunty.ts is modified

import { watch } from "node:fs";
import { resolve } from "node:path";
import { syncDocumentation } from "./sync-readme";

const ROOT_DIR = resolve(import.meta.dir, "..");
const BUNTY_PATH = resolve(ROOT_DIR, "bunty.ts");

console.log("⚡ [WATCH-DOCS] Watching bunty.ts for live functional changes...");
console.log("   README.md will be automatically synchronized on every save.");

let debounceTimer: Timer | null = null;

watch(BUNTY_PATH, (eventType) => {
  if (eventType === "change" || eventType === "rename") {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const res = syncDocumentation();
        if (res.changes.length > 0) {
          console.log(`[${new Date().toLocaleTimeString()}] ✅ README.md updated:`);
          for (const c of res.changes) {
            console.log(`   • ${c}`);
          }
        } else {
          console.log(`[${new Date().toLocaleTimeString()}] ✨ bunty.ts saved (No functional change detected)`);
        }
      } catch (err: any) {
        console.error(`[WATCH-DOCS] Synchronization error:`, err?.message);
      }
    }, 400);
  }
});
