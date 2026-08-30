# Judging guide

## One-sentence scope

ShadowBid is a privacy-conscious, cross-chain indexed auction prototype with authenticated trusted coordination; it is not a trustless bridge or proof-backed winner-computation system.

## What to inspect

- `packages/contracts-evm/src/contracts/ShadowBidAuction.sol`: escrow, deadlines, exact payment, EIP-712 authorization, winner, domain, nonce, expiry, and replay checks.
- `packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact`: domain-bound `persistentCommit`, three private opening slots, and absence of a result-publication circuit.
- `packages/node/shadowbid-primitive.ts` and `state-machine.ts`: immutable public facts and deterministic combined state.
- `packages/batcher/shadowbid-midnight-reader.ts` and `shadowbid-coordinator-core.ts`: live public-ledger checks and trusted result signing.
- `packages/frontend/client/src/ShadowBidApp.tsx`: read-only judge dashboard, demo-flow timeline, and explicit privacy boundary.
- `packages/tests/shadowbid/live-three-bidder.ts`: the real 8/13/11 harness — three private ZK-proved commitments through coordinator-authorized settlement and final NFT ownership.

## Claims judges should evaluate

Midnight protects the commitment/opening boundary: amount and salt are private circuit inputs and losing values do not enter public projection surfaces. The circuit does not compare all bids or derive a maximum. EVM does **not** directly verify a Midnight ZK winner-computation proof; settlement depends on the configured trusted coordinator signer. EffectStream deterministically orders/indexes public multi-chain facts and materializes a read model; it is not a trustless bridge or settlement authority.

## Demo

Use [`DEMO.md`](DEMO.md). The seller → A=8 → B=13 → C=11 → close → result → settlement → final-owner walkthrough **has been executed and recorded**; the two-minute script shows that settled auction live in the dashboard, demo-flow timeline, and public API.

Because eight real ZK proofs take several minutes, the auction is produced *before* the presentation and the two minutes are spent inspecting live state — `DEMO.md` says explicitly which parts are recorded and which are live. The run is harness-driven, not browser-driven, and uses one local development wallet rather than three independently funded Midnight wallets.

## Evidence

The final matrix records 42/42 orchestrated assertions, 45/45 focused batcher/node tests, 8/8 Forge, 4/4 Compact, and 6/6 browser smoke checks. Review [`PRIVACY.md`](PRIVACY.md), [`SECURITY.md`](SECURITY.md), and [`SUBMISSION_READY.md`](SUBMISSION_READY.md) for limitations.
