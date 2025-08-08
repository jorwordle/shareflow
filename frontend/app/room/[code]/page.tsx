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
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<SocketManager | undefined>(undefined)
  const connectionsRef = useRef<Map<string, WebRTCConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const isStreamingRef = useRef<boolean>(false)

  // Update refs when state changes
  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  const createPeerConnection = useCallback(async (peerId: string, isInitiator: boolean) => {
    console.log(`Creating peer connection with ${peerId}, initiator: ${isInitiator}`)
    
    const connection = new WebRTCConnection(
      (candidate) => {
        console.log(`Sending ICE candidate to ${peerId}`)
        socketRef.current?.sendWebRTCSignal('ice-candidate', peerId, candidate)
      },
      (stream) => {
        console.log(`Received remote stream from ${peerId}`)
        setRemoteStreams(prev => {
          const updated = new Map(prev)
          updated.set(peerId, stream)
          return updated
        })
      },
      (channel) => {
        console.log(`Data channel opened with ${peerId}`)
        channel.onmessage = (event) => {
          try {
            const message: ChatMessage = JSON.parse(event.data)
            setMessages(prev => [...prev, message])
          } catch (e) {
            console.error('Error parsing chat message:', e)
          }
        }
      },
      (state) => {
        console.log(`Connection state with ${peerId}: ${state}`)
        setConnectionState(state)
      },
      (error) => {
        console.error(`Connection error with ${peerId}:`, error)
        setError(error.message)
      }
    )

    connectionsRef.current.set(peerId, connection)

    // If initiator (host) and has stream, add it to connection
    if (isInitiator && localStreamRef.current) {
      console.log('Adding local stream to connection')
      await connection.addStream(localStreamRef.current, quality)
      
      // Create and send offer
      const offer = await connection.createOffer()
      console.log(`Sending offer to ${peerId}`)
      socketRef.current?.sendWebRTCSignal('offer', peerId, offer)
    }

    return connection
  }, [quality])

  const handleOffer = useCallback(async (from: string, offer: RTCSessionDescriptionInit) => {
    console.log(`Handling offer from ${from}`)
    
    let connection = connectionsRef.current.get(from)
    
    if (!connection) {
      connection = await createPeerConnection(from, false)
    }

    await connection.setRemoteDescription(offer)
    const answer = await connection.createAnswer()
    console.log(`Sending answer to ${from}`)
    socketRef.current?.sendWebRTCSignal('answer', from, answer)
  }, [createPeerConnection])

  const handleAnswer = useCallback(async (from: string, answer: RTCSessionDescriptionInit) => {
    console.log(`Handling answer from ${from}`)
    const connection = connectionsRef.current.get(from)
    if (connection) {
      await connection.setRemoteDescription(answer)
    } else {
      console.error(`No connection found for ${from}`)
    }
  }, [])

  const handleIceCandidate = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    console.log(`Received ICE candidate from ${from}`)
    const connection = connectionsRef.current.get(from)
    if (connection) {
      await connection.addIceCandidate(candidate)
    } else {
      console.warn(`No connection found for ICE candidate from ${from}`)
    }
  }, [])

  useEffect(() => {
    const userName = localStorage.getItem('userName')
    const isHost = localStorage.getItem('isHost') === 'true'

    if (!userName) {
      router.push('/')
      return
    }

    // We'll use the socket ID as the user ID for consistency
    const currentUser: User = {
      id: '', // Will be set by socket connection
      name: userName,
      isHost,
    }
    setUser(currentUser)

    socketRef.current = new SocketManager()
    socketRef.current.connect()

    // Get socket ID after connection
    socketRef.current.on('room:created', (room) => {
      console.log('Room created:', room)
      setRoom(room)
      // Update user with socket ID (hostId)
      setUser(prev => prev ? { ...prev, id: room.hostId } : null)
    })

    socketRef.current.on('room:joined', (room) => {
      console.log('Joined room:', room)
      setRoom(room)
      // Find our user in the viewers list to get the socket ID
      const ourUser = room.viewers.find(v => v.name === userName)
      if (ourUser) {
        setUser(prev => prev ? { ...prev, id: ourUser.id } : null)
        setViewers(room.viewers.filter(v => v.id !== ourUser.id))
      }
    })

    socketRef.current.on('user:joined', async (newUser) => {
      console.log('User joined:', newUser)
      setViewers(prev => [...prev, newUser])
      
      // If host is streaming, create connection for new viewer
      if (isHost && isStreamingRef.current && localStreamRef.current) {
        console.log('Host creating connection for new viewer:', newUser.id)
        // Small delay to ensure viewer is ready
        setTimeout(async () => {
          await createPeerConnection(newUser.id, true)
        }, 500)
      }
    })

    socketRef.current.on('user:left', (leftUserId) => {
      console.log('User left:', leftUserId)
      setViewers(prev => prev.filter(v => v.id !== leftUserId))
      
      // Clean up connection
      const connection = connectionsRef.current.get(leftUserId)
      if (connection) {
        connection.close()
        connectionsRef.current.delete(leftUserId)
      }
      
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(leftUserId)
        return updated
      })
    })

    socketRef.current.on('chat:message', (message) => {
      setMessages(prev => [...prev, message])
    })

    socketRef.current.on('webrtc:offer', async (signal) => {
      console.log('Received offer signal:', signal)
      // The 'to' field is the socket ID that should receive this
      await handleOffer(signal.from, signal.data)
    })

    socketRef.current.on('webrtc:answer', async (signal) => {
      console.log('Received answer signal:', signal)
      await handleAnswer(signal.from, signal.data)
    })

    socketRef.current.on('webrtc:ice-candidate', async (signal) => {
      await handleIceCandidate(signal.from, signal.data)
    })

    socketRef.current.on('stream:started', () => {
      console.log('Stream started signal received')
      if (!isHost) {
        setIsStreaming(true)
      }
    })

    socketRef.current.on('stream:stopped', () => {
      console.log('Stream stopped signal received')
      setIsStreaming(false)
      if (!isHost) {
        setRemoteStreams(new Map())
      }
      
      connectionsRef.current.forEach(conn => conn.close())
      connectionsRef.current.clear()
    })

    socketRef.current.on('error', (error) => {
      console.error('Socket error:', error)
      setError(error)
    })

    // Join or create room
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
  }, [roomCode, router, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate])

  const startScreenShare = async () => {
    try {
      console.log('Starting screen share')
      
      // Get screen capture stream
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        } as MediaTrackConstraints & { cursor?: string },
        audio: false
      })
      
      setLocalStream(stream)
      setIsStreaming(true)
      
      // Notify others that streaming started
      socketRef.current?.startStream()
      
      // Create peer connections for all existing viewers
      console.log(`Creating connections for ${viewers.length} viewers`)
      for (const viewer of viewers) {
        await createPeerConnection(viewer.id, true)
      }

      // Handle stream ending
      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen share ended by user')
        stopScreenShare()
      }
    } catch (error) {
      console.error('Error starting screen share:', error)
      setError('Failed to start screen sharing')
    }
  }

  const stopScreenShare = () => {
    console.log('Stopping screen share')
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    
    setIsStreaming(false)
    socketRef.current?.stopStream()
    
    // Close all peer connections
    connectionsRef.current.forEach(conn => conn.close())
    connectionsRef.current.clear()
  }

  const handleSendMessage = (message: string) => {
    if (!user || !user.id) return

    const chatMessage: ChatMessage = {
      id: uuidv4(),
      userId: user.id,
      userName: user.name,
      message,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, chatMessage])
    socketRef.current?.sendChatMessage(message)

    // Send via data channel to all peers
    connectionsRef.current.forEach(conn => {
      conn.sendMessage(JSON.stringify(chatMessage))
    })
  }

  const handleQualityChange = async (newQuality: StreamQuality['resolution']) => {
    setQuality(newQuality)
    
    // Update quality for all connections
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

      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 bg-red-500 text-white p-3 rounded-lg max-w-lg mx-auto">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

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
                  {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                    <VideoPlayer
                      key={peerId}
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
                          {isStreaming ? 'Connecting to host...' : 'Waiting for host to start sharing...'}
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