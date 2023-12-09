import AbstractService from './AbstractService'
import { FinalityBlockTag } from 'src/chains/IChainBridge'

export interface IFinalityService {
  getCustomBlockNumber?(blockTag: FinalityBlockTag): Promise<number | undefined>
}

abstract class FinalityService extends AbstractService {}

export default FinalityService
