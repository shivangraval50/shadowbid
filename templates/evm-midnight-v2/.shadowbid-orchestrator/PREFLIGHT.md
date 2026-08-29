# ShadowBid master-orchestration preflight

Date: 2026-08-29
Scope: prepare the untouched/reference EffectStream EVM + Midnight template for the *next* master orchestration prompt. No ShadowBid feature code was created or changed during this preflight.

## Preserved reference baseline

- Repository root: `/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream`
- Template directory: `templates/evm-midnight-v2`
- Reference commit: `7bbd6709647f55a65912185a4046e358c93143a5`
- Local recovery tag: `shadowbid-reference-validated` -> that commit
- Branch: `v-next`
- Initial working tree had pre-existing setup-related edits and untracked files. They were preserved exactly; they were not committed, reset, stashed, or overwritten.
- A detached disposable `git worktree` at the recovery tag was created and removed successfully. Future feature worktrees must be created from the repository root, then use their `templates/evm-midnight-v2` subdirectory.

## Host and toolchain readiness

| Item | Verified state |
| --- | --- |
| Host | macOS 15.3.2 (24D81), `arm64`, 8 GiB RAM |
| Free disk | 11,529,332 KiB (approximately 11.0 GiB; meets the 8 GiB minimum and 10 GiB preferred threshold) |
| Bun | `1.4.0` |
| Node.js | `22.23.1` |
| Foundry | `forge`, `cast`, and `anvil` `1.8.1` |
| Compact | Manager `0.5.2`; exact template selection `0.33.0-rc.2` is installed, and `compact compile +0.33.0-rc.2 --version` returns compiler `0.33.0` |
| Native service prerequisites | Present through the validated template dependencies; Docker is not required for this native local template path |
| Sleep prevention | `/usr/bin/caffeinate` present and usable |
| Git tools | `git`, `zsh`, `bash`, `curl`, `jq`, `sed`, `awk`, `grep`, `find`, `xargs`, Python 3, and Node present |

`bun install`, EVM compilation, Compact compilation, frontend builds, and the full test suite (`41/41`) passed during reference validation. See `docs/SETUP_STATUS.md` for the detailed proof and exact reference launch command.

The preserved coupled dependency set is: EffectStream/native wrappers `0.200.1`, Compact runtime `0.18.0-rc.1`, Compact JS `2.5.5-rc.7`, Midnight JS packages `5.0.0-beta.6`, ledger-v9 `1.0.0-rc.3`, on-chain runtime-v4 `4.0.0-rc.3`, PGLite `0.3.16`, Midnight node `2.0.0-rc.4`, indexer `4.4.0-rc.1`, and proof server `9.0.0-rc.5`. These versions must move together only with evidence; no toolchain dependency was changed in this preflight.

## Codex runner capability and authentication

- CLI version: `codex-cli 0.151.0-alpha.7.1`.
- Authentication check: `codex login status` reports ChatGPT login.
- Harmless non-interactive probes succeeded with `gpt-5.6-luna` and `gpt-5.6-terra`; artifacts/logs were saved locally and are gitignored.
- `gpt-5.6-sol` is available in the local Codex model catalog for final review.
- The supported non-interactive form is:

  ```sh
  codex exec -m <model> -s workspace-write --json -o <result-file> "<prompt>"
  ```

- `codex exec resume <session-id> <prompt>` supports resuming a saved non-interactive session. `codex exec` does **not** accept the interactive `-a/--ask-for-approval` option; do not pass it.
- No automatic reset purchase or redemption is authorized. The CLI help has no documented machine-readable reset timestamp; rate-limit handling must remain status-driven.

Detailed command capability, model allocation, result capture, and rate-limit procedure: `.shadowbid-orchestrator/CODEX_CAPABILITIES.md`, `.shadowbid-orchestrator/model-map.env`, `.shadowbid-orchestrator/runtime.env`, and `.shadowbid-orchestrator/RESULT_CONTRACT.md`.

## Network and service state

- Official-doc reachability was checked without using unofficial sources. `https://docs.midnight.network` reached the official Vercel edge but returned HTTP 429/challenge; this is a documentation-access limitation, not a local dependency failure. Use local locked dependencies and official GitHub/package sources if a future verification needs network material.
- No Docker daemon is required for the validated native launch path.
- Earlier persistent validation proved all template services and browser loading. At this preflight snapshot, the previous detached launch parent is no longer running: known template-owned processes still occupy PGLite (5432), Anvil (8545), Midnight node (9944), proof server (6300), batcher (3334), and frontend (10599); indexer (8088) and EffectStream sync (9999) are not currently listening. This is non-blocking but means the next runner must perform the normal clean stack launch/health check rather than assume every prior service is live. Do not kill or reuse unknown port owners without first identifying them.

| Service | Required TCP port |
| --- | --- |
| PGLite database | 5432 |
| Anvil EVM JSON-RPC | 8545 |
| Midnight node | 9944 |
| Midnight indexer | 8088 |
| Midnight proof server | 6300 |
| EffectStream sync/API | 9999 |
| Batcher | 3334 |
| Frontend | 10599 |

## Orchestrator safety contract

1. Work only in named Git worktrees based on `shadowbid-reference-validated`; leave the reference tree unchanged except for orchestration records expressly requested by the master prompt.
2. Use the model roles in `model-map.env`: Luna for cheap discovery/status, Terra for implementation and integration, Sol for review. Record actual model IDs in each result JSON.
3. Start the durable runner with process-scoped sleep prevention, for example:

   ```sh
   nohup /usr/bin/caffeinate -dims -- bash scripts/shadowbid-start.sh \
     > .shadowbid-orchestrator/logs/master-runner.log 2>&1 &
   echo $! > .shadowbid-orchestrator/sessions/master-runner.pid
   ```

   The runner must create only safe workspace-write Codex sessions, capture JSONL and final artifacts, and never use dangerous sandbox bypasses.
4. Maintain one status JSON per task under `.shadowbid-orchestrator/status/`, matching `RESULT_CONTRACT.md`. Use `PENDING`, `RUNNING`, `PASSED`, `FAILED_RETRYABLE`, `FAILED_ARCHITECTURE`, `WAITING_FOR_CODEX_RESET`, or `BLOCKED_EXTERNAL` only.
5. On a Codex limit/error, persist the session ID, keep the runner state, wait 600 seconds, make one harmless Luna probe, and resume only after it succeeds. Do not improvise an account reset. If blocked after the controlled retry policy, write `WAITING_FOR_USER.md` with the exact reason and needed choice.
6. Keep concurrent worktree tasks bounded by available RAM and port isolation. The next runner should use sequential integration/startup tasks and parallelize only independent, non-server worktrees. Never launch multiple stacks onto the ports listed in `ports.env`.
7. Every implementation task must run the narrow tests it owns; integration tasks must capture command, exit code, and health checks. Review tasks must be Sol-led and produce actionable findings or an explicit clean review.
8. No remote branch, PR, deployment, external message, secret, credential, or wallet material is authorized. Local Git commits are allowed only when a later user prompt explicitly requests them or makes them part of an approved workflow; never force-push or rewrite history.

## Recommendations for the next master prompt

The next master prompt should have its engineering runner create these scripts under `scripts/`, after it has read this preflight:

- `shadowbid-start.sh`: durable master loop, process-scoped `caffeinate`, task queue, locks, session/status persistence, and controlled retry/wait behavior.
- `shadowbid-status.sh`: reads status JSON files and prints a concise task/model/test/blocker table.
- `shadowbid-stop.sh`: validates the recorded master PID before sending a graceful stop signal; it must never kill arbitrary port owners or unrelated Codex sessions.
- `shadowbid-resume.sh`: reloads statuses/session IDs, performs the controlled availability probe if needed, and resumes pending work without repeating completed `PASSED` tasks.

Those scripts are deliberately not created in this preflight because the user instructed that no ShadowBid implementation or master orchestration execution begin yet.

## Remaining non-blocking notes

- The current process snapshot is partial from a prior validated stack; use a clean controlled launch before fresh integration work.
- The Midnight documentation site’s bot challenge may limit direct browser/CLI documentation fetches.
- No Docker cleanup or Docker setup action is required for this template’s native development flow.
