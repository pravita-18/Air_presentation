import { useState, useEffect, useRef } from "react"

export type CameraState = {
  isActive: boolean
  error: string | null
  stop: () => void
}

export function useCamera(): CameraState {
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = () => {
    setIsActive(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const enable = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      setIsActive(true)
      setError(null)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err: any) {
      setError(err.message || "Camera access denied")
      setIsActive(false)
    }
  }

  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  return { isActive, error, stop, enable }
}