# ShadowBid

**Tagline:** Bid without showing your hand.

## Status disclosure

ShadowBid is a validated cross-chain auction reference prototype, not a completed trustless auction. The repository contains the contracts, Compact commitment/opening circuits, EffectStream projection, authenticated trusted-coordinator handoff, tests, and read-only dashboard.

A real 8/13/11 three-bidder run has been executed and recorded — three private ZK-proved bids, closure, private opening/consumption, coordinator-authorized settlement, and final NFT ownership (evidence table in `docs/TEST_MATRIX.md`). Two honest caveats: the winner is selected by the trusted coordinator rather than proven on-chain, and browser-driven auction writes remain unimplemented — the recorded run is driven by a test harness using one local development wallet, not three independently funded Midnight wallets.

## Inspiration

Open NFT auctions reveal too much too early. We wanted EVM custody and public lifecycle state without putting bid openings or losing amounts into the public projection.

## What it does

The ERC-721 auction contract escrows an NFT and enforces signed settlement conditions. Midnight Compact binds each bidder’s amount and salt to an auction-domain commitment and verifies individual opening operations. EffectStream orders EVM and Midnight observations into a deterministic public read model consumed by the API and React dashboard.

## Midnight and privacy

Amounts, salts, and opening witnesses are not disclosed to public events, EffectStream state, database columns, API responses, browser output, or privacy-test logs. Commitment hashes, lifecycle flags, nullifiers, timing, addresses, and transaction metadata remain public; winner identity and winning amount become public on EVM settlement. The current circuit has three fixed slots and does not compare bids or compute a maximum.

## Settlement and cross-chain model

The coordinator chooses winner/amount out-of-band, validates the supplied decision against public Midnight ledger state, and signs an EIP-712 result. EVM authenticates the configured `settlementSigner`; it does **not** directly verify a Midnight ZK winner-computation proof. EffectStream is the deterministic multi-chain ordering/indexing/read-model layer, not a trustless bridge, proof verifier, or settlement authority.

## Accomplishments

- ERC-721 escrow, exact-payment settlement, deadline, domain, nonce, expiry, replay, and signer checks.
- Domain-bound Compact `persistentCommit` and private opening boundary.
- Live public-ledger reader and fail-closed batcher/coordinator handoff.
- Deterministic EffectStream reducer, public API/database projection, and privacy checks.
- Judge-facing read dashboard with loading, empty, error, registry, detail, status, and privacy states.

## Validation

The final recorded gates are 42/42 orchestrated checks, 45/45 focused batcher/node checks, 8/8 Forge tests, 4/4 Compact tests with real ZK key generation, and 6/6 browser smoke checks. See [`TEST_MATRIX.md`](TEST_MATRIX.md) and [`SETUP_STATUS.md`](SETUP_STATUS.md).

## Honest limitations and next steps

The UI currently exposes no create, commit, close, open, or settle transaction controls. Compact lifecycle authority and global winner computation are not implemented. The coordinator is trusted and needs production controls such as multi-party approval, key management, rate limiting, and durable audit trails. Next steps are a proof-backed maximum protocol, scalable bidder storage, authenticated/timed lifecycle transitions, wallet writes, and a recorded private three-bidder settlement.

## Built with

Midnight Compact, Midnight JS/runtime packages, Solidity/OpenZeppelin, Foundry, Bun, React/Vite, Fastify, PostgreSQL/PGLite, and EffectStream 0.200.1.
