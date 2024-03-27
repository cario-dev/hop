import fetch from 'isomorphic-fetch'
import { chunk } from 'lodash'
import { getSubgraphUrl } from './utils/getSubgraphUrl'
import { chainSlugToId } from './utils/chainSlugToId'
import { cctpDomainToChainId } from './utils/cctpDomainToChainId'
import { padHex } from './utils/padHex'
import { promiseTimeout } from './utils/promiseTimeout'

// TODO: remove this temp url once the mainnet subgraph is fully synced
const cctpMainnetSubgraphUrl = 'https://api.thegraph.com/subgraphs/name/hop-protocol/hop-mainnet-cctp'

export async function queryFetch (url: string, query: string, variables?: any) {
  return promiseTimeout(_queryFetch(url, query, variables), 60 * 1000)
}

export async function _queryFetch (url: string, query: string, variables?: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: variables || {}
    })
  })
  const jsonRes = await res.json()
  if (jsonRes.errors?.length) {
    console.log('error query:', query, variables, url)
    throw new Error(jsonRes.errors[0].message)
  }
  return jsonRes.data
}

export async function fetchTransferSents (chain: string, startTime: number, endTime: number, lastId?: string) {
  const queryL1 = `
    query TransferSentToL2($perPage: Int, $startTime: Int, $endTime: Int, $lastId: String) {
      transferSents: transferSentToL2S(
        where: {
          timestamp_gte: $startTime,
          timestamp_lte: $endTime,
          id_gt: $lastId
        },
        first: $perPage,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        destinationChainId
        amount
        amountOutMin
        relayerFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        relayer
        relayerFee
        transaction {
          to
        }
      }
    }
  `
  const queryL2 = `
    query TransferSents($perPage: Int, $startTime: Int, $endTime: Int, $lastId: String) {
      transferSents(
        where: {
          timestamp_gte: $startTime,
          timestamp_lte: $endTime,
          id_gt: $lastId
        },
        first: $perPage,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        transferId
        destinationChainId
        amount
        amountOutMin
        bonderFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        transaction {
          to
        }
      }
    }
  `
  let url :string
  try {
    url = getSubgraphUrl(chain)
    console.log(chain, url)
  } catch (err) {
    return []
  }
  let query = queryL1
  if (chain !== 'ethereum') {
    query = queryL2
  }
  if (!lastId) {
    lastId = '0'
  }
  const data = await queryFetch(url, query, {
    perPage: 1000,
    startTime,
    endTime,
    lastId
  })

  let transfers = data.transferSents
    .filter((x: any) => x)
    .map((x: any) => {
      x.destinationChainId = Number(x.destinationChainId)
      return x
    })

  if (transfers.length === 1000) {
    lastId = transfers[transfers.length - 1].id
    transfers = transfers.concat(...(await fetchTransferSents(
      chain,
      startTime,
      endTime,
      lastId
    )))
  }

  return transfers
}

export async function fetchTransferSentsForTransferId (chain: string, transferId: string) {
  const queryL1TransferId = `
    query TransferSentToL2($transferId: String) {
      transferSents: transferSentToL2S(
        where: {
          id: $transferId
        }
      ) {
        id
        destinationChainId
        amount
        amountOutMin
        relayerFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        transaction {
          to
        }
      }
    }
  `
  const queryL1TxHash = `
    query TransferSentToL2($transferId: String) {
      transferSents: transferSentToL2S(
        where: {
          transactionHash: $transferId
        }
      ) {
        id
        destinationChainId
        amount
        amountOutMin
        relayerFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        transaction {
          to
        }
      }
    }
  `
  const queryL2 = `
    query TransferSents($transferId: String) {
      transferSents: transferSents(
        where: {
          transferId: $transferId
        }
      ) {
        id
        transferId
        destinationChainId
        amount
        amountOutMin
        bonderFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        transaction {
          to
        }
      },
      transferSents2: transferSents(
        where: {
          transactionHash: $transferId
        }
      ) {
        id
        transferId
        destinationChainId
        amount
        amountOutMin
        bonderFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        transaction {
          to
        }
      }
    }
  `
  let url :string
  try {
    url = getSubgraphUrl(chain)
  } catch (err) {
    return []
  }
  let query = transferId.length === 66 ? queryL1TxHash : queryL1TransferId
  if (chain !== 'ethereum') {
    transferId = padHex(transferId)
    query = queryL2
  }
  const data = await queryFetch(url, query, {
    transferId
  })

  const transfers = data.transferSents.concat(data.transferSents2 || [])
    .filter((x: any) => x)
    .map((x: any) => {
      x.destinationChainId = Number(x.destinationChainId)
      return x
    })

  return transfers
}

export async function fetchBondTransferIdEvents (chain: string, startTime: number, endTime: number, lastId?: string) {
  const query = `
    query WithdrawalBondeds($perPage: Int, $startTime: Int, $endTime: Int, $lastId: String) {
      withdrawalBondeds: withdrawalBondeds(
        where: {
          timestamp_gte: $startTime,
          timestamp_lte: $endTime,
          id_gt: $lastId
        },
        first: $perPage,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        transferId
        transactionHash
        timestamp
        token
        from
      }
    }
  `

  let url :string
  try {
    url = getSubgraphUrl(chain)
  } catch (err) {
    return []
  }
  if (!lastId) {
    lastId = '0'
  }
  const data = await queryFetch(url, query, {
    perPage: 1000,
    startTime,
    endTime,
    lastId
  })

  let bonds = data.withdrawalBondeds.filter((x: any) => x)

  if (bonds.length === 1000) {
    lastId = bonds[bonds.length - 1].id
    bonds = bonds.concat(...(await fetchBondTransferIdEvents(
      chain,
      startTime,
      endTime,
      lastId
    )))
  }

  return bonds
}

export async function fetchTransferBonds (chain: string, transferIds: string[]) {
  const query = `
    query WithdrawalBondeds($transferIds: [String]) {
      withdrawalBondeds1: withdrawalBondeds(
        where: {
          transferId_in: $transferIds
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        transferId
        transactionHash
        timestamp
        token
        from
      },
      withdrawalBondeds2: withdrawalBondeds(
        where: {
          transactionHash_in: $transferIds
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc,
      ) {
        id
        transferId
        transactionHash
        timestamp
        token
        from
      }
    }
  `

  transferIds = transferIds?.filter(x => x).map((x: string) => padHex(x)) ?? []
  let url :string
  try {
    url = getSubgraphUrl(chain)
  } catch (err) {
    return []
  }
  let bonds: any = []
  const chunkSize = 1000
  const allChunks = chunk(transferIds, chunkSize)
  for (const _transferIds of allChunks) {
    const data = await queryFetch(url, query, {
      transferIds: _transferIds
    })

    bonds = bonds.concat((data.withdrawalBondeds1 || []).concat(data.withdrawalBondeds2 || []))
  }

  return bonds
}

export async function fetchWithdrews (chain: string, transferIds: string[]) {
  const query = `
    query Withdrews($transferIds: [String]) {
      withdrews(
        where: {
          transferId_in: $transferIds
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        transferId
        transactionHash
        timestamp
        token
        from
      }
    }
  `
  transferIds = transferIds?.filter(x => x).map((x: string) => padHex(x)) ?? []
  let url :string
  try {
    url = getSubgraphUrl(chain)
  } catch (err) {
    return []
  }
  let withdrawals: any = []
  const chunkSize = 1000
  const allChunks = chunk(transferIds, chunkSize)
  for (const _transferIds of allChunks) {
    const data = await queryFetch(url, query, {
      transferIds: _transferIds
    })

    withdrawals = withdrawals.concat(data.withdrews)
  }

  return withdrawals
}

export async function fetchTransferFromL1Completeds (chain: string, startTime: number, endTime: number, lastId = '0') {
  const query = `
    query TransferFromL1Completed($startTime: Int, $endTime: Int, $lastId: ID) {
      events: transferFromL1Completeds(
        where: {
          timestamp_gte: $startTime,
          timestamp_lte: $endTime,
          id_gt: $lastId
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        recipient
        amount
        amountOutMin
        deadline
        transactionHash
        from
        timestamp
      }
    }
  `

  let url :string
  try {
    url = getSubgraphUrl(chain)
  } catch (err) {
    return []
  }
  const data = await queryFetch(url, query, {
    startTime,
    endTime,
    lastId
  })
  let events = data.events || []

  if (events.length === 1000) {
    lastId = events[events.length - 1].id
    events = events.concat(...(await fetchTransferFromL1Completeds(
      chain,
      startTime,
      endTime,
      lastId
    )))
  }

  return events
}

export async function fetchTransferEventsByTransferIds (chain: string, transferIds: string[]) {
  if (chain === 'mainnet' || chain === 'ethereum') {
    return []
  }
  const query = `
    query TransferSents($transferIds: [String]) {
      transferSents: transferSents(
        where: {
          transferId_in: $transferIds
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        transferId
        destinationChainId
        amount
        amountOutMin
        bonderFee
        recipient
        deadline
        transactionHash
        timestamp
        token
        from
        transaction {
          to
        }
      }
    }
  `

  transferIds = transferIds?.filter(x => x).map((x: string) => padHex(x)) ?? []
  let url :string
  try {
    url = getSubgraphUrl(chain)
  } catch (err) {
    return []
  }
  let transferSents: any = []
  const chunkSize = 1000
  const allChunks = chunk(transferIds, chunkSize)
  for (const _transferIds of allChunks) {
    const data = await queryFetch(url, query, {
      transferIds: _transferIds
    })

    transferSents = transferSents.concat(data.transferSents || [])
  }

  return transferSents.filter((x: any) => x)
}

export async function fetchCctpTransferSents (chain: string, startTime: number, endTime: number, lastId?: string) {
  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query CctpTransferSents($perPage: Int, $startTime: Int, $endTime: Int, $lastId: String) {
      cctptransferSents(
        where: {
          block_: {
            timestamp_gte: $startTime,
            timestamp_lte: $endTime,
          },
          id_gt: $lastId
        },
        first: $perPage,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        cctpNonce
        chainId
        recipient
        amount
        bonderFee
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `
  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
    console.log(chain, url)
  } catch (err) {
    return []
  }
  if (!lastId) {
    lastId = '0'
  }
  const data = await queryFetch(url, query, {
    perPage: 1000,
    startTime,
    endTime,
    lastId
  })

  let transfers = data.cctptransferSents
    .filter((x: any) => x)
    .map((x: any) => {
      x.chainId = Number(x.chainId)
      x.destinationChain = x.chainId
      x.destinationChainId = x.chainId
      x.sourceChainId = chainSlugToId(chain)
      x.transferId = `${x.cctpNonce}`
      x.isCctp = true
      return x
    })

  if (transfers.length === 1000) {
    lastId = transfers[transfers.length - 1].id
    transfers = transfers.concat(...(await fetchCctpTransferSents(
      chain,
      startTime,
      endTime,
      lastId
    )))
  }

  return transfers
}

export async function fetchCctpTransferSentsForTxHash (chain: string, txHash: string) {
  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query CctpTransferSentsForTxHash($txHash: String) {
      cctptransferSents: cctptransferSents(
        where: {
          transaction_: {
            hash: $txHash,
          }
        },
      ) {
        id
        cctpNonce
        chainId
        recipient
        amount
        bonderFee
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `
  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
  } catch (err) {
    return []
  }
  const data = await queryFetch(url, query, {
    txHash
  })

  const transfers = data.cctptransferSents
    .filter((x: any) => x)
    .map((x: any) => {
      x.chainId = Number(x.chainId)
      x.destinationChain = x.chainId
      x.destinationChainId = x.chainId
      x.sourceChainId = chainSlugToId(chain)
      x.transferId = `${x.cctpNonce}`
      x.isCctp = true
      return x
    })

  return transfers
}

export async function fetchCctpTransferSentsForTransferId (chain: string, transferId: string) {
  if (transferId.length === 66) {
    return fetchCctpTransferSentsForTxHash(chain, transferId)
  }

  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query CctpTransferSentsForTransferId($cctpNonce: String) {
      cctptransferSents: cctptransferSents(
        where: {
          cctpNonce: $cctpNonce
        },
      ) {
        id
        cctpNonce
        chainId
        recipient
        amount
        bonderFee
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `
  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
  } catch (err) {
    return []
  }
  const data = await queryFetch(url, query, {
    cctpNonce: transferId
  })

  const transfers = data.cctptransferSents
    .filter((x: any) => x)
    .map((x: any) => {
      x.chainId = Number(x.chainId)
      x.destinationChain = x.chainId
      x.destinationChainId = x.chainId
      x.sourceChainId = chainSlugToId(chain)
      x.transferId = `${x.cctpNonce}`
      x.isCctp = true
      return x
    })

  return transfers
}

export async function fetchCctpTransferSentsByTransferIds (chain: string, transferIds: string[]) {
  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query CctpTransferSents($transferIds: [String]) {
      cctptransferSents: cctptransferSents(
        where: {
          cctpNonce_in: $transferIds
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        cctpNonce
        chainId
        recipient
        amount
        bonderFee
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `

  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
  } catch (err) {
    return []
  }
  let transferSents: any = []
  const chunkSize = 1000
  const allChunks = chunk(transferIds.filter(x => !x.startsWith('0x')), chunkSize)
  for (const chunkedTransferIds of allChunks) {
    const data = await queryFetch(url, query, {
      transferIds: chunkedTransferIds
    })

    transferSents = transferSents.concat(data.cctptransferSents || [])
  }

  return transferSents.filter(Boolean).map((x: any) => {
    x.chainId = Number(x.chainId)
    x.destinationChain = x.chainId
    x.destinationChainId = x.chainId
    x.sourceChainId = chainSlugToId(chain)
    x.transferId = `${x.cctpNonce}`
    x.isCctp = true
    return x
  })
}

export async function fetchCctpMessageReceivedsByTxHashes (chain: string, txHashes: string[]) {
  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query CctpMessageReceiveds($txHashes: [String]) {
      cctpmessageReceiveds: cctpmessageReceiveds(
        where: {
          transaction_: {
            hash_in: $txHashes
          }
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc,
      ) {
        id
        address
        sourceDomain
        nonce
        sender
        messageBody
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `

  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
  } catch (err) {
    return []
  }
  let bonds: any = []
  const chunkSize = 1000
  const allChunks = chunk(txHashes, chunkSize)
  for (const chunkedTxHashes of allChunks) {
    const data = await queryFetch(url, query, {
      txHashes: chunkedTxHashes
    })

    bonds = data.cctpmessageReceiveds
  }

  bonds = bonds.map((x: any) => {
    x.isCctp = true
    x.transferId = `${x.nonce}`
    x.sourceChainId = cctpDomainToChainId(x.sourceDomain)
    x.destinationChainId = chainSlugToId(chain)
    return x
  })

  return bonds
}

export async function fetchCctpMessageReceivedsByTransferIds (chain: string, transferIds: string[]) {
  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query CctpMessageReceiveds($transferIds: [String]) {
      cctpmessageReceiveds: cctpmessageReceiveds(
        where: {
          nonce_in: $transferIds
        },
        first: 1000,
        orderBy: id,
        orderDirection: asc,
      ) {
        id
        address
        sourceDomain
        nonce
        sender
        messageBody
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `

  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
  } catch (err) {
    return []
  }
  let bonds: any = []
  const chunkSize = 1000
  const allChunks = chunk(transferIds.filter(x => !x.startsWith('0x')), chunkSize)
  for (const chunkedTransferIds of allChunks) {
    const data = await queryFetch(url, query, {
      transferIds: chunkedTransferIds
    })

    bonds = data.cctpmessageReceiveds
  }

  bonds = bonds.map((x: any) => {
    x.isCctp = true
    x.transferId = `${x.nonce}`
    x.sourceChainId = cctpDomainToChainId(x.sourceDomain)
    x.destinationChainId = chainSlugToId(chain)
    return x
  })

  return bonds
}

export async function fetchMessageReceivedEvents (chain: string, startTime: number, endTime: number, lastId?: string) {
  const supportedChains = ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base']
  if (!supportedChains.includes(chain)) {
    return []
  }

  const query = `
    query MessageReceiveds($perPage: Int, $startTime: Int, $endTime: Int, $lastId: String) {
      cctpmessageReceiveds: cctpmessageReceiveds(
        where: {
          block_: {
            timestamp_gte: $startTime,
            timestamp_lte: $endTime
          },
          id_gt: $lastId
        },
        first: $perPage,
        orderBy: id,
        orderDirection: asc
      ) {
        id
        address
        sourceDomain
        nonce
        sender
        messageBody
        transaction {
          to
          hash
          from
        }
        block {
          timestamp
        }
      }
    }
  `

  let url :string
  try {
    url = getSubgraphUrl(chain)
    if (chain === 'ethereum') {
      url = cctpMainnetSubgraphUrl
    }
  } catch (err) {
    return []
  }
  if (!lastId) {
    lastId = '0'
  }
  const data = await queryFetch(url, query, {
    perPage: 1000,
    startTime,
    endTime,
    lastId
  })

  let bonds = data.cctpmessageReceiveds.filter((x: any) => x)

  if (bonds.length === 1000) {
    lastId = bonds[bonds.length - 1].id
    bonds = bonds.concat(...(await fetchMessageReceivedEvents(
      chain,
      startTime,
      endTime,
      lastId
    )))
  }

  bonds = bonds.map((x: any) => {
    x.transferId = `${x.nonce}`
    x.sourceChainId = cctpDomainToChainId(x.sourceDomain)
    x.destinationChainId = chainSlugToId(chain)
    x.isCctp = true
    return x
  })

  return bonds
}
