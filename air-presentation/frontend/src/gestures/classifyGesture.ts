import type { GestureCommand } from "../types/gestures"

// Finger tip and pip landmark indices
const FINGER_LANDMARKS = {
  thumb: { tip: 4, pip: 3 },
  index: { tip: 8, pip: 6 },
  middle: { tip: 12, pip: 10 },
  ring: { tip: 16, pip: 14 },
  pinky: { tip: 20, pip: 18 },
}

/**
 * Determine if a finger is extended based on landmark positions.
 * Uses normalized coordinates (0 to 1).
 */
export function isFingerExtended(landmarks: Array<{ x: number; y: number; z: number }>, finger: keyof typeof FINGER_LANDMARKS): boolean {
  if (!landmarks || landmarks.length < FINGER_LANDMARKS[finger].tip + 1) return false

  const { tip, pip } = FINGER_LANDMARKS[finger]
  const tipLandmark = landmarks[tip]
  const pipLandmark = landmarks[pip]

  // Compare tip y-position with pip y-position
  // For most fingers, extended means tip is higher (lower y value)
  return tipLandmark.y < pipLandmark.y
}

/**
 * Determine if thumb is extended.
 * Thumb has a different orientation, so we check x-position instead.
 */
export function isThumbExtended(landmarks: Array<{ x: number; y: number; z: number }>): boolean {
  if (!landmarks || landmarks.length < 5) return false

  const thumbTip = landmarks[4]
  const thumbIp = landmarks[3]
  const thumbMcp = landmarks[2]

  // Thumb is extended if tip is to the right of ip (for right hand, mirrored camera)
  // We use a simple check: tip x > ip x means extended (in mirrored view)
  return thumbTip.x > thumbIp.x
}

/**
 * Check if the hand is making a fist (most fingers curled).
 */
export function isFist(landmarks: Array<{ x: number; y: number; z: number }>): boolean {
  if (!landmarks) return false

  const fingers = ["index", "middle", "ring", "pinky"]
  const curledCount = fingers.filter(finger => {
    const { tip, pip } = FINGER_LANDMARKS[finger]
    if (!landmarks[tip] || !landmarks[pip]) return false
    // Finger is curled if tip is below pip (higher y value)
    return landmarks[tip].y > landmarks[pip].y
  }).length

  // Fist if at least 3 of 4 fingers are curled
  return curledCount >= 3
}

/**
 * Check if hand is open palm (most fingers extended).
 */
export function isOpenPalm(landmarks: Array<{ x: number; y: number; z: number }>): boolean {
  if (!landmarks) return false

  const fingers = ["index", "middle", "ring", "pinky"]
  const extendedCount = fingers.filter(finger => isFingerExtended(landmarks, finger)).length

  // Open palm if at least 3 of 4 fingers are extended
  return extendedCount >= 3
}

/**
 * Detect swipe gesture based on wrist movement.
 * Tracks horizontal movement of the wrist landmark (0).
 */
export function detectSwipe(
  currentLandmarks: Array<{ x: number; y: number; z: number }>,
  previousWristX: number | null,
  threshold: number = 0.15
): { direction: "left" | "right" | null; currentWristX: number } {
  if (!currentLandmarks || currentLandmarks.length < 1) {
    return { direction: null, currentWristX: previousWristX || 0 }
  }

  const wristX = currentLandmarks[0].x
  const result = { direction: null as "left" | "right" | null, currentWristX }

  if (previousWristX !== null) {
    const movement = wristX - previousWristX

    // In a mirrored camera preview, positive movement means swipe left visually
    // but the presenter's right hand moving right should move to next slide
    // We normalize: if wrist moves right (increasing x), it's a "right" swipe
    if (movement > threshold) {
      result.direction = "right"
    } else if (movement < -threshold) {
      result.direction = "left"
    }
  }

  result.currentWristX = wristX
  return result
}