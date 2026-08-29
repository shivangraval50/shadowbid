# Judging guide

## Problem and clarity

Private bid openings address strategic leakage in public NFT auctions. The README and dashboard make the public/private boundary visible.

## Technical integration

Inspect `ShadowBidAuction.sol`, `contract-shadowbid/src/shadowbid.compact`, `node/shadowbid-primitive.ts`, `node/state-machine.ts`, and `batcher/shadowbid-settlement.ts`. These are implemented components; the documented unwired boundaries are part of the evaluation context.

## Privacy and security

Look for domain-bound `persistentCommit`, absence of salt disclosure, no private columns in the projection, EIP-712 settlement checks, and durable replay rejection. Do not interpret the coordinator trust model as trustless proof verification.

## Demo expectations

Use [`DEMO.md`](DEMO.md). It is a deterministic two-minute read-only/source-backed demo. The repository does not currently support a truthful three-bid UI walkthrough or completed settlement.

## Track fit

Midnight supplies private computation and selective disclosure; EVM supplies NFT custody; EffectStream supplies a cross-chain public view.
