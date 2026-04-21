import time
import os
from datetime import datetime, timezone
from threading import Event, Lock, Thread
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None

try:
    import numpy as np
except Exception:  # pragma: no cover
    np = None

try:
    import pyvirtualcam
except Exception:  # pragma: no cover
    pyvirtualcam = None


app = FastAPI(title="Face Swap Engine", version="0.2.0")
state_lock = Lock()
active_sessions: dict[int, dict[str, Any]] = {}
session_pipelines: dict[int, "PassthroughPipeline"] = {}
VIRTUAL_CAM_BACKEND = (os.getenv("VIRTUAL_CAM_BACKEND") or "").strip().lower()
DEFAULT_CAMERA_INDEX = int(os.getenv("ENGINE_CAMERA_INDEX", "0"))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StartSessionRequest(BaseModel):
    userId: int
    sessionId: int
    faceImageId: int
    faceImagePath: str
    executionProvider: str = "cpu"
    frameProcessor: str = "face_swapper"
    liveMirror: bool = False
    cameraIndex: int = DEFAULT_CAMERA_INDEX
    outputWidth: int = Field(default=1280, ge=320, le=3840)
    outputHeight: int = Field(default=720, ge=240, le=2160)
    outputFps: int = Field(default=30, ge=15, le=60)


class SessionQueryRequest(BaseModel):
    userId: int


class PassthroughPipeline:
    def __init__(
        self,
        *,
        user_id: int,
        camera_index: int,
        width: int,
        height: int,
        fps: int,
        live_mirror: bool,
        virtual_cam_backend: str,
        frame_processor: str,
        source_face_path: str,
    ) -> None:
        self.user_id = user_id
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.fps = fps
        self.live_mirror = live_mirror
        self.virtual_cam_backend = virtual_cam_backend
        self.frame_processor = frame_processor
        self.source_face_path = source_face_path
        self.stop_event = Event()
        self.thread = Thread(target=self._run, daemon=True)
        self.metrics_lock = Lock()
        self.running = False
        self.last_error = ""
        self.virtual_camera = ""
        self.capture_fps = 0.0
        self.output_fps = 0.0
        self.latency_ms = 0.0
        self.dropped_frames = 0
        self.source_face: Any = None
        self.face_cascade: Any = None
        self.detect_every_n = 3
        self.frame_index = 0
        self.last_faces: list[tuple[int, int, int, int]] = []
        self.missed_detections = 0

    def start(self) -> None:
        self.running = True
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=2.0)
        self.running = False

    def snapshot(self) -> dict[str, Any]:
        with self.metrics_lock:
            return {
                "running": self.running,
                "lastError": self.last_error,
                "virtualCamera": self.virtual_camera,
                "captureFps": round(self.capture_fps, 2),
                "outputFps": round(self.output_fps, 2),
                "latencyMs": round(self.latency_ms, 2),
                "droppedFrames": self.dropped_frames,
                "backend": self.virtual_cam_backend or "auto",
                "frameProcessor": self.frame_processor,
                "missedDetections": self.missed_detections,
            }

    def _load_source_face(self, image_path: str) -> Any:
        image = cv2.imread(image_path)
        if image is None:
            return None

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        if cascade.empty():
            return image

        faces = cascade.detectMultiScale(
            gray,
            scaleFactor=1.2,
            minNeighbors=5,
            minSize=(80, 80),
        )
        if len(faces) == 0:
            return image

        x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
        return image[y : y + h, x : x + w]

    def _apply_simple_swap(self, frame: Any) -> Any:
        if self.source_face is None or self.face_cascade is None:
            return frame

        self.frame_index += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.frame_index % self.detect_every_n == 0:
            detected = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(56, 56),
            )
            self.last_faces = [tuple(map(int, box)) for box in detected]

        faces = self.last_faces
        if not faces:
            self.missed_detections += 1
            # Fallback region keeps output visibly transformed even when detector misses.
            frame_h, frame_w = frame.shape[:2]
            w = int(frame_w * 0.28)
            h = int(frame_h * 0.40)
            x = (frame_w - w) // 2
            y = int(frame_h * 0.22)
            faces = [(x, y, w, h)]
        else:
            self.missed_detections = 0

        for x, y, w, h in faces:
            x = max(0, min(x, frame.shape[1] - 1))
            y = max(0, min(y, frame.shape[0] - 1))
            w = max(1, min(w, frame.shape[1] - x))
            h = max(1, min(h, frame.shape[0] - y))
            target = cv2.resize(self.source_face, (w, h))

            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.ellipse(
                mask,
                (w // 2, h // 2),
                (max(1, int(w * 0.45)), max(1, int(h * 0.48))),
                0,
                0,
                360,
                255,
                -1,
            )

            center = (x + w // 2, y + h // 2)
            try:
                frame = cv2.seamlessClone(target, frame, mask, center, cv2.NORMAL_CLONE)
            except Exception:
                roi = frame[y : y + h, x : x + w]
                alpha = (mask.astype(np.float32) / 255.0)[:, :, None]
                blended = (target.astype(np.float32) * alpha) + (
                    roi.astype(np.float32) * (1.0 - alpha)
                )
                frame[y : y + h, x : x + w] = blended.astype(np.uint8)

        return frame

    def _run(self) -> None:
        if cv2 is None or pyvirtualcam is None:
            with self.metrics_lock:
                self.last_error = "opencv-python and pyvirtualcam must be installed"
                self.running = False
            return

        if self.frame_processor == "face_swapper":
            if np is None:
                with self.metrics_lock:
                    self.last_error = "numpy must be installed for face swap processing"
                    self.running = False
                return

            self.source_face = self._load_source_face(self.source_face_path)
            if self.source_face is None:
                with self.metrics_lock:
                    self.last_error = f"Could not read source face image: {self.source_face_path}"
                    self.running = False
                return

            self.face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            if self.face_cascade.empty():
                with self.metrics_lock:
                    self.last_error = "Could not load OpenCV frontal face detector"
                    self.running = False
                return

        cap = self._open_capture(self.camera_index)
        if not cap.isOpened():
            with self.metrics_lock:
                self.last_error = f"Could not open webcam index {self.camera_index}"
                self.running = False
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, self.fps)

        frame_counter = 0
        output_counter = 0
        window_start = time.perf_counter()

        try:
            camera_kwargs: dict[str, Any] = {
                "width": self.width,
                "height": self.height,
                "fps": self.fps,
                "fmt": pyvirtualcam.PixelFormat.BGR,
            }
            if self.virtual_cam_backend:
                camera_kwargs["backend"] = self.virtual_cam_backend

            with pyvirtualcam.Camera(**camera_kwargs) as cam:
                with self.metrics_lock:
                    self.virtual_camera = cam.device

                while not self.stop_event.is_set():
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        with self.metrics_lock:
                            self.dropped_frames += 1
                        time.sleep(0.01)
                        continue

                    frame_counter += 1

                    if self.live_mirror:
                        frame = cv2.flip(frame, 1)

                    if frame.shape[1] != self.width or frame.shape[0] != self.height:
                        frame = cv2.resize(frame, (self.width, self.height))

                    if self.frame_processor == "face_swapper":
                        frame = self._apply_simple_swap(frame)

                    start = time.perf_counter()
                    cam.send(frame)
                    cam.sleep_until_next_frame()
                    end = time.perf_counter()
                    output_counter += 1

                    elapsed = end - window_start
                    if elapsed >= 1.0:
                        with self.metrics_lock:
                            self.capture_fps = frame_counter / elapsed
                            self.output_fps = output_counter / elapsed
                            self.latency_ms = (end - start) * 1000.0
                        frame_counter = 0
                        output_counter = 0
                        window_start = end
        except Exception as exc:
            with self.metrics_lock:
                self.last_error = str(exc)
        finally:
            cap.release()
            with self.metrics_lock:
                self.running = False

    def _open_capture(self, camera_index: int) -> Any:
        # Windows: DirectShow is often more stable than MSMF for live camera loops.
        if os.name == "nt":
            cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
            if cap.isOpened():
                return cap

        return cv2.VideoCapture(camera_index)


def _stop_pipeline_for_user(user_id: int) -> bool:
    pipeline = session_pipelines.pop(user_id, None)
    if pipeline:
        pipeline.stop()
        return True
    return False


def _has_other_running_user(user_id: int) -> bool:
    for owner_id, pipeline in session_pipelines.items():
        if owner_id != user_id and pipeline.running:
            return True
    return False


@app.get("/health")
def health() -> dict[str, Any]:
    with state_lock:
        running_sessions = len(active_sessions)

    return {
        "ok": True,
        "service": "face-swap-engine",
        "mode": "passthrough",
        "dependencies": {
            "opencv": cv2 is not None,
            "pyvirtualcam": pyvirtualcam is not None,
        },
        "virtualCameraBackend": VIRTUAL_CAM_BACKEND or "auto",
        "activeSessions": running_sessions,
        "timestamp": utc_now(),
    }


@app.post("/session/start")
def start_session(payload: StartSessionRequest) -> dict[str, Any]:
    with state_lock:
        if _has_other_running_user(payload.userId):
            raise HTTPException(
                status_code=409,
                detail="Engine currently supports one active webcam session at a time",
            )

        _stop_pipeline_for_user(payload.userId)

        pipeline = PassthroughPipeline(
            user_id=payload.userId,
            camera_index=payload.cameraIndex,
            width=payload.outputWidth,
            height=payload.outputHeight,
            fps=payload.outputFps,
            live_mirror=payload.liveMirror,
            virtual_cam_backend=VIRTUAL_CAM_BACKEND,
            frame_processor=payload.frameProcessor,
            source_face_path=payload.faceImagePath,
        )
        session_pipelines[payload.userId] = pipeline
        pipeline.start()

        active_sessions[payload.userId] = {
            "userId": payload.userId,
            "sessionId": payload.sessionId,
            "faceImageId": payload.faceImageId,
            "faceImagePath": payload.faceImagePath,
            "executionProvider": payload.executionProvider,
            "frameProcessor": payload.frameProcessor,
            "liveMirror": payload.liveMirror,
            "cameraIndex": payload.cameraIndex,
            "outputWidth": payload.outputWidth,
            "outputHeight": payload.outputHeight,
            "outputFps": payload.outputFps,
            "startedAt": utc_now(),
            "isRunning": True,
        }

    time.sleep(0.25)
    status = pipeline.snapshot()
    if not status["running"] and status["lastError"]:
        with state_lock:
            _stop_pipeline_for_user(payload.userId)
            active_sessions.pop(payload.userId, None)
        raise HTTPException(status_code=500, detail=status["lastError"])

    return {
        "success": True,
        "isRunning": True,
        "sessionId": payload.sessionId,
        "userId": payload.userId,
        "pipeline": status,
    }


@app.post("/session/stop")
def stop_session(payload: SessionQueryRequest) -> dict[str, Any]:
    with state_lock:
        had_active_session = active_sessions.pop(payload.userId, None) is not None
        stopped_pipeline = _stop_pipeline_for_user(payload.userId)

    return {
        "success": True,
        "isRunning": False,
        "userId": payload.userId,
        "hadActiveSession": had_active_session or stopped_pipeline,
    }


@app.post("/session/status")
def session_status(payload: SessionQueryRequest) -> dict[str, Any]:
    with state_lock:
        existing = active_sessions.get(payload.userId)
        pipeline = session_pipelines.get(payload.userId)

    if not existing:
        return {
            "success": True,
            "isRunning": False,
            "userId": payload.userId,
            "sessionId": None,
            "faceImageId": None,
            "pipeline": None,
        }

    pipeline_status = pipeline.snapshot() if pipeline else None
    is_running = bool(pipeline_status and pipeline_status["running"])

    if not is_running:
        with state_lock:
            active_sessions.pop(payload.userId, None)
            _stop_pipeline_for_user(payload.userId)

    return {
        "success": True,
        "isRunning": is_running,
        "userId": payload.userId,
        "sessionId": existing["sessionId"] if is_running else None,
        "faceImageId": existing["faceImageId"] if is_running else None,
        "pipeline": pipeline_status,
    }


@app.get("/metrics")
def metrics() -> dict[str, Any]:
    with state_lock:
        pipelines = list(session_pipelines.values())

    pipeline_snapshots = [pipeline.snapshot() for pipeline in pipelines]
    running = [snapshot for snapshot in pipeline_snapshots if snapshot["running"]]
    if running:
        average_capture_fps = sum(x["captureFps"] for x in running) / len(running)
        average_output_fps = sum(x["outputFps"] for x in running) / len(running)
        average_latency_ms = sum(x["latencyMs"] for x in running) / len(running)
        dropped = sum(x["droppedFrames"] for x in running)
    else:
        average_capture_fps = 0.0
        average_output_fps = 0.0
        average_latency_ms = 0.0
        dropped = 0

    return {
        "activeSessions": len(running),
        "pipeline": {
            "captureFps": round(average_capture_fps, 2),
            "processFps": round(average_output_fps, 2),
            "outputFps": round(average_output_fps, 2),
            "droppedFrames": dropped,
            "latencyMs": round(average_latency_ms, 2),
        },
        "details": pipeline_snapshots,
        "timestamp": utc_now(),
    }
