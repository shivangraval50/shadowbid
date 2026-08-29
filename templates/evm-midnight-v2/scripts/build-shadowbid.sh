#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$TEMPLATE_DIR" rev-parse --show-toplevel)"
TEMPLATE_REL="$(git -C "$REPO_ROOT" ls-files --full-name "$TEMPLATE_DIR/package.json" | sed 's#/package.json$##')"
ORCH_DIR="$TEMPLATE_DIR/.shadowbid-orchestrator"
PROMPT_DIR="$ORCH_DIR/prompts"
STATUS_DIR="$ORCH_DIR/status"
LOG_DIR="$ORCH_DIR/logs"
ARTIFACT_DIR="$ORCH_DIR/artifacts"
REVIEW_DIR="$ORCH_DIR/reviews"
SESSION_DIR="$ORCH_DIR/sessions"
LOCK_DIR="$ORCH_DIR/locks/build-shadowbid.lock"
WORKTREE_ROOT="${SHADOWBID_WORKTREE_ROOT:-$(dirname "$REPO_ROOT")/shadowbid-worktrees}"

source "$ORCH_DIR/model-map.env"
source "$ORCH_DIR/runtime.env"

mkdir -p "$STATUS_DIR" "$LOG_DIR" "$ARTIFACT_DIR" "$REVIEW_DIR" "$SESSION_DIR" "$ORCH_DIR/handoffs" "$WORKTREE_ROOT"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "SHADOWBID INCOMPLETE"
  echo "blocker: another orchestrator lock exists at $LOCK_DIR"
  echo "affected component: orchestration"
  echo "last successful phase: inspect status files"
  echo "next command/task required: verify the recorded PID, then run scripts/shadowbid-resume.sh or remove only a proven-stale lock"
  exit 1
fi

printf '%s\n' "$$" > "$LOCK_DIR/pid"
/usr/bin/caffeinate -dimsu -w "$$" &
CAFFEINATE_PID=$!

cleanup() {
  kill "$CAFFEINATE_PID" 2>/dev/null || true
  wait "$CAFFEINATE_PID" 2>/dev/null || true
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

timestamp() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

status_is_passed() {
  local task="$1"
  [[ -f "$STATUS_DIR/$task.json" ]] && [[ "$(jq -r '.status // empty' "$STATUS_DIR/$task.json" 2>/dev/null)" == "PASSED" ]]
}

write_status() {
  local task="$1"
  local model_role="$2"
  local model_actual="$3"
  local task_status="$4"
  local worktree="$5"
  local session_id="$6"
  local blocker="$7"
  local next_action="$8"
  local branch
  local started_at
  local finished_at
  local tmp_status
  branch="$(git -C "$worktree" branch --show-current 2>/dev/null || true)"
  started_at="$(jq -r '.started_at // empty' "$STATUS_DIR/$task.json" 2>/dev/null || true)"
  [[ -n "$started_at" ]] || started_at="$(timestamp)"
  finished_at="null"
  if [[ "$task_status" != "RUNNING" && "$task_status" != "PENDING" && "$task_status" != "WAITING_FOR_CODEX_RESET" ]]; then
    finished_at="\"$(timestamp)\""
  fi
  tmp_status="$STATUS_DIR/$task.json.tmp"
  jq -n \
    --arg task "$task" \
    --arg model_role "$model_role" \
    --arg model_actual "$model_actual" \
    --arg branch "$branch" \
    --arg worktree "$worktree" \
    --arg started_at "$started_at" \
    --arg status "$task_status" \
    --arg session_id "$session_id" \
    --arg blocker "$blocker" \
    --arg next_action "$next_action" \
    --argjson finished_at "$finished_at" \
    '{task:$task,model_role:$model_role,model_actual:$model_actual,branch:$branch,worktree:$worktree,started_at:$started_at,finished_at:$finished_at,status:$status,tests_run:[],tests_passed:null,files_changed:[],blockers:(if $blocker=="" then [] else [$blocker] end),next_action:$next_action,session_id_if_available:(if $session_id=="" then null else $session_id end)}' \
    > "$tmp_status"
  mv "$tmp_status" "$STATUS_DIR/$task.json"
}

extract_session_id() {
  local task_log="$1"
  grep '"type":"thread.started"' "$task_log" 2>/dev/null | tail -n 1 | jq -r '.thread_id // empty' 2>/dev/null || true
}

is_usage_limit() {
  local task_log="$1"
  grep -Eiq 'usage limit|rate limit|too many requests|credit.*exhaust|quota.*exceed|try again later' "$task_log"
}

wait_for_codex_reset() {
  local waiting_task="$1"
  local waiting_role="$2"
  local waiting_model="$3"
  local waiting_worktree="$4"
  local waiting_session="$5"
  local probe_log="$LOG_DIR/availability-probe.log"
  write_status "$waiting_task" "$waiting_role" "$waiting_model" "WAITING_FOR_CODEX_RESET" "$waiting_worktree" "$waiting_session" "Codex usage window unavailable" "Wait and resume automatically after a successful cheap probe"
  while true; do
    log "$waiting_task is waiting $CODEX_LIMIT_POLL_SECONDS seconds for ordinary Codex access reset"
    sleep "$CODEX_LIMIT_POLL_SECONDS"
    set +e
    printf '%s\n' 'Read no files. Make no changes. Reply exactly CODEX_AVAILABLE.' | \
      codex exec -m "$CHEAP_MODEL" -s read-only --ephemeral --json - > "$probe_log" 2>&1
    local probe_rc=$?
    set -e
    if [[ "$probe_rc" -eq 0 ]] && grep -q 'CODEX_AVAILABLE' "$probe_log"; then
      log "Codex access restored"
      return 0
    fi
  done
}

run_agent() {
  local task="$1"
  local role="$2"
  local model="$3"
  local prompt_file="$4"
  local task_dir="$5"
  local sandbox="${6:-workspace-write}"
  local attempt=1
  local task_log="$LOG_DIR/$task.jsonl"
  local result_file="$ARTIFACT_DIR/$task.md"
  local session_id=""

  if status_is_passed "$task"; then
    log "Skipping completed task $task"
    return 0
  fi
  session_id="$(jq -r '.session_id_if_available // empty' "$STATUS_DIR/$task.json" 2>/dev/null || true)"

  while [[ "$attempt" -le 2 ]]; do
    write_status "$task" "$role" "$model" "RUNNING" "$task_dir" "$session_id" "" "Codex attempt $attempt"
    log "Starting $task with $model (attempt $attempt)"
    set +e
    if [[ -n "$session_id" ]]; then
      (cd "$task_dir" && codex exec resume -m "$model" --json -o "$result_file" "$session_id" \
        "Continue the assigned task. Inspect your prior work and logs, fix the remaining failures, run the required checks, and finish with an exact evidence-based summary.") \
        > "$task_log" 2>&1
    else
      (cd "$task_dir" && codex exec -m "$model" -s "$sandbox" --json -o "$result_file" - < "$prompt_file") \
        > "$task_log" 2>&1
    fi
    local task_rc=$?
    set -e
    session_id="$(extract_session_id "$task_log")"
    printf '%s\n' "$session_id" > "$SESSION_DIR/$task.session"

    if [[ "$task_rc" -eq 0 ]]; then
      write_status "$task" "$role" "$model" "PASSED" "$task_dir" "$session_id" "" "Review result and checkpoint changes"
      log "Task $task completed"
      return 0
    fi

    if is_usage_limit "$task_log"; then
      wait_for_codex_reset "$task" "$role" "$model" "$task_dir" "$session_id"
      continue
    fi

    attempt=$((attempt + 1))
  done

  write_status "$task" "$role" "$model" "FAILED_RETRYABLE" "$task_dir" "$session_id" "Agent failed twice; see $task_log" "Escalate according to model policy"
  log "Task $task failed twice"
  return 1
}

ensure_worktree() {
  local logical_name="$1"
  local branch_name="$2"
  local worktree_path="$WORKTREE_ROOT/$logical_name"
  if [[ -d "$worktree_path/.git" || -f "$worktree_path/.git" ]]; then
    if [[ ! -e "$worktree_path/$TEMPLATE_REL/node_modules" && -d "$TEMPLATE_DIR/node_modules" ]]; then
      ln -s "$TEMPLATE_DIR/node_modules" "$worktree_path/$TEMPLATE_REL/node_modules"
    fi
    printf '%s\n' "$worktree_path"
    return 0
  fi
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$branch_name"; then
    git -C "$REPO_ROOT" worktree add "$worktree_path" "$branch_name" >&2
  else
    git -C "$REPO_ROOT" worktree add -b "$branch_name" "$worktree_path" HEAD >&2
  fi
  if [[ ! -e "$worktree_path/$TEMPLATE_REL/node_modules" && -d "$TEMPLATE_DIR/node_modules" ]]; then
    ln -s "$TEMPLATE_DIR/node_modules" "$worktree_path/$TEMPLATE_REL/node_modules"
  fi
  printf '%s\n' "$worktree_path"
}

sync_clean_worktree_to_head() {
  local worktree="$1"
  if [[ -n "$(git -C "$worktree" status --porcelain)" ]]; then
    log "Preserving resumable uncommitted task changes without fast-forwarding: $worktree"
    return 0
  fi
  git -C "$worktree" merge --ff-only shadowbid-build
}

validate_owned_changes() {
  local worktree="$1"
  local changed_path
  while IFS= read -r changed_path; do
    [[ -z "$changed_path" ]] && continue
    case "$changed_path" in
      */node_modules|*/node_modules/*|*/node_modules.*|*/node_modules.*/*)
        log "Refusing to checkpoint generated dependency path: $changed_path"
        return 1
        ;;
      "$TEMPLATE_REL"/*) ;;
      *)
        log "Refusing to checkpoint out-of-scope path from task worktree: $changed_path"
        return 1
        ;;
    esac
  done < <({ git -C "$worktree" diff --name-only; git -C "$worktree" diff --cached --name-only; git -C "$worktree" ls-files --others --exclude-standard; } | sort -u)
}

checkpoint_worktree() {
  local task="$1"
  local worktree="$2"
  local allow_empty="${3:-no}"
  if status_is_passed "checkpoint-$task"; then
    log "Skipping completed checkpoint for $task"
    return 0
  fi
  validate_owned_changes "$worktree"
  git -C "$worktree" add -- "$TEMPLATE_REL"
  if git -C "$worktree" diff --cached --quiet; then
    if [[ "$allow_empty" == "yes" ]]; then
      log "$task produced no file changes"
      return 0
    fi
    log "$task completed without required file changes"
    return 1
  fi
  git -C "$worktree" commit -m "shadowbid: checkpoint $task"
  write_status "checkpoint-$task" "local" "git" "PASSED" "$worktree" "" "" "Merge the task branch"
}

merge_branch() {
  local branch_name="$1"
  if git -C "$REPO_ROOT" merge-base --is-ancestor "$branch_name" HEAD; then
    log "Branch $branch_name already integrated"
    return 0
  fi
  log "Merging $branch_name"
  if ! git -C "$REPO_ROOT" merge --no-ff "$branch_name" -m "merge: $branch_name"; then
    write_status "merge-${branch_name//\//-}" "engineering" "$ENGINEERING_MODEL" "BLOCKED_EXTERNAL" "$TEMPLATE_DIR" "" "Unresolved merge conflict" "Resolve conflict in $REPO_ROOT, commit, then rerun this script"
    echo "DECISION REQUIRED"
    echo "Question: Resolve the reported merge conflict while preserving both task contracts?"
    echo "A. Resolve manually and rerun"
    echo "B. Abort this orchestration and inspect branches"
    echo "Recommended: A"
    echo "Why: Automatic conflict resolution could silently change privacy or settlement semantics."
    echo "Impact: All task branches and status files remain intact."
    exit 2
  fi
}

commit_main_file() {
  local file_path="$1"
  local message="$2"
  git -C "$REPO_ROOT" add -- "$TEMPLATE_REL/$file_path"
  if ! git -C "$REPO_ROOT" diff --cached --quiet; then
    git -C "$REPO_ROOT" commit -m "$message"
  fi
}

run_cheap_with_escalation() {
  local task="$1"
  local prompt="$2"
  local task_dir="$3"
  if run_agent "$task" "cheap" "$CHEAP_MODEL" "$prompt" "$task_dir"; then
    return 0
  fi
  run_agent "$task-terra" "engineering" "$ENGINEERING_MODEL" "$prompt" "$task_dir"
}

run_terra_with_blocker_review() {
  local task="$1"
  local prompt="$2"
  local task_dir="$3"
  if run_agent "$task" "engineering" "$ENGINEERING_MODEL" "$prompt" "$task_dir"; then
    return 0
  fi
  run_agent "$task-blocker-review" "review" "$REVIEW_MODEL" "$PROMPT_DIR/blocker-review.md" "$task_dir" "read-only" || true
  run_agent "$task-terra-remediation" "engineering" "$ENGINEERING_MODEL" "$prompt" "$task_dir"
}

run_gate() {
  local gate_name="$1"
  shift
  if status_is_passed "gate-$gate_name"; then
    log "Skipping completed gate $gate_name"
    return 0
  fi
  write_status "gate-$gate_name" "local" "shell" "RUNNING" "$TEMPLATE_DIR" "" "" "Run local quality gate"
  log "Running local gate $gate_name: $*"
  set +e
  (cd "$TEMPLATE_DIR" && "$@") > "$LOG_DIR/gate-$gate_name.log" 2>&1
  local gate_rc=$?
  set -e
  if [[ "$gate_rc" -ne 0 ]]; then
    write_status "gate-$gate_name" "local" "shell" "FAILED_RETRYABLE" "$TEMPLATE_DIR" "" "Command failed; see gate-$gate_name.log" "Run Terra remediation"
    return 1
  fi
  write_status "gate-$gate_name" "local" "shell" "PASSED" "$TEMPLATE_DIR" "" "" "Gate complete"
}

incomplete() {
  local blocker="$1"
  local component="$2"
  local phase="$3"
  local next="$4"
  echo "SHADOWBID INCOMPLETE"
  echo "blocker: $blocker"
  echo "affected component: $component"
  echo "last successful phase: $phase"
  echo "next command/task required: $next"
  exit 1
}

log "Orchestration mode: resumable Codex CLI tasks in isolated Git worktrees"
[[ "$(git -C "$REPO_ROOT" branch --show-current)" == "shadowbid-build" ]] || incomplete "expected integration branch shadowbid-build" "git baseline" "preflight" "switch to shadowbid-build without discarding changes and rerun"
git -C "$REPO_ROOT" diff --quiet || incomplete "tracked working tree is dirty" "git baseline" "preflight" "checkpoint or inspect tracked changes, then rerun"
git -C "$REPO_ROOT" diff --cached --quiet || incomplete "index is dirty" "git baseline" "preflight" "checkpoint or inspect staged changes, then rerun"
git -C "$REPO_ROOT" rev-parse shadowbid-reference-validated >/dev/null
command -v codex >/dev/null
command -v jq >/dev/null
command -v bun >/dev/null
command -v forge >/dev/null
command -v compact >/dev/null

if ! status_is_passed "architecture-review"; then
  run_agent "architecture-review" "review" "$REVIEW_MODEL" "$PROMPT_DIR/architecture-review.md" "$TEMPLATE_DIR" "read-only" || incomplete "architecture review failed" "architecture" "reference validation" "inspect $LOG_DIR/architecture-review.jsonl and rerun"
fi
if [[ ! -s "$TEMPLATE_DIR/docs/ARCHITECTURE_REVIEW.md" ]]; then
  cp "$ARTIFACT_DIR/architecture-review.md" "$TEMPLATE_DIR/docs/ARCHITECTURE_REVIEW.md"
  commit_main_file "docs/ARCHITECTURE_REVIEW.md" "docs: record ShadowBid architecture review"
fi

CORE_ROOT="$(ensure_worktree shadowbid-core shadowbid/core)"
CORE_DIR="$CORE_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "core" "$PROMPT_DIR/core.md" "$CORE_DIR" || incomplete "core agent failed after review/remediation" "contracts and cross-chain core" "architecture review" "inspect core logs and resume the recorded session"
checkpoint_worktree "core" "$CORE_ROOT" || incomplete "core produced no safe checkpoint" "contracts and cross-chain core" "architecture review" "inspect $CORE_ROOT"
merge_branch shadowbid/core

MIDNIGHT_ROOT="$(ensure_worktree shadowbid-midnight shadowbid/midnight)"
EFFECTSTREAM_ROOT="$(ensure_worktree shadowbid-effectstream shadowbid/effectstream)"
MIDNIGHT_DIR="$MIDNIGHT_ROOT/$TEMPLATE_REL"
EFFECTSTREAM_DIR="$EFFECTSTREAM_ROOT/$TEMPLATE_REL"

set +e
run_terra_with_blocker_review "midnight-core" "$PROMPT_DIR/midnight-core.md" "$MIDNIGHT_DIR" &
MIDNIGHT_PID=$!
run_terra_with_blocker_review "effectstream-core" "$PROMPT_DIR/effectstream-core.md" "$EFFECTSTREAM_DIR" &
EFFECTSTREAM_PID=$!
wait "$MIDNIGHT_PID"
MIDNIGHT_RC=$?
wait "$EFFECTSTREAM_PID"
EFFECTSTREAM_RC=$?
set -e
[[ "$MIDNIGHT_RC" -eq 0 ]] || incomplete "Midnight core failed after escalation" "Midnight/Compact" "EVM core merge" "inspect midnight-core logs and resume"
[[ "$EFFECTSTREAM_RC" -eq 0 ]] || incomplete "EffectStream core failed after escalation" "EffectStream/database" "EVM core merge" "inspect effectstream-core logs and resume"
checkpoint_worktree "midnight-core" "$MIDNIGHT_ROOT" || incomplete "Midnight core produced no safe checkpoint" "Midnight/Compact" "EVM core merge" "inspect Midnight worktree"
checkpoint_worktree "effectstream-core" "$EFFECTSTREAM_ROOT" || incomplete "EffectStream core produced no safe checkpoint" "EffectStream/database" "EVM core merge" "inspect EffectStream worktree"
merge_branch shadowbid/midnight
merge_branch shadowbid/effectstream

BATCHER_ROOT="$(ensure_worktree shadowbid-batcher shadowbid/batcher)"
BATCHER_DIR="$BATCHER_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "batcher-core" "$PROMPT_DIR/batcher-core.md" "$BATCHER_DIR" || incomplete "batcher core failed after escalation" "batcher settlement" "Midnight/EffectStream merge" "inspect batcher-core logs and resume"
checkpoint_worktree "batcher-core" "$BATCHER_ROOT" || incomplete "batcher core produced no safe checkpoint" "batcher settlement" "Midnight/EffectStream merge" "inspect batcher worktree"
merge_branch shadowbid/batcher

FRONTEND_ROOT="$(ensure_worktree shadowbid-frontend shadowbid/frontend)"
TESTS_ROOT="$(ensure_worktree shadowbid-tests shadowbid/tests)"
sync_clean_worktree_to_head "$FRONTEND_ROOT" || incomplete "frontend worktree cannot fast-forward" "frontend" "stable core" "inspect frontend worktree"
sync_clean_worktree_to_head "$TESTS_ROOT" || incomplete "tests worktree cannot fast-forward" "tests" "stable core" "inspect tests worktree"
FRONTEND_DIR="$FRONTEND_ROOT/$TEMPLATE_REL"
TESTS_DIR="$TESTS_ROOT/$TEMPLATE_REL"

set +e
run_cheap_with_escalation "frontend" "$PROMPT_DIR/frontend.md" "$FRONTEND_DIR" &
FRONTEND_PID=$!
run_cheap_with_escalation "tests" "$PROMPT_DIR/tests.md" "$TESTS_DIR" &
TESTS_PID=$!
wait "$FRONTEND_PID"
FRONTEND_RC=$?
wait "$TESTS_PID"
TESTS_RC=$?
set -e
[[ "$FRONTEND_RC" -eq 0 ]] || incomplete "frontend agents failed" "frontend" "core merge" "inspect frontend logs and resume"
[[ "$TESTS_RC" -eq 0 ]] || incomplete "test agents failed" "tests" "core merge" "inspect tests logs and resume"
checkpoint_worktree "frontend" "$FRONTEND_ROOT" || incomplete "frontend produced no safe checkpoint" "frontend" "core merge" "inspect frontend worktree"
checkpoint_worktree "tests" "$TESTS_ROOT" || incomplete "tests produced no safe checkpoint" "tests" "core merge" "inspect tests worktree"
merge_branch shadowbid/tests
merge_branch shadowbid/frontend

DOCS_ROOT="$(ensure_worktree shadowbid-docs shadowbid/docs)"
DOCS_DIR="$DOCS_ROOT/$TEMPLATE_REL"
run_cheap_with_escalation "docs" "$PROMPT_DIR/docs.md" "$DOCS_DIR" || incomplete "documentation agents failed" "documentation" "frontend/tests merge" "inspect docs logs and resume"
checkpoint_worktree "docs" "$DOCS_ROOT" || incomplete "docs produced no safe checkpoint" "documentation" "frontend/tests merge" "inspect docs worktree"
merge_branch shadowbid/docs

INTEGRATION_ROOT="$(ensure_worktree shadowbid-integration shadowbid/integration)"
INTEGRATION_DIR="$INTEGRATION_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "integration" "$PROMPT_DIR/integration.md" "$INTEGRATION_DIR" || incomplete "integration failed after escalation" "cross-chain integration" "docs merge" "inspect integration logs and resume"
checkpoint_worktree "integration" "$INTEGRATION_ROOT" "yes" || incomplete "integration checkpoint unsafe" "cross-chain integration" "docs merge" "inspect integration worktree"
merge_branch shadowbid/integration

run_agent "security-review" "review" "$REVIEW_MODEL" "$PROMPT_DIR/security-review.md" "$TEMPLATE_DIR" "read-only" || incomplete "security review failed" "security/privacy review" "integration merge" "inspect security-review log and resume"
if [[ ! -s "$TEMPLATE_DIR/docs/SOL_REVIEW_1.md" ]]; then
  cp "$ARTIFACT_DIR/security-review.md" "$TEMPLATE_DIR/docs/SOL_REVIEW_1.md"
  cp "$ARTIFACT_DIR/security-review.md" "$TEMPLATE_DIR/docs/SECURITY_REVIEW.md"
  commit_main_file "docs/SOL_REVIEW_1.md" "docs: record Sol security review"
  commit_main_file "docs/SECURITY_REVIEW.md" "docs: update security review status"
fi

REMEDIATION_ROOT="$(ensure_worktree shadowbid-remediation shadowbid/remediation)"
REMEDIATION_DIR="$REMEDIATION_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "remediation" "$PROMPT_DIR/remediation.md" "$REMEDIATION_DIR" || incomplete "security remediation failed" "security remediation" "Sol security review" "inspect remediation logs and resume"
checkpoint_worktree "remediation" "$REMEDIATION_ROOT" "yes" || incomplete "remediation checkpoint unsafe" "security remediation" "Sol security review" "inspect remediation worktree"
merge_branch shadowbid/remediation

QA_ROOT="$(ensure_worktree shadowbid-qa shadowbid/qa)"
QA_DIR="$QA_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "qa" "$PROMPT_DIR/qa.md" "$QA_DIR" || incomplete "full QA failed after escalation" "quality gates and demo" "security remediation" "inspect QA logs and resume"
checkpoint_worktree "qa" "$QA_ROOT" "yes" || incomplete "QA checkpoint unsafe" "quality gates and demo" "security remediation" "inspect QA worktree"
merge_branch shadowbid/qa

run_agent "final-review" "review" "$REVIEW_MODEL" "$PROMPT_DIR/final-review.md" "$TEMPLATE_DIR" "read-only" || incomplete "final review failed" "pre-submission review" "full QA" "inspect final-review log and resume"
if [[ ! -s "$TEMPLATE_DIR/docs/SOL_FINAL_REVIEW.md" ]]; then
  cp "$ARTIFACT_DIR/final-review.md" "$TEMPLATE_DIR/docs/SOL_FINAL_REVIEW.md"
  commit_main_file "docs/SOL_FINAL_REVIEW.md" "docs: record final Sol review"
fi

FINAL_FIX_ROOT="$(ensure_worktree shadowbid-final-fixes shadowbid/final-fixes)"
FINAL_FIX_DIR="$FINAL_FIX_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "final-fixes" "$PROMPT_DIR/final-fixes.md" "$FINAL_FIX_DIR" || incomplete "final fixes failed" "final correctness and claims" "final Sol review" "inspect final-fixes logs and resume"
checkpoint_worktree "final-fixes" "$FINAL_FIX_ROOT" "yes" || incomplete "final-fixes checkpoint unsafe" "final correctness and claims" "final Sol review" "inspect final-fixes worktree"
merge_branch shadowbid/final-fixes

run_gate "install" bun install --frozen-lockfile || incomplete "frozen install failed" "dependencies" "final fixes" "inspect gate-install.log and run Terra remediation"
run_gate "midnight-build" bun run build:midnight || incomplete "Compact build failed" "Midnight" "dependency install" "inspect gate-midnight-build.log and run Terra remediation"
run_gate "evm-build" bun run build:evm || incomplete "Forge build failed" "EVM" "Midnight build" "inspect gate-evm-build.log and run Terra remediation"
run_gate "frontend-build" bun run --cwd packages/frontend build || incomplete "frontend production build failed" "frontend" "EVM build" "inspect gate-frontend-build.log and run Terra remediation"
run_gate "full-tests" bun run test || incomplete "full test suite failed" "tests" "frontend build" "inspect gate-full-tests.log and run Terra remediation"

VALIDATION_ROOT="$(ensure_worktree shadowbid-validation shadowbid/validation)"
VALIDATION_DIR="$VALIDATION_ROOT/$TEMPLATE_REL"
run_terra_with_blocker_review "final-validation" "$PROMPT_DIR/final-validation.md" "$VALIDATION_DIR" || incomplete "independent final validation failed" "completion standard" "local quality gates" "inspect final-validation logs and resume"
checkpoint_worktree "final-validation" "$VALIDATION_ROOT" "yes" || incomplete "validation checkpoint unsafe" "completion standard" "local quality gates" "inspect validation worktree"
merge_branch shadowbid/validation

grep -qx 'VALIDATION_PASS' "$ARTIFACT_DIR/final-validation.md" || incomplete "validator did not certify mandatory criteria" "completion standard" "local quality gates" "read final-validation.md and address its blockers"

for required_doc in README.md docs/ARCHITECTURE.md docs/PRIVACY.md docs/SECURITY.md docs/DEMO.md docs/DEVPOST.md docs/JUDGING.md docs/BUILD_STATUS.md docs/DECISIONS.md docs/AGENT_HANDOFF.md docs/TEST_MATRIX.md docs/TROUBLESHOOTING.md docs/SOL_REVIEW_1.md docs/SOL_FINAL_REVIEW.md docs/SUBMISSION_READY.md; do
  [[ -s "$TEMPLATE_DIR/$required_doc" ]] || incomplete "missing required document $required_doc" "submission documentation" "final validation" "create and verify the missing document"
done

log "All mandatory orchestrated phases and local gates passed"
echo "SHADOWBID COMPLETE"
