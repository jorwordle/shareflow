'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import VideoPlayer from '@/components/VideoPlayer'
import Chat from '@/components/Chat'
import ConnectionIndicator from '@/components/ConnectionIndicator'
import { SocketManager } from '@/lib/socket'
import { WebRTCConnection } from '@/lib/webrtc'
import { User, Room, ChatMessage, StreamQuality } from '@/types'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.code as string

  const [room, setRoom] = useState<Room | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [viewers, setViewers] = useState<User[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [isStreaming, setIsStreaming] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new')
  const [stats, setStats] = useState<RTCStatsReport | undefined>()
  const [quality, setQuality] = useState<StreamQuality['resolution']>('1080p')

  const socketRef = useRef<SocketManager | undefined>(undefined)
  const connectionsRef = useRef<Map<string, WebRTCConnection>>(new Map())

  useEffect(() => {
    const userName = localStorage.getItem('userName')
    const isHost = localStorage.getItem('isHost') === 'true'

    if (!userName) {
      router.push('/')
      return
    }

    const userId = uuidv4()
    const currentUser: User = {
      id: userId,
      name: userName,
      isHost,
    }
    setUser(currentUser)

    socketRef.current = new SocketManager()
    socketRef.current.connect()

    socketRef.current.on('room:created', (room) => {
      setRoom(room)
    })

    socketRef.current.on('room:joined', (room) => {
      setRoom(room)
      setViewers(room.viewers.filter(v => v.id !== userId))
    })

    socketRef.current.on('user:joined', async (newUser) => {
      setViewers(prev => [...prev, newUser])
      
      if (isHost && isStreaming) {
        await createPeerConnection(newUser.id, true)
      }
    })

    socketRef.current.on('user:left', (userId) => {
      setViewers(prev => prev.filter(v => v.id !== userId))
      
      const connection = connectionsRef.current.get(userId)
      if (connection) {
        connection.close()
        connectionsRef.current.delete(userId)
      }
      
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(userId)
        return updated
      })
    })

    socketRef.current.on('chat:message', (message) => {
      setMessages(prev => [...prev, message])
    })

    socketRef.current.on('webrtc:offer', async (signal) => {
      if (signal.to === userId) {
        await handleOffer(signal.from, signal.data)
      }
    })

    socketRef.current.on('webrtc:answer', async (signal) => {
      if (signal.to === userId) {
        await handleAnswer(signal.from, signal.data)
      }
    })

    socketRef.current.on('webrtc:ice-candidate', async (signal) => {
      if (signal.to === userId) {
        await handleIceCandidate(signal.from, signal.data)
      }
    })

    socketRef.current.on('stream:started', () => {
      if (!isHost) {
        setIsStreaming(true)
      }
    })

    socketRef.current.on('stream:stopped', () => {
      setIsStreaming(false)
      setLocalStream(null)
      setRemoteStreams(new Map())
      
      connectionsRef.current.forEach(conn => conn.close())
      connectionsRef.current.clear()
    })

    socketRef.current.on('error', (error) => {
      console.error('Socket error:', error)
    })

    if (isHost) {
      socketRef.current.createRoom(userName, 10)
    } else {
      socketRef.current.joinRoom(roomCode, userName)
    }

    return () => {
      connectionsRef.current.forEach(conn => conn.close())
      socketRef.current?.disconnect()
      localStorage.removeItem('userName')
      localStorage.removeItem('isHost')
    }
  }, [roomCode, router])

  const createPeerConnection = async (peerId: string, isInitiator: boolean) => {
    const connection = new WebRTCConnection(
      (candidate) => {
        socketRef.current?.sendWebRTCSignal('ice-candidate', peerId, candidate)
      },
      (stream) => {
        setRemoteStreams(prev => {
          const updated = new Map(prev)
          updated.set(peerId, stream)
          return updated
        })
      },
      (channel) => {
        channel.onmessage = (event) => {
          const message: ChatMessage = JSON.parse(event.data)
          setMessages(prev => [...prev, message])
        }
      },
      (state) => {
        setConnectionState(state)
      }
    )

    connectionsRef.current.set(peerId, connection)

    if (isInitiator && localStream) {
      localStream.getTracks().forEach(track => {
        connection['pc'].addTrack(track, localStream)
      })
      
      const offer = await connection.createOffer()
      socketRef.current?.sendWebRTCSignal('offer', peerId, offer)
    }

    return connection
  }

  const handleOffer = async (from: string, offer: RTCSessionDescriptionInit) => {
    let connection = connectionsRef.current.get(from)
    
    if (!connection) {
      connection = await createPeerConnection(from, false)
    }

    await connection.setRemoteDescription(offer)
    const answer = await connection.createAnswer()
    socketRef.current?.sendWebRTCSignal('answer', from, answer)
  }

  const handleAnswer = async (from: string, answer: RTCSessionDescriptionInit) => {
    const connection = connectionsRef.current.get(from)
    if (connection) {
      await connection.setRemoteDescription(answer)
    }
  }

  const handleIceCandidate = async (from: string, candidate: RTCIceCandidateInit) => {
    const connection = connectionsRef.current.get(from)
    if (connection) {
      await connection.addIceCandidate(candidate)
    }
  }

  const startScreenShare = async () => {
    try {
      const connection = new WebRTCConnection(
        () => {},
        undefined,
        undefined,
        setConnectionState
      )
      
      const stream = await connection.startScreenShare(quality)
      setLocalStream(stream)
      setIsStreaming(true)
      
      socketRef.current?.startStream()
      
      for (const viewer of viewers) {
        await createPeerConnection(viewer.id, true)
      }

      const statsInterval = setInterval(async () => {
        const stats = await connection.getConnectionStats()
        setStats(stats)
      }, 1000)

      stream.getVideoTracks()[0].onended = () => {
        clearInterval(statsInterval)
        stopScreenShare()
      }
    } catch (error) {
      console.error('Error starting screen share:', error)
    }
  }

  const stopScreenShare = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    
    setIsStreaming(false)
    socketRef.current?.stopStream()
    
    connectionsRef.current.forEach(conn => conn.close())
    connectionsRef.current.clear()
  }

  const handleSendMessage = (message: string) => {
    if (!user) return

    const chatMessage: ChatMessage = {
      id: uuidv4(),
      userId: user.id,
      userName: user.name,
      message,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, chatMessage])
    socketRef.current?.sendChatMessage(message)

    connectionsRef.current.forEach(conn => {
      conn.sendMessage(JSON.stringify(chatMessage))
    })
  }

  const handleQualityChange = async (newQuality: StreamQuality['resolution']) => {
    setQuality(newQuality)
    
    connectionsRef.current.forEach(conn => {
      conn.changeQuality(newQuality)
    })
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
  }

  const isHost = user?.isHost

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <ConnectionIndicator connectionState={connectionState} stats={stats} />

      <div className="flex h-screen">
        <div className={`flex-1 p-2 sm:p-4 transition-all duration-300 ${isChatOpen ? 'sm:mr-80' : ''}`}>
          <div className="h-full flex flex-col">
            <div className="glass-effect rounded-xl p-3 sm:p-4 mb-2 sm:mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                    {isHost ? 'Hosting Room' : 'Viewing Room'}
                  </h1>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mt-2 gap-2 sm:gap-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Room:</span>
                      <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded text-xs sm:text-sm font-mono">
                        {roomCode}
                      </code>
                      <button
                        onClick={copyRoomCode}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        title="Copy room code"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Viewers:</span>
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-xs font-medium">
                        {viewers.length}
                      </span>
                    </div>
                  </div>
                </div>

                {isHost && (
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    {!isStreaming ? (
                      <button
                        onClick={startScreenShare}
                        className="btn-primary flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base py-2 sm:py-3 px-3 sm:px-6"
                      >
                        <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="hidden xs:inline">Start Sharing</span>
                        <span className="xs:hidden">Share</span>
                      </button>
                    ) : (
                      <button
                        onClick={stopScreenShare}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 sm:py-3 px-3 sm:px-6 rounded-lg transition-colors flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base"
                      >
                        <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="hidden xs:inline">Stop Sharing</span>
                        <span className="xs:hidden">Stop</span>
                      </button>
                    )}

                    <button
                      onClick={() => setIsChatOpen(!isChatOpen)}
                      className="p-2 sm:p-3 bg-gray-200 dark:bg-gray-800 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors hidden sm:block"
                      title={isChatOpen ? 'Hide chat' : 'Show chat'}
                    >
                      <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1">
              {isHost ? (
                <VideoPlayer
                  stream={localStream}
                  isLocal={true}
                  quality={quality}
                  className="h-full"
                />
              ) : (
                <div className="h-full">
                  {Array.from(remoteStreams.values()).map((stream, index) => (
                    <VideoPlayer
                      key={index}
                      stream={stream}
                      quality={quality}
                      onQualityChange={handleQualityChange}
                      className="h-full"
                    />
                  ))}
                  {remoteStreams.size === 0 && (
                    <div className="h-full flex items-center justify-center glass-effect rounded-xl">
                      <div className="text-center">
                        <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400 text-lg">
                          Waiting for host to start sharing...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <Chat
          messages={messages}
          onSendMessage={handleSendMessage}
          userId={user?.id || ''}
          userName={user?.name || ''}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen(!isChatOpen)}
        />
      </div>
    </div>
  )
}