import {loadFixture, ethers, expect} from "./setup";

describe("AuctionEngine", function () {
  const newActionDefaultDiscountRate = 3
  const newActionDefaultDuration = 60
  const newActionDefaultPrice = ethers.parseEther("0.0001")
  const newActionDefaultItemName = "test item"

  let owner
  let seller
  let firstBuyer
  let secondBuyer
  let contract

  beforeEach(async function () {
    [owner, seller, firstBuyer, secondBuyer] = await ethers.getSigners()

    const AuctionEngine = await ethers.getContractFactory("AuctionEngine", owner)
    contract = await AuctionEngine.deploy()
    await contract.waitForDeployment()
  })

  it("sets owner success", async function () {
    const auctionOwner = await contract.owner()

    expect(auctionOwner).to.not.eq(seller.address)
    expect(auctionOwner).to.eq(owner.address)
  })

  async function getBlockTimestamp(blockNumber: bigint) {
    // @ts-ignore
    return (await ethers.provider.getBlock(blockNumber)).timestamp
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  describe("createAuction", function () {
    it("incorrect start price failed", async function () {
      expect(contract.connect(seller).createAuction(
        newActionDefaultDuration,
        newActionDefaultPrice,
        ethers.parseEther("0.00001"),
        newActionDefaultItemName
      )).to.be.revertedWith("incorrect start price")
    })

    it("success", async function () {
      const tx = await contract.connect(seller).createAuction(
        newActionDefaultDuration,
        newActionDefaultPrice,
        newActionDefaultDiscountRate,
        newActionDefaultItemName
      )
      await tx.wait()

      const blockTimestamp = await getBlockTimestamp(tx.blockNumber)
      const newAuction = await contract.auctions(0)

      expect(newAuction.stopped).to.be.false
      expect(newAuction.seller).to.eq(seller.address)
      expect(newAuction.startPrice).to.eq(newActionDefaultPrice)
      expect(newAuction.finalPrice).to.eq(newActionDefaultPrice)
      expect(newAuction.discountRate).to.eq(newActionDefaultDiscountRate)
      expect(newAuction.startAt).to.eq(blockTimestamp)
      expect(newAuction.endAt).to.eq(blockTimestamp + newActionDefaultDuration)
      expect(newAuction.item).to.eq(newActionDefaultItemName)

      expect(newAuction).to.emit(contract, "AuctionCreated")
        .withArgs(0, newActionDefaultDuration, newActionDefaultPrice, newActionDefaultItemName)
    })
  })

  describe("getPriceFor", function () {
    it("incorrect index failed", async function () {
      expect(contract.getPriceFor(10)).to.be.revertedWith("auction not found")
    })

    it("auction is stopped failed", async function () {
      const txCreate = await contract.connect(seller).createAuction(
        newActionDefaultDuration,
        newActionDefaultPrice,
        newActionDefaultDiscountRate,
        newActionDefaultItemName
      )
      await txCreate.wait()

      // just for stopping
      const txBuy = await contract.connect(firstBuyer)
        .buy(0, { value: ethers.parseEther("0.0002") })
      await txBuy.wait()

      expect(contract.connect(secondBuyer).getPriceFor(0))
        .to.be.revertedWith("auction is stopped")
    })

    it("get price success", async function () {
      this.timeout(5000)

      const txCreate = await contract.connect(seller).createAuction(
        newActionDefaultDuration,
        newActionDefaultPrice,
        newActionDefaultDiscountRate,
        newActionDefaultItemName
      )
      await txCreate.wait()

      let price = await contract.connect(secondBuyer).getPriceFor(0)
      expect(price).to.eq(newActionDefaultPrice)

      const waitingSec = 2
      // Увеличиваем время на waitingSec секунд и создаем новый блок
      await ethers.provider.send("evm_increaseTime", [waitingSec]);
      //
      await ethers.provider.send("evm_mine");

      price = await contract.connect(secondBuyer).getPriceFor(0)
      expect(price).to.eq(newActionDefaultPrice - BigInt(newActionDefaultDiscountRate * waitingSec))
    })
  })
})