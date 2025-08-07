'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateRoom = async () => {
    if (!name.trim()) return
    
    setIsCreating(true)
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    
    localStorage.setItem('userName', name)
    localStorage.setItem('isHost', 'true')
    
    router.push(`/room/${newRoomCode}`)
  }

  const handleJoinRoom = () => {
    if (!name.trim() || !roomCode.trim()) return
    
    localStorage.setItem('userName', name)
    localStorage.setItem('isHost', 'false')
    
    router.push(`/room/${roomCode.toUpperCase()}`)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-effect rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              ShareFlow
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              High-quality screen sharing, instantly
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field w-full"
                placeholder="Enter your name"
                maxLength={30}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">
                  Choose an option
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleCreateRoom}
                disabled={!name.trim() || isCreating}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating Room...' : 'Create New Room'}
              </button>

              <div className="space-y-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="input-field w-full text-center uppercase"
                  placeholder="Enter room code"
                  maxLength={6}
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!name.trim() || !roomCode.trim()}
                  className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Room
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>1080p @ 60fps</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                <span>No registration</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                <span>10 viewers</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}