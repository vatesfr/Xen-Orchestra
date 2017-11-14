import { forEach, includes, map } from 'lodash'

export const getDefaultNetworkForVif = (vif, destHost, pifs, networks) => {
  const originNetwork = networks[vif.$network]
  const originVlans = map(originNetwork.PIFs, pifId => pifs[pifId].vlan)

  let destNetworkId = pifs[destHost.$PIFs[0]].$network

  forEach(destHost.$PIFs, pifId => {
    const { $network, vlan } = pifs[pifId]

    if (networks[$network].name_label === originNetwork.name_label) {
      destNetworkId = $network

      return false
    }

    if (vlan !== -1 && includes(originVlans, vlan)) {
      destNetworkId = $network
    }
  })

  return destNetworkId
}
