# ShadowBid privacy model

> This document describes a privacy-conscious reference design, not a claim of trustless private winner computation.

## Private input

The private bid opening is `{amount, salt}`. Midnight’s `persistentCommit<Bid>` binds those values to the protocol version, EVM chain, auction, Midnight network/contract, and bidder. A correctly random salt prevents observers from deriving the amount from the commitment alone. The current Compact contract has three fixed commitment/opening slots and verifies individual openings; it does not compare all bids or select a maximum.

## Public disclosures

- EVM: seller, NFT, deadlines, reserve, commitment hashes, transaction metadata, and—only after settlement—the winner and winning amount.
- Midnight: auction/domain identifiers, lifecycle flags, commitment hashes, nullifiers, and transaction metadata.
- EffectStream/API/database: source identity, lifecycle, counts, commitment hashes, and final public EVM result fields when present.
- Frontend: the public projection and status information only.

Salts, opening inputs, losing bid amounts, and private witness data are not disclosed in Compact events and are not retained in EffectStream state, database columns, API responses, browser output, or application logs covered by the privacy tests. Metadata such as addresses, timing, counts, hashes, nullifiers, and network activity remains observable. Winner identity and winning amount become public by protocol design when EVM settlement emits its event.

## Trust boundary and non-claims

The coordinator sees private bid information out-of-band and chooses the result. Its EIP-712 signature authenticates the configured `settlementSigner` and binds the result to the EVM/Midnight domains, but does not prove that the selected winner is mathematically highest. EVM does **not** directly verify a Midnight ZK winner-computation proof. The current Compact source has no result-publication circuit.

The live reader checks public Midnight state before the batcher accepts an authenticated result, and never treats EffectStream/API/database state as settlement authority. EffectStream is a deterministic indexing/read-model layer, not a trustless bridge. The UI is read-only; no private bid transaction or proof submission is claimed.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for boundaries and [`SECURITY.md`](SECURITY.md) for controls and limitations.
