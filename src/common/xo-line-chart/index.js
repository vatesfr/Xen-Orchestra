import ChartistGraph from 'react-chartist'
import ChartistLegend from 'chartist-plugin-legend'
import ChartistTooltip from 'chartist-plugin-tooltip'
import React from 'react'
import { injectIntl } from 'react-intl'
import { messages } from 'intl'
import { find, flatten, floor, map, max, size, sum, values } from 'lodash'

import propTypes from '../prop-types-decorator'
import { computeArraysSum } from '../xo-stats'
import { formatSize } from '../utils'

import styles from './index.css'

// Number of labels on axis X.
const N_LABELS_X = 5

const LABEL_OFFSET_X = 40
const LABEL_OFFSET_Y = 85

// ===================================================================

// See xo-stats.js, data can be null.
// Return the size of the first non-null object.
const getStatsLength = stats => size(find(stats, stats => stats != null))

// ===================================================================

const makeOptions = ({
  intl,
  nValues,
  endTimestamp,
  interval,
  valueTransform,
}) => ({
  showPoint: true,
  lineSmooth: false,
  showArea: true,
  height: 300,
  low: 0,
  axisX: {
    labelInterpolationFnc: makeLabelInterpolationFnc(
      intl,
      nValues,
      endTimestamp,
      interval
    ),
    offset: LABEL_OFFSET_X,
  },
  axisY: {
    labelInterpolationFnc: valueTransform,
    offset: LABEL_OFFSET_Y,
  },
  plugins: [
    ChartistLegend(),
    ChartistTooltip({
      valueTransform: value => valueTransform(+value), // '+value' because tooltip gives a string value...
    }),
  ],
})

// ===================================================================

const makeLabelInterpolationFnc = (intl, nValues, endTimestamp, interval) => {
  const labelSpace = floor(nValues / N_LABELS_X)
  let format

  if (interval === 3600) {
    format = {
      minute: 'numeric',
      hour: 'numeric',
      weekday: 'short',
    }
  } else if (interval === 86400) {
    format = {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }
  }

  return (value, index) =>
    index % labelSpace === 0
      ? intl.formatTime(
        (endTimestamp - (nValues - index - 1) * interval) * 1000,
        format
      )
      : null
}

// Supported series: xvds, vifs, pifs.
const buildSeries = ({ stats, label, addSumSeries }) => {
  const series = []

  for (const io in stats) {
    const ioData = stats[io]
    for (const letter in ioData) {
      const data = ioData[letter]

      // See xo-stats.js, data can be null.
      if (data) {
        series.push({
          name: `${label}${letter} (${io})`,
          data,
        })
      }
    }

    if (addSumSeries) {
      series.push({
        name: `All ${io}`,
        data: computeArraysSum(values(ioData)),
        className: styles.dashedLine,
      })
    }
  }

  return series
}

const templateError = <div>No stats.</div>

// ===================================================================

export const CpuLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const stats = data.stats.cpus
    const length = getStatsLength(stats)

    if (!length) {
      return templateError
    }

    const series = map(stats, (data, id) => ({
      name: `Cpu${id}`,
      data,
    }))

    if (addSumSeries) {
      series.push({
        name: 'All Cpus',
        data: computeArraysSum(stats),
        className: styles.dashedLine,
      })
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series,
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: data.endTimestamp,
            interval: data.interval,
            valueTransform: value => `${floor(value)}%`,
          }),
          high: !addSumSeries ? 100 : stats.length * 100,
          ...options,
        }}
      />
    )
  })
)

export const PoolCpuLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const firstHostData = data[0]
    const length = getStatsLength(firstHostData.stats.cpus)

    if (!length) {
      return templateError
    }

    const series = map(data, ({ host, stats }) => ({
      name: host,
      data: computeArraysSum(stats.cpus),
    }))

    if (addSumSeries) {
      series.push({
        name: intl.formatMessage(messages.poolAllHosts),
        data: computeArraysSum(map(series, 'data')),
        className: styles.dashedLine,
      })
    }

    const nbCpusByHost = map(data, ({ stats }) => stats.cpus.length)

    return (
      <ChartistGraph
        type='Line'
        data={{
          series,
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: firstHostData.endTimestamp,
            interval: firstHostData.interval,
            valueTransform: value => `${floor(value)}%`,
          }),
          high: 100 * (addSumSeries ? sum(nbCpusByHost) : max(nbCpusByHost)),
          ...options,
        }}
      />
    )
  })
)

export const MemoryLineChart = injectIntl(
  propTypes({
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ data, options = {}, intl }) => {
    const { memory, memoryUsed } = data.stats

    if (!memory || !memoryUsed) {
      return templateError
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series: [
            {
              name: 'RAM',
              data: memoryUsed,
            },
          ],
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: memoryUsed.length,
            endTimestamp: data.endTimestamp,
            interval: data.interval,
            valueTransform: formatSize,
          }),
          high: memory[memory.length - 1],
          ...options,
        }}
      />
    )
  })
)

export const PoolMemoryLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const firstHostData = data[0]
    const { memory, memoryUsed } = firstHostData.stats

    if (!memory || !memoryUsed) {
      return templateError
    }

    const series = map(data, ({ host, stats }) => ({
      name: host,
      data: stats.memoryUsed,
    }))

    if (addSumSeries) {
      series.push({
        name: intl.formatMessage(messages.poolAllHosts),
        data: computeArraysSum(map(data, 'stats.memoryUsed')),
        className: styles.dashedLine,
      })
    }

    const currentMemoryByHost = map(
      data,
      ({ stats }) => stats.memory[stats.memory.length - 1]
    )

    return (
      <ChartistGraph
        type='Line'
        data={{
          series,
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: firstHostData.stats.memoryUsed.length,
            endTimestamp: firstHostData.endTimestamp,
            interval: firstHostData.interval,
            valueTransform: formatSize,
          }),
          high: addSumSeries
            ? sum(currentMemoryByHost)
            : max(currentMemoryByHost),
          ...options,
        }}
      />
    )
  })
)

export const XvdLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const stats = data.stats.xvds
    const length = stats && getStatsLength(stats.r)

    if (!length) {
      return templateError
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series: buildSeries({ addSumSeries, stats, label: 'Xvd' }),
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: data.endTimestamp,
            interval: data.interval,
            valueTransform: formatSize,
          }),
          ...options,
        }}
      />
    )
  })
)

export const VifLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const stats = data.stats.vifs
    const length = stats && getStatsLength(stats.rx)

    if (!length) {
      return templateError
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series: buildSeries({ addSumSeries, stats, label: 'Vif' }),
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: data.endTimestamp,
            interval: data.interval,
            valueTransform: formatSize,
          }),
          ...options,
        }}
      />
    )
  })
)

export const PifLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const stats = data.stats.pifs
    const length = stats && getStatsLength(stats.rx)

    if (!length) {
      return templateError
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series: buildSeries({ addSumSeries, stats, label: 'Pif' }),
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: data.endTimestamp,
            interval: data.interval,
            valueTransform: formatSize,
          }),
          ...options,
        }}
      />
    )
  })
)

const ios = ['rx', 'tx']
export const PoolPifLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const firstHostData = data[0]
    const length =
      firstHostData.stats && getStatsLength(firstHostData.stats.pifs.rx)

    if (!length) {
      return templateError
    }

    const series = addSumSeries
      ? map(ios, io => ({
        name: `${intl.formatMessage(messages.poolAllHosts)} (${io})`,
        data: computeArraysSum(
          map(data, ({ stats }) => computeArraysSum(stats.pifs[io]))
        ),
      }))
      : flatten(
        map(data, ({ stats, host }) =>
          map(ios, io => ({
            name: `${host} (${io})`,
            data: computeArraysSum(stats.pifs[io]),
          }))
        )
      )

    return (
      <ChartistGraph
        type='Line'
        data={{
          series,
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: firstHostData.endTimestamp,
            interval: firstHostData.interval,
            valueTransform: formatSize,
          }),
          ...options,
        }}
      />
    )
  })
)

export const LoadLineChart = injectIntl(
  propTypes({
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ data, options = {}, intl }) => {
    const stats = data.stats.load
    const { length } = stats || {}

    if (!length) {
      return templateError
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series: [
            {
              name: 'Load average',
              data: stats,
            },
          ],
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: data.endTimestamp,
            interval: data.interval,
            valueTransform: value => `${value.toPrecision(3)}`,
          }),
          ...options,
        }}
      />
    )
  })
)

export const PoolLoadLineChart = injectIntl(
  propTypes({
    addSumSeries: propTypes.bool,
    data: propTypes.object.isRequired,
    options: propTypes.object,
  })(({ addSumSeries, data, options = {}, intl }) => {
    const firstHostData = data[0]
    const length = firstHostData.stats && firstHostData.stats.load.length

    if (!length) {
      return templateError
    }

    const series = map(data, ({ host, stats }) => ({
      name: host,
      data: stats.load,
    }))

    if (addSumSeries) {
      series.push({
        name: intl.formatMessage(messages.poolAllHosts),
        data: computeArraysSum(map(data, 'stats.load')),
        className: styles.dashedLine,
      })
    }

    return (
      <ChartistGraph
        type='Line'
        data={{
          series,
        }}
        options={{
          ...makeOptions({
            intl,
            nValues: length,
            endTimestamp: firstHostData.endTimestamp,
            interval: firstHostData.interval,
            valueTransform: value => `${value.toPrecision(3)}`,
          }),
          ...options,
        }}
      />
    )
  })
)
