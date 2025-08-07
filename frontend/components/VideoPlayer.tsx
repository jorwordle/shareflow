'use client'

import { useEffect, useRef, useState } from 'react'
import { StreamQuality } from '@/types'

interface VideoPlayerProps {
  stream: MediaStream | null
  isLocal?: boolean
  quality?: StreamQuality['resolution']
  onQualityChange?: (quality: StreamQuality['resolution']) => void
  className?: string
}

export default function VideoPlayer({
  stream,
  isLocal = false,
  quality = '1080p',
  onQualityChange,
  className = '',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(false)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const handleFullscreen = () => {
    if (!videoRef.current) return

    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true)
      })
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      })
    }
  }

  const handleQualityChange = (newQuality: StreamQuality['resolution']) => {
    onQualityChange?.(newQuality)
  }

  return (
    <div 
      className={`video-container ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-contain"
      />

      {stream && (
        <>
          <div className="quality-badge">
            {quality}
          </div>

          {showControls && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {!isLocal && onQualityChange && (
                    <select
                      value={quality}
                      onChange={(e) => handleQualityChange(e.target.value as StreamQuality['resolution'])}
                      className="bg-black/50 text-white px-3 py-1 rounded-md text-sm backdrop-blur-sm border border-white/20"
                    >
                      <option value="360p">360p</option>
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  )}
                </div>

                <button
                  onClick={handleFullscreen}
                  className="p-2 bg-black/50 text-white rounded-md backdrop-blur-sm hover:bg-black/70 transition-colors"
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5H5m10 0h4v4m0 6v4h-4m-6 0H5v-4" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4m8 0h4v4m0 8v4h-4M4 16v4h4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Waiting for stream...</p>
          </div>
        </div>
      )}
    </div>
  )
}