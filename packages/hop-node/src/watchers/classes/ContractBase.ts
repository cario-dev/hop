import chainIdToSlug from 'src/utils/chainIdToSlug'
import chainSlugToId from 'src/utils/chainSlugToId'
import getBumpedGasPrice from 'src/utils/getBumpedGasPrice'
import getProviderChainSlug from 'src/utils/getProviderChainSlug'
import { BigNumber, BigNumberish, Contract, providers } from 'ethers'
import {
  Chain,
  MinGnosisGasPrice,
  MinPolygonGasPrice
} from 'src/constants'
import { Event, PayableOverrides } from '@ethersproject/contracts'
import { EventEmitter } from 'events'
import { FinalityService } from 'src/finality/FinalityService'
import { config as globalConfig } from 'src/config'

export type TxOverrides = PayableOverrides & {from?: string, value?: BigNumberish}

export default class ContractBase extends EventEmitter {
  contract: Contract
  public chainId: number
  public chainSlug: Chain
  private readonly finalityService: FinalityService

  constructor (contract: Contract) {
    super()
    this.contract = contract
    if (!this.contract.provider) {
      throw new Error('no provider found for contract')
    }
    const chainSlug = getProviderChainSlug(contract.provider)
    if (!chainSlug) {
      throw new Error('chain slug not found for contract provider')
    }
    this.chainSlug = chainSlug
    this.chainId = chainSlugToId(chainSlug)
    this.finalityService = new FinalityService(
      this.contract.provider,
      this.chainSlug,
      FinalityService.FinalityStrategyType.Bonder
    )
  }

  getChainId = async (): Promise<number> => {
    if (this.chainId) {
      return this.chainId
    }
    const { chainId } = await this.contract.provider.getNetwork()
    const _chainId = Number(chainId.toString())
    this.chainId = _chainId
    return _chainId
  }

  chainIdToSlug (chainId: number): Chain {
    return chainIdToSlug(chainId)
  }

  chainSlugToId (chainSlug: string): number {
    return Number(chainSlugToId(chainSlug))
  }

  get provider () {
    return this.contract.provider
  }

  get address (): string {
    return this.contract.address
  }

  getTransaction = async (txHash: string): Promise<providers.TransactionResponse> => {
    if (!txHash) {
      throw new Error('tx hash is required')
    }
    return await this.contract.provider.getTransaction(txHash)
  }

  getTransactionReceipt = async (
    txHash: string
  ): Promise<providers.TransactionReceipt> => {
    return await this.contract.provider.getTransactionReceipt(txHash)
  }

  getBlockNumber = async (): Promise<number> => {
    return this.finalityService.getBlockNumber()
  }

  getSafeBlockNumber = async (): Promise<number> => {
    return this.finalityService.getSafeBlockNumber()
  }

  getFinalizedBlockNumber = async (): Promise<number> => {
    return this.finalityService.getFinalizedBlockNumber()
  }

  getSyncHeadBlockNumber = async (): Promise<number> => {
    return this.finalityService.getCustomBlockNumber()
  }

  getTransactionBlockNumber = async (txHash: string): Promise<number> => {
    const tx = await this.contract.provider.getTransaction(txHash)
    if (!tx) {
      throw new Error(`transaction not found. transactionHash: ${txHash}`)
    }
    return tx.blockNumber! // eslint-disable-line
  }

  getBlockTimestamp = async (
    blockNumber: number | string = 'latest'
  ): Promise<number> => {
    const block = await this.contract.provider.getBlock(blockNumber)
    if (!block) {
      throw new Error(`expected block. blockNumber: ${blockNumber}`)
    }
    return block.timestamp
  }

  async getTransactionTimestamp (
    txHash: string
  ): Promise<number> {
    const blockNumber = await this.getTransactionBlockNumber(txHash)
    return await this.getBlockTimestamp(blockNumber)
  }

  async getEventTimestamp (event: Event): Promise<number> {
    const tx = await event.getBlock()
    if (!tx) {
      return 0
    }
    if (!tx.timestamp) {
      return 0
    }
    return Number(tx.timestamp.toString())
  }

  getCode = async (
    address: string,
    blockNumber: string | number = 'latest'
  ): Promise<string> => {
    return await this.contract.provider.getCode(address, blockNumber)
  }

  getBalance = async (
    address: string
  ): Promise<BigNumber> => {
    if (!address) {
      throw new Error('expected address')
    }
    return await this.contract.provider.getBalance(address)
  }

  protected getGasPrice = async (): Promise<BigNumber> => {
    return await this.contract.provider.getGasPrice()
  }

  protected async getBumpedGasPrice (multiplier: number): Promise<BigNumber> {
    const gasPrice = await this.getGasPrice()
    return getBumpedGasPrice(gasPrice, multiplier)
  }

  async txOverrides (): Promise<TxOverrides> {
    const txOptions: TxOverrides = {}
    if (globalConfig.isMainnet) {
      // Not all Polygon nodes follow recommended 30 Gwei gasPrice
      // https://forum.matic.network/t/recommended-min-gas-price-setting/2531
      if (this.chainSlug === Chain.Polygon) {
        txOptions.gasPrice = await this.getBumpedGasPrice(1)

        const gasPriceBn = BigNumber.from(txOptions.gasPrice)
        if (gasPriceBn.lt(MinPolygonGasPrice)) {
          txOptions.gasPrice = MinPolygonGasPrice
        }
      } else if (this.chainSlug === Chain.Gnosis) {
        // increasing more gas multiplier for gnosis
        // to avoid the error "code:-32010, message: FeeTooLowToCompete"
        const multiplier = 3
        txOptions.gasPrice = await this.getBumpedGasPrice(multiplier)

        const gasPriceBn = BigNumber.from(txOptions.gasPrice)
        if (gasPriceBn.lt(MinGnosisGasPrice)) {
          txOptions.gasPrice = MinGnosisGasPrice
        }
      }
    } else {
      if (this.chainSlug === Chain.Gnosis) {
        txOptions.gasPrice = 50_000_000_000
        txOptions.gasLimit = 5_000_000
      } else if (this.chainSlug === Chain.Polygon) {
        txOptions.gasLimit = 5_000_000
      } else if (this.chainSlug === Chain.Linea) {
        txOptions.gasLimit = 5_000_000
      }
    }

    return txOptions
  }
}
