import React, { useState, useRef, useEffect } from "react"
import { useCamera } from "../hooks/useCamera"
import { useHandLandmarker } from "../hooks/useHandLandmarker"
import { processGesture, GestureControllerState } from "../gestures/gestureController"
import type { GestureCommand } from "../types/gestures"

const MODEL_PATH = "/models/hand_landmarker.task"

export default function CameraPreview() {
  const [camera, setCamera] = useState<{
    isActive: boolean
    error: string | null
    enable: () => void
    stop: () => void
  }>({ isActive: false, error: null, enable: () => {}, stop: () => {} })

  const [gestureState, setGestureState] = useState<{
    isRunning: boolean
    confidence: number
    lastRecognized: string | null
    cooldownRemaining: number
  }>({
    isRunning: false,
    confidence: 0,
    lastRecognized: null,
    cooldownRemaining: 0,
  })

  const [presentationId, setPresentationId] = useState<string | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)
  const [isPresentationActive, setIsPresentationActive] = useState(false)
  const [isGestureControlEnabled, setIsGestureControlEnabled] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastWristXRef = useRef<number>(0)

  // Initialize hand landmarker when model path is available
  useEffect(() => {
    let modelLoaded = false
    import("@mediapipe/tasks-vision").then(({ HandLandmarker, HandLandmarkerOptions, HandLandmarkerRunningMode }) => {
      if (modelLoaded) return
      modelLoaded = true

      const options: HandLandmarkerOptions = {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: "web",
        },
        maxNumHands: 1,
        runningMode: "mediapipe",
      }

      const landMarker = new HandLandmarker(options)

      landMarker.onResults = (results: any) => {
        const landmarks: Array<{ x: number; y: number; z: number }> = []
        if (results.landmarks && results.landmarks[0]) {
          landmarks.push(...results.landmark[0].map((l: any) => ({
            x: l.x,
            y: l.y,
            z: l.z,
          })))
        }

        const state: GestureControllerState = {
          lastRecognized: gestureState.lastRecognized as GestureCommand,
          lastGestureTime: Date.now(),
          wristXHistory: lastWristXRef.current ? [lastWristXRef.current] : [],
          isControlEnabled: isGestureControlEnabled,
          isBlackScreenEnabled: false,
        }

        const result = processGesture(landmarks, state)
        
        setGestureState({
          isRunning: true,
          confidence: results.score || 0,
          lastRecognized: result.command ? result.command.toString() : null,
          cooldownRemaining: Math.max(0, COOLDOWN_MS - (Date.now() - (state.lastGestureTime || 0))),
        })

        if (result.command) {
          handleGestureCommand(result.command)
        }
      }

      // Store the landmarker instance for later use
      ; (window as any).handLandmarker = landMarker
    })
  }, [modelLoaded])

  const COOLDOWN_MS = 500

  const handleGestureCommand = (command: GestureCommand) => {
    switch (command) {
      case "NEXT_SLIDE":
        setCurrentSlide(c => Math.min(c + 1, totalSlides - 1))
        break
      case "PREVIOUS_SLIDE":
        setCurrentSlide(c => Math.max(c - 1, 0))
        break
      case "TOGGLE_GESTURE_CONTROL":
        setIsGestureControlEnabled(c => !c)
        break
      case "TOGGLE_BLACK_SCREEN":
        // Black screen handled in presentation mode
        break
    }
  }

  const handleStartPresentation = () => {
    setIsPresentationActive(true)
  }

  const handleExitPresentation = () => {
    setIsPresentationActive(false)
    camera.stop()
    // Reset slide to first
    setCurrentSlide(0)
  }

  const handleSlideChange = (slide: number) => {
    setCurrentSlide(slide)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Air Presentation</h1>
        <button
          onClick={handleStartPresentation}
          disabled={isPresentationActive || !camera.isActive || !isGestureControlEnabled}
          className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
        >
          Start Presentation
        </button>
      </header>

      {/* Main content area */}
      {isPresentationActive ? (
        <PresentationMode
          currentSlide={currentSlide}
          totalSlides={totalSlides}
          onSlideChange={handleSlideChange}
          onExit={handleExitPresentation}
          isGestureControlEnabled={isGestureControlEnabled}
        />
        : (
          <div className="grid grid-cols-1 gap-4 max-w-2xl">
            {/* Upload section */}
            {presentationId ? (
              <SlideViewer
                presentationId={presentationId}
                currentSlide={currentSlide}
                totalSlides={totalSlides}
              />
            ) : (
              <UploadArea onUpload={handleUpload} />
            })

            {/* Camera preview section */}
            <CameraArea
              camera={camera}
              gestureState={gestureState}
              onGestureCommand={handleGestureCommand}
            />
          </div>
        )}
      )}
    </div>
  )
}

function UploadArea({ onUpload }: { onUpload: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null)

  return (
    <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:border-gray-800 cursor-pointer transition-colors">
      <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" viewBox="0 0 24 24">
        <path d="M10 20v-6l4 4-4 4zm0-7v6l4 4-4-4zm8-4v6l-4-4 4-4zm-8 8v6l4 4-4-4zm0-7v6l4 4-4-4zm8-4v6L12 14z" />
      </svg>
      <p className="text-gray-300">Drag and drop a PPTX file</p>
      <p className="text-xs text-gray-500 mt-2">.pptx only, max 50MB</p>
      <input
        type="file"
        accept=".pptx"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            setFile(file)
            onUpload(file)
          }
        }}
        className="hidden"
      />
      <button
        onClick => document.querySelector('input[type="file"]')?.click()
        className="mt-2 text-blue-400 underline"
      >
        Browse
      </button>
    </div>
  )
}

function SlideViewer({
  presentationId,
  currentSlide,
  totalSlides,
}: {
  presentationId: string
  currentSlide: number
  totalSlides: number
}) {
  return (
    <div className="border rounded-lg overflow-hidden shadow-lg">
      <div className="h-64 w-full bg-gray-800">
        {/* PDF.js viewer would go here */}
        <div className="flex items-center justify-center h-full text-gray-400">
          Slide {currentSlide + 1} of {totalSlides}
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-300">
          {totalSlides} slides • Slide {currentSlide + 1} of {totalSlides}
        </p>
      </div>
    </div>
  )
}

function CameraArea({
  camera,
  gestureState,
  onGestureCommand,
}: {
  camera: {
    isActive: boolean
    error: string | null
    enable: () => void
    stop: () => void
  }
  gestureState: {
    isRunning: boolean
    confidence: number
    lastRecognized: string | null
    cooldownRemaining: number
  }
  onGestureCommand: (command: string) => void
}) {
  return (
    <div className="border rounded-lg overflow-hidden shadow-lg">
      {camera.error ? (
        <p className="p-4 text-red-300">Camera error: {camera.error}</p>
      ) : camera.isActive ? (
        <div className="relative h-64 w-full">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full"
          />
          {/* Gesture overlay */}
          <div className="absolute inset-0 bg-black/20 opacity-50"></div>
          <div className="absolute bottom-2 left-2 right-2 p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium">Gesture Status</p>
                <p className="text-lg font-bold text-green-300">
                  {gestureState.lastRecognized || "Waiting for hand"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-300">Confidence: {gestureState.confidence.toFixed(1)}%</p>
                <p className="text-xs text-gray-400">
                  Cooldown: {gestureState.cooldownRemaining > 0 ? `${gestureState.cooldownRemaining}ms` : "Ready"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="p-4 text-yellow-300">Enable camera to begin</p>
      )}
    </div>
  )
}

function PresentationMode({
  currentSlide,
  totalSlides,
  onSlideChange,
  onExit,
  isGestureControlEnabled,
}: {
  currentSlide: number
  totalSlides: number
  onSlideChange: (slide: number) => void
  onExit: () => void
  isGestureControlEnabled: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full shadow-2xl">
        <header className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Presentation Mode</h2>
          <button
            onClick={onExit}
            className="text-gray-500 hover:text-red-500"
          >
            ✕ Exit
          </button>
        </header>

        <div className="mb-4">
          <p className="text-lg">
            Slide <span className="text-red-500">{currentSlide + 1}</span> of {totalSlides}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Gesture control: {"enabled".toUpperCase().replace(
              "ENABLED",
              isGestureControlEnabled ? "ENABLED" : "DISABLED"
            )}
          </p>
          <p className="text-sm text-gray-400">
            Use swipe left/right or open palm to pause/resume gestures
          </p>
          <p className="text-sm text-gray-400">
            Make a fist to toggle black screen
          </p>
        </div>

        <div className="mt-8 pt-8 border-t">
          <button
            onClick={onExit}
            className="w-full py-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            End Presentation
          </button>
        </div>
      </div>
    </div>
  )
}