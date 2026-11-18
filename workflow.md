# Air Presentation System — MVP Workflow

## 1. Main user journey

```text
Open application
      |
      v
Upload PPTX file
      |
      v
Validate file
      |
      v
Convert PPTX to PDF
      |
      v
Load PDF pages in viewer
      |
      v
Show presentation preview
      |
      v
Start camera and detect hand
      |
      v
Show gesture guide / camera status
      |
      v
Start presentation
      |
      v
Recognize gestures continuously
      |
      v
Move to next / previous slide
      |
      v
End presentation
```

## 2. Screen-by-screen workflow

### Screen A — Home / Upload

Show:
- Product name: Air Presentation
- A drag-and-drop upload area
- Browse files button
- Supported format: `.pptx`
- Maximum file size
- Short explanation that slides are converted to PDF for display

User action:
1. Select or drop a PPTX file.
2. Frontend checks extension and file size.
3. Frontend uploads the file to the backend.

States:
- Empty
- Uploading
- Converting
- Ready
- Error

### Screen B — Conversion and preview

Backend:
1. Receive the uploaded PPTX.
2. Validate file type and size.
3. Create a unique temporary working directory.
4. Run LibreOffice in headless mode to convert PPTX to PDF.
5. Check that the PDF exists and is readable.
6. Return a short-lived presentation ID and a PDF access route.
7. Schedule or perform cleanup of temporary files.

Frontend:
1. Load the PDF with PDF.js.
2. Read the page count.
3. Render the first slide as a preview.
4. Show the filename and slide count.
5. Enable the camera setup and presentation controls.

### Screen C — Camera setup

User action:
1. Click **Enable Camera**.
2. Browser asks for webcam permission.
3. Frontend starts the video stream.
4. MediaPipe Hand Landmarker loads.
5. Show a small live camera preview and hand-detection status.

Setup guidance:
- Keep one hand visible.
- Keep the hand inside the camera frame.
- Use a reasonably lit area.
- Avoid standing too far from the camera.

Do not start slide navigation until the user explicitly starts the presentation.

### Screen D — Gesture calibration / test

Show the supported gesture guide and a live detected-gesture label.

The user can test gestures before presenting. Require a gesture to be held briefly or detected across multiple frames before confirming it.

Provide:
- Detection status
- Last recognized gesture
- A short cooldown indicator
- A way to recalibrate or disable gesture control

### Screen E — Presentation mode

Display:
- Current slide, full-screen or near full-screen
- Current slide number and total slide count
- Small camera status indicator
- Gesture-control enabled/disabled status
- Exit presentation control

Gesture recognition runs continuously while presentation mode is active.

When a valid gesture is recognized:
1. Confirm it is stable across multiple frames.
2. Check the cooldown.
3. Send a navigation command to the presentation controller.
4. Update the current slide index.
5. Prevent the same held gesture from triggering repeatedly.

### Screen F — End presentation

When the user exits:
1. Stop the webcam media tracks.
2. Stop the hand-landmarker processing loop.
3. Release PDF rendering resources where practical.
4. Return to the preview screen.
5. Allow the user to restart or upload another PPTX.

## 3. Initial gesture map

Start with a small, deliberate gesture set. Add more gestures only after navigation is reliable.

| Gesture | Action | Detection idea |
|---|---|---|
| Swipe right | Next slide | Track wrist movement horizontally to the right over a short time window |
| Swipe left | Previous slide | Track wrist movement horizontally to the left over a short time window |
| Open palm held | Pause / resume gesture control | Detect extended fingers and require a stable hold |
| Fist held | Toggle black-screen mode | Detect curled fingers and require a stable hold |

Important:
- Interpret horizontal swipes relative to the mirrored camera preview so the on-screen direction matches the presenter's intuition.
- Test mirrored and unmirrored webcam behavior.
- Use a neutral/rest state between repeated commands.
- Do not trigger a command from a single noisy frame.
- Black-screen mode should be a visual overlay, not a change to the underlying slide.

## 4. Gesture recognition pipeline

```text
Webcam frame
     |
     v
MediaPipe Hand Landmarker
     |
     v
Hand landmarks (21 points)
     |
     v
Normalize landmark coordinates
     |
     v
Gesture / motion classification
     |
     v
Stability check
     |
     v
Cooldown + neutral-state check
     |
     v
Presentation command
```

### Classification approach

For the MVP, use geometric rules rather than training a custom ML model.

Examples:
- Finger extension: compare fingertip and finger-joint positions, accounting for hand orientation.
- Fist: determine whether most fingers are curled.
- Open palm: determine whether most fingers are extended.
- Swipe: track wrist or palm-center movement over consecutive frames.

Use normalized coordinates so the logic is less dependent on webcam resolution.

### Stability and accidental-trigger prevention

Implement all of the following:
- Require a candidate gesture to remain consistent for several frames.
- Use a short hold duration for static gestures.
- Use a movement threshold for swipes.
- Add a cooldown after each command.
- Require the hand to return to a neutral state before the same command can trigger again.
- Ignore detections when no hand is confidently present.
- Avoid running gesture actions while the user is on the upload or preview screen.

Tune thresholds on the actual laptop webcam; do not assume one threshold works for every camera or room.

## 5. Slide controller behavior

Maintain:
- `currentSlideIndex`
- `totalSlides`
- `isPresentationActive`
- `isGestureControlEnabled`
- `isBlackScreenEnabled`

Navigation rules:
- Next: `currentSlideIndex = min(currentSlideIndex + 1, totalSlides - 1)`
- Previous: `currentSlideIndex = max(currentSlideIndex - 1, 0)`
- Never allow an index outside the valid slide range.
- At the first or last slide, keep the current slide unchanged.
- Keep keyboard navigation available as a fallback: Right / PageDown for next, Left / PageUp for previous, Escape to exit.

## 6. API workflow

### `POST /api/presentations`

Request:
- Multipart form upload containing one `.pptx` file.

Success response:
```json
{
  "presentationId": "server-generated-id",
  "pdfUrl": "/api/presentations/server-generated-id/file",
  "status": "ready"
}
```

Errors:
- `400` unsupported or invalid file
- `413` file too large
- `422` conversion failed
- `500` unexpected server error

### `GET /api/presentations/{presentationId}/file`

Returns the converted PDF for the frontend PDF.js viewer.

### `DELETE /api/presentations/{presentationId}`

Deletes the temporary PPTX, PDF and working directory associated with the presentation.

Security:
- Use unguessable IDs.
- Restrict access to files created by the application.
- Do not accept arbitrary paths from the client.
- Add expiry cleanup for abandoned presentations.

## 7. MVP acceptance criteria

The MVP is ready for a demo when:

- [ ] User can upload a valid PPTX.
- [ ] Invalid file types and oversized files are rejected.
- [ ] Backend converts PPTX to PDF successfully.
- [ ] PDF.js displays all slides and reports the correct page count.
- [ ] User can enable and disable the webcam.
- [ ] MediaPipe detects a visible hand in real time.
- [ ] Swipe right advances exactly one slide.
- [ ] Swipe left moves back exactly one slide.
- [ ] Static gestures do not repeatedly fire while held.
- [ ] First and last slide boundaries work correctly.
- [ ] Keyboard fallback works.
- [ ] Exiting presentation stops the camera.
- [ ] Temporary files can be deleted.

## 8. Suggested build order

1. Build the upload UI and PPTX-to-PDF backend.
2. Build the PDF.js slide viewer and keyboard navigation.
3. Add webcam permission and live camera preview.
4. Integrate MediaPipe Hand Landmarker.
5. Implement swipe detection first.
6. Add static gestures and gesture debouncing.
7. Add presentation mode, black-screen overlay and cleanup.
8. Test in different lighting conditions and with different hand distances.

**Do not begin by building every gesture.** First make upload, conversion, slide rendering, and swipe navigation work reliably. That is the core product.
