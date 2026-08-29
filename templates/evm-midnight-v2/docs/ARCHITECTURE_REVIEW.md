## ShadowBid implementation blueprint

### 1. Grounded extension points

ShadowBid should extend the validated workspace without changing its pinned dependency set.

| Package | Existing extension point | ShadowBid use |
|---|---|---|
| EVM contracts | [src/contracts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts), [deploy.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/deploy.ts) | Add a non-upgradeable `ShadowBidAuction.sol`, an Ignition module, generated ABI/address exports, and Forge tests. Do not put settlement authority in `MyPaimaL2Contract`; that contract only submits EffectStream input bytes. |
| Midnight | [counter.compact](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-round-value/src/counter.compact), [witnesses.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-round-value/src/witnesses.ts), [_index.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-round-value/src/_index.ts), [deploy.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/deploy.ts) | Replace the counter example with a separate ShadowBid Compact package rather than mutating its semantics incrementally. Keep source, witness implementation, generated contract export, deployment configuration, and generated assets separated as in the reference. |
| EffectStream node | [config.dev.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/config.dev.ts), [grammar.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/grammar.ts), [state-machine.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/state-machine.ts), [api.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/api.ts) | Register the EVM auction deployment and Midnight contract as parallel primitives, add immutable event projections and a deterministic combined auction reducer, then expose read-only auction views. |
| Database | [000-init.sql](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/database/migrations/000-init.sql), [sm_example.sql](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/database/sql/sm_example.sql), [migration-order.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/database/migration-order.ts) | Add a new ordered migration and pgtyped queries; do not rewrite `000-init.sql`. Store source events separately from derived auction state. |
| Batcher | [batcher.dev.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/batcher.dev.ts), [effectstream-l2.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/effectstream-l2.ts), [midnight-balancing.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/midnight-balancing.ts) | Add ShadowBid-specific adapters or pre-queue validation. Do not treat the generic adapters as settlement authorization. |
| Frontend | [increment.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/frontend/client/src/increment.ts), [WalletContext.tsx](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/frontend/client/src/contexts/WalletContext.tsx), [WalletDemo.tsx](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/frontend/client/src/components/WalletDemo.tsx), [config.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/frontend/client/src/config.ts) | Extract typed EVM, Midnight, API, and batcher clients. Never reuse the embedded genesis seed or hard-coded private-state password outside local development. |
| Tests | [packages/tests](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/tests) and Forge `test/src` | Extend the existing infrastructure/STF/frontend suite and add contract invariants. The existing “cross-chain” test proves indexing correlation only. |

### 2. Honest privacy model

The supported first version should be described as **commit–reveal sealed bids**:

1. A bidder privately retains `{amount, salt, bidder identity binding}`.
2. Midnight records a public, domain-separated commitment and auction identifier.
3. Before the deadline, observers cannot derive the amount from a properly random salt, but can observe transaction timing, contract interaction, commitment count, and potentially wallet/network metadata.
4. Reveal or settlement necessarily discloses the winning amount and whatever opening data the chosen circuit makes public.
5. Losing amounts remain hidden only if they are never revealed and the protocol does not require publicly proving that each losing amount is below the winner.

A globally correct private maximum cannot be claimed merely because Compact circuits exist. The current contract has public ledgers and empty witnesses; its `disclose(...)` calls explicitly publish every argument. Per-client private-state storage is not shared confidential contract state. Without a reviewed protocol for privately proving the maximum across all commitments, choose one of:

- **Trust-minimized but reveal-heavy:** all valid bids reveal; anyone can recompute the winner.
- **Private losing bids but trusted settlement:** a designated auctioneer/coordinator sees openings and signs the result. Compact proves only per-bid commitment opening and eligibility, not global maximality.
- **Future cryptographic maximum protocol:** defer until it is expressed, compiled and adversarially tested with the pinned toolchain. Do not advertise it in v1.

Recommended v1: trusted settlement with hidden losing amounts, clearly labeled.

| Data | Location/visibility |
|---|---|
| Auction ID, NFT chain/contract/token, deadlines, reserve commitment or public reserve | Public on EVM and/or Midnight |
| Bid commitment, commitment transaction/call identity, status/nullifier | Public Midnight ledger/indexer |
| Bid amount, salt, local bid record | Bidder private-state provider/local wallet storage |
| Bidder network timing and contract interaction | Observable metadata; not hidden by Compact |
| Winner, winning amount, settlement digest, settlement nonce | Public at EVM settlement |
| Losing amounts | Private only under the coordinator/bidder trust model |
| NFT ownership, auction phase, settlement/cancellation | Public EVM |
| EffectStream database/API | Public derived index; must never ingest salts or losing amounts |

Commitments must bind at least:

`protocolVersion, EVM chainId, auctionContract, auctionId, Midnight networkId, Midnight contract, bidder identity or one-time key, amount, salt`.

Use a circuit-compatible hash proven available in the Compact standard library during the prototype milestone; do not standardize a guessed hash or JS encoding first.

### 3. EVM escrow and settlement authorization

`ShadowBidAuction` should be the custody and enforcement boundary:

- `createAuction`: escrow an already-minted ERC-721 with `safeTransferFrom`; record seller, NFT coordinates, payment asset, reserve policy, commit/reveal/settlement deadlines and a unique auction ID.
- Implement `IERC721Receiver`; reject unsolicited or incorrectly correlated transfers.
- Auction state is monotonic: `Created/Commit → SettlementReady → Settled` or `Cancelled/Expired`. No reopening.
- Settlement uses a typed authorization containing the complete domain, auction ID, winner, amount, bid commitment, Midnight contract/network identifier, result version, expiry and per-auction nonce.
- Verify authorization on EVM using an explicit signer/quorum policy. Consume the nonce and settlement digest before external calls.
- Winner payment and NFT delivery occur in the same EVM transaction. For ERC-20, check exact received amount or restrict supported tokens; use `SafeERC20`. For native payment, require exact value and refund through pull accounting.
- Credit seller proceeds to a withdrawal balance and transfer the NFT last or use reentrancy protection plus checks-effects-interactions. Avoid sending seller funds inline.
- Cancellation is seller-only before any valid commitment, or timeout-driven after the settlement deadline. A coordinator must not be able to strand custody indefinitely.
- Reject zero winner, wrong chain/domain, stale authorization, replayed nonce/digest, wrong amount/asset and settlement after cancel/expiry.

This is signer-authorized settlement—not Midnight proof verification. The repository contains no EVM verifier, bridge, light client, or authenticated Midnight-state relay. If eliminating the signer is required, that is a separate bridge/verifier project.

### 4. Compact approach supported by the pin

The verified build path is:

- Compact compiler `+0.33.0-rc.2`
- language `0.25.0`
- `compact-runtime 0.18.0-rc.1`
- `compact-js 2.5.5-rc.7`
- Midnight JS `5.0.0-beta.6`
- ledger v9/runtime v4 prereleases.

Follow the existing concrete pattern:

- Export public `ledger` fields and `circuit` entrypoints in `.compact`.
- Put local secrets in a typed private-state object and implement actual witnesses in `witnesses.ts`.
- Construct the generated `Contract(witnesses)`.
- Compile into `src/managed`, producing `contract/index.js`, typings, `contract-info.json`, manifest, ZKIR and prover/verifier assets.
- Use `CompiledContract.make(...).pipe(withWitnesses(...), withCompiledFileAssets(...))`.
- Join through `findDeployedContract`, configure `levelPrivateStateProvider`, indexer public data, ZK config, proof provider and wallet/Midnight providers, then invoke generated `callTx.<circuit>` bindings.

Prototype only these circuits first:

- register an auction’s immutable domain;
- commit a bid with deadline and uniqueness checks;
- prove/open one commitment;
- mark a commitment consumed or withdrawn using a public nullifier;
- publish a settlement result under the chosen coordinator policy.

Do not assume mappings, signature primitives, hash encodings, time semantics, or witness declarations until a minimal Compact source using each feature compiles and its generated `.d.ts` is inspected. Generated files are build artifacts; source-level interfaces and compiler pin are the stable contract.

### 5. Deterministic combined state

EffectStream currently uses NTP as the main ordering stream with EVM and Midnight as parallel protocols. Therefore:

- Treat EVM and Midnight observations as immutable facts, not commands whose arrival order decides the winner.
- Give every fact a canonical source key: EVM `chainId/contract/txHash/logIndex`; Midnight `networkId/contract/txId/call-or-event-index` using fields actually emitted by the primitive.
- Enforce database uniqueness on source keys and semantic keys such as `auctionId/commitment`.
- Recompute or upsert the auction projection from facts using explicit monotonic precedence. For example, confirmed EVM `Settled` dominates an earlier derived `SettlementReady`; `Cancelled` and `Settled` are mutually exclusive.
- Never use wall-clock time, `Date.now()`, insertion order, random values, frontend state, or asynchronous API results inside the STF.
- Store source block height and transaction identity. Do not use EffectStream rollup height as proof of cross-chain simultaneity.
- Define confirmation/finality policy per protocol in configuration; the present local EVM setting is only `confirmationDepth: 1`.
- Reprocessing the same ordered inputs must produce byte-equivalent rows.

The built-in EffectStream L2 primitive has nonce duplicate handling, but that does not deduplicate direct EVM auction logs or Midnight calls. ShadowBid needs its own source-key constraints.

### 6. Batcher validation boundary

Pinned batcher behavior matters:

- Generic EVM inputs get signature verification over normalized `namespace + target + timestamp + address + input`.
- `FileStorage.addInput` appends duplicates; it is not a durable replay registry.
- Its callback/storage key includes address type, target, address, timestamp, signature and input, but that key is used for processing/removal—not permanent replay rejection.
- The generic Midnight adapter returns `true` from `verifySignature`; it validates only that the JSON names a generated circuit with parseable arguments.
- `wait-effectstream-processed` means EffectStream observed a block at least as high as the receipt. It does not mean ShadowBid settlement semantics were accepted.

Consequently, the ShadowBid boundary must:

- require an explicit target—never allow settlement payloads to fall through to `defaultTarget`;
- parse a versioned, canonical envelope with strict sizes and no unknown fields;
- enforce deadline skew, domain, auction status, allowed circuit/method and argument bounds;
- authenticate bidder actions inside the Compact circuit or with a verifiable outer signature;
- use a durable request ID/nonce table with a unique constraint;
- query only finalized authoritative state needed for admission;
- regard admission as convenience/DoS protection, while EVM and Compact contracts independently enforce all security invariants;
- keep settlement-signing keys outside the public HTTP batcher process if possible.

The frontend currently defaults `BATCHER_ENDPOINT` to port 3000 while the dev batcher listens on 3334, and its helper supplies a numeric timestamp although the SDK HTTP schema declares a string. Fix these interface inconsistencies before building auction flows.

### 7. Stable interfaces

Freeze versioned domain objects before UI work:

- `AuctionRefV1`: EVM chain/contract/auction ID plus Midnight network/contract/domain ID.
- `BidCommitmentV1`: version, auction reference, bidder binding, commitment, nullifier policy.
- `SettlementAuthorizationV1`: full auction reference, winner, amount, payment asset, winning commitment, result version, expiry, nonce.
- `SourceEventIdV1`: protocol, network, contract, transaction ID, event/call index.
- `AuctionViewV1`: public derived phase, deadlines, commitment count, settlement status and source finality; no private bid fields.
- `BatcherEnvelopeV1`: request ID, target, action, canonical payload, timestamp/expiry and authentication.

Generate EVM types from the compiled ABI and Midnight types from Compact output. Put hand-written cross-package domain types in a small dependency-free module; do not import frontend or database models as protocol definitions.

### 8. Ordered milestones

1. Write threat model, public/private table, coordinator policy and byte-level domain encodings.
2. Build a minimal Compact feature probe; compile and inspect generated bindings/assets.
3. Implement and invariant-test EVM NFT escrow, timeout recovery and typed settlement authorization.
4. Implement Compact commitment/opening/nullifier circuits and private-state witnesses; test disclosure boundaries.
5. Add immutable EffectStream source tables, deterministic reducer, uniqueness constraints and API.
6. Add ShadowBid batcher validation, durable replay protection and isolated signing service boundary.
7. Add typed frontend clients, wallet-backed private storage and explicit trust/privacy disclosures.
8. Run adversarial end-to-end tests, then update decisions, security review, test matrix and handoff documents.

### 9. Critical risks and proof tests

**Critical trust assumptions**

- Settlement signer/coordinator honestly computes the winner in the recommended v1.
- Midnight node/indexer/proof server and wallet SDK behave according to their pinned prerelease implementations.
- EffectStream is an index/projection layer, not a bridge or settlement oracle.
- Users protect salts and private-state storage; loss can make a bid unrecoverable.
- Chain reorganization and liveness policies are explicitly chosen for production.

**Tests required to substantiate claims**

- Commitment vectors match Compact and TypeScript encoders; one-bit changes invalidate openings.
- Indexer/public ledger snapshots never contain amount or salt before settlement.
- Two identical amounts with different salts produce unlinkable-looking distinct commitments.
- Late commits, duplicate commitments/nullifiers, wrong domains and unauthorized openings fail in-circuit.
- EVM invariants: exactly one terminal outcome; escrowed NFT cannot be stolen or stranded permanently; settlement replay and cross-chain/domain replay fail; seller cannot cancel after the permitted point.
- Malicious ERC-721 receiver, reentrant seller and fee-on-transfer/nonstandard ERC-20 cases are rejected or handled as documented.
- Replaying identical batcher requests before and after restart is rejected durably.
- Duplicate and reordered EVM/Midnight source facts converge to identical database state.
- EVM reorg/reprocessing and Midnight re-ingestion do not duplicate commitments or regress terminal state.
- A batcher receipt or EffectStream block notification alone cannot mark an auction settled.
- Coordinator equivocation—two signed winners for one auction—is prevented on EVM by the consumed nonce/digest and detected operationally.
- Full build gates remain green: Compact compile, Forge build/tests, TypeScript/frontend build, existing 41-test baseline, and new cross-package integration tests.

No files were edited.