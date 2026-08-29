# Mission

Remediate the merged Sol security review as a Terra engineering task. Read AGENTS.md, docs/SOL_REVIEW_1.md, and concise status/handoff files. Verify each finding against code before changing it.

Fix every CRITICAL/HIGH and practical MEDIUM issue. Add regression tests. Preserve real Midnight privacy, settlement authorization, replay protection, deterministic EffectStream behavior, and truthful frontend/docs semantics. Do not broaden scope into routine polish. If a finding cannot be safely fixed, document the exact limitation and mitigation in SECURITY.md/SECURITY_REVIEW.md.

Run focused tests for every fix plus relevant builds. Do not commit. Report finding disposition and exact command results.
