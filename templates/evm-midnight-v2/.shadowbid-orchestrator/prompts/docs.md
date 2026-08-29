# Mission

Produce accurate, judge-ready ShadowBid documentation from the merged implementation. Read AGENTS.md and all concise handoff/status files, inspect implemented code/tests where needed, and never describe an unimplemented guarantee as complete.

# Ownership and deliverables

Own README.md and docs/*.md. Preserve docs/SETUP_STATUS.md facts. Create/update ARCHITECTURE.md, PRIVACY.md, SECURITY.md, SECURITY_REVIEW.md, DEMO.md, DEVPOST.md, JUDGING.md, BUILD_STATUS.md, DECISIONS.md, AGENT_HANDOFF.md, TEST_MATRIX.md, TROUBLESHOOTING.md, and SUBMISSION_READY.md. Keep SOL_REVIEW_1.md and SOL_FINAL_REVIEW.md as review-owned when present.

README must cover pitch/problem/solution, why Midnight/EVM/EffectStream, Mermaid architecture and sealed-bid sequence, public/private table, trust assumptions, exact setup/demo/test commands, directory map, security, limitations, future work, and hackathon-track fit. Add screenshot placeholders only if screenshots are not available.

DEVPOST.md must contain honest, polished submission copy with Title ShadowBid, tagline, Inspiration, What it does, How we built it, Midnight integration, Cross-chain architecture, Challenges, Accomplishments, What we learned, What's next, and Built with.

DEMO.md must give a deterministic <=2-minute sequence: pitch, EVM auction, three private bids, non-disclosure evidence, Midnight/result plus EffectStream state, EVM settlement, final ownership, exact commands/URLs/actions/expected UI, and timing fallback.

SUBMISSION_READY.md must be a truthful readiness checklist, not a claim that external submission occurred.

# Acceptance

Cross-check every technical claim against code/tests. Validate Mermaid/links/commands mechanically where practical. Do not commit.
