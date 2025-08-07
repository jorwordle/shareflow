'use client'

import { useEffect, useState } from 'react'

interface ConnectionIndicatorProps {
  connectionState: RTCPeerConnectionState
  stats?: RTCStatsReport
}

export default function ConnectionIndicator({ connectionState, stats }: ConnectionIndicatorProps) {
  const [quality, setQuality] = useState<'excellent' | 'good' | 'poor'>('good')
  const [latency, setLatency] = useState<number>(0)
  const [bitrate, setBitrate] = useState<number>(0)

  useEffect(() => {
    if (!stats) return

    let totalBitrate = 0
    let totalLatency = 0
    let count = 0

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        if (report.bytesReceived && report.timestamp) {
          totalBitrate += (report.bytesReceived * 8) / 1000
        }
      }
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (report.currentRoundTripTime) {
          totalLatency += report.currentRoundTripTime * 1000
          count++
        }
      }
    })

    if (count > 0) {
      const avgLatency = totalLatency / count
      setLatency(Math.round(avgLatency))
      
      if (avgLatency < 50) {
        setQuality('excellent')
      } else if (avgLatency < 150) {
        setQuality('good')
      } else {
        setQuality('poor')
      }
    }

    setBitrate(Math.round(totalBitrate))
  }, [stats])

  const getConnectionText = () => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting...'
      case 'connected':
        return 'Connected'
      case 'disconnected':
        return 'Disconnected'
      case 'failed':
        return 'Connection Failed'
      case 'closed':
        return 'Connection Closed'
      default:
        return 'Initializing...'
    }
  }

  const getConnectionColor = () => {
    if (connectionState === 'connected') {
      return quality
    }
    if (connectionState === 'connecting') {
      return 'good'
    }
    return 'poor'
  }

  return (
    <div className="fixed top-4 left-4 z-20 glass-effect rounded-lg px-4 py-2 shadow-lg">
      <div className="flex items-center space-x-3">
        <div className={`connection-indicator ${getConnectionColor()}`} />
        <div className="text-sm">
          <div className="font-medium text-gray-900 dark:text-white">
            {getConnectionText()}
          </div>
          {connectionState === 'connected' && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {latency > 0 && <span>{latency}ms</span>}
              {bitrate > 0 && <span className="ml-2">{(bitrate / 1000).toFixed(1)} Mbps</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}