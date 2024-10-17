// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

contract AuctionEngine {
    address public owner;
    uint constant DURATION = 2 days;
    uint constant FEE = 5; // % выручки

    event AuctionCreated(uint index, uint duration, uint startPrice, string item);
    event AuctionEnded(uint index, uint finalPrice, address winner);

    struct Auction {
        bool stopped;
        address payable seller;
        uint startPrice;
        uint finalPrice;
        uint startAt;
        uint endAt;
        uint discountRate;
        string item;
    }

    Auction[] public auctions;

    constructor(){
        owner = msg.sender;
    }

    function createAuction(uint _duration, uint _startPrice, uint _discountRate, string calldata _item) external {
        uint duration = _duration != 0 ? _duration : DURATION;

        require(_startPrice >= _discountRate * duration, "incorrect start price");

        Auction memory newAuction = Auction({
            stopped: false,
            seller: payable(msg.sender),
            startPrice: _startPrice,
            finalPrice: _startPrice,
            discountRate: _discountRate,
            startAt: block.timestamp,
            endAt: block.timestamp + duration,
            item: _item
        });
        auctions.push(newAuction);

        emit AuctionCreated(auctions.length - 1, duration, _startPrice, _item);
    }

    function getPriceFor(uint index) public view returns(uint) {
        require(index < auctions.length, "auction not found");

        Auction memory auction = auctions[index];
        require(!auction.stopped, "auction is stopped");

        return auction.startPrice - (auction.discountRate * (block.timestamp - auction.startAt));
    }

    function buy(uint index) external payable {
        require(index < auctions.length, "auction not found");

        Auction storage auction = auctions[index];
        require(!auction.stopped, "auction is stopped");
        require(block.timestamp < auction.endAt, "auction is ended");

        uint currentPrice = getPriceFor(index);
        require(msg.value >= currentPrice, "not enough funds");

        auction.stopped = true;
        auction.finalPrice = currentPrice;

        uint refund = msg.value - currentPrice;
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }

        auction.seller.transfer(
            currentPrice - ((currentPrice * FEE) / 100)
        );

        emit AuctionEnded(index, currentPrice, msg.sender);
    }
}
