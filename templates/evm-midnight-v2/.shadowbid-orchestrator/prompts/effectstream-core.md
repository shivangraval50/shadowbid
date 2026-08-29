# Mission

Implement the missing deterministic EffectStream/database ShadowBid core in this isolated worktree. Read AGENTS.md, concise status docs, docs/ARCHITECTURE_REVIEW.md, and the merged EVM interface first.

# Ownership

Own packages/node, packages/database, and focused state-machine/database tests. Do not edit contracts, frontend, batcher, or broad docs. Do not commit.

# Required outcome

Ingest real ShadowBid EVM auction events and relevant Midnight public state/events using actual configured primitives. Add ordered migrations and typed queries without rewriting the validated initial migration. Store immutable source facts with canonical unique source/semantic keys, derive a deterministic combined AuctionViewV1-like projection, enforce monotonic lifecycle and terminal-state precedence, and handle duplicate/reordered/replayed facts safely. Expose read-only auction/list/detail/service state needed by frontend and batcher. Do not ingest salts or losing bid amounts, use wall-clock/random/frontend state in the STF, call EffectStream a bridge, or treat indexing as settlement authorization.

# Acceptance

Add focused tests for EVM/Midnight ingestion, lifecycle, duplicates, ordering, invalid transitions, deterministic replay, and settlement readiness. Run database generation only through existing tools and report exact commands/results and stable API shapes.
