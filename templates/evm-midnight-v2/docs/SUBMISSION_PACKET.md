# Devpost submission packet — copy/paste ready

Prepared 2026-08-30 for the 10:00 AM ET initial deadline. Every field below is
ready to paste. Items marked **[YOU MUST SUPPLY]** cannot be produced from this
repository and require your input.

---

## Project name

```
ShadowBid
```

## Tagline (one line)

```
Sealed-bid NFT auctions: bid amounts stay private on Midnight, custody and outcome stay auditable on Ethereum.
```

## Elevator pitch / short description

```
ShadowBid is a cross-chain sealed-bid NFT auction. An ERC-721 is escrowed on EVM. Each bidder's amount and salt are private inputs to a Midnight Compact circuit, which publishes only a domain-bound commitment hash. EffectStream deterministically indexes public facts from both chains into one auditable read model. After the deadline, a trusted coordinator authorizes settlement with an EIP-712 signature that the EVM contract verifies before transferring the NFT and taking exact payment. Losing bid amounts are never published.
```

## The problem

```
Open NFT auctions leak strategy. Every bid is public the moment it lands, which enables copy-trading, anchoring, sniping, and collusion. Bidders are forced to reveal willingness-to-pay to participate at all. Sealing bids off-chain re-introduces a trusted operator with no auditability; putting them on a public chain defeats the point.
```

## The solution

```
Split the auction across two chains along the privacy boundary. Midnight holds the private part: amount and salt are private circuit inputs bound into a commitment over protocol version, EVM chain id, auction id, Midnight network/contract, and bidder. EVM holds the custody and enforcement part: escrow, deadlines, reserve, exact payment, replay protection, and signature-authorized settlement. EffectStream joins only the public facts from both chains into a deterministic projection, so the auction is auditable without exposing what anyone bid.
```

## How it works

```
1. Seller mints/lists an ERC-721; createAuction escrows it and publishes deadlines, reserve, and the Midnight domain.
2. Each bidder calls a Compact circuit with a private (amount, salt). The circuit computes persistentCommit<Bid> and publishes only the commitment hash and a lifecycle flag.
3. The trusted coordinator records each public commitment hash on EVM.
4. After the commit deadline the auction closes, and each opening is proven and consumed in-circuit (open_and_consume), setting public consumed flags.
5. The coordinator reads finalized public Midnight ledger state, validates domain, closure, commitment membership, and the deadline window, then signs an EIP-712 SettlementAuthorization.
6. The winner calls settle() with exact payment. The EVM contract verifies the signature against its configured settlementSigner plus deadline, domain, nonce, expiry, replay, and winner checks, then transfers the NFT.
7. EffectStream indexes the public events and projects the auction as SETTLED with the winner and winning amount.
```

## How we used Midnight

```
Midnight is where the private data lives and where the commitment/opening lifecycle is proven. The Compact contract (shadowbid.compact) has eight circuits over three fixed bidder slots: register_auction, commit_bid_0/1/2, close_commitments, and open_and_consume_0/1/2. Bid amount and salt are private circuit inputs and are never passed to disclose(). The contract compiles with real proving and verifier keys by default (16 key files across the 8 circuits), and the recorded run generated genuine ZK proofs for all eight circuit calls.

What Midnight proves here: that each commitment is well-formed and domain-bound, and that each opening genuinely opens its commitment. What Midnight does NOT prove here: that the winning bid was the highest. The circuits never compare the three amounts.
```

## How we used EffectStream

```
EffectStream is the deterministic multi-chain state and indexing layer. Custom primitives ingest ShadowBid facts from both EVM logs and the Midnight public ledger as append-only, source-keyed observations. A pure reducer folds them into one auction projection that converges under duplicates and reordering, materialized into PGLite/Postgres and served by a Fastify API to the React dashboard.

EffectStream is explicitly NOT a bridge, proof verifier, or settlement authority. The batcher's settlement adapter never treats the projection as authority; it reads finalized Midnight ledger state directly and fails closed when anything is missing, malformed, stale, replayed, or domain-mismatched.
```

## Privacy model

```
Private (never published): bid amounts, salts, and opening witnesses for every bidder, winning and losing alike, at every point before settlement.
Public: commitment hashes, lifecycle flags, nullifiers, commitment counts, seller, token, deadlines, reserve, addresses, and transaction metadata.
Public only after settlement, by protocol design: the winner's identity and the winning amount.
Never published at all: the two losing bid amounts and the losing bidders' identities.

Verified empirically on the recorded run: the losing bidder identifiers and every salt/opening field were absent from all public API routes, the served frontend, and the fully rendered DOM including every element attribute.
```

## Technologies / Built with

```
midnight, compact, zero-knowledge-proofs, effectstream, ethereum, solidity, openzeppelin, foundry, typescript, bun, react, vite, fastify, postgresql, pglite, viem, eip-712, erc-721
```

## Repository link — RESOLVED, public and verified

```
https://github.com/shivangraval50/shadowbid
```

Public, default branch `shadowbid-build`. Verified reachable without any
GitHub session: repository page, root README, ShadowBid README, DEMO,
ARCHITECTURE, PRIVACY, SECURITY, TEST_MATRIX, this packet, and all three
screenshots each returned HTTP 200.

The repository root README opens with a judge banner linking straight into the
submission, and states that everything outside `templates/evm-midnight-v2/` is
upstream EffectStream (Apache-2.0 / MIT) rather than hackathon work.

```
Repository:    https://github.com/shivangraval50/shadowbid
Branch:        shadowbid-build (default)
Template path: templates/evm-midnight-v2
Start here:    templates/evm-midnight-v2/README.md
```

## Track

```
Cross-Chain Track
```

## Challenges we ran into

```
The hardest problems were all at the seams between the two chains, not inside either one.

Getting a real proof-capable run at all took three separate fixes: the harness imported the Compact bindings from the wrong subpath (the package root exports the ShadowBid namespace and witnesses; the /contract subpath exports Contract and ledger directly), the live ledger reader never exposed the public consumed_0/1/2 flags so a completed lifecycle read back as undefined, and the harness unconditionally pushed the EVM clock forward before settling even though proving and three recordCommitment transactions had already moved the chain past the deadline, which the RPC rejects.

Two SQL bugs were invisible until a real database was reachable for the first time: a hand-written parameter shim computed an exclusive end offset where pgtyped's runtime expects an inclusive one, which silently ate the space in "LIMIT $1 OFFSET $2", and its regex matched PostgreSQL's ::int casts as named parameters.

The Compact contract also turns out to be single-use — register_auction asserts initialized == false and there are three fixed slots — so every end-to-end run needs a freshly deployed instance, which shaped how the demo has to be staged.
```

## What we learned

```
Privacy claims are only worth what you can verify. It is easy to write "losing bids stay private" and much harder to prove it, so we checked the actual public surfaces against a real settled auction: every API route, the served frontend, and the fully rendered DOM including element attributes, looking for the losing bidders' addresses and any salt or opening field.

We also learned to be precise about what a ZK circuit actually proves. Our circuits prove that commitments are well-formed and that openings genuinely open them. They do not prove the winner was the highest bidder, and it would have been easy to let a recorded 8/13/11 run imply otherwise. Naming the exact attack that remains possible — a dishonest coordinator signing for the bidder who committed 8, with every check still passing — turned out to be the most useful line in our documentation.

Finally, deterministic indexing is not bridging. EffectStream gave us one auditable cross-chain view, but the moment it is treated as settlement authority the security model collapses, so the batcher reads finalized Midnight state directly and fails closed.
```

## Demo video

**[YOU MUST SUPPLY]** — no video was recorded. Use `docs/DEMO.md` as the script; it is a deterministic ≤2-minute walkthrough of the live settled auction.

## Images / screenshots

Attach these committed files (already captured from the live settled stack):

```
docs/screenshots/01-dashboard.png            Dashboard: SETTLED auction, 3 commitments, privacy panel
docs/screenshots/02-demo-flow.png            Demo Flow: seven stages, all complete, no private values
docs/screenshots/03-detail-final-owner.png   Detail view: final NFT owner after settlement
```

Suggested Devpost thumbnail: `01-dashboard.png`.

## Try it out / setup instructions

```
git clone https://github.com/shivangraval50/shadowbid.git
cd shadowbid/templates/evm-midnight-v2
bun install --frozen-lockfile
bun run dev
# wait for all 8 listeners, then open http://127.0.0.1:10599/

# populate a real settled 8/13/11 auction (~6-8 min: Midnight wallet sync + 8 ZK proofs)
cd packages/tests
MIDNIGHT_STORAGE_PASSWORD="YourPasswordMy1!" \
  bun run -e 'import {runLiveThreeBidderAuction} from "./shadowbid/live-three-bidder.ts"; console.log(await runLiveThreeBidderAuction())'
```

Requires Compact `0.33.0-rc.2` with the coupled prerelease SDK set; see `docs/SETUP_STATUS.md` for the archived-compiler install and SHA-256.

## Accomplishments

```
- A real, recorded three-bidder run: bids of 8, 13, and 11 stayed private inputs to genuine ZK circuits; only commitment hashes became public; the NFT ended up with the authorized winner and EffectStream projected winning_amount 13.
- Eight Compact circuits compiling and proving with real proving/verifier keys by default, not --skip-zk.
- A settlement path that fails closed at every step: unreachable indexer, missing contract, unregistered auction, malformed state, unknown commitment, wrong domain, premature/expired result, forged signature, and replay are each rejected.
- 42/42 orchestrated checks including the live three-bidder end-to-end test, plus 45 focused, 8 Forge, and 4 Compact tests.
```

## Known limitations (do not omit these)

```
- Midnight does NOT prove the winner is the maximum bid. The Compact circuits verify the commitment/opening lifecycle only; they never compare amounts. The trusted coordinator selects the winner and signs it. A dishonest coordinator could have signed for the bidder who committed 8 and every check in the system would still have passed.
- Ethereum verifies coordinator authorization (EIP-712 against a configured settlementSigner), not a Midnight ZK winner-computation proof.
- EffectStream is deterministic indexing and a read model, not a trustless bridge or settlement authority.
- The UI is read-only. The recorded run is driven by a test harness, not by browser transactions.
- The three commitments were submitted through one local development wallet, not three independently funded Midnight wallets.
- The Compact contract has three fixed bidder slots and, because register_auction asserts initialized == false, each deployed instance serves exactly one auction.
- Production coordinator controls (multi-party approval, key management, rate limiting, durable audit) are not implemented.
- Everything runs on a local development stack; nothing is deployed to a public network.
```

## Future work

```
Proof-backed winner selection with deterministic tie rules and EVM-address binding; authenticated and time-bound Compact lifecycle transitions; scalable bidder storage beyond three fixed slots; wallet-backed UI writes for create/commit/close/open/settle; and production coordinator hardening.
```

## Judging highlights

```
- Genuine Midnight usage: eight circuits, real proving keys, private witnesses, and a domain-bound commitment scheme — not a mock.
- Honest trust boundary: every document states plainly what is and is not proven, including the exact attack a dishonest coordinator could perform.
- Verified privacy: losing bids are absent from APIs, the served frontend, and the rendered DOM including attributes, checked against real settled data.
- Real cross-chain state: EffectStream deterministically joins EVM and Midnight facts into one projection, with replay/reordering convergence tests.
- Reproducible: one launch command, one harness command, and a recorded evidence table.
```

## Team

**[YOU MUST SUPPLY]** — names, roles, contact, and Devpost handles.

---

## Manual submission procedure (~8 minutes)

The repository is public and every field above is final. Devpost could not be
filled automatically: `devpost.com/settings` redirected to the login page, so
there is no authenticated session on this machine. Do these in order.

| # | ~Time | Action |
| --- | --- | --- |
| 1 | 0:30 | Log in to Devpost and open the hackathon's **Submit a project** form. Click **Save draft** immediately so nothing is lost. |
| 2 | 0:30 | **Project name:** `ShadowBid`. **Tagline:** copy the Tagline block above. |
| 3 | 2:00 | Paste the long-form fields from the blocks above, in this order: Elevator pitch → The problem → The solution → How it works → How we used Midnight → How we used EffectStream → Privacy model → Challenges → Accomplishments → What we learned → Known limitations → Future work. |
| 4 | 0:30 | **Built with:** paste the Technologies block (comma-separated tag list). |
| 5 | 0:30 | **Try it out / repository link:** `https://github.com/shivangraval50/shadowbid` |
| 6 | 1:00 | **Upload the three images** from `templates/evm-midnight-v2/docs/screenshots/`: `01-dashboard.png` (set as thumbnail), `02-demo-flow.png`, `03-detail-final-owner.png`. |
| 7 | 0:30 | **Track / category:** select **Cross-Chain Track**. |
| 8 | 1:00 | Re-read the Known limitations block in the form. Confirm it still says Midnight does not prove the maximum, the coordinator selects and signs the winner, Ethereum verifies authorization rather than a Midnight proof, EffectStream is indexing rather than a bridge, the UI is read-only, and one local wallet submitted the three commitments. Do not soften any of it. |
| 9 | 0:30 | **Team fields:** enter your own name/handle/contact. These are the only fields nobody else can fill for you. |
| 10 | 0:30 | **Video:** if optional, leave blank. If mandatory, record a ≤2-minute screen capture following `docs/DEMO.md` against the running stack, upload to YouTube/Vimeo unlisted, and paste the link. |
| 11 | 0:30 | **Save draft**, review once end to end for leftover placeholders or broken links, then **Submit**. |

### Fields only you can supply

- **Team member name(s), roles, contact, Devpost handles.**
- **Demo video URL** — only if the hackathon makes video mandatory. Nothing in
  this repository fabricates one.

Everything else on this page is final, verified, and safe to paste as written.
