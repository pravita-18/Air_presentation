export type GestureCommand =
  | "NEXT_SLIDE"
  | "PREVIOUS_SLIDE"
  | "TOGGLE_GESTURE_CONTROL"
  | "TOGGLE_BLACK_SCREEN"

export type GestureState = {
  lastRecognized: GestureCommand | null
  cooldownRemaining: number
  isControlEnabled: boolean
  isBlackScreenEnabled: boolean
}