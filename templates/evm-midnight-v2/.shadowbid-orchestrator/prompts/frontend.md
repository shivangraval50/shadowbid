# Mission

Build a polished, truthful ShadowBid frontend in your isolated worktree after core interfaces stabilize. Read AGENTS.md and its concise handoff documents first, then inspect only frontend code and the stable core interfaces you consume.

# Ownership

Own packages/frontend only. Do not modify contracts, EffectStream core, batcher, tests packages, or shared docs. Do not commit.

# Experience

Create a responsive judge-ready interface with ShadowBid branding and pitch, service/network indicators, auction dashboard/cards, create-auction flow, NFT visualization, auction detail, private-bid flow, proof states (preparing/proving/submitting/confirmed), cross-chain EVM → EffectStream ← Midnight visualization, settlement/final owner state, and a developer/judge privacy panel.

Use actual APIs/state. Include accessible contrast, typography, spacing, keyboard/form behavior, loading/error/empty states, mobile layout, and honest labels. Never expose competing/losing bid amounts, add fake chain activity, or imply Ethereum proof verification/EffectStream bridge semantics not implemented.

# Acceptance

Run frontend type/build and focused tests available in this template. Inspect the rendered experience if browser capability is available. Report changed files, commands/results, assumptions, and any interface mismatch.
