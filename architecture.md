# Air Presentation System — MVP Architecture

## 1. Architecture overview

The application has two runtime parts:

1. **React frontend:** owns the user experience, PDF rendering, webcam access, hand tracking, gesture interpretation and slide navigation.
2. **FastAPI backend:** accepts PPTX files, converts them to PDF using LibreOffice, and serves the generated PDF temporarily.

The webcam stream stays in the browser. The backend does not need image frames or hand landmarks.

```text
                  USER
                   |
                   v
          React + Vite Frontend
          /          |          \
         /           |           \
        v            v            v
   PPTX Upload    PDF.js       Webcam
        |          Viewer         |
        v                         v
   FastAPI API              MediaPipe
        |                   Hand Landmarker
        v                         |
   File Validator                 v
        |                  Gesture Engine
        v                         |
   LibreOffice                     v
   PPTX -> PDF              Gesture Controller
        |                         |
        v                         v
   Temporary PDF  ----------> Slide State
                                  |
                                  v
                            Current Slide
```

## 2. Frontend modules

### App shell
Controls the overall application state:
- `HOME`
- `UPLOADING`
- `PREVIEW`
- `CAMERA_SETUP`
- `PRESENTING`

Keep transitions explicit so gesture detection cannot accidentally control slides outside presentation mode.

### File upload module
Responsibilities:
- Select or drop a `.pptx`.
- Validate extension and size before upload.
- Show progress and conversion errors.
- Retain the returned presentation ID and PDF URL.

### PDF viewer module
Responsibilities:
- Load the converted PDF using PDF.js.
- Track page count and current page.
- Render the selected page to a canvas.
- Render the next slide on demand or use a small cache.
- Expose `nextSlide()`, `previousSlide()` and `goToSlide(index)`.

### Camera module
Responsibilities:
- Request webcam access only after user action.
- Display a local preview.
- Stop all media tracks when camera use ends.
- Handle permission denied, missing camera and camera-in-use errors.

### Hand tracking module
Responsibilities:
- Load the MediaPipe Hand Landmarker model.
- Process video frames in the browser.
- Retrieve 21 hand landmarks.
- Expose landmarks and confidence to the gesture engine.
- Avoid unnecessary inference when presentation mode is inactive.

### Gesture engine
Responsibilities:
- Convert landmarks into normalized coordinates.
- Classify static hand poses.
- Track hand movement over time for swipes.
- Apply confidence, stability, neutral-state and cooldown rules.
- Emit semantic commands rather than manipulating the viewer directly.

Example command types:
- `NEXT_SLIDE`
- `PREVIOUS_SLIDE`
- `TOGGLE_GESTURE_CONTROL`
- `TOGGLE_BLACK_SCREEN`

### Presentation controller
Responsibilities:
- Receive semantic gesture commands.
- Check that presentation mode is active.
- Update the slide index safely.
- Apply black-screen overlay state.
- Keep keyboard controls available.

## 3. Backend modules

### Upload endpoint
- Accept one PPTX file.
- Enforce file-size limits.
- Validate file type and content.
- Generate an unguessable presentation ID.
- Save into a unique temporary directory.

### Conversion service
- Invoke LibreOffice in headless mode with a fixed, server-controlled command.
- Use a timeout.
- Capture conversion errors safely.
- Verify the resulting PDF exists and is non-empty.
- Never pass user-controlled shell fragments into a command.

### File-serving endpoint
- Serve only PDFs associated with valid presentation IDs.
- Set appropriate content type and safe response headers.
- Do not expose the temporary directory directly as a static public folder.

### Cleanup service
- Delete files when the frontend calls the delete endpoint.
- Expire abandoned presentation files after a configurable period.
- Clean up partial conversion output after failures.

## 4. Data flow

### Upload and conversion

```text
Browser
  | POST multipart PPTX
  v
FastAPI
  | validate + create temporary directory
  v
LibreOffice
  | converted PDF
  v
FastAPI
  | presentation ID + PDF URL
  v
Browser
  | PDF.js loads PDF
  v
Slide viewer
```

### Gesture navigation

```text
Webcam video frame
  |
  v
MediaPipe landmarks
  |
  v
Gesture engine
  |
  v
Stable gesture candidate?
  |
  +---- No ----> Continue tracking
  |
 Yes
  |
  v
Cooldown / neutral-state check
  |
  v
Emit NEXT_SLIDE or PREVIOUS_SLIDE
  |
  v
Presentation controller
  |
  v
Update PDF page index
```

## 5. State model

Suggested frontend state:

```ts
type AppScreen =
  | "HOME"
  | "UPLOADING"
  | "PREVIEW"
  | "CAMERA_SETUP"
  | "PRESENTING";

type PresentationState = {
  presentationId: string | null;
  pdfUrl: string | null;
  totalSlides: number;
  currentSlideIndex: number;
  isPresentationActive: boolean;
  isCameraActive: boolean;
  isGestureControlEnabled: boolean;
  isBlackScreenEnabled: boolean;
};
```

Suggested gesture command type:

```ts
type GestureCommand =
  | "NEXT_SLIDE"
  | "PREVIOUS_SLIDE"
  | "TOGGLE_GESTURE_CONTROL"
  | "TOGGLE_BLACK_SCREEN";
```

Keep gesture detection separate from slide navigation. This makes it easier to test the gesture engine without loading a PowerPoint file.

## 6. Reliability considerations

- Run gesture detection only when the presentation is active and the camera is enabled.
- Use a timestamp-aware processing loop; do not process the same video frame repeatedly.
- Keep a short rolling history for swipe direction and speed.
- Require multiple consistent detections before firing a static gesture.
- Add a cooldown and neutral reset to prevent repeated commands.
- Show a visible indicator when a gesture is recognized.
- Provide keyboard navigation if webcam access or inference fails.
- Test with different webcam resolutions, lighting, skin/background contrast, and hand orientations.
- Make sure the camera is stopped when the user exits or the component unmounts.

## 7. Security and privacy boundaries

- Camera access is browser-side and permission-based.
- Webcam frames are not sent to the backend.
- Temporary presentation files are isolated by generated IDs.
- Upload size and conversion time are bounded.
- The backend never accepts a filesystem path from the browser.
- Temporary files are removed after use or expiry.
- The MVP should not claim that files are permanently erased from every operating-system cache or backup; it should only guarantee cleanup of its own temporary working files.

## 8. Deliberately out of scope

Do not include these in the first MVP:
- User accounts and cloud sync
- Remote presentation control
- Multiple presenters
- Custom-trained gesture model
- Voice commands
- PowerPoint animation playback
- Live collaboration
- Presentation analytics
- Mobile application

These features can be considered after the basic upload-to-gesture-navigation loop works reliably.
