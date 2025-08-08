'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import VideoPlayer from '@/components/VideoPlayer'
import Chat from '@/components/Chat'
import ConnectionIndicator from '@/components/ConnectionIndicator'
import { SocketManager } from '@/lib/socket'
import { FixedWebRTCConnection } from '@/lib/webrtcFixed'
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
  const [notification, setNotification] = useState<{ type: 'success' | 'info', message: string } | null>(null)

  const socketRef = useRef<SocketManager | undefined>(undefined)
  const connectionsRef = useRef<Map<string, FixedWebRTCConnection>>(new Map())
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
    
    // Host is impolite (creates offers), viewer is polite (waits)
    const isPolite = !isInitiator
    const connection = new FixedWebRTCConnection(isPolite, peerId)
    
    // Set up event handlers
    connection.onIceCandidate = (candidate) => {
      socketRef.current?.sendWebRTCSignal('ice-candidate', peerId, candidate)
    }
    
    connection.onTrack = (stream) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.set(peerId, stream)
        return updated
      })
    }
    
    connection.onDataChannel = (channel) => {
      channel.onmessage = (event) => {
        try {
          const message: ChatMessage = JSON.parse(event.data)
          setMessages(prev => [...prev, message])
        } catch (e) {
          console.error('Error parsing chat message:', e)
        }
      }
    }
    
    connection.onConnectionStateChange = (state) => {
      setConnectionState(state)
    }
    
    connection.onIceConnectionStateChange = (state) => {
      // Only log errors
      if (state === 'failed') {
        console.error(`ICE connection failed with peer ${peerId}`)
      }
    }
    
    connectionsRef.current.set(peerId, connection)

    // If initiator (host) and has stream, set up the connection
    if (isInitiator && localStreamRef.current) {
      try {
        // Add the stream first
        await connection.addStream(localStreamRef.current)
        
        // Then create data channel
        connection.createDataChannel()
        
        // Small delay to let things settle
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Create and send offer
        const offer = await connection.createOffer()
        socketRef.current?.sendWebRTCSignal('offer', peerId, offer)
      } catch (error) {
        console.error(`Failed to create connection for ${peerId}:`, error)
        setError('Failed to establish peer connection')
      }
    }

    return connection
  }, [])

  const handleOffer = useCallback(async (from: string, offer: RTCSessionDescriptionInit) => {
    let connection = connectionsRef.current.get(from)
    
    if (!connection) {
      connection = await createPeerConnection(from, false)
    }

    const answer = await connection.handleOffer(offer)
    if (answer) {
      socketRef.current?.sendWebRTCSignal('answer', from, answer)
    }
  }, [createPeerConnection])

  const handleAnswer = useCallback(async (from: string, answer: RTCSessionDescriptionInit) => {
    const connection = connectionsRef.current.get(from)
    if (connection) {
      await connection.handleOffer(answer) // handleOffer handles both offers and answers
    } else {
      console.error(`No connection found for ${from}`)
    }
  }, [])

  const handleIceCandidate = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    const connection = connectionsRef.current.get(from)
    if (connection) {
      await connection.addIceCandidate(candidate)
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
      // Set viewers (excluding host)
      setViewers(room.viewers.filter(v => v.id !== room.hostId))
    })

    socketRef.current.on('room:joined', (room) => {
      console.log('Joined room:', room)
      setRoom(room)
      // Find our user in the viewers list to get the socket ID
      const ourUser = room.viewers.find(v => v.name === userName)
      if (ourUser) {
        setUser(prev => prev ? { ...prev, id: ourUser.id } : null)
        // Show all other users (excluding ourselves)
        setViewers(room.viewers.filter(v => v.id !== ourUser.id))
      }
    })

    socketRef.current.on('user:joined', async (newUser) => {
      setViewers(prev => [...prev, newUser])
      
      // Show notification
      setNotification({ type: 'info', message: `${newUser.name} joined the room` })
      setTimeout(() => setNotification(null), 3000)
      
      // If host is streaming, create connection for new viewer
      if (isHost && isStreamingRef.current && localStreamRef.current) {
        // Delay to ensure viewer is ready
        setTimeout(async () => {
          await createPeerConnection(newUser.id, true)
        }, 1000)
      }
    })

    socketRef.current.on('user:left', (leftUserId) => {
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
      await handleOffer(signal.from, signal.data)
    })

    socketRef.current.on('webrtc:answer', async (signal) => {
      await handleAnswer(signal.from, signal.data)
    })

    socketRef.current.on('webrtc:ice-candidate', async (signal) => {
      await handleIceCandidate(signal.from, signal.data)
    })

    socketRef.current.on('stream:started', () => {
      if (!isHost) {
        setIsStreaming(true)
      }
    })

    socketRef.current.on('stream:stopped', () => {
      setIsStreaming(false)
      if (!isHost) {
        setRemoteStreams(new Map())
      }
      
      connectionsRef.current.forEach(conn => conn.close())
      connectionsRef.current.clear()
    })

    // Handle room closure
    socketRef.current.on('room:closed', (reason) => {
      setError(reason || 'Room has been closed')
      setIsStreaming(false)
      setRemoteStreams(new Map())
      
      // Clean up connections
      connectionsRef.current.forEach(conn => conn.close())
      connectionsRef.current.clear()
      
      // Redirect after 3 seconds
      setTimeout(() => {
        router.push('/')
      }, 3000)
    })

    // Handle viewer count updates
    socketRef.current.on('room:updated', ({ viewers, viewerCount }) => {
      // Update viewer list, excluding ourselves
      const currentUserId = user?.id || socketRef.current?.getSocketId()
      if (currentUserId) {
        setViewers(viewers.filter(v => v.id !== currentUserId))
      }
    })

    // Handle host disconnect
    socketRef.current.on('host:disconnected', () => {
      setError('Host has disconnected')
      setIsStreaming(false)
      setRemoteStreams(new Map())
      
      // Clean up connections
      connectionsRef.current.forEach(conn => conn.close())
      connectionsRef.current.clear()
      
      // Redirect after 3 seconds
      setTimeout(() => {
        router.push('/')
      }, 3000)
    })

    socketRef.current.on('error', (error) => {
      console.error('Socket error:', error)
      setError(error)
    })

    // Join or create room
    if (isHost) {
      socketRef.current.createRoom(userName, roomCode, 10)
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
      // Optimized settings for different capture scenarios
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 }, // Start with 30fps for better stability
      }
      
      // Add cursor display for screen/window capture (not for tab)
      const displayConstraints: any = {
        video: videoConstraints,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
        // Prefer tab capture for better performance
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
      }
      
      // Get screen capture stream with audio
      const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints).catch(async (error) => {
        // If audio capture fails, try without audio
        console.warn('Audio capture not supported or denied, trying video only:', error)
        return navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints,
          audio: false,
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
          monitorTypeSurfaces: 'include',
        } as any)
      })
      
      setLocalStream(stream)
      setIsStreaming(true)
      
      // Notify others that streaming started
      socketRef.current?.startStream()
      
      // Show success notification
      setNotification({ type: 'success', message: 'Screen sharing started successfully!' })
      setTimeout(() => setNotification(null), 3000)
      
      // Create peer connections for all existing viewers
      // Add a small delay to ensure stream is ready
      await new Promise(resolve => setTimeout(resolve, 100))
      
      for (const viewer of viewers) {
        await createPeerConnection(viewer.id, true)
        // Small delay between connections to avoid overwhelming signaling
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Optimize video track based on content
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()
        
        // Apply optimizations based on display surface type
        if (settings.displaySurface === 'browser') {
          // Tab capture - optimize for smooth scrolling
          await videoTrack.applyConstraints({
            frameRate: { ideal: 30, max: 30 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          })
        } else if (settings.displaySurface === 'window') {
          // Window capture - balance quality and performance
          await videoTrack.applyConstraints({
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: settings.width },
            height: { ideal: settings.height },
          })
        } else if (settings.displaySurface === 'monitor') {
          // Full screen capture - may need lower framerate for stability
          await videoTrack.applyConstraints({
            frameRate: { ideal: 30, max: 30 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          })
        }
        
        // Handle stream ending
        videoTrack.onended = () => {
          stopScreenShare()
        }
        
        // Log capture details for debugging
        console.log('Capture started:', {
          displaySurface: settings.displaySurface,
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          hasAudio: stream.getAudioTracks().length > 0,
        })
      }
    } catch (error) {
      console.error('Error starting screen share:', error)
      setError('Failed to start screen sharing. Please try again.')
    }
  }

  const stopScreenShare = () => {
    if (localStream) {
      // Properly stop all tracks
      localStream.getTracks().forEach(track => {
        track.stop()
        // Remove event listeners to prevent memory leaks
        track.onended = null
      })
      setLocalStream(null)
    }
    
    setIsStreaming(false)
    socketRef.current?.stopStream()
    
    // Close all peer connections with cleanup
    connectionsRef.current.forEach(conn => {
      try {
        conn.close()
      } catch (error) {
        console.error('Error closing connection:', error)
      }
    })
    connectionsRef.current.clear()
    
    // Clear remote streams
    setRemoteStreams(new Map())
    
    // Force garbage collection hint
    if (typeof window !== 'undefined' && 'gc' in window) {
      (window as any).gc()
    }
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
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
    setNotification({ type: 'success', message: 'Room code copied to clipboard!' })
    setTimeout(() => setNotification(null), 2000)
  }

  const isHost = user?.isHost

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <ConnectionIndicator connectionState={connectionState} stats={stats} />

      {notification && (
        <div className={`fixed top-20 left-4 right-4 z-50 ${notification.type === 'success' ? 'bg-green-500/90' : 'bg-blue-500/90'} backdrop-blur text-white p-4 rounded-lg max-w-lg mx-auto shadow-xl animate-in slide-in-from-top-2 duration-300`}>
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {notification.type === 'success' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
            <p className="flex-1">{notification.message}</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 bg-red-500/90 backdrop-blur text-white p-4 rounded-lg max-w-lg mx-auto shadow-xl animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Connection Error</p>
              <p className="text-sm mt-1 text-red-100">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
                      <div className="text-center p-8">
                        <div className="relative">
                          <div className="w-20 h-20 border-4 border-blue-600/30 rounded-full mx-auto"></div>
                          <div className="w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto absolute inset-0"></div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-lg mt-6 font-medium">
                          {isStreaming ? 'Establishing connection...' : 'Waiting for host to start sharing'}
                        </p>
                        <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                          {isStreaming ? 'This may take a few seconds' : 'The host will begin sharing their screen soon'}
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