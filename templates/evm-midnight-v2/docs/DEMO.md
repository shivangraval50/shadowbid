# Deterministic judge demo (≤2 minutes)

> Current executable demo: read-only dashboard plus source/test evidence. The 8/13/11 live auction-to-settlement sequence below is pending and must not be presented as completed until a recorded proof-capable E2E run exists.

## Prepare

From the template directory:

```sh
bun run dev
```

Open [http://127.0.0.1:10599/](http://127.0.0.1:10599/). Optional evidence endpoints are `http://127.0.0.1:9999/api/auctions`, `http://127.0.0.1:9999/api/shadowbid/service-state`, and `http://127.0.0.1:9999/health`.

## Current truthful script

| Time | Action | Evidence to call out |
| --- | --- | --- |
| 0:00–0:15 | Say: “ShadowBid keeps bid openings private while EVM custody and cross-chain state remain auditable.” | EVM custody, Midnight commitments, EffectStream public projection. |
| 0:15–0:35 | Show the dashboard and its operational status, registry, and privacy sections. | Read-only auction cards, lifecycle/count state, and “no bid openings in API”. |
| 0:35–0:55 | Open an indexed auction, if available. | Seller, token, reserve, deadline, and public commitment count; no amounts or salts. |
| 0:55–1:15 | Open the auction and service-state API responses. | Public hashes and lifecycle state only; no `salt`, opening, losing amount, or private-bid fields. |
| 1:15–1:35 | Show `shadowbid.compact` and its privacy test. | Domain-bound `persistentCommit`, three fixed slots, no result-publication circuit. |
| 1:35–1:50 | Show `ShadowBidAuction.sol` and Forge test names. | Escrow, exact payment, EIP-712 signer authorization, expiry, nonce, replay, and winner checks. |
| 1:50–2:00 | Show the test matrix and security model. | EVM does not verify a Midnight winner-computation proof; coordinator trust is explicit; EffectStream is indexing, not a trustless bridge. |

If no auction is indexed, use the empty state and API responses, then move directly to source/tests. Do not fabricate a successful settlement transaction.

## Pending live-flow script (not yet validated)

The intended future judge flow is: seller mints/lists an NFT; bidder A commits 8, bidder B commits 13, and bidder C commits 11 privately; the auction closes; an approved Midnight result path derives the permitted winner; EffectStream reflects public state; the authenticated settlement executes on EVM; and the final NFT owner is shown. This section is a target specification only. The current Compact circuit does not compute a global maximum, the UI has no write controls, and no run has demonstrated these steps together.

## Optional coordinator handoff evidence

The one-shot CLI can validate an operator-supplied decision against public Midnight ledger state and sign an EIP-712 result when configured with `SHADOWBID_COORDINATOR_PRIVATE_KEY`, `SHADOWBID_COORDINATOR_RESULTS_DIR`, `SHADOWBID_EVM_CHAIN_ID`, `SHADOWBID_EVM_AUCTION_CONTRACT`, and `SHADOWBID_SETTLEMENT_SIGNER`. It never reads private witnesses or computes the maximum. This is authenticated trusted coordination, not proof-backed winner selection.
