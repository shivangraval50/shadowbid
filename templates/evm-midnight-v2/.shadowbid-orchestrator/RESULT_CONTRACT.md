# Agent result contract

Each task writes `.shadowbid-orchestrator/status/<task>.json` with: `task`, `model_role`, `model_actual`, `branch`, `worktree`, `started_at`, `finished_at`, `status`, `tests_run`, `tests_passed`, `files_changed`, `blockers`, `next_action`, and `session_id_if_available`.

Allowed `status`: `PENDING`, `RUNNING`, `PASSED`, `FAILED_RETRYABLE`, `FAILED_ARCHITECTURE`, `WAITING_FOR_CODEX_RESET`, `BLOCKED_EXTERNAL`.
