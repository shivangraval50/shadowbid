import { assert } from "../helpers.ts";
import { runLiveThreeBidderAuction } from "../shadowbid/live-three-bidder.ts";

/**
 * Must run immediately after `midnightPropertyTest` in the orchestrated
 * process. MidnightLocalConnector is a singleton; reusing its already-funded
 * local WalletFacade avoids creating a second wallet connection and makes this
 * a real local proving/integration gate rather than a mocked contract test.
 */
export async function shadowBidLiveE2eTest(): Promise<void> {
  await assert(
    "ShadowBid live singleton auction: three private commitments settle and EffectStream indexes final NFT ownership",
    async () => {
      const result = await runLiveThreeBidderAuction();
      return result.publicCommitments.length === 3 &&
        result.owner.toLowerCase() === result.winner.toLowerCase();
    },
  );
}
