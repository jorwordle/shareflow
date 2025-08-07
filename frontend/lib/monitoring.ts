// Production monitoring and error reporting

interface ErrorReport {
  message: string
  stack?: string
  timestamp: Date
  userAgent: string
  url: string
  connectionState?: string
  roomCode?: string
}

class MonitoringService {
  private errorQueue: ErrorReport[] = []
  private maxQueueSize = 50
  private flushInterval: NodeJS.Timeout | null = null

  constructor() {
    // Set up automatic error reporting
    if (typeof window !== 'undefined') {
      this.setupErrorHandlers()
      this.startFlushInterval()
    }
  }

  private setupErrorHandlers() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.reportError({
        message: event.message,
        stack: event.error?.stack,
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      })
    })

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      })
    })
  }

  private startFlushInterval() {
    // Flush error queue every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushErrors()
    }, 30000)
  }

  reportError(error: ErrorReport) {
    console.error('Error reported:', error)
    
    // Add to queue
    this.errorQueue.push(error)
    
    // Trim queue if too large
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(-this.maxQueueSize)
    }
    
    // Flush immediately for critical errors
    if (error.message.includes('Connection failed') || 
        error.message.includes('Stream stopped unexpectedly')) {
      this.flushErrors()
    }
  }

  private async flushErrors() {
    if (this.errorQueue.length === 0) return
    
    const errors = [...this.errorQueue]
    this.errorQueue = []
    
    try {
      // In production, send to your error monitoring service
      // For now, just log to console
      console.log('Flushing errors to monitoring service:', errors)
      
      // Example: Send to server endpoint
      if (process.env.NEXT_PUBLIC_MONITORING_URL) {
        await fetch(process.env.NEXT_PUBLIC_MONITORING_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errors }),
        }).catch(console.error)
      }
    } catch (error) {
      console.error('Failed to flush errors:', error)
      // Re-add errors to queue if send failed
      this.errorQueue = [...errors, ...this.errorQueue]
    }
  }

  // WebRTC connection monitoring
  monitorConnection(pc: RTCPeerConnection, roomCode: string): () => void {
    const interval = setInterval(async () => {
      try {
        const stats = await pc.getStats()
        let metrics = {
          timestamp: Date.now(),
          roomCode,
          bytesReceived: 0,
          bytesSent: 0,
          packetsLost: 0,
          jitter: 0,
          roundTripTime: 0,
          connectionState: pc.connectionState,
        }
        
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            metrics.bytesReceived += report.bytesReceived || 0
            metrics.packetsLost += report.packetsLost || 0
            metrics.jitter = report.jitter || 0
          }
          
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            metrics.bytesSent += report.bytesSent || 0
          }
          
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            metrics.roundTripTime = report.currentRoundTripTime || 0
          }
        })
        
        // Log metrics for analysis
        this.logMetrics(metrics)
        
        // Alert on poor conditions
        if (metrics.packetsLost > 100 || metrics.roundTripTime > 0.5) {
          this.reportError({
            message: 'Poor connection quality detected',
            timestamp: new Date(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            connectionState: pc.connectionState,
            roomCode,
          })
        }
      } catch (error) {
        console.error('Error monitoring connection:', error)
      }
    }, 10000) // Check every 10 seconds
    
    // Return cleanup function
    return () => clearInterval(interval)
  }

  private logMetrics(metrics: any) {
    // In production, send to metrics service
    if (process.env.NODE_ENV === 'development') {
      console.log('Connection metrics:', metrics)
    }
  }

  // Performance monitoring
  measurePerformance(name: string, fn: () => Promise<any>) {
    return async () => {
      const start = performance.now()
      try {
        const result = await fn()
        const duration = performance.now() - start
        
        // Log performance metrics
        console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`)
        
        // Alert on slow operations
        if (duration > 3000) {
          this.reportError({
            message: `Slow operation detected: ${name} took ${duration.toFixed(2)}ms`,
            timestamp: new Date(),
            userAgent: navigator.userAgent,
            url: window.location.href,
          })
        }
        
        return result
      } catch (error) {
        const duration = performance.now() - start
        this.reportError({
          message: `Operation failed: ${name} after ${duration.toFixed(2)}ms`,
          stack: (error as Error).stack,
          timestamp: new Date(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        })
        throw error
      }
    }
  }

  // Clean up
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    this.flushErrors()
  }
}

// Singleton instance
let monitoringInstance: MonitoringService | null = null

export function getMonitoring(): MonitoringService {
  if (!monitoringInstance) {
    monitoringInstance = new MonitoringService()
  }
  return monitoringInstance
}

// Browser compatibility check
export function checkBrowserCompatibility(): {
  compatible: boolean
  issues: string[]
} {
  const issues: string[] = []
  
  // Check WebRTC support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    issues.push('Screen sharing is not supported in this browser')
  }
  
  if (!window.RTCPeerConnection) {
    issues.push('WebRTC is not supported in this browser')
  }
  
  // Check browser version
  const userAgent = navigator.userAgent
  
  // Chrome/Edge
  if (userAgent.includes('Chrome/') || userAgent.includes('Edg/')) {
    const version = parseInt(userAgent.match(/Chrome\/(\d+)|Edg\/(\d+)/)?.[1] || '0')
    if (version < 90) {
      issues.push('Please update to Chrome/Edge 90 or later for best experience')
    }
  }
  
  // Firefox
  if (userAgent.includes('Firefox/')) {
    const version = parseInt(userAgent.match(/Firefox\/(\d+)/)?.[1] || '0')
    if (version < 88) {
      issues.push('Please update to Firefox 88 or later for best experience')
    }
  }
  
  // Safari
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    const version = parseInt(userAgent.match(/Version\/(\d+)/)?.[1] || '0')
    if (version < 14) {
      issues.push('Please update to Safari 14.1 or later for screen sharing support')
    }
  }
  
  return {
    compatible: issues.length === 0,
    issues,
  }
}

// Network quality detection
export async function detectNetworkQuality(): Promise<{
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  estimatedBandwidth: number
  recommendation: string
}> {
  try {
    // Use Network Information API if available
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection
    
    if (connection) {
      const downlink = connection.downlink || 10 // Mbps
      const effectiveType = connection.effectiveType || '4g'
      
      let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'good'
      let recommendation = '1080p @ 60fps recommended'
      
      if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 1) {
        quality = 'poor'
        recommendation = 'Connection too slow for screen sharing'
      } else if (effectiveType === '3g' || downlink < 3) {
        quality = 'fair'
        recommendation = '360p quality recommended'
      } else if (downlink < 8) {
        quality = 'good'
        recommendation = '720p quality recommended'
      } else {
        quality = 'excellent'
        recommendation = '1080p @ 60fps recommended'
      }
      
      return {
        quality,
        estimatedBandwidth: downlink,
        recommendation,
      }
    }
    
    // Fallback: assume good connection
    return {
      quality: 'good',
      estimatedBandwidth: 10,
      recommendation: '1080p @ 60fps available',
    }
  } catch (error) {
    console.error('Error detecting network quality:', error)
    return {
      quality: 'good',
      estimatedBandwidth: 10,
      recommendation: '1080p @ 60fps available',
    }
  }
}