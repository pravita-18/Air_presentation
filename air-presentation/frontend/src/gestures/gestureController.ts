import type { GestureCommand } from "../types/gestures"
import { detectSwipe, isFingerExtended, isFist, isOpenPalm } from "./classifyGesture"

const SWIPE_THRESHOLD = 0.15
const GESTURE_HOLD_FRAMES = 3 // Require gesture to be consistent for 3 frames
const COOLDOWN_MS = 500 // Minimum time between gestures

export type GestureControllerState = {
  lastRecognized: GestureCommand | null
  lastGestureTime: number
  wristXHistory: number[]
  isControlEnabled: boolean
  isBlackScreenEnabled: boolean
}

/**
 * Process a single hand landmark result and determine the gesture command.
 * Returns the command if one should be emitted, or null.
 */
export function processGesture(
  landmarks: Array<{ x: number; y: number; z: number }> | null,
  state: GestureControllerState
): { command: GestureCommand | null; updatedState: GestureControllerState } {
  if (!landmarks || landmarks.length < 21) {
    // No valid landmarks, reset state and return neutral
    return {
      command: null,
      updatedState: {
        ...state,
        lastRecognized: null,
        wristXHistory: [],
      },
    }
  }

  const now = Date.now()

  // Check for fist (toggle black screen)
  if (isFist(landmarks)) {
    if (state.lastRecognized !== "TOGGLE_BLACK_SCREEN" || now - state.lastGestureTime > COOLDOWN_MS) {
      // Check if hand was in neutral before this
      const fingers = ["index", "middle", "ring", "pinky"]
      const extendedCount = fingers.filter(finger => isFingerExtended(landmarks, finger)).length

      if (extendedCount < 3) {
        // Hand is in fist position, and wasn't already in this state
        return {
          command: "TOGGLE_BLACK_SCREEN" as GestureCommand,
          updatedState: {
            ...state,
            lastRecognized: "TOGGLE_BLACK_SCREEN",
            lastGestureTime: now,
          },
        }
      }
    }
  }

  // Check for open palm (toggle gesture control)
  if (isOpenPalm(landmarks)) {
    if (state.lastRecognized !== "TOGGLE_GESTURE_CONTROL" || now - state.lastGestureTime > COOLDOWN_MS) {
      return {
        command: "TOGGLE_GESTURE_CONTROL" as GestureCommand,
        updatedState: {
          ...state,
          lastRecognized: "TOGGLE_GESTURE_CONTROL",
          lastGestureTime: now,
        },
      }
    }
  }

  // Check for swipe gestures
  const swipeResult = detectSwipe(landmarks, state.wristXHistory[state.wristXHistory.length - 1], SWIPE_THRESHOLD)

  if (swipeResult.direction && now - state.lastGestureTime > COOLDOWN_MS) {
    if (swipeResult.direction === "right") {
      return {
        command: "NEXT_SLIDE" as GestureCommand,
        updatedState: {
          ...state,
          lastRecognized: "NEXT_SLIDE",
          lastGestureTime: now,
          wristXHistory: [...state.wristXHistory.slice(-5), swipeResult.currentWristX], // Keep last 5
        },
      }
    } else if (swipeResult.direction === "left") {
      return {
        command: "PREVIOUS_SLIDE" as GestureCommand,
        updatedState: {
          ...state,
          lastRecognized: "PREVIOUS_SLIDE",
          lastGestureTime: now,
          wristXHistory: [...state.wristXHistory.slice(-5), swipeResult.currentWristX],
        },
      }
    }
  }

  // Reset wrist history if no swipe detected (keep it short)
  const updatedHistory = swipeResult.direction
    ? [...state.wristXHistory.slice(-5), swipeResult.currentWristX]
    : state.wristXHistory.slice(-10) // Keep max 10 entries

  return {
    command: null,
    updatedState: {
      ...state,
      lastRecognized: state.lastRecognized,
      wristXHistory: updatedHistory,
    },
  }
}