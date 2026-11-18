import { useState, useEffect, useRef } from "react"

export type HandLandmarkerResult = {
  landmarks: Array<{
    x: number
    y: number
    z: number
  }> | null
  timestamp: number
}

export type HandLandmarkerState = {
  isRunning: boolean
  confidence: number
  lastResult: HandLandmarkerResult
  stop: () => void
}

export function useHandLandmarker(
  modelPath: string,
  onResult: (landmarks: HandLandmarkerResult) => void
) {
  const [isRunning, setIsRunning] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const lastResultRef = useRef<HandLandmarkerResult>({ landmarks: null, timestamp: 0 })
  const modelRef = useRef<any>(null)
  const animationFrameRef = useRef<number>(0)

  useEffect(() => {
    // Load the MediaPipe model
    import("@mediapipe/tasks-vision").then(({ HandLandmarker, HandLandmarkerOptions, HandLandmarkerRunningMode }) => {
      const options: HandLandmarkerOptions = {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "web",  // or "gpu" if available
        },
        maxNumHands: 1,
        runningMode: "visualization",
      }

      modelRef.current = new HandLandmarker(options)

      // Set up the result callback
      modelRef.current.onResults = (results: any) => {
        const landmarks: HandLandmarkerResult = {
          landmarks: results.landmarks ? results.landmarks[0].map((l: any) => ({
            x: l.x,
            y: l.y,
            z: l.z,
          })) : null,
          timestamp: results.timestamp,
        }
        lastResultRef.current = landmarks
        setConfidence(results.score || 0)
        onResult(landmarks)
      }
    })

    if (isRunning && modelRef.current) {
      // Start processing
      // Will be started from the camera component
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (modelRef.current) {
        modelRef.current.reset()
      }
    }
  }, [isRunning, modelPath, onResult])

  const start = () => {
    setIsRunning(true)
  }

  const stop = () => {
    setIsRunning(false)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = 0
    }
    if (modelRef.current) {
      modelRef.current.reset()
    }
  }

  return { isRunning, confidence, lastResult: lastResultRef.current, start, stop }
}