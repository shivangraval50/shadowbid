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

## Repository link

**[YOU MUST SUPPLY] — this is the single hardest blocker. Read carefully.**

The branch `shadowbid-build` exists **only on this machine**. It is not pushed
anywhere. The one configured remote is:

```
origin  https://github.com/effectstream/effectstream.git
```

That is the **upstream EffectStream project**, not your fork. Do not push there:
you almost certainly lack write access, and this is hackathon work that belongs
in your own repository. Judges cannot see a local branch.

To produce a working link, create your own repository and push to it:

```sh
cd /Users/shivangraval/Documents/Codex/2026-08-29/you-are-responsible-for-making-this/effectstream
git remote add submission https://github.com/<your-account>/<your-repo>.git
git push submission shadowbid-build
```

Then paste that URL into Devpost, pointing judges at:

```
Branch:        shadowbid-build
Commit:        55faa31c   (or the latest at push time)
Template path: templates/evm-midnight-v2
Start here:    templates/evm-midnight-v2/README.md
```

Note this repository is a full EffectStream monorepo; ShadowBid lives entirely
under `templates/evm-midnight-v2`. Say so in the submission so judges do not
land in unrelated template code.

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
git clone <repo> && cd templates/evm-midnight-v2
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

## What still needs manual action

1. **Push to your own repository** and paste the public URL. `shadowbid-build` is local-only; the sole configured remote is the upstream `effectstream/effectstream`, which is not yours to push to. See the Repository link section above for exact commands. **Without this, judges have nothing to inspect — do it first.**
2. **Record and link a demo video** if the hackathon requires one — script in `docs/DEMO.md`.
3. **Upload the three screenshots** from `docs/screenshots/`.
4. **Fill in team information.**
5. **Press submit on Devpost** — I have no Devpost access or credentials and cannot submit on your behalf.
