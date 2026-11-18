from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uuid
import subprocess
import asyncio
from pathlib import Path

app = FastAPI(title="Air Presentation Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

PRESENTATIONS_DIR = Path("./presentations")
PRESENTATIONS_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def validate_pptx(file_bytes: bytes, filename: str) -> None:
    """Validate that the uploaded file is a valid PPTX."""
    if not filename.endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are supported")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50MB")
    # Basic PPTX signature check (zip-based format)
    if file_bytes[:4] != b"PK\x03\x04":
        raise HTTPException(status_code=400, detail="Invalid PPTX file format")


def convert_pptx_to_pdf(pptx_path: Path, pdf_path: Path) -> None:
    """Convert a PPTX file to PDF using LibreOffice headless."""
    try:
        subprocess.run(
            [
                "soffice",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(pdf_path.parent),
                str(pptx_path),
            ],
            check=True,
            timeout=120,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        # LibreOffice writes <basename>.pdf in outdir
        expected = pptx_path.with_suffix(".pdf")
        if expected.exists() and expected != pdf_path:
            expected.replace(pdf_path)
        elif not pdf_path.exists() and expected.exists():
            expected.replace(pdf_path)
        if not pdf_path.exists():
            raise RuntimeError("LibreOffice did not produce a PDF file")
    except FileNotFoundError:
        raise RuntimeError("LibreOffice (soffice) is not installed or not on PATH")
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or b"").decode(errors="ignore").strip()
        raise RuntimeError(f"LibreOffice conversion failed{': ' + stderr if stderr else ''}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("LibreOffice conversion timed out")


@app.post("/api/presentations")
async def upload_presentation(file: UploadFile = File(...)):
    """Upload a PPTX and return a presentation ID and PDF URL."""
    file_bytes = await file.read()
    try:
        validate_pptx(file_bytes, file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    presentation_id = str(uuid.uuid4())
    pptx_path = PRESENTATIONS_DIR / f"{presentation_id}.pptx"
    pdf_path = PRESENTATIONS_DIR / f"{presentation_id}.pdf"

    # Save uploaded PPTX
    try:
        with open(pptx_path, "wb") as f:
            f.write(file_bytes)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")

    # Convert to PDF in a thread pool
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, convert_pptx_to_pdf, pptx_path, pdf_path)
    except RuntimeError as e:
        # Clean up pptx on conversion failure
        if pptx_path.exists():
            pptx_path.unlink()
        raise HTTPException(status_code=422, detail=str(e))

    # Return PDF URL and presentation ID
    pdf_url = f"/api/presentations/{presentation_id}/file"

    # Schedule cleanup
    async def cleanup():
        await asyncio.sleep(3600)  # Keep for 1 hour
        try:
            if pptx_path.exists():
                pptx_path.unlink()
            if pdf_path.exists():
                pdf_path.unlink()
        except Exception:
            pass

    # We fire-and-forget the cleanup; it's a background task
    BackgroundTasks([lambda: asyncio.get_event_loop().create_task(cleanup())])

    return {
        "presentationId": presentation_id,
        "pdfUrl": pdf_url,
        "status": "ready",
    }


@app.get("/api/presentations/{presentation_id}/file")
def get_presentation_file(presentation_id: str):
    """Serve the converted PDF for PDF.js."""
    pdf_path = PRESENTATIONS_DIR / f"{presentation_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Presentation not found")
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{presentation_id}.pdf",
    )


@app.delete("/api/presentations/{presentation_id}")
def delete_presentation(presentation_id: str):
    """Delete the temporary PPTX, PDF and working directory."""
    pptx_path = PRESENTATIONS_DIR / f"{presentation_id}.pptx"
    pdf_path = PRESENTATIONS_DIR / f"{presentation_id}.pdf"

    for p in [pptx_path, pdf_path]:
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass

    return {"status": "deleted"}