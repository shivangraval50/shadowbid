# ShadowBid

**Tagline:** Bid without showing your hand.

## Inspiration

Open NFT auctions reveal too much too early. We wanted a design where ownership remains easy to verify on EVM while bid openings remain private until the auction result is ready.

## What it does

ShadowBid escrows an ERC-721 on EVM, commits bid values through a Midnight Compact circuit, and uses EffectStream to project public lifecycle facts into a queryable cross-chain view. The current checkout includes the core contract/circuit and a read-only dashboard; wallet writes and production settlement authority are not yet wired.

## How we built it

The Solidity contract owns custody and settlement checks. Compact `persistentCommit` binds each opening to the auction domain. EffectStream ingests EVM and Midnight observations, stores append-only facts, reduces them deterministically, and serves a Fastify API consumed by React. A strict batcher adapter validates canonical coordinator-result envelopes and durable replay keys.

## Midnight integration

Midnight is used for the commitment/opening lifecycle and selective disclosure. Salts and openings are not disclosed into the public projection. The EVM contract currently trusts an explicit coordinator signature rather than verifying a Midnight proof, and the local sync config still needs to select the ShadowBid deployment.

## Cross-chain architecture

EVM and Midnight are correlated in EffectStream by auction/domain identifiers. There is no bridge or light client in this prototype. EffectStream provides ordering and projection, not atomic cross-chain execution.

## Challenges

Keeping public facts useful without leaking private openings, handling duplicate/out-of-order observations, and making settlement fail closed were the main challenges. The remaining integration work is intentionally documented rather than hidden.

## Accomplishments

We built the escrow contract, domain-bound commitment circuit, replay-safe projection model, privacy-oriented API/database checks, strict settlement envelope validation, and a clear read dashboard.

## What we learned

Selective disclosure is an interface design problem: the ledger schema and sync primitive define the privacy boundary. A projection can be deterministic and auditable without being a settlement authority.

## What's next

Generalize beyond two Compact slots, wire the ShadowBid deployment into the local stack, connect wallet-backed actions, implement the finalized-state reader, and add a complete integration test.

## Built with

Midnight Compact, Midnight JS/runtime packages, Solidity/OpenZeppelin, Foundry, Bun, React/Vite, Fastify, PostgreSQL/PGLite, and EffectStream 0.200.1.
