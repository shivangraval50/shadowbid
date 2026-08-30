# ShadowBid architecture

ShadowBid has four boundaries: EVM custody, Midnight privacy circuits, EffectStream projection, and an explicitly trusted settlement coordinator.

1. `ShadowBidAuction.sol` escrows an ERC-721, records public commitment hashes from `settlementSigner`, and settles only after the commit deadline and an EIP-712 authorization, exact payment, valid winner, reserve, separately stored Midnight contract/network, expiry, nonce, and commitment checks.
2. `shadowbid.compact` binds protocol version, EVM chain, auction, Midnight network/contract, bidder, amount, and salt into `persistentCommit<Bid>`. It has three commitment/opening slots. Salt and openings are not disclosed. Result publication is disabled until a coordinator-authenticated Compact design is available.
3. `shadowbid-primitive.ts` converts EVM events and Midnight public commitment observations into immutable facts. `state-machine.ts` stores facts and reduces them into `shadowbid_auctions` and `shadowbid_commitments`.
4. The Fastify API exposes read-only auction/projection state. The React UI consumes those endpoints and labels write flows as unavailable.
5. `ShadowBidSettlementAdapter` fails closed for result publication. The dev reader is intentionally unavailable (`null`); no projection or public Compact ledger is settlement authority.

The local config deploys and observes the ShadowBid public commitment ledger alongside the retained reference contract.
