# Mission

Build comprehensive ShadowBid tests against the stable implemented interfaces. Read AGENTS.md and its concise handoff documents first. Inspect only owned tests and implementation surfaces needed to write accurate assertions.

# Ownership

Own packages/tests and test files colocated under core packages where the repository convention requires them. Avoid implementation changes unless a tiny testability correction is essential and clearly report it. Do not modify frontend production code or documentation. Do not commit.

# Matrix

Cover EVM creation/owner/escrow/deadline/premature settlement/valid settlement/double settlement/wrong winner/unauthorized/nonexistent auction; Midnight valid and invalid private bids, multiple bidders, proof/input/result handling, permitted output, and enforceable losing-bid secrecy; EffectStream event handling, transitions, duplicates, ordering, invalid transitions, and settlement readiness; batcher correct/forged/wrong/duplicate/not-ready requests; and the deterministic three-bidder flow (8, 13, 11) ending with the correct ERC-721 owner.

Add a privacy regression that searches relevant public events, APIs, database/app state, browser output, and logs for unintended losing-bid disclosure without itself logging secrets. Use real APIs only; do not weaken or delete reference tests.

# Acceptance

Run focused tests that fit available resources. Report changed files, exact results, gaps, and any substantive defect separately from test failures.
