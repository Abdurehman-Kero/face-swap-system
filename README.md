# Real-Time Face Swap System

A production-ready system that replaces your face in real-time during live video calls (WhatsApp, Telegram, Zoom).

## Architecture

- Electron desktop app with React frontend
- Node.js/Express backend with MySQL
- Deep-Live-Cam AI engine for face swapping
- OBS Studio virtual camera output

## Prerequisites

- Python 3.10
- Node.js 18+
- MySQL 8.0+
- OBS Studio

## Setup Instructions

See documentation for complete setup guide.

## Local Web App Flow (Current)

Use the project as a web app with backend orchestration and local engine service.

### 1) Start backend

- Configure `backend/.env`
- Run in `backend`:
  - `npm install`
  - `npm run dev`

### 2) Start frontend

- Run in `frontend`:
  - `npm install`
  - `npm run dev`

### 3) Start local engine (stub)

- Run in `engine`:
  - `pip install -r requirements.txt`
  - `uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload`

### 4) Enable backend engine mode

Set in `backend/.env`:

- `SWAP_ENGINE_MODE=engine`
- `SWAP_ENGINE_URL=http://127.0.0.1:8765`

When not running the Python service, use:

- `SWAP_ENGINE_MODE=mock`
