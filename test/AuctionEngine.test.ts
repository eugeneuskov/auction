import {loadFixture, ethers, expect} from "./setup";

describe("AuctionEngine", function () {
  const actionDefaultDiscountRate = 3
  const actionDefaultDuration = 60
  const actionDefaultPrice = ethers.parseEther("0.0001")
  const actionDefaultItemName = "test item"

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

  async function createDefaultAuction() {
    const tx = await contract.connect(seller).createAuction(
      actionDefaultDuration,
      actionDefaultPrice,
      actionDefaultDiscountRate,
      actionDefaultItemName
    )
    await tx.wait()

    return tx
  }

  async function getBlockTimestamp(blockNumber: bigint) {
    // @ts-ignore
    return (await ethers.provider.getBlock(blockNumber)).timestamp
  }

  async function timeMachine(waitingSec: number) {
    // Увеличиваем время на `waitingSec` секунд и создаем новый блок
    await ethers.provider.send("evm_increaseTime", [waitingSec]);
    await ethers.provider.send("evm_mine");
  }

  describe("createAuction", function () {
    it("incorrect start price failed", async function () {
      await expect(contract.connect(seller).createAuction(
        actionDefaultDuration,
        actionDefaultPrice,
        ethers.parseEther("0.00001"),
        actionDefaultItemName
      )).to.be.revertedWith("incorrect start price")
    })

    it("success", async function () {
      const tx = await createDefaultAuction()

      const blockTimestamp = await getBlockTimestamp(tx.blockNumber)
      const newAuction = await contract.auctions(0)

      expect(newAuction.stopped).to.be.false
      expect(newAuction.seller).to.eq(seller.address)
      expect(newAuction.startPrice).to.eq(actionDefaultPrice)
      expect(newAuction.finalPrice).to.eq(actionDefaultPrice)
      expect(newAuction.discountRate).to.eq(actionDefaultDiscountRate)
      expect(newAuction.startAt).to.eq(blockTimestamp)
      expect(newAuction.endAt).to.eq(blockTimestamp + actionDefaultDuration)
      expect(newAuction.item).to.eq(actionDefaultItemName)

      expect(newAuction).to.emit(contract, "AuctionCreated")
        .withArgs(0, actionDefaultDuration, actionDefaultPrice, actionDefaultItemName)
    })
  })

  describe("buy", function () {
    it("auction not found failed", async function () {
      await expect(contract.buy(0, { value: actionDefaultPrice }))
        .to.be.revertedWith("auction not found")
    })

    it("seller cannot buy own lot failed", async function () {
      await createDefaultAuction()

      await expect(contract.connect(seller).buy(0, { value: actionDefaultPrice }))
        .to.be.revertedWith("you can not buy your own lot")
    })

    it("auction is stopped failed", async function () {
      await createDefaultAuction()

      // just for stopping
      const txBuy = await contract.connect(secondBuyer)
        .buy(0, { value: ethers.parseEther("0.0002") })
      await txBuy.wait()

      await expect(contract.connect(firstBuyer).buy(0, { value: actionDefaultPrice }))
        .to.be.revertedWith("auction is stopped")
    })

    it("auction is ended failed", async function () {
      await createDefaultAuction()
      await timeMachine(actionDefaultDuration + 1)

      await expect(contract.connect(firstBuyer).buy(0, { value: actionDefaultPrice }))
        .to.be.revertedWith("auction is ended")
    })

    it("buyer have not enough funds", async function () {
      await createDefaultAuction()

      await expect(contract.connect(firstBuyer).buy(0, { value: 1 }))
        .to.be.revertedWith("not enough funds")
    })

    it("success", async function () {
      await createDefaultAuction()

      const waitingSec = 10
      await timeMachine(waitingSec)

      const txBuy = await contract.connect(firstBuyer).buy(0, { value: actionDefaultPrice })
      await txBuy.wait()

      const sellAuction = await contract.auctions(0)
      const sellPrice = sellAuction.finalPrice
      const feePrice = (sellPrice * 5n) / 100n

      await expect(txBuy).to.changeEtherBalances(
        [firstBuyer, seller, contract],
        [-sellPrice, sellPrice - feePrice, feePrice]
      )

      expect(txBuy).to.emit(contract, "AuctionEnded")
        .withArgs(0, sellPrice, firstBuyer.address)
      expect(sellAuction.stopped).to.be.true
    })
  })

  describe("getPriceFor", function () {
    it("auction not found failed", async function () {
      await expect(contract.getPriceFor(10)).to.be.revertedWith("auction not found")
    })

    it("auction is stopped failed", async function () {
      await createDefaultAuction()

      // just for stopping
      const txBuy = await contract.connect(firstBuyer)
        .buy(0, { value: ethers.parseEther("0.0002") })
      await txBuy.wait()

      await expect(contract.connect(secondBuyer).getPriceFor(0))
        .to.be.revertedWith("auction is stopped")
    })

    it("get price success", async function () {
      await createDefaultAuction()

      let price = await contract.connect(secondBuyer).getPriceFor(0)
      expect(price).to.eq(actionDefaultPrice)

      const waitingSec = 2
      await timeMachine(waitingSec)

      price = await contract.connect(secondBuyer).getPriceFor(0)
      expect(price).to.eq(actionDefaultPrice - BigInt(actionDefaultDiscountRate * waitingSec))
    })
  })

  describe("withdraw", function () {
    it("only owner can withdraw failed", async function () {
      await expect(contract.connect(firstBuyer).withdraw())
        .to.be.revertedWith("access denied")
    })

    it('success', async function () {
      await createDefaultAuction()

      const waitingSec = 5
      await timeMachine(waitingSec)

      const txBuy = await contract.connect(secondBuyer).buy(0, { value: actionDefaultPrice })
      await txBuy.wait()

      const sellAuction = await contract.auctions(0)
      const feePrice = (sellAuction.finalPrice * 5n) / 100n

      const txWithdraw = await contract.connect(owner).withdraw()
      await txWithdraw.wait()

      await expect(txWithdraw).to.changeEtherBalances(
        [owner, contract],
        [feePrice, -feePrice]
      )
    })
  })
})