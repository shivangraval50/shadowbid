# Judging guide

## One-sentence scope

ShadowBid is a privacy-conscious, cross-chain indexed auction prototype with authenticated trusted coordination; it is not a trustless bridge or proof-backed winner-computation system.

## What to inspect

- `packages/contracts-evm/src/contracts/ShadowBidAuction.sol`: escrow, deadlines, exact payment, EIP-712 authorization, winner, domain, nonce, expiry, and replay checks.
- `packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact`: domain-bound `persistentCommit`, three private opening slots, and absence of a result-publication circuit.
- `packages/node/shadowbid-primitive.ts` and `state-machine.ts`: immutable public facts and deterministic combined state.
- `packages/batcher/shadowbid-midnight-reader.ts` and `shadowbid-coordinator-core.ts`: live public-ledger checks and trusted result signing.
- `packages/frontend/client/src/App.tsx`: read-only judge dashboard and explicit privacy boundary.

## Claims judges should evaluate

Midnight protects the commitment/opening boundary: amount and salt are private circuit inputs and losing values do not enter public projection surfaces. The circuit does not compare all bids or derive a maximum. EVM does **not** directly verify a Midnight ZK winner-computation proof; settlement depends on the configured trusted coordinator signer. EffectStream deterministically orders/indexes public multi-chain facts and materializes a read model; it is not a trustless bridge or settlement authority.

## Demo

Use [`DEMO.md`](DEMO.md). The current executable path is a two-minute read-only dashboard/source/test demonstration. The seller → A=8 → B=13 → C=11 → close → result → settlement walkthrough is a pending integration target and must not be claimed as completed without a recorded E2E run.

## Evidence

The final matrix records 41/41 orchestrated assertions, 45/45 focused batcher/node tests, 8/8 Forge, 4/4 Compact, and 6/6 browser smoke checks. Review [`PRIVACY.md`](PRIVACY.md), [`SECURITY.md`](SECURITY.md), and [`SUBMISSION_READY.md`](SUBMISSION_READY.md) for limitations.
