# Face Swap Engine (Local Real-Time MVP)

This is a local FastAPI engine service for the face swap web app orchestration flow.

## Why this exists

- Provides stable endpoints for backend integration now
- Streams webcam input to a virtual camera and applies a lightweight face swap step
- Keeps web app architecture intact (frontend -> backend -> engine)

## Endpoints

- `GET /health`
- `POST /session/start`
- `POST /session/stop`
- `POST /session/status`
- `GET /metrics`

## Quick start

1. Create and activate a Python virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Start service:
   - `uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload`

Optional (force OBS backend):

- PowerShell: `$env:VIRTUAL_CAM_BACKEND="obs"`
- Git Bash: `export VIRTUAL_CAM_BACKEND=obs`

Optional (select webcam index):

- PowerShell: `$env:ENGINE_CAMERA_INDEX="2"`
- Git Bash: `export ENGINE_CAMERA_INDEX=2`

## Backend config

In backend `.env`:

- `SWAP_ENGINE_MODE=engine`
- `SWAP_ENGINE_URL=http://127.0.0.1:8765`

## Notes

- This MVP applies lightweight OpenCV-based live face replacement using the uploaded image.
- It is suitable for end-to-end validation but not production-grade quality.
- Only one active webcam session is supported at a time.
- By default backend is `auto`; set `VIRTUAL_CAM_BACKEND=obs` to force OBS Virtual Camera path.
- Default webcam index is `0`; set `ENGINE_CAMERA_INDEX` if your real camera is on another index.
