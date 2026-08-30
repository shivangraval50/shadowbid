import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { Counter, type CounterPrivateState, witnesses as counterWitnesses } from "./contract-round-value/src/_index.ts";
import { ShadowBid, type ShadowBidPrivateState, witnesses } from "./contract-shadowbid/src/_index.ts";

const counterConfig: DeployConfig = {
  contractName: "contract-round-value",
  contractFileName: "contract-round-value.json",
  contractClass: Counter.Contract,
  witnesses: counterWitnesses,
  privateStateId: "counterPrivateState",
  initialPrivateState: { privateCounter: 0 } as CounterPrivateState,
  privateStateStoreName: "counter-private-state",
};

const shadowBidConfig: DeployConfig = {
  contractName: "contract-shadowbid",
  contractFileName: "contract-shadowbid.json",
  contractClass: ShadowBid.Contract,
  witnesses,
  privateStateId: "shadowBidPrivateState",
  initialPrivateState: { bids: {} } as ShadowBidPrivateState,
  privateStateStoreName: "shadowbid-private-state",
};

// Keep the validated Counter reference contract available while deploying the
// ShadowBid binding used by the auction primitives and batcher.
deployMidnightContract(counterConfig, midnightNetworkConfig)
  .then(() => deployMidnightContract(shadowBidConfig, midnightNetworkConfig))
  .then(() => {
    console.log("Deployment successful");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("Unhandled error:", e);
    process.exit(1);
  });
