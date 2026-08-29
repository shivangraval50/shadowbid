import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ShadowBid, type ShadowBidPrivateState, witnesses } from "./contract-shadowbid/src/_index.ts";

const config: DeployConfig = {
  contractName: "contract-shadowbid",
  contractFileName: "contract-shadowbid.json",
  contractClass: ShadowBid.Contract,
  witnesses,
  privateStateId: "shadowBidPrivateState",
  initialPrivateState: { bids: {} } as ShadowBidPrivateState,
  privateStateStoreName: "shadowbid-private-state",
};

deployMidnightContract(config, midnightNetworkConfig)
  .then(() => {
    console.log("Deployment successful");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Unhandled error:", e);
    process.exit(1);
  });
