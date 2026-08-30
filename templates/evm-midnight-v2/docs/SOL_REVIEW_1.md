## CRITICAL
<!-- HISTORICAL REVIEW: This document records an earlier review checkpoint. Its findings and paths are preserved; current remediation and validation status are in BUILD_STATUS.md and SECURITY_REVIEW.md. -->

No critical findings.

The current development deployment cannot settle because its authoritative reader always returns `null` ([batcher.dev.ts](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/batcher.dev.ts:27)). Therefore, the issues below do not currently produce an end-to-end NFT theft path without either the trusted EVM settlement signer or a future incorrectly implemented authority reader.

## HIGH

### H-1 — Compact settlement eligibility and winner/result fields are forgeable

Proven implementation fact:

`publish_coordinator_result` is a public exported circuit. It accepts caller-supplied `winner_`, `commitment`, `amount`, `digest`, and `nonce`. Its only eligibility check is that the commitment equals one of the three stored commitments; it does not verify:

- that `winner_` and `amount` open that commitment;
- that the corresponding slot was successfully opened or consumed;
- that the winner is the bidder bound into the commitment;
- that the amount is the committed amount;
- that it is the highest eligible amount;
- coordinator authorization or signature;
- settlement nonce progression;
- the EVM settlement digest.

Evidence: [shadowbid.compact:75](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:75), especially the weak membership assertion at [line 77](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:77) and unconditional publication at [line 78](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:78).

All lifecycle functions are also unauthenticated. An arbitrary caller can register the singleton contract domain, close commitments immediately, consume an opening if known, or publish a result. Deadlines are stored at [lines 18–19](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:18), but no circuit checks ledger time. `register_auction` merely compares the two supplied deadlines ([lines 39–41](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:39)); `commit_bid_*` and `close_commitments` use only a manually mutable flag ([lines 44–59](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:44)).

Impact:

- Settlement eligibility on Midnight can be forged.
- A caller can publish an arbitrary winner and amount against any real commitment.
- A caller can front-run initialization or prematurely close the three bid slots, causing permanent denial of bidding.
- A future authority reader that treats `settled`, `winner`, or `winning_amount` as authoritative would turn this into a cross-chain settlement vulnerability.

The EVM contract currently prevents this alone from transferring the NFT because EVM settlement independently requires `settlementSigner`. That signer trust is explicit at [ShadowBidAuction.sol:10](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:10) and [lines 133–145](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:133).

Remediation:

- Authenticate registration, closure, and result publication with a contract-recognized coordinator key or capability.
- Bind publication to a verified opening: recompute the commitment from winner/bidder, amount, salt, and complete domain.
- Require the selected slot to be committed and consumed, with nonce progression enforced in-circuit.
- Either implement and review a proof of maximum/eligibility or explicitly keep winner computation coordinator-trusted and cryptographically authenticate that coordinator result.
- Enforce actual ledger/network time for commit, close, open, and publish transitions.
- Never implement the authoritative reader by trusting the current public `settled/winner/amount` ledger fields.

### H-2 — EVM settlement is allowed while bidding is still open

Proven implementation fact:

`settle` checks only that the auction remains in `Phase.Commit` and that the settlement deadline has not elapsed. It never requires `block.timestamp > commitDeadline`:

[ShadowBidAuction.sol:123–131](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:123).

The trusted signer can record a commitment and immediately settle it before other bidders’ advertised commit window ends. `recordCommitment` explicitly permits recording throughout that window ([lines 112–120](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:112)).

Impact:

The signer can prematurely terminate a live auction and exclude later valid bidders. This violates the auction timing/fairness state machine even if the signature is authentic.

Remediation:

Require settlement after the commit phase, for example:

```solidity
if (
    auction.phase != Phase.Commit ||
    block.timestamp <= auction.commitDeadline ||
    block.timestamp > auction.settlementDeadline
) revert InvalidPhase();
```

Prefer an explicit `SettlementReady`/commit-closed transition tied to finalized authoritative state. Add boundary tests for `commitDeadline - 1`, exactly `commitDeadline`, and `commitDeadline + 1`.

## MEDIUM

### M-1 — “SETTLEMENT_READY” projection is neither domain-complete nor actually settlement-ready

Proven implementation fact:

The reducer declares readiness whenever an EVM commitment string matches a Midnight commitment string ([shadowbid.ts:63–77](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/shadowbid.ts:63)). It does not require:

- `commitments_closed`;
- a valid opening or consumption;
- the Compact auction’s EVM chain/contract/domain to match the EVM auction;
- commit deadline completion;
- coordinator approval or a result;
- finality.

The Midnight primitive forwards only `{auctionId, commitment}` ([shadowbid-primitive.ts:94–108](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/shadowbid-primitive.ts:94)), dropping the public domain and closure fields that could support stronger correlation.

Impact:

The API and dashboard can display `SETTLEMENT_READY` for a merely matching hash, including before commitments close. This is not presently used as settlement authority, which limits the impact, but it is an unsafe signal for operators or future integration.

Remediation:

Rename the state to something precise such as `COMMITMENT_CORRELATED`, or require full auction-domain equality, closed commitments, appropriate finalized heights, valid slot state, and coordinator-approved result before using `SETTLEMENT_READY`. Preserve the documented rule that this projection must never authorize settlement.

### M-2 — Replay state is consumed during validation, permitting permanent admission denial

Proven implementation fact:

`validateInput` permanently claims both the request ID and auction nonce before batch construction or successful on-chain submission:

[shadowbid-settlement.ts:140–151](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/shadowbid-settlement.ts:140).

The claim is written durably at [lines 77–89](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/shadowbid-settlement.ts:77). There is no pending/committed state or rollback if batching, proving, submission, or confirmation fails.

Impact:

A failed or deliberately raced request can burn the approved auction nonce locally and prevent retry after a transient failure. If approved result data becomes observable, an unauthenticated caller may be able to submit it first; the adapter itself never examines `input.signature` or binds `input.address` to the winner.

Assumption:

The surrounding batcher SDK may perform outer authentication, but that guarantee was not established by this adapter and the test uses a placeholder signature ([shadowbid-settlement.test.ts:30](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/batcher/shadowbid-settlement.test.ts:30)).

Remediation:

Use transactional replay states: `pending → submitted → finalized`, allow safe retry of identical payloads, and release or reconcile failed pending claims. Cryptographically authenticate the envelope and bind the authenticated caller to the expected coordinator/winner as policy requires. Use a database uniqueness constraint or equivalent cross-process atomic store rather than a process-local promise plus JSON file.

### M-3 — Signed Midnight network is not checked against auction state

Proven implementation fact:

The EVM auction stores only one `midnightDomain` value ([ShadowBidAuction.sol:15–25](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:15)). Settlement requires `midnightContract == auction.midnightDomain`, but `midnightNetwork` need only be nonzero:

[ShadowBidAuction.sol:129–130](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:129).

Impact:

The contract cannot reject a result signed for the wrong Midnight network. This is partly contained by signer trust and EIP-712’s EVM chain/verifying-contract domain, but contradicts the claimed complete cross-chain domain validation.

Remediation:

Store the expected Midnight network and contract identifiers separately when creating the auction, and compare both exactly during settlement. Define their byte encodings explicitly.

### M-4 — Privacy verification tests do not exercise the real leakage surfaces

Proven implementation facts:

- The API privacy test queries `/api/shadowbid`, which does not exist, and treats `404` as success; it does not query `/api/auctions` or `/api/auctions/:id` ([shadowbid-privacy.test.ts:21–27](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/tests/stm/shadowbid-privacy.test.ts:21)).
- The DB test checks column names rather than stored JSON payload values ([lines 30–37](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/tests/stm/shadowbid-privacy.test.ts:30)).
- The browser test fetches static HTML, not rendered DOM/API state, and treats connection failure as success ([lines 39–45](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/tests/stm/shadowbid-privacy.test.ts:39)).
- Log inspection is vacuous when `SHADOWBID_LOG_PATHS` is unset ([lines 48–53](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/tests/stm/shadowbid-privacy.test.ts:48)).
- Compact tests inspect source strings rather than execute adversarial circuits ([shadowbid.contract.test.ts:4–33](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.contract.test.ts:4)).

Remediation:

Seed canary secrets into real bid/private-state paths, execute actual circuit calls, query every live API route and JSONB source-fact payload, render the browser, capture configured process logs, and fail—not pass—when a required surface is unavailable.

## LOW

### L-1 — Reserve price is publicly disclosed while the UI/demo describe it as hidden

Proven implementation fact:

`reservePrice` is stored in a public Solidity mapping and emitted in `AuctionCreated` ([ShadowBidAuction.sol:15–25](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:15), [line 55](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-evm/src/contracts/ShadowBidAuction.sol:55)). It is also stored and returned by the API ([api.ts:19–26](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/node/api.ts:19)).

Nevertheless, the frontend labels it “Hidden” and “Hidden by design” ([App.tsx:30–31](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/frontend/client/src/App.tsx:30)), and the demo claims it remains hidden ([DEMO.md:22](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/docs/DEMO.md:22)).

Remediation:

Either display and document the reserve as public or replace it with an appropriately domain-separated commitment and prove reserve compliance during settlement.

### L-2 — Security/privacy documentation is stale and internally inconsistent

Examples:

- Architecture says two slots and unwired ShadowBid sync ([ARCHITECTURE.md:6](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/docs/ARCHITECTURE.md:6), [line 11](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/docs/ARCHITECTURE.md:11)); the merged code has three slots and dev sync wiring.
- Privacy documentation still says two slots ([PRIVACY.md:7](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/docs/PRIVACY.md:7)).
- The security-review status remains “Pending” ([SECURITY_REVIEW.md:3](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/docs/SECURITY_REVIEW.md:3)).

Remediation:

Reconcile documentation with the merged implementation and explicitly state that current Compact publication proves neither winner identity, committed amount, nor maximum-bid eligibility.

## Explicit requested assessments

- Losing bids unnecessarily disclosed: **No direct disclosure found in the merged ShadowBid path.** Losing amounts and salts are private circuit arguments and are not passed to `disclose`; only commitment hashes, nullifiers, lifecycle metadata, and the selected public result are exposed ([shadowbid.compact:44–73](/Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream/templates/evm-midnight-v2/packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact:44)). This conclusion assumes `persistentCommit`/`persistentHash` are cryptographically sound and salts have sufficient entropy. Timing, transaction identity, slot/count, bidder interaction metadata, and the winning amount remain public. The weak tests do not constitute runtime proof of non-leakage.
- Can settlement eligibility be forged? **Yes on the Midnight contract:** arbitrary winner and amount can be published against any stored commitment. **Not directly on EVM without the trusted signer:** EIP-712 binds auction ID, winner, amount, commitment, EVM chain, and verifying contract, while exact payment and recorded commitment are checked. The signer itself can intentionally authorize a false winner because signer honesty is the explicit settlement trust assumption.
- Wrong auction/replay/double settlement: EVM cross-auction signature reuse is prevented by signed `auctionId`, EIP-712 domain, per-auction nonce, digest tracking, and terminal phase. No direct double-settlement path was found. Compact prevents only a second publication through `settled`; it does not authenticate the first.
- Frontend authority: no frontend settlement authority or ShadowBid write controls were found. It is read-only, but displays projection-derived readiness that should not be interpreted as authoritative.
- Review status: read-only source review only; no files were edited and no build/test command was run. The documented environment uses `--skip-zk` and has not completed a real proof/settlement execution, so cryptographic runtime behavior remains an assumption rather than a validated fact.
