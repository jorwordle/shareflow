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
    
    // Simply add tracks using addTrack - let WebRTC handle transceiver creation
    for (const track of stream.getTracks()) {
      console.log(`[WebRTC ${this.peerId}] Adding ${track.kind} track: ${track.id}`)
      
      try {
        const sender = this.pc.addTrack(track, stream)
        
        // Configure encoding parameters after adding
        const params = sender.getParameters()
        if (!params.encodings) {
          params.encodings = [{}]
        }
        
        if (track.kind === 'video') {
          params.encodings[0].maxBitrate = 8000000 // 8 Mbps for video
        } else if (track.kind === 'audio') {
          params.encodings[0].maxBitrate = 128000 // 128 kbps for audio
        }
        
        // Only set parameters if the method exists
        if (sender.setParameters) {
          await sender.setParameters(params)
        }
      } catch (error) {
        console.error(`[WebRTC ${this.peerId}] Error adding ${track.kind} track:`, error)
      }
    }
  }
  
  createDataChannel(): RTCDataChannel {
    console.log(`[WebRTC ${this.peerId}] Creating data channel`)
    
    try {
      // Check if data channel already exists
      if (this.dataChannel) {
        console.log(`[WebRTC ${this.peerId}] Data channel already exists`)
        return this.dataChannel
      }
      
      this.dataChannel = this.pc.createDataChannel('chat', {
        ordered: true
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
      
      // Create offer without forcing receive constraints
      const offer = await this.pc.createOffer()
      
      // Don't modify SDP for now - let WebRTC handle it naturally
      await this.pc.setLocalDescription(offer)
      
      return offer
    } catch (error) {
      console.error(`[WebRTC ${this.peerId}] Error creating offer:`, error)
      throw error
    } finally {
      this.makingOffer = false
    }
  }
  
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    console.log(`[WebRTC ${this.peerId}] Handling ${offer.type}`)
    
    try {
      this.isNegotiating = true
      
      if (offer.type === 'offer') {
        await this.pc.setRemoteDescription(offer)
        
        // Process any pending ICE candidates
        await this.processPendingCandidates()
        
        // Create answer
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        
        return answer
      } else if (offer.type === 'answer') {
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