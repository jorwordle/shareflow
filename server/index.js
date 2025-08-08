const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
require('dotenv').config()

const app = express()

// Production CORS configuration
const allowedOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000']

// In production, ensure we have the correct frontend URL
if (process.env.NODE_ENV === 'production' && !allowedOrigins.includes('https://sharefloww.netlify.app')) {
  allowedOrigins.push('https://sharefloww.netlify.app')
}

console.log('Allowed origins:', allowedOrigins)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`Blocked CORS request from: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))

app.use(express.json())

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

const server = http.createServer(app)

// Socket.io configuration with production settings
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow different Socket.io versions
})

// In-memory storage with cleanup
const rooms = new Map()
const users = new Map()
const connectionStats = {
  totalConnections: 0,
  currentConnections: 0,
  peakConnections: 0,
  roomsCreated: 0,
}

// Cleanup stale rooms (older than 12 hours)
setInterval(() => {
  const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000)
  let cleaned = 0
  
  rooms.forEach((room, code) => {
    if (room.createdAt.getTime() < twelveHoursAgo && room.viewers.length === 0) {
      rooms.delete(code)
      cleaned++
    }
  })
  
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} stale rooms`)
  }
}, 60 * 60 * 1000) // Run every hour

function generateRoomCode() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()
  // Ensure unique code
  if (rooms.has(code)) {
    return generateRoomCode()
  }
  return code
}

function createRoom(hostId, hostName, roomCode = null, maxViewers = 10) {
  // Use provided room code or generate a new one
  const code = roomCode || generateRoomCode()
  const room = {
    id: code,
    code,
    hostId,
    hostName,
    viewers: [],
    createdAt: new Date(),
    maxViewers: Math.min(maxViewers, 10), // Cap at 10 for performance
    isStreaming: false,
  }
  rooms.set(code, room)
  connectionStats.roomsCreated++
  console.log(`Room created: ${code} by ${hostName} (Total rooms: ${rooms.size})`)
  return room
}

function addUserToRoom(roomCode, user) {
  const room = rooms.get(roomCode)
  if (!room) {
    console.warn(`Attempted to join non-existent room: ${roomCode}`)
    return null
  }
  
  if (room.viewers.length >= room.maxViewers && !user.isHost) {
    console.warn(`Room ${roomCode} is full (${room.viewers.length}/${room.maxViewers})`)
    return null
  }
  
  // Check if user already in room (reconnection)
  const existingUser = room.viewers.find(v => v.id === user.id)
  if (!existingUser) {
    room.viewers.push(user)
    console.log(`User ${user.name} joined room ${roomCode} (${room.viewers.length}/${room.maxViewers})`)
  }
  
  return room
}

function removeUserFromRoom(roomCode, userId) {
  const room = rooms.get(roomCode)
  if (!room) return
  
  const previousCount = room.viewers.length
  room.viewers = room.viewers.filter(v => v.id !== userId)
  
  if (previousCount !== room.viewers.length) {
    console.log(`[ROOM] User removed from room ${roomCode} (${room.viewers.length} viewers remaining)`)
  }
  
  // Clean up empty rooms or rooms where host left
  if (room.hostId === userId) {
    console.log(`[ROOM] Host left room ${roomCode}, closing room`)
    // Notify all viewers that room is closing
    io.to(roomCode).emit('room:closed', 'Host has left the room')
    // Remove all users from socket room
    const socketsInRoom = io.sockets.adapter.rooms.get(roomCode)
    if (socketsInRoom) {
      for (const socketId of socketsInRoom) {
        io.sockets.sockets.get(socketId)?.leave(roomCode)
      }
    }
    rooms.delete(roomCode)
  } else if (room.viewers.length === 0 && !room.isStreaming) {
    console.log(`[ROOM] Room ${roomCode} is empty, removing`)
    rooms.delete(roomCode)
  }
  
  return room
}

// Socket.io error handling
io.on('connection_error', (err) => {
  console.error('Connection error:', err.message)
})

io.on('connection', (socket) => {
  connectionStats.totalConnections++
  connectionStats.currentConnections++
  connectionStats.peakConnections = Math.max(
    connectionStats.peakConnections,
    connectionStats.currentConnections
  )
  
  console.log(`[SOCKET] User connected: ${socket.id} (Active: ${connectionStats.currentConnections})`)

  // Attach error handler for this socket
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error)
  })

  socket.on('room:create', ({ hostName, roomCode, maxViewers }) => {
    try {
      // Validate input
      if (!hostName || typeof hostName !== 'string' || hostName.length > 50) {
        socket.emit('error', 'Invalid host name')
        return
      }

      // If room code is provided, validate and normalize it
      let normalizedCode = null
      if (roomCode) {
        normalizedCode = roomCode.toUpperCase().substring(0, 10)
        // Check if room already exists
        if (rooms.has(normalizedCode)) {
          console.log(`[ROOM] Room ${normalizedCode} already exists, joining as host instead`)
          // Room exists, join it as host instead
          const existingRoom = rooms.get(normalizedCode)
          if (existingRoom) {
            // Update the host info
            existingRoom.hostId = socket.id
            existingRoom.hostName = hostName
            
            const user = {
              id: socket.id,
              name: hostName.substring(0, 50),
              isHost: true,
              connectedAt: new Date(),
            }
            users.set(socket.id, user)
            
            socket.join(normalizedCode)
            socket.emit('room:created', existingRoom)
            console.log(`[ROOM] Host ${hostName} took over room ${normalizedCode}`)
            return
          }
        }
      }

      const user = {
        id: socket.id,
        name: hostName.substring(0, 50), // Limit name length
        isHost: true,
        connectedAt: new Date(),
      }
      users.set(socket.id, user)
      
      const room = createRoom(socket.id, hostName, normalizedCode, maxViewers)
      socket.join(room.code)
      console.log(`[ROOM] Created room ${room.code} with host ${hostName} (${socket.id})`)
      socket.emit('room:created', room)
    } catch (error) {
      console.error('Error creating room:', error)
      socket.emit('error', 'Failed to create room')
    }
  })

  socket.on('room:join', ({ roomCode, userName }) => {
    try {
      // Validate input
      if (!roomCode || !userName || typeof userName !== 'string' || userName.length > 50) {
        socket.emit('error', 'Invalid room code or name')
        return
      }

      const normalizedCode = roomCode.toUpperCase().substring(0, 10)
      console.log(`[ROOM] User ${userName} (${socket.id}) attempting to join room ${normalizedCode}`)
      
      const room = rooms.get(normalizedCode)
      
      if (!room) {
        console.error(`[ROOM] Room ${normalizedCode} not found`)
        console.log('[ROOM] Available rooms:', Array.from(rooms.keys()))
        socket.emit('error', 'Room not found')
        return
      }
      
      // Check if user is already in a room and clean up
      const existingUser = users.get(socket.id)
      if (existingUser) {
        console.log(`[ROOM] User ${socket.id} already exists, cleaning up`)
        const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id)
        userRooms.forEach(oldRoom => {
          if (oldRoom !== normalizedCode) {
            socket.leave(oldRoom)
            removeUserFromRoom(oldRoom, socket.id)
          }
        })
      }
      
      const user = {
        id: socket.id,
        name: userName.substring(0, 50),
        isHost: false,
        connectedAt: new Date(),
      }
      users.set(socket.id, user)
      
      const updatedRoom = addUserToRoom(normalizedCode, user)
      if (!updatedRoom) {
        socket.emit('error', 'Room is full')
        return
      }
      
      socket.join(normalizedCode)
      console.log(`[ROOM] User ${userName} joined room ${normalizedCode}. Total viewers: ${updatedRoom.viewers.length}`)
      socket.emit('room:joined', updatedRoom)
      
      // Notify all users in room about updated viewer count
      io.to(normalizedCode).emit('room:updated', {
        viewers: updatedRoom.viewers,
        viewerCount: updatedRoom.viewers.length
      })
      
      // Notify about new user
      socket.to(normalizedCode).emit('user:joined', user)
      
      // If host is in the room, notify them specifically
      if (room.hostId) {
        io.to(room.hostId).emit('user:joined', user)
      }
    } catch (error) {
      console.error('Error joining room:', error)
      socket.emit('error', 'Failed to join room')
    }
  })

  socket.on('room:leave', () => {
    try {
      const user = users.get(socket.id)
      if (!user) return
      
      const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id)
      userRooms.forEach(roomCode => {
        removeUserFromRoom(roomCode, socket.id)
        socket.to(roomCode).emit('user:left', socket.id)
        socket.leave(roomCode)
      })
      
      users.delete(socket.id)
    } catch (error) {
      console.error('Error leaving room:', error)
    }
  })

  socket.on('chat:message', (message) => {
    try {
      const user = users.get(socket.id)
      if (!user) return
      
      // Validate and sanitize message
      if (!message || typeof message !== 'string' || message.length > 500) {
        return
      }
      
      const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id)
      userRooms.forEach(roomCode => {
        socket.to(roomCode).emit('chat:message', {
          id: `${Date.now()}-${Math.random()}`,
          userId: socket.id,
          userName: user.name,
          message: message.substring(0, 500),
          timestamp: new Date(),
        })
      })
    } catch (error) {
      console.error('Error sending message:', error)
    }
  })

  socket.on('webrtc:offer', ({ to, data }) => {
    try {
      if (!to || !data) return
      
      console.log(`[WebRTC] Relaying OFFER from ${socket.id} to ${to}`)
      io.to(to).emit('webrtc:offer', {
        type: 'offer',
        from: socket.id,
        to,
        data,
      })
    } catch (error) {
      console.error('Error relaying offer:', error)
    }
  })

  socket.on('webrtc:answer', ({ to, data }) => {
    try {
      if (!to || !data) return
      
      console.log(`[WebRTC] Relaying ANSWER from ${socket.id} to ${to}`)
      io.to(to).emit('webrtc:answer', {
        type: 'answer',
        from: socket.id,
        to,
        data,
      })
    } catch (error) {
      console.error('Error relaying answer:', error)
    }
  })

  socket.on('webrtc:ice-candidate', ({ to, data }) => {
    try {
      if (!to || !data) return
      
      console.log(`[WebRTC] Relaying ICE candidate from ${socket.id} to ${to} (${data.type || 'unknown'} ${data.protocol || ''})`)
      io.to(to).emit('webrtc:ice-candidate', {
        type: 'ice-candidate',
        from: socket.id,
        to,
        data,
      })
    } catch (error) {
      console.error('Error relaying ICE candidate:', error)
    }
  })

  socket.on('stream:start', () => {
    try {
      const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id)
      userRooms.forEach(roomCode => {
        const room = rooms.get(roomCode)
        if (room && room.hostId === socket.id) {
          room.isStreaming = true
          socket.to(roomCode).emit('stream:started')
          console.log(`Stream started in room ${roomCode}`)
        }
      })
    } catch (error) {
      console.error('Error starting stream:', error)
    }
  })

  socket.on('stream:stop', () => {
    try {
      const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id)
      userRooms.forEach(roomCode => {
        const room = rooms.get(roomCode)
        if (room && room.hostId === socket.id) {
          room.isStreaming = false
          socket.to(roomCode).emit('stream:stopped')
          console.log(`Stream stopped in room ${roomCode}`)
        }
      })
    } catch (error) {
      console.error('Error stopping stream:', error)
    }
  })

  socket.on('disconnect', (reason) => {
    connectionStats.currentConnections--
    console.log(`[SOCKET] User disconnected: ${socket.id} (Reason: ${reason}, Active: ${connectionStats.currentConnections})`)
    
    try {
      const user = users.get(socket.id)
      if (user) {
        console.log(`[ROOM] Removing user ${user.name} (${socket.id}) from all rooms`)
        
        // Get all rooms this socket was in (except their own ID room)
        const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id)
        
        userRooms.forEach(roomCode => {
          const room = removeUserFromRoom(roomCode, socket.id)
          
          if (room) {
            // Only emit user:left if room still exists
            if (rooms.has(roomCode)) {
              io.to(roomCode).emit('user:left', socket.id)
              
              // Send updated viewer count
              io.to(roomCode).emit('room:updated', {
                viewers: room.viewers,
                viewerCount: room.viewers.length
              })
            }
            
            if (user.isHost && room) {
              console.log(`[ROOM] Host disconnected, notifying viewers`)
              io.to(roomCode).emit('stream:stopped')
              io.to(roomCode).emit('host:disconnected')
            }
          }
        })
        
        // Clean up user data
        users.delete(socket.id)
      }
      
      // Force cleanup of any lingering socket rooms
      socket.rooms.clear()
    } catch (error) {
      console.error('Error handling disconnect:', error)
    }
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: connectionStats.currentConnections,
    rooms: rooms.size,
    users: users.size,
  }
  res.json(health)
})

// Debug endpoint for specific room
app.get('/room/:code', (req, res) => {
  const roomCode = req.params.code.toUpperCase()
  const room = rooms.get(roomCode)
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found', availableRooms: Array.from(rooms.keys()) })
  }
  
  res.json({
    room: {
      code: room.code,
      hostId: room.hostId,
      hostName: room.hostName,
      viewers: room.viewers,
      viewerCount: room.viewers.length,
      maxViewers: room.maxViewers,
      isStreaming: room.isStreaming,
      createdAt: room.createdAt,
    },
    connectedSockets: io.sockets.adapter.rooms.get(roomCode) ? 
      Array.from(io.sockets.adapter.rooms.get(roomCode)) : [],
  })
})

// Stats endpoint
app.get('/stats', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    code: room.code,
    hostId: room.hostId,
    hostName: room.hostName,
    viewers: room.viewers.length,
    viewerList: room.viewers.map(v => ({ id: v.id, name: v.name })),
    maxViewers: room.maxViewers,
    isStreaming: room.isStreaming,
    createdAt: room.createdAt,
  }))
  
  res.json({
    ...connectionStats,
    currentRooms: rooms.size,
    currentUsers: users.size,
    activeRoomCodes: Array.from(rooms.keys()),
    rooms: roomList,
  })
})

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'ShareFlow Signaling Server',
    version: '1.0.0',
    status: 'running',
    health: '/health',
    stats: '/stats',
    rooms: rooms.size,
    users: users.size,
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully')
  
  io.close(() => {
    console.log('All socket connections closed')
  })
  
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
})

const PORT = process.env.PORT || 3001
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ShareFlow Signaling Server v1.0.0`)
  console.log(`Running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`)
})