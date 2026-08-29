# Codex CLI capabilities (verified 2026-08-29)

Codex CLI: `codex-cli 0.151.0-alpha.7.1`. Authentication is active through the normal ChatGPT login. The following was established from the local `codex --help`, `codex exec --help`, `codex exec resume --help`, `codex resume --help`, `codex login --help`, `codex agents --help`, `codex features list`, and the local Codex configuration (configuration only; no credentials read).

| Capability | Evidence / supported form |
| --- | --- |
| Non-interactive execution | `codex exec [OPTIONS] [PROMPT]` |
| Explicit model selection | `codex exec -m <model> ...` |
| Sandbox selection | `codex exec -s read-only|workspace-write|danger-full-access ...`; runner must use `workspace-write` only |
| JSON event output | `codex exec --json ...` |
| Final-message capture | `codex exec -o <file> ...` / `--output-last-message <file>` |
| Structured output | `codex exec --output-schema <schema-file> ...` |
| Resumable non-interactive sessions | `codex exec resume <session-id> <prompt>`; omit `--ephemeral` so the session persists |
| Interactive resume | `codex resume --last` or `codex resume <session-id>` |
| Session visibility | `codex agents` lists local-app-server sessions; JSON event output supplies a thread/session identifier for durable task records |
| Worktree isolation | native `git worktree` verified separately; Codex does not create worktrees automatically in the tested `exec` form |
| Approval modes | interactive root command exposes `-a/--ask-for-approval`; `codex exec` rejects that flag. Non-interactive runner must not invent an approval flag and must stay in safe sandbox scope |
| Concurrency | no documented CLI task scheduler/controller was found. Independent `codex exec` processes can be started by a shell runner, but the runner must enforce its own worktree/port/RAM limits |
| Usage/reset reporting | no documented machine-readable reset-time/status command found in inspected help |

Verified model identifiers: `gpt-5.6-luna` and `gpt-5.6-terra` completed read-only probes. `gpt-5.6-sol` is available in the local Codex model catalog and is reserved for review; do not spend a Sol call merely to prove availability. Exact safe invocation:

```sh
codex exec -m gpt-5.6-terra -s workspace-write --json -o RESULT.md "<task>"
```

Git isolation is supported by native `git worktree`; a disposable detached worktree at the reference tag created and removed successfully. The CLI does not expose a documented machine-readable usage/reset timestamp in the inspected help. On rate/usage-limit output, save session/status, mark `WAITING_FOR_CODEX_RESET`, retain the runner, and make one harmless Luna probe at 600-second intervals; resume with `codex exec resume <session-id> <prompt>` only after access returns. Never purchase or redeem resets automatically.
