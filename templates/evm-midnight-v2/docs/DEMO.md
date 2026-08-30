# Deterministic judge demo (≤2 minutes)

> **What is live vs. recorded.** Everything shown in the two minutes below is a
> *live* query against a running local stack. The auction it displays was
> produced by a *recorded* run of the real three-bidder harness, executed before
> the presentation because Compact proving alone takes several minutes. No step
> in the script fabricates a transaction, and nothing is replayed from a fixture
> file — the UI and APIs read live indexed state the whole time.

## Prepare (before the two minutes start)

From the template directory:

```sh
bun run dev
```

Wait for all eight listeners (5432, 8545, 9944, 8088, 6300, 9999, 3334, 10599).
Then produce the auction the demo will show. `register_auction` asserts
`initialized == false`, so a fresh Compact instance is required per run; the
orchestrator deploys one on every `bun run dev`:

```sh
cd packages/tests
MIDNIGHT_STORAGE_PASSWORD="YourPasswordMy1!" \
  bun run -e 'import {runLiveThreeBidderAuction} from "./shadowbid/live-three-bidder.ts"; console.log(await runLiveThreeBidderAuction())'
```

This takes roughly 6–8 minutes: Midnight wallet sync plus eight real ZK proofs
(`register_auction`, three `commit_bid_*`, `close_commitments`, three
`open_and_consume_*`). It prints the auction id, the three public commitment
hashes, the winner, and the final owner. It never prints bid amounts or salts.

Open [http://127.0.0.1:10599/](http://127.0.0.1:10599/).

## The two-minute script

| Time | Action | What to say / point at |
| --- | --- | --- |
| 0:00–0:15 | Dashboard is open. | “Sealed-bid NFT auction. Bid amounts stay private on Midnight; custody and outcome stay auditable on EVM. Three bidders committed 8, 13, and 11 — watch what the public surfaces actually show.” |
| 0:15–0:35 | Point at the status strip and the auction card. | Auctions tracked, settled count, and a card showing **TOKEN #900001**, phase **SETTLED**, and **COMMITMENTS 3**. Three commitments are public; three *amounts* are not. |
| 0:35–0:55 | Click **View auction**. | Seller, public reserve, commit deadline, **FINAL NFT OWNER**, and the EVM ↔ EffectStream ↔ Midnight state row. Note: hash correlation is explicitly *not* settlement authorization. |
| 0:55–1:15 | Click **Demo flow**. | Seven stages driven by `/api/shadowbid/demo-status`, derived only from indexed public state. Bidders A/B/C appear as *sealed commitment* channels with no values. |
| 1:15–1:35 | Open `http://127.0.0.1:9999/api/auctions/1` in a tab. | Public JSON: commitment hashes, lifecycle, winner, `winning_amount: "13"`. Search it live for `salt`, `opening`, or the losing bidders — **nothing**. Only the winning amount is public, by protocol design. |
| 1:35–1:50 | Show `packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact`. | Eight circuits, three fixed slots, domain-bound `persistentCommit`, and **no result-publication circuit**. Amounts and salts are private circuit inputs, never `disclose`d. |
| 1:50–2:00 | Close on the trust boundary. | “Midnight proves the commitment/opening lifecycle. It does **not** prove 13 was the highest bid — a trusted coordinator selects the winner and signs an EIP-712 authorization, and EVM verifies that authorization, not a ZK winner proof. EffectStream is deterministic indexing, not a trustless bridge.” |

## The one thing not to overstate

If a judge asks “does Midnight prove the winner is the maximum?”, the answer is
**no**. The Compact circuits verify that each commitment opens correctly and
that the lifecycle advanced; they never compare the three amounts. The
coordinator chooses the winner out-of-band and signs it. A dishonest
coordinator could have signed for the bidder who committed 8, and every check in
this system — Compact, EffectStream, and the EVM contract — would still have
passed. That is the explicit, documented trust assumption, not a bug.

Similarly, the recorded run submits all three commitments through **one** local
development wallet. It does not demonstrate three independently funded Midnight
wallets.

## If no auction is indexed

The dashboard shows a real empty state and `/api/shadowbid/demo-status` reports
`mode: "UNAVAILABLE"` with every stage `ready`. Use that honestly and move to
the source/test evidence rows (1:35 onward). Do not fabricate a settlement.

## Optional coordinator handoff evidence

The one-shot CLI validates an operator-supplied decision against public Midnight
ledger state and signs an EIP-712 result when configured with
`SHADOWBID_COORDINATOR_PRIVATE_KEY`, `SHADOWBID_COORDINATOR_RESULTS_DIR`,
`SHADOWBID_EVM_CHAIN_ID`, `SHADOWBID_EVM_AUCTION_CONTRACT`, and
`SHADOWBID_SETTLEMENT_SIGNER`. It never reads private witnesses and never
computes a maximum. This is authenticated trusted coordination, not proof-backed
winner selection.
