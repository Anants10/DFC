# DFCCIL Railway Track Crack Detection System

**ECG Lab, IIT Roorkee | DFCCIL | Ministry of Railways, Government of India**

A full-stack AI-powered system for detecting cracks in railway tracks using IR thermography images, videos, and live camera feeds — with optional FLIR T1020 thermal camera support.

---

## Quick Start

### First Time Setup (run once)
```
Double-click install.bat
```

### Daily Use (start everything)
```
Double-click start.bat
```

Then open: **http://localhost:5173**

---

## Architecture

```
Browser (React :5173)
  → Vite proxy /api/*
  → Express (:5000) → MongoDB (:27017)
  → Flask ML (:5001) → TensorFlow/Keras model
                     → FLIR Bridge (:7654) → FLIR T1020 camera
```

---

## Folder Structure

```
dfccil-fresh/
├── frontend/          React 18 + Vite 5 web application
├── backend/           Express + Node.js REST API
├── flask-ml/          Flask + Python ML server
├── flir-service/      C# .NET 10 FLIR T1020 bridge (optional)
├── install.bat        First-time setup (Windows)
├── start.bat          Start all services (Windows)
└── start.sh           Start all services (Linux/Mac)
```

---

## Prerequisites

### Required for core app
| Software | Version | Download |
|---|---|---|
| Python | **3.10 exactly** | https://python.org/downloads/release/python-31011/ |
| Node.js | 18+ | https://nodejs.org |
| MongoDB | 6+ | https://www.mongodb.com/try/download/community |
| FFmpeg | Any | `winget install FFmpeg` (Windows) / `sudo apt install ffmpeg` (Linux) |

> ⚠️ **Python 3.10 is required.** TensorFlow 2.18 does not support Python 3.11, 3.12, 3.13, or 3.14.

### Required for FLIR T1020 camera (optional)
| Software | Version | Download |
|---|---|---|
| .NET SDK | 10.0 | https://dotnet.microsoft.com/download |
| FLIR Atlas SDK | 7.7.0 | From FLIR/Teledyne installation package |

---

## Installation

### Step 1 — Run install.bat
Double-click `install.bat`. It will:
- Create Python 3.10 virtual environment in `flask-ml/venv/`
- Install all Python packages (TensorFlow, Flask, OpenCV, etc.)
- Run `npm install` for the backend
- Run `npm install` for the frontend

### Step 2 — FLIR T1020 SDK DLLs (only if using FLIR camera)
Copy these files from your Atlas SDK installation into `flir-service/libs/`:
```
From: C:\Program Files\FLIR Systems\Atlas SDK\Bin\x64\Release\
Copy: Flir.Atlas.Image.dll
      Flir.Atlas.Live.dll
      Flir.Atlas.Gigevision.dll
      AtlasCronos.dll
      (all other .dll files in that folder)
Into: flir-service\libs\
```
Then build the bridge:
```
cd flir-service
dotnet build
```

---

## Running the Application

### Windows — one double-click
```
start.bat
```
Opens 4 terminal windows (FLIR Bridge, Flask ML, Express, React) and launches the browser automatically.

### Windows — manual (if start.bat fails)
Open 4 separate PowerShell/CMD windows:

**Terminal 1 — MongoDB:**
```
net start MongoDB
```

**Terminal 2 — FLIR Bridge (optional):**
```
cd flir-service
dotnet run
```

**Terminal 3 — Flask ML Server:**
```
cd flask-ml
venv\Scripts\activate
py -3.10 run.py
```

**Terminal 4 — Express Backend:**
```
cd backend
node src/server.js
```

**Terminal 5 — React Frontend:**
```
cd frontend
npm run dev
```
Open: http://localhost:5173

### Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

---

## Using the Application

### 1. Load a Model
- Go to **Model Manager** tab
- Click **Upload** → select your `.keras` or `.h5` model file
- Click **Load Selected Model**
- Configure **Prediction Direction** if needed (sigmoid/softmax toggle)

### 2. Image Analysis
- Go to **Image Analysis** tab
- Upload an IR thermography image
- Click **Run Prediction**
- View results with P(crack) and P(normal) confidence gauges
- Download 2-page PDF report

### 3. Video Analysis (any format)
- Go to **Video/Camera** tab → **Upload Video** mode
- Upload any video (MP4, MPG, AVI, MKV, etc.)
- MP4/WebM: Click **Play & Detect** (client-side, real-time overlay)
- MPG/AVI/MKV: Click **Convert & Analyse** (FFmpeg converts + OpenCV analyses in parallel)
- Download multi-page PDF with crack photos

### 4. Live Webcam
- Go to **Video/Camera** tab → **Live Camera** mode
- Click **Detect Cameras** to list available cameras
- Select your camera (external webcam preferred)
- Click **Start Detection**

### 5. FLIR T1020 Thermal Camera
- Connect FLIR T1020 to PC via Wi-Fi (camera creates a hotspot, PC connects to it)
  - Your PC IP will be: `192.168.16.2`
  - Camera gateway: `192.168.16.1`
- Ensure FLIR Bridge is running (`dotnet run` in flir-service/)
- Go to **Video/Camera** tab → **FLIR T1020** mode
- Click **Connect to FLIR T1020**
- Click **Start Detection**
- Live thermal frames are analysed with real GPS from the camera + temperature data (min/max/avg °C)

---

## Ports

| Service | Port | Purpose |
|---|---|---|
| React (Vite) | 5173 | Web UI |
| Express | 5000 | REST API + ML proxy |
| Flask ML | 5001 | TensorFlow inference |
| MongoDB | 27017 | Detection event storage |
| FLIR Bridge | 7654 | C# FLIR Atlas SDK wrapper |

---

## Key Files Changed vs v1.0

| File | Change |
|---|---|
| `frontend/src/pages/VideoLive/VideoLive.jsx` | Added FLIR tab, real GPS (watchPosition), removed simulated GPS |
| `frontend/src/services/api.js` | Added convertVideo, getModelMeta, setModelMeta, FLIR endpoints |
| `backend/src/controllers/mlController.js` | Added convertVideo, getModelMeta, setModelMeta, FLIR proxy functions |
| `backend/src/routes/mlRoutes.js` | Added all new routes |
| `flask-ml/app.py` | Added convert_bp and flir_bp blueprints |
| `flask-ml/routes/convert_routes.py` | New — FFmpeg video conversion |
| `flask-ml/routes/flir_routes.py` | New — FLIR bridge proxy |
| `flask-ml/routes/model_routes.py` | Added /model_meta GET and POST |
| `flask-ml/utils/gps_utils.py` | Real GPS only, no simulated coordinates |
| `flask-ml/requirements.txt` | Added requests==2.32.3 |
| `flir-service/` | New C# project — FLIR Atlas SDK bridge |

---

## Troubleshooting

**"No module named flask"** → Run `install.bat` again. Make sure Python 3.10 is used.

**"Cannot connect to MongoDB"** → Run `net start MongoDB` or start the MongoDB service from Windows Services.

**"Flask ML not reachable"** → Check the Flask terminal window for errors. Make sure you activated the venv with `venv\Scripts\activate`.

**Video not playing after conversion** → Ensure FFmpeg is installed: `winget install FFmpeg`

**FLIR camera not found** → Ensure T1020 Wi-Fi is enabled and your PC is connected to the camera's Wi-Fi network (192.168.16.x). Make sure FLIR Bridge is running.

**Model upload fails** → Only `.keras` (Keras 3.x) and `.h5` (Keras 2.x HDF5) files are accepted.

**GPS shows null** → Allow location permission in the browser. For FLIR mode, the camera needs an outdoor GPS satellite fix.

---
