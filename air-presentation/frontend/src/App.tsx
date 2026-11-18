import React, { useEffect, useMemo, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import { deletePresentation, getPresentationFile, uploadPptx } from "./services/api"
import { processGesture, type GestureControllerState } from "./gestures/gestureController"
import type { GestureCommand } from "./types/gestures"

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

type UploadState = "idle" | "uploading" | "ready" | "error"

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"

export default function App() {
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [presentationId, setPresentationId] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [isRendering, setIsRendering] = useState(false)

  // Camera / gestures
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [gestureControlEnabled, setGestureControlEnabled] = useState(true)
  const [blackScreen, setBlackScreen] = useState(false)
  const [handDetected, setHandDetected] = useState(false)
  const [lastGesture, setLastGesture] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [modelError, setModelError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef<number | null>(null)
  const gestureStateRef = useRef<GestureControllerState>({
    lastRecognized: null,
    lastGestureTime: 0,
    wristXHistory: [],
    isControlEnabled: true,
    isBlackScreenEnabled: false,
  })
  const lastVideoTimeRef = useRef<number>(-1)

  const canPrev = currentPage > 1
  const canNext = totalPages > 0 && currentPage < totalPages

  const statusLabel = useMemo(() => {
    if (uploadState === "uploading") return "Uploading and converting PPTX..."
    if (uploadState === "error") return "Something went wrong"
    if (uploadState === "ready" && pdfDoc) return "Presentation ready"
    return "Upload a PPTX to start"
  }, [uploadState, pdfDoc])

  function applyGestureCommand(command: GestureCommand) {
    setLastGesture(command)
    if (command === "NEXT_SLIDE") {
      setCurrentPage((p) => Math.min(p + 1, totalPages || p))
    } else if (command === "PREVIOUS_SLIDE") {
      setCurrentPage((p) => Math.max(p - 1, 1))
    } else if (command === "TOGGLE_GESTURE_CONTROL") {
      setGestureControlEnabled((v) => {
        const next = !v
        gestureStateRef.current.isControlEnabled = next
        return next
      })
    } else if (command === "TOGGLE_BLACK_SCREEN") {
      setBlackScreen((v) => {
        const next = !v
        gestureStateRef.current.isBlackScreenEnabled = next
        return next
      })
    }
  }

  async function ensureHandLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current
    setModelStatus("loading")
    setModelError(null)
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      })
      landmarkerRef.current = landmarker
      setModelStatus("ready")
      return landmarker
    } catch (e: any) {
      console.error(e)
      setModelStatus("error")
      setModelError(e?.message || "Failed to load hand landmarker model")
      throw e
    }
  }

  function stopCamera() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setHandDetected(false)
  }

  async function startCamera() {
    setCameraError(null)
    try {
      await ensureHandLandmarker()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (e: any) {
      console.error(e)
      setCameraError(e?.message || "Camera access failed")
      stopCamera()
    }
  }

  useEffect(() => {
    return () => {
      stopCamera()
      try {
        landmarkerRef.current?.close()
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Gesture detection loop
  useEffect(() => {
    if (!cameraActive || !landmarkerRef.current || !videoRef.current) return

    let cancelled = false
    const loop = () => {
      if (cancelled) return
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (video && landmarker && video.readyState >= 2) {
        const now = performance.now()
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime
          try {
            const result = landmarker.detectForVideo(video, now)
            const landmarks = result.landmarks && result.landmarks[0]
              ? result.landmarks[0].map((l: any) => ({ x: l.x, y: l.y, z: l.z ?? 0 }))
              : null
            setHandDetected(!!landmarks && landmarks.length > 0)

            // keep controller flags in sync
            gestureStateRef.current.isControlEnabled = gestureControlEnabled
            gestureStateRef.current.isBlackScreenEnabled = blackScreen

            const { command, updatedState } = processGesture(landmarks, gestureStateRef.current)
            gestureStateRef.current = updatedState

            if (command) {
              // Respect control toggle: only TOGGLE_GESTURE_CONTROL can fire when disabled
              if (gestureControlEnabled || command === "TOGGLE_GESTURE_CONTROL") {
                applyGestureCommand(command)
              }
            }
          } catch (e) {
            // detection errors shouldn't kill the loop
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [cameraActive, gestureControlEnabled, blackScreen, totalPages])

  async function renderPage(pageNumber: number) {
    if (!pdfDoc || !canvasRef.current) return
    setIsRendering(true)
    try {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {
          // ignore
        }
      }

      const page = await pdfDoc.getPage(pageNumber)
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas context unavailable")

      const containerWidth = canvas.parentElement?.clientWidth || 960
      const unscaledViewport = page.getViewport({ scale: 1 })
      const scale = Math.min((containerWidth - 32) / unscaledViewport.width, 1.6)
      const viewport = page.getViewport({ scale: Math.max(scale, 0.5) })

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, viewport.width, viewport.height)

      const task = page.render({ canvasContext: context, viewport })
      renderTaskRef.current = task
      await task.promise
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") {
        console.error(e)
        setError(e?.message || "Failed to render slide")
      }
    } finally {
      setIsRendering(false)
    }
  }

  useEffect(() => {
    if (pdfDoc && totalPages > 0) {
      renderPage(currentPage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, totalPages])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!pdfDoc) return
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault()
        setCurrentPage((p) => Math.min(p + 1, totalPages || p))
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault()
        setCurrentPage((p) => Math.max(p - 1, 1))
      } else if (e.key === "Escape") {
        e.preventDefault()
        void handleReset()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  async function handleFile(file: File) {
    setError(null)
    setUploadState("uploading")
    try {
      const result = await uploadPptx(file)
      setPresentationId(result.presentationId)

      const response = await getPresentationFile(result.presentationId)
      const data = await response.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data })
      const doc = await loadingTask.promise

      setPdfDoc(doc)
      setTotalPages(doc.numPages)
      setCurrentPage(1)
      setUploadState("ready")
    } catch (e: any) {
      console.error(e)
      setError(e?.message || "Upload or conversion failed")
      setUploadState("error")
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      await handleFile(file)
      e.target.value = ""
    }
  }

  async function handleReset() {
    setError(null)
    stopCamera()
    if (presentationId) {
      try {
        await deletePresentation(presentationId)
      } catch {
        // ignore cleanup errors
      }
    }
    setPresentationId(null)
    setPdfDoc(null)
    setTotalPages(0)
    setCurrentPage(1)
    setBlackScreen(false)
    setLastGesture(null)
    setUploadState("idle")
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Air Presentation</h1>
            <p className="text-sm text-slate-400">Upload PPTX, convert to PDF, present with keyboard or hand gestures</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={onFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              disabled={uploadState === "uploading"}
            >
              {uploadState === "uploading" ? "Uploading..." : "Upload PPTX"}
            </button>
            {!cameraActive ? (
              <button
                onClick={() => void startCamera()}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Enable Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Stop Camera
              </button>
            )}
            {presentationId && (
              <button
                onClick={() => void handleReset()}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden relative">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{statusLabel}</p>
              {pdfDoc && (
                <p className="text-xs text-slate-400">
                  Slide {currentPage} of {totalPages}
                  {isRendering ? " · Rendering..." : ""}
                </p>
              )}
            </div>
            {pdfDoc && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={!canPrev}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={!canNext}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div className="min-h-[60vh] p-4 flex items-center justify-center bg-slate-950/40 relative">
            {!pdfDoc && (
              <div className="max-w-lg text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-500">
                  PPTX
                </div>
                <h2 className="text-lg font-medium">No presentation loaded</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Upload a <code>.pptx</code> file. The backend converts it to PDF (requires LibreOffice installed) and the slides render here.
                </p>
                {uploadState === "uploading" && (
                  <p className="mt-4 text-sm text-blue-300">Converting, please wait...</p>
                )}
              </div>
            )}
            {pdfDoc && (
              <div className="w-full flex justify-center overflow-auto relative">
                <canvas ref={canvasRef} className="rounded-md shadow-2xl bg-white max-w-full" />
                {blackScreen && (
                  <div className="absolute inset-0 bg-black/95 rounded-md flex items-center justify-center">
                    <p className="text-slate-300 text-sm">Black screen (fist gesture to toggle)</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-medium">Camera & Gestures</h3>
            <div className="mt-3 space-y-3">
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-black border border-slate-800 flex items-center justify-center relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraActive ? "" : "hidden"}`}
                />
                {!cameraActive && (
                  <p className="text-sm text-slate-400 px-4 text-center">Enable camera to start hand tracking</p>
                )}
              </div>

              <div className="text-sm space-y-1.5 text-slate-300">
                <p><span className="text-slate-400">Model:</span> {modelStatus}{modelError ? ` (${modelError})` : ""}</p>
                <p><span className="text-slate-400">Camera:</span> {cameraActive ? "active" : "off"}</p>
                <p><span className="text-slate-400">Hand detected:</span> {handDetected ? "yes" : "no"}</p>
                <p><span className="text-slate-400">Gesture control:</span> {gestureControlEnabled ? "enabled" : "paused"}</p>
                <p><span className="text-slate-400">Last gesture:</span> {lastGesture || "none"}</p>
                {cameraError && <p className="text-red-300">{cameraError}</p>}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setGestureControlEnabled((v) => {
                      const next = !v
                      gestureStateRef.current.isControlEnabled = next
                      return next
                    })
                  }}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
                >
                  {gestureControlEnabled ? "Pause Gestures" : "Resume Gestures"}
                </button>
                <button
                  onClick={() => setBlackScreen((v) => {
                    const next = !v
                    gestureStateRef.current.isBlackScreenEnabled = next
                    return next
                  })}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
                >
                  {blackScreen ? "Unblack" : "Black Screen"}
                </button>
              </div>

              <div className="text-xs text-slate-400 space-y-1 pt-1">
                <p><strong className="text-slate-300">Gestures:</strong></p>
                <p>• Swipe hand right → Next slide</p>
                <p>• Swipe hand left → Previous slide</p>
                <p>• Open palm → Toggle gesture control</p>
                <p>• Fist → Toggle black screen</p>
                <p className="pt-1">Tip: keep one hand visible, move wrist clearly across frame for swipes.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-medium">Keyboard Controls</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li><span className="text-slate-400">Next:</span> Right Arrow / Page Down</li>
              <li><span className="text-slate-400">Previous:</span> Left Arrow / Page Up</li>
              <li><span className="text-slate-400">Close:</span> Esc</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-medium">Status</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p><span className="text-slate-400">Backend:</span> {import.meta.env.VITE_BASE_URL || "http://localhost:8000"}</p>
              <p><span className="text-slate-400">Presentation:</span> {presentationId ? `${presentationId.slice(0, 8)}...` : "none"}</p>
              <p><span className="text-slate-400">Slides:</span> {totalPages || "-"}</p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
