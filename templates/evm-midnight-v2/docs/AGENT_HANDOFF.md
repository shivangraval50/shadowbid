# Agent handoff

Last reviewed: 2026-08-29.

Start from [`SETUP_STATUS.md`](SETUP_STATUS.md), whose reference-stack facts are preserved. Documentation audit completed against the merged ShadowBid contracts, Compact source, EffectStream wiring, batcher, API, frontend, and tests.

Completed: ShadowBid now has three Compact bid slots, regenerated bindings, dual Counter/ShadowBid local deployment wiring, and a Midnight primitive that joins the canonical public `Bytes<32>` auction id to EVM facts. The dashboard is read-only without simulated write/proof controls.

Known blockers: the authoritative settlement reader remains fail-closed; the local host denies Compact's proving-key subprocess, so live proof/settlement validation requires a proof-capable host. The workspace dependency symlink is incomplete and cannot be repaired by `bun install --frozen-lockfile` here (EPERM).

Next action: provide a finalized EVM/Midnight/coordinator authority reader, validate a real proof and settlement on a host where `zkir` can generate keys, then rerun the full build/test suite with a writable complete dependency install.
