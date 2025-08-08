// Performance monitoring and optimization utilities

export interface PerformanceMetrics {
  fps: number
  bitrate: number
  packetLoss: number
  jitter: number
  roundTripTime: number
  availableBandwidth: number
}

export class PerformanceMonitor {
  private metricsHistory: PerformanceMetrics[] = []
  private maxHistorySize = 30 // Keep 30 seconds of history
  
  async collectMetrics(pc: RTCPeerConnection): Promise<PerformanceMetrics | null> {
    try {
      const stats = await pc.getStats()
      let metrics: PerformanceMetrics = {
        fps: 0,
        bitrate: 0,
        packetLoss: 0,
        jitter: 0,
        roundTripTime: 0,
        availableBandwidth: 0,
      }
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          metrics.fps = report.framesPerSecond || 0
          metrics.bitrate = report.bytesReceived ? (report.bytesReceived * 8) / 1000 : 0
          metrics.jitter = report.jitter || 0
          
          // Calculate packet loss
          const packetsLost = report.packetsLost || 0
          const packetsReceived = report.packetsReceived || 0
          if (packetsReceived > 0) {
            metrics.packetLoss = (packetsLost / (packetsLost + packetsReceived)) * 100
          }
        }
        
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          metrics.roundTripTime = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0
          metrics.availableBandwidth = report.availableOutgoingBitrate || 0
        }
      })
      
      // Add to history
      this.metricsHistory.push(metrics)
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory.shift()
      }
      
      return metrics
    } catch (error) {
      console.error('Error collecting metrics:', error)
      return null
    }
  }
  
  getAverageMetrics(): PerformanceMetrics {
    if (this.metricsHistory.length === 0) {
      return {
        fps: 0,
        bitrate: 0,
        packetLoss: 0,
        jitter: 0,
        roundTripTime: 0,
        availableBandwidth: 0,
      }
    }
    
    const sum = this.metricsHistory.reduce((acc, metrics) => ({
      fps: acc.fps + metrics.fps,
      bitrate: acc.bitrate + metrics.bitrate,
      packetLoss: acc.packetLoss + metrics.packetLoss,
      jitter: acc.jitter + metrics.jitter,
      roundTripTime: acc.roundTripTime + metrics.roundTripTime,
      availableBandwidth: acc.availableBandwidth + metrics.availableBandwidth,
    }))
    
    const count = this.metricsHistory.length
    return {
      fps: sum.fps / count,
      bitrate: sum.bitrate / count,
      packetLoss: sum.packetLoss / count,
      jitter: sum.jitter / count,
      roundTripTime: sum.roundTripTime / count,
      availableBandwidth: sum.availableBandwidth / count,
    }
  }
  
  suggestQualityAdjustment(): 'increase' | 'maintain' | 'decrease' {
    const avgMetrics = this.getAverageMetrics()
    
    // If packet loss is high or RTT is high, decrease quality
    if (avgMetrics.packetLoss > 5 || avgMetrics.roundTripTime > 200) {
      return 'decrease'
    }
    
    // If FPS is low, decrease quality
    if (avgMetrics.fps < 20 && avgMetrics.fps > 0) {
      return 'decrease'
    }
    
    // If everything is good and we have bandwidth, increase quality
    if (avgMetrics.packetLoss < 1 && 
        avgMetrics.roundTripTime < 50 && 
        avgMetrics.fps >= 30 &&
        avgMetrics.availableBandwidth > avgMetrics.bitrate * 1.5) {
      return 'increase'
    }
    
    return 'maintain'
  }
  
  clear() {
    this.metricsHistory = []
  }
}

// Memory management utilities
export class MemoryManager {
  private cleanupInterval: NodeJS.Timeout | null = null
  
  startMonitoring(interval = 30000) { // Check every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, interval)
  }
  
  stopMonitoring() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
  
  private checkMemoryUsage() {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory
      const usedJSHeapSize = memInfo.usedJSHeapSize
      const totalJSHeapSize = memInfo.totalJSHeapSize
      const jsHeapSizeLimit = memInfo.jsHeapSizeLimit
      
      const usagePercent = (usedJSHeapSize / jsHeapSizeLimit) * 100
      
      console.log(`Memory usage: ${Math.round(usagePercent)}% (${Math.round(usedJSHeapSize / 1048576)}MB / ${Math.round(jsHeapSizeLimit / 1048576)}MB)`)
      
      // If memory usage is high, suggest garbage collection
      if (usagePercent > 80) {
        console.warn('High memory usage detected. Consider closing unused connections.')
        this.suggestGarbageCollection()
      }
    }
  }
  
  private suggestGarbageCollection() {
    // Force garbage collection if available (Chrome with --expose-gc flag)
    if (typeof window !== 'undefined' && 'gc' in window) {
      (window as any).gc()
      console.log('Garbage collection triggered')
    }
  }
  
  // Clean up media stream tracks
  static cleanupMediaStream(stream: MediaStream | null) {
    if (!stream) return
    
    stream.getTracks().forEach(track => {
      track.stop()
      track.enabled = false
      // Remove all event listeners
      track.onended = null
      track.onmute = null
      track.onunmute = null
    })
  }
  
  // Clean up video element
  static cleanupVideoElement(video: HTMLVideoElement | null) {
    if (!video) return
    
    video.pause()
    video.srcObject = null
    video.src = ''
    video.load()
    
    // Remove all event listeners
    video.onloadedmetadata = null
    video.onplay = null
    video.onpause = null
    video.onerror = null
  }
}

// Network quality detector
export class NetworkQualityDetector {
  static async testBandwidth(): Promise<number> {
    try {
      // Create a test image URL (1MB)
      const testUrl = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png'
      const startTime = performance.now()
      
      const response = await fetch(testUrl, { cache: 'no-store' })
      const blob = await response.blob()
      
      const endTime = performance.now()
      const duration = (endTime - startTime) / 1000 // Convert to seconds
      const sizeInBits = blob.size * 8
      const bandwidth = sizeInBits / duration / 1000000 // Mbps
      
      return bandwidth
    } catch (error) {
      console.error('Bandwidth test failed:', error)
      return 10 // Default to 10 Mbps
    }
  }
  
  static async testLatency(serverUrl: string): Promise<number> {
    try {
      const startTime = performance.now()
      await fetch(`${serverUrl}/health`, { method: 'HEAD' })
      const endTime = performance.now()
      return endTime - startTime
    } catch (error) {
      console.error('Latency test failed:', error)
      return 100 // Default to 100ms
    }
  }
  
  static async getNetworkQuality(serverUrl: string): Promise<'excellent' | 'good' | 'fair' | 'poor'> {
    const [bandwidth, latency] = await Promise.all([
      this.testBandwidth(),
      this.testLatency(serverUrl),
    ])
    
    if (bandwidth > 10 && latency < 50) return 'excellent'
    if (bandwidth > 5 && latency < 100) return 'good'
    if (bandwidth > 2 && latency < 200) return 'fair'
    return 'poor'
  }
}