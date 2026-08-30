import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ShadowBidAuctionModule = buildModule("ShadowBidAuctionModule", (m) => {
  const settlementSigner = m.getParameter("settlementSigner");
  const contract = m.contract("ShadowBidAuction", [settlementSigner]);
  return { contract };
});

export default ShadowBidAuctionModule;
