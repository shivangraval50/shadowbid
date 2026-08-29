# Mission

Implement ShadowBid's technically complete core in your isolated worktree. Read AGENTS.md, docs/SETUP_STATUS.md, docs/BUILD_STATUS.md, docs/DECISIONS.md, docs/AGENT_HANDOFF.md, docs/TEST_MATRIX.md, and docs/ARCHITECTURE_REVIEW.md first. Inspect local source and generated APIs as ground truth.

# Ownership

- packages/contracts-evm
- packages/contracts-midnight
- core EffectStream node/state-machine packages used by this template
- packages/batcher
- critical shared interfaces required by those packages

Do not edit packages/frontend or broad submission documentation. Do not commit; the orchestrator owns commits.

# Required implementation

- EVM ERC-721 demo asset if required, auction creation, escrow/ownership, deadlines, lifecycle, authorization, replay/double-settlement protection, settlement, events, invalid-state handling, and Foundry tests.
- Strongest correctly supportable Midnight sealed-bid design using real Compact/witness/private-state/proof mechanisms. Generate bindings through repository scripts; never hand-invent them.
- Multiple bidder support, bid-rule enforcement, minimal permitted disclosure, and no deliberate private-bid logging.
- EffectStream ingestion of real EVM and Midnight state/events into a deterministic auction lifecycle with duplicate/replay/order safety supported by the framework.
- Batcher settlement coordination that rejects forged winner, wrong auction, duplicate settlement, and premature settlement using real supported mechanisms.
- Focused tests for every implemented boundary.

# Acceptance

Run the narrowest relevant Compact, Forge, node/state, and batcher tests/builds. Leave the worktree coherent with no fake indicators, placeholders presented as working features, invented APIs, or claims that Ethereum verifies a Midnight proof unless Solidity truly does so. Summarize files, commands, results, remaining risks, and stable interfaces in your final response.
