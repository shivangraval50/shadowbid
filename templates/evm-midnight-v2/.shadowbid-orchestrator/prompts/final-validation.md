# Mission

Independently determine whether ShadowBid meets the mandatory completion standard. Read AGENTS.md and concise final docs/status. Do not assume earlier claims are true.

Run or verify formatter/lint/type checks that exist, Forge build/tests, Compact build/tests, EffectStream/batcher/integration/E2E tests, frontend production build, full stack health, browser desktop/mobile flow, console state, deterministic three-bidder demo ending with the correct NFT owner, and losing-bid non-disclosure across public outputs/logs/state. Confirm security/privacy/final reviews and all required README/docs/Devpost/demo materials exist and match behavior.

Fix only a tiny obvious validation blocker; otherwise report it. Do not commit. Your final line must be exactly `VALIDATION_PASS` only when every mandatory criterion is evidenced, otherwise exactly `VALIDATION_FAIL` and the blocker details above it.
