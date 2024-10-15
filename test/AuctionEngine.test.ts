import { loadFixture, ethers, expect } from "./setup";

describe("AuctionEngine", function () {
    let owner
    let buyer
    let auction

    beforeEach(async function() {
        [owner, buyer] = await ethers.getSigners()

        const AuctionEngine = await ethers.getContractFactory("AuctionEngine", owner)
        auction = await AuctionEngine.deploy()
        await auction.waitForDeployment()
    })
})