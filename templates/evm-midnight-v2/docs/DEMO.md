# Deterministic demo (read-only, ≤2 minutes)

This is the honest demo path for the current checkout. It demonstrates the implemented public projection and privacy boundaries; it does not claim that the UI submits three bids or settles an auction.

## Prepare

From the template directory:

```sh
bun install --frozen-lockfile
bun run dev
```

Wait for `Server listening on http://127.0.0.1:10599`, then open [http://127.0.0.1:10599](http://127.0.0.1:10599). Keep [the auction API](http://127.0.0.1:9999/api/auctions), [service state](http://127.0.0.1:9999/api/shadowbid/service-state), and [health](http://127.0.0.1:9999/health) ready in tabs.

## Script

| Time | Action | Expected evidence |
| --- | --- | --- |
| 0:00–0:15 | Say: “ShadowBid keeps bid openings private while EVM custody and cross-chain state remain auditable.” | Explain EVM → EffectStream → Midnight. |
| 0:15–0:35 | Show the dashboard and click `Auctions`, then `Privacy model`. | Read-only cards, phase/counts, “Amounts are never exposed”. |
| 0:35–0:50 | Open an auction card if one is indexed. | Public seller/token/deadline/commitment count; reserve and openings remain hidden. |
| 0:50–1:05 | Open `/api/auctions/:id` and `/api/shadowbid/service-state`. | Commitments are hashes/public records; no salt/opening/losing amount fields. |
| 1:05–1:25 | Show `packages/contracts-midnight/contract-shadowbid/src/shadowbid.compact` and its privacy test. | `persistentCommit`, no `disclose(salt)`, lifecycle circuits; state honestly says two slots. |
| 1:25–1:45 | Show `ShadowBidAuction.sol` and the EVM test names. | Escrow, signer authorization, exact payment, replay/cancel protections. |
| 1:45–2:00 | Show `docs/BUILD_STATUS.md`. | Explain that frontend writes, three-bid support, ShadowBid sync wiring, and settlement reader remain incomplete. |

## Fallback

If the dashboard has no auctions, show the empty-state text and the API responses, then use the source/tests in the last 45 seconds. If `bun run dev` is unavailable, run `bun run build:midnight`, `bun run build:evm`, and `bun run --cwd packages/frontend build`, then present the source-backed architecture. Do not fabricate a successful settlement transaction.
