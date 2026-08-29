# ShadowBid architecture

ShadowBid has four boundaries: EVM custody, Midnight privacy circuits, EffectStream projection, and an explicitly trusted settlement coordinator.

1. `ShadowBidAuction.sol` escrows an ERC-721, records public commitment hashes from `settlementSigner`, and settles only after an EIP-712 authorization, exact payment, valid winner, reserve, domain, expiry, nonce, and commitment checks.
2. `shadowbid.compact` binds protocol version, EVM chain, auction, Midnight network/contract, bidder, amount, and salt into `persistentCommit<Bid>`. It has two commitment/opening slots. Salt and openings are not disclosed; selected result fields are disclosed.
3. `shadowbid-primitive.ts` converts EVM events and Midnight public commitment observations into immutable facts. `state-machine.ts` stores facts and reduces them into `shadowbid_auctions` and `shadowbid_commitments`.
4. The Fastify API exposes read-only auction/projection state. The React UI consumes those endpoints and labels write flows as unavailable.
5. `ShadowBidSettlementAdapter` validates a canonical result envelope against an authoritative reader and a durable replay registry before passing a publish call to the inner Midnight adapter. The dev reader is intentionally unavailable (`null`).

The local config currently deploys the legacy `contract-round-value` and points the generic Midnight primitive at it; ShadowBid contract deployment exists separately but is not yet wired into the dev sync path.
