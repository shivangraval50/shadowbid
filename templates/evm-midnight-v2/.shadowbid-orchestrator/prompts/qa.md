# Mission

Perform full local ShadowBid QA and fix ordinary integration/UI defects in this isolated worktree. Read AGENTS.md and current handoff/test matrix first.

Run formatter/lint/type checks that exist, Forge builds/tests, Compact builds/tests, EffectStream and batcher tests, integration/E2E, production frontend build, and full repository tests. Start exactly one local stack using the documented command after identifying any existing port owners; terminate only clearly repository-owned stale processes if needed. Verify every required service stays healthy, exercise the deterministic three-bidder demo, inspect browser console and desktop/mobile layouts if browser tooling is available, and check public events/APIs/database/app state/browser/logs for unintended losing-bid disclosure.

Fix scoped, ordinary defects you can prove. Do not weaken tests or privacy. Do not commit. Record exact commands, pass counts, service health, browser observations, privacy evidence, remaining warnings, and blockers.
