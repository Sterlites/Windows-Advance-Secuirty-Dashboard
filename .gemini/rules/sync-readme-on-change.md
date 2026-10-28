# Autonomous Documentation Synchronization Rule

When working on this repository (`Windows Advance Secuirty Dashboard` / `bunty.ts`):

1. **Mandatory Documentation Sync on Functional Changes**:
   - Whenever any functional change is made to `bunty.ts` (e.g., adding/modifying endpoints, updating `REMEDIATION_COMMANDS`, altering PowerShell collection logic in `PS_COLLECTOR_SCRIPT`, adding/changing environment variables, adjusting posture scoring algorithms, or modifying data sanitization rules), you MUST run:
     ```bash
     bun run sync-docs
     ```
   - This synchronizes the auto-generated specification tables in `README.md` and records the functional change in `.sentinel/doc-state.json`.

2. **Always Keep Architecture in Sync**:
   - Verify that any newly introduced command has a title, description, PowerShell script, and corresponding rollback script if applicable.
   - Any new REST or SSE endpoint must be documented in the route dispatcher table.
   - Verify that all sensitive tokens (API keys, home dirs, usernames, MAC addresses) are scrubbed through `sanitizeString` / `sanitizeData`.
