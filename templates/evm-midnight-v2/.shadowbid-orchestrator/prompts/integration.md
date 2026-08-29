# Mission

Integrate and harden the merged ShadowBid core, frontend, tests, and docs. Read AGENTS.md and concise handoff files first. Treat repository code and pinned APIs as authoritative.

# Work

- Resolve real cross-package type/API mismatches without weakening privacy or authorization.
- Complete generated-binding and deployment wiring using repository scripts.
- Make the EVM ↔ EffectStream ↔ Midnight lifecycle deterministic and the batcher settlement path validated.
- Ensure the frontend consumes actual state and has no fake controls/indicators.
- Run focused builds/tests, then the broadest practical suite.
- Update only concise BUILD_STATUS, DECISIONS, AGENT_HANDOFF, and TEST_MATRIX facts when necessary.

Do not paper over failures, delete tests, invent APIs, expose private bid values, or overstate cross-chain/proof semantics. Do not commit. Report exact commands/results and unresolved blockers.
