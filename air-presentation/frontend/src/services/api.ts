import type { GestureCommand } from "../types/gestures"

const BASE_URL = import.meta.env.VITE_BASE_URL || "http://localhost:8000"

export async function uploadPptx(file: File): Promise<{
  presentationId: string
  pdfUrl: string
  status: string
}> {
  const formData = new FormData()
  formData.append("file", file, file.name)

  const response = await fetch(`${BASE_URL}/api/presentations`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.detail || "Upload failed")
  }

  return response.json()
}

export async function getPresentationFile(presentationId: string): Promise<Response> {
  const response = await fetch(`${BASE_URL}/api/presentations/${presentationId}/file`)
  if (!response.ok) {
    throw new Error("Failed to fetch PDF")
  }
  return response
}

export async function deletePresentation(presentationId: string): Promise<{
  status: string
}> {
  const response = await fetch(`${BASE_URL}/api/presentations/${presentationId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error("Failed to delete presentation")
  }
  return response.json()
}

export async function sendGestureCommand(command: GestureCommand): Promise<void> {
  // This will be used when we integrate with the presentation controller
  // For now, it's a no-op that will be implemented in the presentation controller
  console.log(`Gesture command sent: ${command}`)
}