// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Erc721Dev} from "../../src/contracts/ERC721Dev.sol";
import {ShadowBidAuction} from "../../src/contracts/ShadowBidAuction.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function prank(address) external;
    function deal(address account, uint256 newBalance) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8, bytes32, bytes32);
    function warp(uint256) external;
}

contract ShadowBidAuctionTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant SIGNER_KEY = 0xA11CE;
    address private seller = address(0xA11CE1);
    address private winner = address(0xB0B);
    Erc721Dev private nft;
    ShadowBidAuction private auction;

    receive() external payable {}

    function setUp() public {
        nft = new Erc721Dev();
        auction = new ShadowBidAuction(vm.addr(SIGNER_KEY));
        nft.mint(seller, 1);
        vm.deal(winner, 10 ether);
    }

    function testEscrowCancellationAndTimeoutRecovery() public {
        setUp();
        uint256 id = _create();
        _assertEq(nft.ownerOf(1), address(auction));

        vm.prank(seller);
        auction.cancel(id);
        _assertEq(nft.ownerOf(1), seller);

        nft.mint(seller, 2);
        vm.prank(seller);
        nft.approve(address(auction), 2);
        vm.prank(seller);
        uint256 expiredId = auction.createAuction(address(nft), 2, uint64(block.timestamp + 10), uint64(block.timestamp + 20), 1 ether, bytes32(uint256(7)));
        vm.warp(block.timestamp + 21);
        auction.cancel(expiredId);
        _assertEq(nft.ownerOf(2), seller);
    }

    function testSettlementConsumesAuthorizationAndCreditsSeller() public {
        setUp();
        uint256 id = _create();
        bytes32 commitment = keccak256("midnight-commitment");
        vm.prank(vm.addr(SIGNER_KEY));
        auction.recordCommitment(id, commitment);

        ShadowBidAuction.SettlementAuthorization memory auth = ShadowBidAuction.SettlementAuthorization({
            auctionId: id,
            winner: winner,
            amount: 1 ether,
            commitment: commitment,
            midnightContract: bytes32(uint256(7)),
            midnightNetwork: bytes32(uint256(31337)),
            resultVersion: 1,
            expiry: block.timestamp + 100,
            nonce: 0
        });
        bytes memory signature = _sign(auth);
        vm.prank(winner);
        auction.settle{value: 1 ether}(auth, signature);
        _assertEq(nft.ownerOf(1), winner);
        _assertEq(auction.proceeds(seller), 1 ether);

        vm.prank(winner);
        (bool ok,) = address(auction).call{value: 1 ether}(abi.encodeCall(auction.settle, (auth, signature)));
        _assertTrue(!ok);
    }

    function testRejectsForgedWinnerWrongDomainAndPrematureSettlement() public {
        setUp();
        uint256 id = _create();
        bytes32 commitment = keccak256("midnight-commitment");
        vm.prank(vm.addr(SIGNER_KEY));
        auction.recordCommitment(id, commitment);
        ShadowBidAuction.SettlementAuthorization memory auth = ShadowBidAuction.SettlementAuthorization({
            auctionId: id, winner: winner, amount: 1 ether, commitment: commitment,
            midnightContract: bytes32(uint256(7)), midnightNetwork: bytes32(uint256(31337)), resultVersion: 1,
            expiry: block.timestamp + 100, nonce: 0
        });
        bytes memory signature = _sign(auth);
        auth.winner = address(0xBAD);
        vm.prank(winner);
        (bool forgedWinner,) = address(auction).call{value: 1 ether}(abi.encodeCall(auction.settle, (auth, signature)));
        _assertTrue(!forgedWinner);

        setUp();
        id = _create();
        auth.auctionId = id;
        vm.prank(winner);
        (bool premature,) = address(auction).call{value: 1 ether}(abi.encodeCall(auction.settle, (auth, signature)));
        _assertTrue(!premature);
    }

    function _create() private returns (uint256) {
        vm.prank(seller);
        nft.approve(address(auction), 1);
        vm.prank(seller);
        return auction.createAuction(address(nft), 1, uint64(block.timestamp + 100), uint64(block.timestamp + 200), 1 ether, bytes32(uint256(7)));
    }

    function _sign(ShadowBidAuction.SettlementAuthorization memory auth) private returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(auction.SETTLEMENT_TYPEHASH(), auth.auctionId, auth.winner, auth.amount, auth.commitment, auth.midnightContract, auth.midnightNetwork, auth.resultVersion, auth.expiry, auth.nonce));
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("ShadowBidAuction"), keccak256("1"), block.chainid, address(auction)));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _assertTrue(bool value) private pure { require(value, "assert true"); }
    function _assertEq(address a, address b) private pure { require(a == b, "assert address"); }
    function _assertEq(uint256 a, uint256 b) private pure { require(a == b, "assert uint"); }
}
