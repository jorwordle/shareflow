import { StreamQuality } from '@/types'

// Extend RTCRtpEncodingParameters with browser-supported properties
interface ExtendedRTCRtpEncodingParameters extends RTCRtpEncodingParameters {
  maxFramerate?: number
}

// Enhanced ICE servers including TURN for firewall traversal
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Add TURN servers if available (recommended for production)
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  }] : []),
]

export const QUALITY_PRESETS: Record<StreamQuality['resolution'], Partial<MediaTrackConstraints>> = {
  '360p': {
    width: { ideal: 640, max: 640 },
    height: { ideal: 360, max: 360 },
    frameRate: { ideal: 30, max: 30 },
  },
  '720p': {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
  '1080p': {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 60, max: 60 },
  },
}

// Bandwidth limits for each quality preset (in bits per second)
const BITRATE_LIMITS: Record<StreamQuality['resolution'], number> = {
  '360p': 800000,    // 800 Kbps
  '720p': 2500000,   // 2.5 Mbps
  '1080p': 8000000,  // 8 Mbps
}

export class WebRTCConnection {
  private pc: RTCPeerConnection
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private dataChannel: RTCDataChannel | null = null
  private quality: StreamQuality['resolution'] = '1080p'
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private statsInterval: NodeJS.Timeout | null = null
  private connectionTimeout: NodeJS.Timeout | null = null

  constructor(
    private onIceCandidate: (candidate: RTCIceCandidate) => void,
    private onTrack?: (stream: MediaStream) => void,
    private onDataChannel?: (channel: RTCDataChannel) => void,
    private onConnectionStateChange?: (state: RTCPeerConnectionState) => void,
    private onError?: (error: Error) => void
  ) {
    this.pc = this.createPeerConnection()
    this.setupEventListeners()
    this.startConnectionTimeout()
  }

  private createPeerConnection(): RTCPeerConnection {
    return new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all', // Use 'relay' to force TURN
    })
  }

  private startConnectionTimeout() {
    this.connectionTimeout = setTimeout(() => {
      if (this.pc.connectionState !== 'connected') {
        console.warn('Connection timeout - attempting reconnection')
        this.handleConnectionFailure()
      }
    }, 30000) // 30 second timeout
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
  }

  private setupEventListeners() {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(event.candidate)
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.pc.iceConnectionState)
      
      if (this.pc.iceConnectionState === 'failed') {
        this.handleConnectionFailure()
      } else if (this.pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (this.pc.iceConnectionState === 'disconnected') {
            this.handleConnectionFailure()
          }
        }, 5000) // Wait 5 seconds before attempting reconnection
      }
    }

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0]
        this.onTrack?.(event.streams[0])
        
        // Monitor track health
        event.track.onended = () => {
          console.log('Remote track ended')
        }
        
        event.track.onmute = () => {
          console.log('Remote track muted')
        }
      }
    }

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel
      this.setupDataChannelHandlers(event.channel)
      this.onDataChannel?.(event.channel)
    }

    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc.connectionState)
      this.onConnectionStateChange?.(this.pc.connectionState)
      
      if (this.pc.connectionState === 'connected') {
        this.clearConnectionTimeout()
        this.reconnectAttempts = 0
        this.startStatsMonitoring()
      } else if (this.pc.connectionState === 'failed') {
        this.handleConnectionFailure()
      }
    }
  }

  private handleConnectionFailure() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      // Restart ICE
      this.pc.restartIce()
      
      // Notify error handler
      this.onError?.(new Error(`Connection failed, attempting reconnection ${this.reconnectAttempts}`))
    } else {
      console.error('Max reconnection attempts reached')
      this.onError?.(new Error('Connection failed after maximum retry attempts'))
      this.close()
    }
  }

  private setupDataChannelHandlers(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('Data channel opened')
    }
    
    channel.onerror = (error) => {
      console.error('Data channel error:', error)
    }
    
    channel.onclose = () => {
      console.log('Data channel closed')
    }
  }

  private startStatsMonitoring() {
    if (this.statsInterval) return
    
    this.statsInterval = setInterval(async () => {
      try {
        const stats = await this.pc.getStats()
        let hasActiveConnection = false
        
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            hasActiveConnection = true
            
            // Log connection quality metrics
            if (report.currentRoundTripTime && report.currentRoundTripTime > 0.3) {
              console.warn(`High RTT detected: ${report.currentRoundTripTime}s`)
            }
          }
          
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            // Monitor packet loss
            if (report.packetsLost && report.packetsReceived) {
              const lossRate = report.packetsLost / (report.packetsLost + report.packetsReceived)
              if (lossRate > 0.05) { // 5% packet loss threshold
                console.warn(`High packet loss detected: ${(lossRate * 100).toFixed(2)}%`)
              }
            }
          }
        })
        
        if (!hasActiveConnection && this.pc.connectionState === 'connected') {
          console.warn('No active candidate pair despite connected state')
        }
      } catch (error) {
        console.error('Error getting stats:', error)
      }
    }, 5000) // Check every 5 seconds
  }

  async startScreenShare(quality: StreamQuality['resolution'] = '1080p') {
    try {
      const constraints = QUALITY_PRESETS[quality]
      
      // Request screen capture with system audio if supported
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          ...constraints,
          cursor: 'always',
          displaySurface: 'monitor', // Prefer full screen
        } as MediaTrackConstraints,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints | boolean,
      }).catch(async (error) => {
        // Fallback without audio if not supported
        console.warn('Audio capture not supported, falling back to video only')
        return navigator.mediaDevices.getDisplayMedia({
          video: {
            ...constraints,
            cursor: 'always',
          } as MediaTrackConstraints,
          audio: false,
        })
      })

      this.localStream = stream
      this.quality = quality

      // Add tracks with proper encoding parameters
      for (const track of stream.getTracks()) {
        const sender = this.pc.addTrack(track, stream)
        
        if (track.kind === 'video') {
          // Set content hint for better encoding
          if ('contentHint' in track) {
            (track as any).contentHint = quality === '1080p' ? 'detail' : 'motion'
          }
          
          // Configure encoding parameters
          await this.configureVideoEncoding(sender, quality)
        }
      }

      this.createDataChannel()

      // Handle stream ending
      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen share ended by user')
        this.stopScreenShare()
      }

      return stream
    } catch (error) {
      console.error('Error starting screen share:', error)
      this.onError?.(error as Error)
      throw error
    }
  }

  private async configureVideoEncoding(sender: RTCRtpSender, quality: StreamQuality['resolution']) {
    if (!sender.setParameters) return
    
    try {
      const params = sender.getParameters()
      
      if (!params.encodings) {
        params.encodings = [{}]
      }
      
      // Use extended type for encoding parameters
      const encoding = params.encodings[0] as ExtendedRTCRtpEncodingParameters
      
      // Set bitrate limit
      encoding.maxBitrate = BITRATE_LIMITS[quality]
      
      // Enable scalability for better adaptation with framerate control
      if (quality === '1080p') {
        encoding.scaleResolutionDownBy = 1
        encoding.maxFramerate = 60
      } else if (quality === '720p') {
        encoding.scaleResolutionDownBy = 1.5
        encoding.maxFramerate = 30
      } else {
        encoding.scaleResolutionDownBy = 3
        encoding.maxFramerate = 30
      }
      
      await sender.setParameters(params)
    } catch (error) {
      console.error('Error configuring video encoding:', error)
    }
  }

  private createDataChannel() {
    this.dataChannel = this.pc.createDataChannel('chat', {
      ordered: true,
      maxRetransmits: 3,
      maxPacketLifeTime: 3000, // 3 seconds
    })
    
    this.setupDataChannelHandlers(this.dataChannel)
  }

  async createOffer() {
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      })

      // Modify SDP for better quality
      offer.sdp = this.optimizeSDP(offer.sdp || '')

      await this.pc.setLocalDescription(offer)
      return offer
    } catch (error) {
      console.error('Error creating offer:', error)
      this.onError?.(error as Error)
      throw error
    }
  }

  async createAnswer() {
    try {
      const answer = await this.pc.createAnswer()
      
      // Modify SDP for better quality
      answer.sdp = this.optimizeSDP(answer.sdp || '')
      
      await this.pc.setLocalDescription(answer)
      return answer
    } catch (error) {
      console.error('Error creating answer:', error)
      this.onError?.(error as Error)
      throw error
    }
  }

  private optimizeSDP(sdp: string): string {
    // Prefer H.264 codec for better hardware support
    sdp = sdp.replace(/m=video (\d+) ([A-Z/]+) ([\d ]+)/g, (match, port, proto, formats) => {
      // Move H.264 to the front if available
      const formatList = formats.split(' ')
      const h264Formats = formatList.filter((f: string) => f === '102' || f === '127')
      const otherFormats = formatList.filter((f: string) => f !== '102' && f !== '127')
      const reorderedFormats = [...h264Formats, ...otherFormats].join(' ')
      return `m=video ${port} ${proto} ${reorderedFormats}`
    })
    
    // Increase bandwidth for video
    if (this.quality === '1080p') {
      sdp = sdp.replace(/b=AS:[\d]+/g, 'b=AS:8000')
    }
    
    return sdp
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    try {
      await this.pc.setRemoteDescription(description)
    } catch (error) {
      console.error('Error setting remote description:', error)
      this.onError?.(error as Error)
      throw error
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate)
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
      // Don't throw here as some candidates might fail naturally
    }
  }

  sendMessage(message: string): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(message)
        return true
      } catch (error) {
        console.error('Error sending message:', error)
        return false
      }
    }
    return false
  }

  async changeQuality(newQuality: StreamQuality['resolution']) {
    if (!this.localStream) return

    const videoTrack = this.localStream.getVideoTracks()[0]
    if (!videoTrack) return

    try {
      const constraints = QUALITY_PRESETS[newQuality]
      await videoTrack.applyConstraints(constraints)
      
      if ('contentHint' in videoTrack) {
        (videoTrack as any).contentHint = newQuality === '1080p' ? 'detail' : 'motion'
      }

      this.quality = newQuality

      // Update encoding parameters
      const sender = this.pc.getSenders().find(
        (s) => s.track && s.track.kind === 'video'
      )

      if (sender) {
        await this.configureVideoEncoding(sender, newQuality)
      }
    } catch (error) {
      console.error('Error changing quality:', error)
      this.onError?.(error as Error)
    }
  }

  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop()
        this.pc.removeTrack(
          this.pc.getSenders().find(s => s.track === track)!
        )
      })
      this.localStream = null
    }
  }

  getConnectionStats() {
    return this.pc.getStats()
  }

  close() {
    this.clearConnectionTimeout()
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
    
    this.stopScreenShare()
    
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    
    this.pc.close()
  }

  getConnectionState() {
    return {
      iceConnectionState: this.pc.iceConnectionState,
      connectionState: this.pc.connectionState,
      signalingState: this.pc.signalingState,
    }
  }

  // Method to handle network changes
  async handleNetworkChange() {
    if (this.pc.connectionState === 'connected') {
      console.log('Network change detected, restarting ICE')
      this.pc.restartIce()
    }
  }
}