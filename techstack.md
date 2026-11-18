# Air Presentation System — MVP Tech Stack

## 1. Product goal

Build a laptop-first web application that lets a presenter upload a PowerPoint file, start a presentation, and navigate slides using gestures captured by the laptop webcam.

**MVP principle:** keep the application local-first. Do not require paid APIs, cloud AI inference, user accounts, or a database.

## 2. Recommended stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React + Vite + TypeScript | Upload UI, presentation screen, camera controls, app state |
| Styling | Tailwind CSS | Responsive interface and presentation controls |
| PPTX conversion | Python + FastAPI | Accept PPTX uploads and convert them to PDF |
| Conversion engine | LibreOffice headless | Preserve slide layout by converting PPTX to PDF |
| Slide rendering | PDF.js (`pdfjs-dist`) | Render PDF pages as presentation slides |
| Hand tracking | MediaPipe Tasks Vision — Hand Landmarker | Detect hand landmarks from webcam frames |
| Gesture logic | TypeScript | Interpret landmarks, detect gestures and swipes |
| Camera | Browser `getUserMedia()` | Access webcam with user permission |
| Local development | Node.js + npm, Python virtual environment | Run frontend and backend |

## 3. Why this stack?

- **React + Vite:** fast to develop, easy to componentize, and suitable for a responsive presentation UI.
- **MediaPipe Hand Landmarker:** runs hand landmark detection in the browser; no separate gesture-recognition API is needed.
- **PDF.js:** renders converted slides consistently in a browser and gives direct control over slide navigation.
- **LibreOffice:** converts uploaded PPTX files without requiring a paid conversion service.
- **FastAPI:** provides a small upload-and-convert backend with clear validation and error handling.

## 4. Important implementation choice

Browsers do not natively render `.pptx` files as presentation slides. For this MVP, convert each uploaded PPTX to PDF on the backend, then render the PDF pages with PDF.js.

This is generally more reliable than trying to recreate PowerPoint layout in the browser. Conversion fidelity can still vary for unusual fonts, animations, embedded media, transitions, and unsupported PowerPoint features.

## 5. Suggested project structure

```text
air-presentation/
├── frontend/
│   ├── public/
│   │   └── models/
│   │       └── hand_landmarker.task
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUpload.tsx
│   │   │   ├── CameraPreview.tsx
│   │   │   ├── SlideViewer.tsx
│   │   │   ├── GestureHelp.tsx
│   │   │   └── PresentationToolbar.tsx
│   │   ├── hooks/
│   │   │   ├── useCamera.ts
│   │   │   └── useHandLandmarker.ts
│   │   ├── gestures/
│   │   │   ├── classifyGesture.ts
│   │   │   ├── detectSwipe.ts
│   │   │   └── gestureController.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── pdfRenderer.ts
│   │   ├── types/
│   │   │   └── gestures.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── converter.py
│   │   └── validators.py
│   ├── requirements.txt
│   └── README.md
├── techstack.md
├── workflow.md
└── architecture.md
```

## 6. Core dependencies

### Frontend

- `react`
- `react-dom`
- `vite`
- `typescript`
- `tailwindcss`
- `@mediapipe/tasks-vision`
- `pdfjs-dist`

Use the MediaPipe Hand Landmarker task model. Download the official model asset and keep it in the frontend's public assets so inference can run locally after the application has loaded.

### Backend

- `fastapi`
- `uvicorn[standard]`
- `python-multipart`
- `pydantic`

System dependency:
- LibreOffice installed and available to the backend process.

Use Python's standard library for temporary-file handling, subprocess execution and cleanup where practical.

## 7. Runtime and hardware

- Windows 10/11 laptop
- Working webcam
- Modern Chromium-based browser
- Node.js LTS
- Python 3.11 or a compatible supported version
- LibreOffice installed
- Internet may be needed initially to install dependencies and obtain the model; presentation-time inference should run locally.

## 8. MVP constraints

- Support `.pptx` first. Reject unsupported file types with a clear message.
- Set a configurable upload size limit, for example 50 MB.
- Convert to PDF before presentation.
- Do not store uploaded files permanently.
- Do not upload webcam frames to the backend.
- Do not add authentication, database, cloud storage, or analytics in the first version.
- PowerPoint animations and transitions are not part of the initial scope.
- Provide keyboard controls as a fallback if camera access fails.

## 9. Privacy and security

- Request camera permission only when the user starts camera setup or presentation.
- Process webcam frames in the browser.
- Never record or save camera footage in the MVP.
- Validate file extension, MIME type, and file signature where feasible.
- Generate server-side random temporary filenames; never trust the uploaded filename as a filesystem path.
- Enforce upload size limits and conversion timeouts.
- Store temporary files outside public static directories and delete them after conversion or expiry.
- Do not expose arbitrary filesystem paths or shell command input through the API.
