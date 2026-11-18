# Air Presentation System — Project Summary

## Overview
Air Presentation System is a laptop-first web application that enables presenters to upload a PowerPoint file, start a presentation, and navigate slides using hand gestures captured by the laptop webcam. The system converts PPTX files to PDF for reliable browser rendering, and uses MediaPipe Hand Landmarker for in-browser gesture detection — no webcam frames are sent to the backend.

## Architecture
The application has two runtime parts:

1. **React + Vite frontend** — owns the user experience, PDF rendering, webcam access, hand tracking, gesture interpretation and slide navigation.
2. **FastAPI backend** — accepts PPTX files, converts them to PDF using LibreOffice, and serves the generated PDF temporarily.

The webcam stream stays in the browser; the backend does not need image frames or hand landmarks.

## Key Features
- **PPTX upload and conversion** — upload a `.pptx` file, validate extension/size, convert to PDF via LibreOffice headless mode
- **PDF.js slide viewer** — render converted PDF pages as presentation slides with navigation controls
- **Webcam hand tracking** — MediaPipe Hand Landmarker detects 21 hand landmarks in the browser
- **Gesture-based slide navigation** — swipe right/left to advance or retreat one slide
- **Static gesture controls** — open palm to pause/resume gesture control, fist to toggle black-screen overlay
- **Keyboard fallback** — Right/PageDown for next, Left/PageUp for previous, Escape to exit
- **Temporary file cleanup** — backend generates unguessable presentation IDs, deletes files on demand or after expiry

## Tech Stack
| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React + Vite + TypeScript | Upload UI, presentation screen, camera controls, app state |
| Styling | Tailwind CSS | Responsive interface and presentation controls |
| PPTX conversion | Python + FastAPI | Accept PPTX uploads and convert to PDF |
| Conversion engine | LibreOffice headless | Preserve slide layout |
| Slide rendering | pdfjs-dist | Render PDF pages as slides |
| Hand tracking | MediaPipe Tasks Vision — Hand Landmarker | Detect hand landmarks from webcam frames |
| Gesture logic | TypeScript | Interpret landmarks, detect gestures and swipes |
| Camera | Browser `getUserMedia()` | Access webcam with user permission |
| Local dev | Node.js + npm, Python virtual environment | Run frontend and backend |

## Core Dependencies
### Frontend
- `react`, `react-dom`, `vite`, `typescript`, `tailwindcss`
- `@mediapipe/tasks-vision`, `pdfjs-dist`

### Backend
- `fastapi`, `uvicorn[standard]`, `python-multipart`, `pydantic`
- System: LibreOffice installed and available to the backend process

## MVP Constraints
- Support `.pptx` first; reject unsupported file types with a clear message
- Configurable upload size limit (e.g., 50 MB)
- Convert to PDF before presentation
- Do not store uploaded files permanently
- Do not upload webcam frames to the backend
- No authentication, database, cloud storage, or analytics in the first version
- PowerPoint animations and transitions are out of scope
- Provide keyboard controls as a fallback if camera access fails

## Privacy & Security
- Camera permission requested only when user starts camera setup or presentation
- Webcam frames processed entirely in the browser; never recorded or saved
- Temporary presentation files isolated by generated IDs
- Validate file extension, MIME type, and file signature where feasible
- Generate server-side random temporary filenames; never trust uploaded filename as filesystem path
- Enforce upload size limits and conversion timeouts
- Store temporary files outside public static directories and delete after conversion or expiry
- Do not expose arbitrary filesystem paths or shell command input through the API

## Acceptance Criteria (MVP ready for demo)
- [ ] User can upload a valid PPTX
- [ ] Invalid file types and oversized files are rejected
- [ ] Backend converts PPTX to PDF successfully
- [ ] PDF.js displays all slides and reports correct page count
- [ ] User can enable and disable the webcam
- [ ] MediaPipe detects a visible hand in real time
- [ ] Swipe right advances exactly one slide
- [ ] Swipe left moves back exactly one slide
- [ ] Static gestures do not repeatedly fire while held
- [ ] First and last slide boundaries work correctly
- [ ] Keyboard fallback works
- [ ] Exiting presentation stops the camera
- [ ] Temporary files can be deleted

## Build Order (suggested)
1. Build the upload UI and PPTX-to-PDF backend
2. Build the PDF.js slide viewer and keyboard navigation
3. Add webcam permission and live camera preview
4. Integrate MediaPipe Hand Landmarker
5. Implement swipe detection first
6. Add static gestures and gesture debouncing
7. Add presentation mode, black-screen overlay and cleanup
8. Test in different lighting conditions and with different hand distances