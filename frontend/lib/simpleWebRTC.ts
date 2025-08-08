// Simplified WebRTC implementation with proper ICE handling
export class SimpleWebRTCConnection {
  private pc: RTCPeerConnection
  private makingOffer = false
  private ignoreOffer = false
  private isSettingRemoteAnswerPending = false
  private iceCandidateBuffer: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false
  
  public onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null
  public onTrack: ((stream: MediaStream) => void) | null = null
  public onDataChannel: ((channel: RTCDataChannel) => void) | null = null
  public onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null
  public onIceConnectionStateChange: ((state: RTCIceConnectionState) => void) | null = null
  public onNegotiationNeeded: ((offer: RTCSessionDescriptionInit) => void) | null = null
  
  private dataChannel: RTCDataChannel | null = null
  private debugPrefix: string

  constructor(
    public isPolite: boolean,
    private peerId: string
  ) {
    this.debugPrefix = `[WebRTC ${peerId}]`
    
    // Use multiple STUN servers and add a free TURN server
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // Free TURN server (for testing - replace with your own in production)
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
      iceCandidatePoolSize: 10,
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
        console.error(`${this.debugPrefix} ICE connection failed, restarting ICE`)
        this.pc.restartIce()
      }
    }
    
    // Connection state handler
    this.pc.onconnectionstatechange = () => {
      this.onConnectionStateChange?.(this.pc.connectionState)
    }
    
    // Track handler
    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onTrack?.(event.streams[0])
      }
    }
    
    // Data channel handler
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel
      this.setupDataChannel(event.channel)
      this.onDataChannel?.(event.channel)
    }
    
    // Negotiation needed handler - only for impolite peer (host)
    this.pc.onnegotiationneeded = async () => {
      // Only create offers if we're the impolite peer (host)
      if (!this.isPolite) {
        try {
          this.makingOffer = true
          await this.pc.setLocalDescription()
          this.onNegotiationNeeded?.(this.pc.localDescription!)
        } catch (error) {
          console.error(`${this.debugPrefix} Error creating offer:`, error)
        } finally {
          this.makingOffer = false
        }
      }
    }
    
    // Signaling state change handler
    this.pc.onsignalingstatechange = () => {
      // Only log errors
      if (this.pc.signalingState === 'closed') {
        console.error(`${this.debugPrefix} Signaling state closed unexpectedly`)
      }
    }
  }
  
  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {}
    channel.onclose = () => {}
    channel.onerror = (error) => {
      console.error(`${this.debugPrefix} Data channel error:`, error)
    }
  }
  
  createDataChannel(): RTCDataChannel {
    this.dataChannel = this.pc.createDataChannel('chat', {
      ordered: true,
    })
    this.setupDataChannel(this.dataChannel)
    return this.dataChannel
  }
  
  async addStream(stream: MediaStream) {
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream)
    }
  }
  
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    try {
      // Perfect negotiation pattern
      const offerCollision = 
        offer.type === 'offer' && 
        (this.makingOffer || this.pc.signalingState !== 'stable')
      
      this.ignoreOffer = !this.isPolite && offerCollision
      
      if (this.ignoreOffer) {
        return null
      }
      
      if (offer.type === 'offer') {
        await this.pc.setRemoteDescription(offer)
        this.remoteDescriptionSet = true
        
        // Process buffered ICE candidates
        await this.processIceCandidateBuffer()
        
        await this.pc.setLocalDescription()
        return this.pc.localDescription!
      } else if (offer.type === 'answer') {
        await this.pc.setRemoteDescription(offer)
        this.remoteDescriptionSet = true
        
        // Process buffered ICE candidates
        await this.processIceCandidateBuffer()
        
        return null
      }
    } catch (error) {
      console.error(`${this.debugPrefix} Error handling ${offer.type}:`, error)
      return null
    }
    
    return null
  }
  
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    // Buffer candidates if remote description not set yet
    if (!this.remoteDescriptionSet) {
      this.iceCandidateBuffer.push(candidate)
      return
    }
    
    try {
      await this.pc.addIceCandidate(candidate)
    } catch (error) {
      // Ignore errors if connection is being closed
      if (this.pc.connectionState !== 'closed') {
        console.error(`${this.debugPrefix} Error adding ICE candidate:`, error)
      }
    }
  }
  
  private async processIceCandidateBuffer() {
    if (this.iceCandidateBuffer.length > 0) {
      for (const candidate of this.iceCandidateBuffer) {
        try {
          await this.pc.addIceCandidate(candidate)
        } catch (error) {
          console.error(`${this.debugPrefix} Error adding buffered ICE candidate:`, error)
        }
      }
      
      this.iceCandidateBuffer = []
    }
  }
  
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    return offer
  }
  
  sendMessage(message: string): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(message)
      return true
    }
    return false
  }
  
  getStats() {
    return this.pc.getStats()
  }
  
  close() {
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