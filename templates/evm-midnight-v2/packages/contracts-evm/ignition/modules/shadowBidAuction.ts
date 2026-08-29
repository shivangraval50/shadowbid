import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ShadowBidAuctionModule = buildModule("ShadowBidAuctionModule", (m) => {
  const settlementSigner = m.getParameter("settlementSigner");
  const auction = m.contract("ShadowBidAuction", [settlementSigner]);
  return { auction };
});

export default ShadowBidAuctionModule;
