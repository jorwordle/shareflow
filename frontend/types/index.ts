export interface User {
  id: string
  name: string
  isHost?: boolean
}

export interface Room {
  id: string
  code: string
  hostId: string
  viewers: User[]
  createdAt: Date
  maxViewers: number
}

export interface ChatMessage {
  id: string
  userId: string
  userName: string
  message: string
  timestamp: Date
}

export interface StreamQuality {
  resolution: '360p' | '720p' | '1080p'
  frameRate: 30 | 60
  bitrate: number
}

export interface ConnectionState {
  iceConnectionState: RTCIceConnectionState
  connectionState: RTCPeerConnectionState
  signalingState: RTCSignalingState
}

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate'
  from: string
  to: string
  data: any
}

export interface RoomEvents {
  'room:created': (room: Room) => void
  'room:joined': (room: Room) => void
  'room:left': (userId: string) => void
  'user:joined': (user: User) => void
  'user:left': (userId: string) => void
  'stream:started': () => void
  'stream:stopped': () => void
  'chat:message': (message: ChatMessage) => void
  'webrtc:offer': (signal: WebRTCSignal) => void
  'webrtc:answer': (signal: WebRTCSignal) => void
  'webrtc:ice-candidate': (signal: WebRTCSignal) => void
  'error': (error: string) => void
}