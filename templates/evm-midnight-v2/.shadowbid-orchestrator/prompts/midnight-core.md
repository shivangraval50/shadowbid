# Mission

Implement the missing Midnight/Compact ShadowBid core in this isolated worktree. Read AGENTS.md, concise status docs, and docs/ARCHITECTURE_REVIEW.md first. The earlier core pass intentionally delivered only EVM; do not repeat EVM work.

# Ownership

Own packages/contracts-midnight and its focused tests/client-neutral generated-binding integration. Do not edit EVM, frontend, EffectStream node/database, batcher, or broad docs. Do not commit.

# Required outcome

Using only syntax and APIs proven by the pinned compiler and local SDK examples, implement the strongest honest v1 sealed-bid protocol supported here: immutable auction domain, commitment registration with deadline/uniqueness rules, bidder local private state/witnesses where supported, opening/result flow under the documented coordinator trust model, nullifier/consumption protection, minimal public disclosure, multiple bidders, generated bindings/assets, deployment wiring, and focused privacy/correctness tests. Commitments must bind the complete EVM/Midnight domain and bidder identity using a compiler-supported encoding/hash; if the pin cannot prove a desired primitive, implement the strongest compiling alternative and document the exact limitation in your result.

Never expose salts or losing amounts in ledgers, logs, events, or results. Never claim a global private maximum or EVM proof verification that is not implemented.

# Acceptance

Run `compact compile +0.33.0-rc.2` through repository scripts, inspect generated typings, and run focused Midnight tests. No hand-invented generated code. Report public/private fields, trust boundary, files, and exact results.
