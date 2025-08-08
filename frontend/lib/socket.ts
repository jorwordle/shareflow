import { io, Socket } from 'socket.io-client'
import { RoomEvents, User, Room, ChatMessage, WebRTCSignal } from '@/types'

export class SocketManager {
  private socket: Socket | null = null
  private serverUrl: string
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(serverUrl: string = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001') {
    this.serverUrl = serverUrl
    console.log('Socket.io connecting to:', this.serverUrl)
  }

  connect() {
    if (this.socket?.connected) return

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    this.setupEventListeners()
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('Connected to server:', this.serverUrl, 'Socket ID:', this.socket?.id)
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason)
    })
    
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message)
    })

    this.socket.on('room:created', (room: Room) => {
      this.emit('room:created', room)
    })

    this.socket.on('room:joined', (room: Room) => {
      this.emit('room:joined', room)
    })

    this.socket.on('user:joined', (user: User) => {
      this.emit('user:joined', user)
    })

    this.socket.on('user:left', (userId: string) => {
      this.emit('user:left', userId)
    })

    this.socket.on('chat:message', (message: ChatMessage) => {
      this.emit('chat:message', message)
    })

    this.socket.on('webrtc:offer', (signal: WebRTCSignal) => {
      this.emit('webrtc:offer', signal)
    })

    this.socket.on('webrtc:answer', (signal: WebRTCSignal) => {
      this.emit('webrtc:answer', signal)
    })

    this.socket.on('webrtc:ice-candidate', (signal: WebRTCSignal) => {
      this.emit('webrtc:ice-candidate', signal)
    })

    this.socket.on('stream:started', () => {
      this.emit('stream:started')
    })

    this.socket.on('stream:stopped', () => {
      this.emit('stream:stopped')
    })

    this.socket.on('error', (error: string) => {
      this.emit('error', error)
    })
  }

  createRoom(hostName: string, roomCode: string | null = null, maxViewers: number = 10) {
    this.socket?.emit('room:create', { hostName, roomCode, maxViewers })
  }

  joinRoom(roomCode: string, userName: string) {
    this.socket?.emit('room:join', { roomCode, userName })
  }

  leaveRoom() {
    this.socket?.emit('room:leave')
  }

  sendChatMessage(message: string) {
    this.socket?.emit('chat:message', message)
  }

  sendWebRTCSignal(type: WebRTCSignal['type'], to: string, data: any) {
    this.socket?.emit(`webrtc:${type}`, { to, data })
  }

  startStream() {
    this.socket?.emit('stream:start')
  }

  stopStream() {
    this.socket?.emit('stream:stop')
  }

  on<K extends keyof RoomEvents>(event: K, callback: RoomEvents[K]) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(callback as Function)
  }

  off<K extends keyof RoomEvents>(event: K, callback: RoomEvents[K]) {
    this.listeners.get(event)?.delete(callback as Function)
  }

  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((callback) => {
      callback(...args)
    })
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
    this.listeners.clear()
  }

  isConnected() {
    return this.socket?.connected || false
  }
}