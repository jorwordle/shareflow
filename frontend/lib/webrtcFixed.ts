// Fixed WebRTC implementation with proper SDP handling and audio support
export class FixedWebRTCConnection {
  private pc: RTCPeerConnection
  private dataChannel: RTCDataChannel | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private isNegotiating = false
  private makingOffer = false
  
  public onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null
  public onTrack: ((stream: MediaStream) => void) | null = null
  public onDataChannel: ((channel: RTCDataChannel) => void) | null = null
  public onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null
  public onIceConnectionStateChange: ((state: RTCIceConnectionState) => void) | null = null
  
  constructor(
    public readonly isPolite: boolean,
    private readonly peerId: string
  ) {
    // Use a consistent configuration with proper TURN servers
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Free TURN servers for NAT traversal
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        }
      ],
      iceCandidatePoolSize: 10
    })
    
    this.setupEventHandlers()
  }
  
  private setupEventHandlers() {
    // ICE candidate handler
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(event.candidate.toJSON())
      }
    }
    
    // ICE connection state handler
    this.pc.oniceconnectionstatechange = () => {
      this.onIceConnectionStateChange?.(this.pc.iceConnectionState)
      
      if (this.pc.iceConnectionState === 'failed') {
        console.error(`[WebRTC ${this.peerId}] ICE connection failed, restarting ICE`)
        this.pc.restartIce()
      }
    }
    
    // Connection state handler
    this.pc.onconnectionstatechange = () => {
      this.onConnectionStateChange?.(this.pc.connectionState)
    }
    
    // Track handler for receiving remote streams
    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        console.log(`[WebRTC ${this.peerId}] Received track: ${event.track.kind}`)
        this.onTrack?.(event.streams[0])
      }
    }
    
    // Data channel handler for receiving channels
    this.pc.ondatachannel = (event) => {
      console.log(`[WebRTC ${this.peerId}] Received data channel: ${event.channel.label}`)
      this.dataChannel = event.channel
      this.setupDataChannelHandlers(event.channel)
      this.onDataChannel?.(event.channel)
    }
    
    // Negotiation needed - but we'll control this manually to avoid issues
    this.pc.onnegotiationneeded = async () => {
      // Prevent negotiation loops
      if (this.isNegotiating) {
        console.log(`[WebRTC ${this.peerId}] Already negotiating, skipping`)
        return
      }
      
      console.log(`[WebRTC ${this.peerId}] Negotiation needed, but will be handled manually`)
    }
  }
  
  private setupDataChannelHandlers(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log(`[WebRTC ${this.peerId}] Data channel opened: ${channel.label}`)
    }
    
    channel.onclose = () => {
      console.log(`[WebRTC ${this.peerId}] Data channel closed: ${channel.label}`)
    }
    
    channel.onerror = (error) => {
      console.error(`[WebRTC ${this.peerId}] Data channel error:`, error)
    }
    
    channel.onmessage = (event) => {
      // Message handling is done by the parent component
    }
  }
  
  async addStream(stream: MediaStream) {
    console.log(`[WebRTC ${this.peerId}] Adding stream with ${stream.getTracks().length} tracks`)
    
    // Remove any existing senders to avoid duplicates
    const senders = this.pc.getSenders()
    for (const sender of senders) {
      if (sender.track) {
        this.pc.removeTrack(sender)
      }
    }
    
    // Add new tracks with proper transceiver configuration
    for (const track of stream.getTracks()) {
      console.log(`[WebRTC ${this.peerId}] Adding ${track.kind} track: ${track.id}`)
      
      // Use addTransceiver for better control over SDP
      if (track.kind === 'video') {
        const transceiver = this.pc.addTransceiver(track, {
          direction: 'sendonly',
          streams: [stream],
          sendEncodings: [
            {
              maxBitrate: 8000000, // 8 Mbps for video
            }
          ]
        })
      } else if (track.kind === 'audio') {
        const transceiver = this.pc.addTransceiver(track, {
          direction: 'sendonly',
          streams: [stream],
          sendEncodings: [
            {
              maxBitrate: 128000, // 128 kbps for audio
            }
          ]
        })
      }
    }
  }
  
  createDataChannel(): RTCDataChannel {
    // Create data channel before any media to ensure consistent SDP ordering
    console.log(`[WebRTC ${this.peerId}] Creating data channel`)
    
    try {
      this.dataChannel = this.pc.createDataChannel('chat', {
        ordered: true,
        // Don't set maxPacketLifeTime or maxRetransmits to avoid conflicts
      })
      
      this.setupDataChannelHandlers(this.dataChannel)
      return this.dataChannel
    } catch (error) {
      console.error(`[WebRTC ${this.peerId}] Error creating data channel:`, error)
      throw error
    }
  }
  
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    console.log(`[WebRTC ${this.peerId}] Creating offer`)
    
    try {
      this.makingOffer = true
      this.isNegotiating = true
      
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false, // We're sending, not receiving
        offerToReceiveVideo: false, // We're sending, not receiving
      })
      
      // Fix SDP to ensure consistent m-line ordering
      if (offer.sdp) {
        offer.sdp = this.fixSdpMlineOrder(offer.sdp)
      }
      
      await this.pc.setLocalDescription(offer)
      
      return offer
    } finally {
      this.makingOffer = false
    }
  }
  
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    console.log(`[WebRTC ${this.peerId}] Handling ${offer.type}`)
    
    try {
      this.isNegotiating = true
      
      if (offer.type === 'offer') {
        // Fix SDP before setting
        if (offer.sdp) {
          offer.sdp = this.fixSdpMlineOrder(offer.sdp)
        }
        
        await this.pc.setRemoteDescription(offer)
        
        // Process any pending ICE candidates
        await this.processPendingCandidates()
        
        // Create answer
        const answer = await this.pc.createAnswer()
        
        // Fix answer SDP
        if (answer.sdp) {
          answer.sdp = this.fixSdpMlineOrder(answer.sdp)
        }
        
        await this.pc.setLocalDescription(answer)
        
        return answer
      } else if (offer.type === 'answer') {
        // Fix SDP before setting
        if (offer.sdp) {
          offer.sdp = this.fixSdpMlineOrder(offer.sdp)
        }
        
        await this.pc.setRemoteDescription(offer)
        
        // Process any pending ICE candidates
        await this.processPendingCandidates()
        
        return null
      }
    } catch (error) {
      console.error(`[WebRTC ${this.peerId}] Error handling ${offer.type}:`, error)
      throw error
    } finally {
      this.isNegotiating = false
    }
    
    return null
  }
  
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    // If no remote description yet, queue the candidate
    if (!this.pc.remoteDescription) {
      console.log(`[WebRTC ${this.peerId}] Queueing ICE candidate (no remote description yet)`)
      this.pendingCandidates.push(candidate)
      return
    }
    
    try {
      await this.pc.addIceCandidate(candidate)
    } catch (error) {
      // Ignore errors if connection is closing
      if (this.pc.connectionState !== 'closed') {
        console.error(`[WebRTC ${this.peerId}] Error adding ICE candidate:`, error)
      }
    }
  }
  
  private async processPendingCandidates() {
    if (this.pendingCandidates.length > 0) {
      console.log(`[WebRTC ${this.peerId}] Processing ${this.pendingCandidates.length} pending ICE candidates`)
      
      for (const candidate of this.pendingCandidates) {
        try {
          await this.pc.addIceCandidate(candidate)
        } catch (error) {
          console.error(`[WebRTC ${this.peerId}] Error adding pending ICE candidate:`, error)
        }
      }
      
      this.pendingCandidates = []
    }
  }
  
  private fixSdpMlineOrder(sdp: string): string {
    // Parse SDP into lines
    const lines = sdp.split('\r\n')
    const mediaBlocks: { [key: string]: string[] } = {}
    let currentMedia = 'session'
    let currentBlock: string[] = []
    
    for (const line of lines) {
      if (line.startsWith('m=')) {
        // Save previous block
        if (currentBlock.length > 0) {
          if (!mediaBlocks[currentMedia]) {
            mediaBlocks[currentMedia] = []
          }
          mediaBlocks[currentMedia] = currentBlock
        }
        
        // Start new media block
        currentMedia = line.split(' ')[0].substring(2) // Get media type (audio, video, application)
        currentBlock = [line]
      } else if (line !== '') {
        currentBlock.push(line)
      }
    }
    
    // Save last block
    if (currentBlock.length > 0) {
      mediaBlocks[currentMedia] = currentBlock
    }
    
    // Reconstruct SDP with consistent ordering: application (data), audio, video
    const orderedSdp: string[] = []
    
    // Add session block
    if (mediaBlocks['session']) {
      orderedSdp.push(...mediaBlocks['session'])
    }
    
    // Add media blocks in consistent order
    const mediaOrder = ['application', 'audio', 'video']
    for (const mediaType of mediaOrder) {
      if (mediaBlocks[mediaType]) {
        orderedSdp.push(...mediaBlocks[mediaType])
      }
    }
    
    // Add empty line at the end
    orderedSdp.push('')
    
    return orderedSdp.join('\r\n')
  }
  
  sendMessage(message: string): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(message)
        return true
      } catch (error) {
        console.error(`[WebRTC ${this.peerId}] Error sending message:`, error)
        return false
      }
    }
    return false
  }
  
  close() {
    console.log(`[WebRTC ${this.peerId}] Closing connection`)
    
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    
    this.pc.close()
  }
  
  getConnectionState() {
    return {
      connectionState: this.pc.connectionState,
      iceConnectionState: this.pc.iceConnectionState,
      signalingState: this.pc.signalingState,
      iceGatheringState: this.pc.iceGatheringState,
    }
  }
}