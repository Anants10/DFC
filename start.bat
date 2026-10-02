@echo off
title DFCCIL Crack Detection System
color 0B
echo.
echo  ============================================================
echo   DFCCIL Railway Track Crack Detection System
echo   Starting all services...
echo  ============================================================
echo.

if not exist "backend" (
    echo [ERROR] Run from the project root folder.
    pause & exit /b 1
)

REM ── Step 1: MongoDB ──────────────────────────────────────────────────────
echo  [1/5] Starting MongoDB...
net start MongoDB >nul 2>&1
if errorlevel 1 (
    echo  [INFO] MongoDB service not found. Trying mongod directly...
    start "MongoDB" /min cmd /c "mongod --dbpath C:\data\db 2>&1 | more"
    timeout /t 3 /nobreak >nul
) else (
    echo  [OK]   MongoDB service started.
)
echo.

REM ── Step 2: FLIR Bridge (optional) ──────────────────────────────────────
echo  [2/5] Starting FLIR Bridge (optional - for FLIR T1020 camera)...
if exist "flir-service\FlirBridge.csproj" (
    start "FLIR Bridge :7654" cmd /k "cd flir-service && dotnet run"
    echo  [OK]   FLIR Bridge starting on port 7654...
) else (
    echo  [SKIP] flir-service folder not found. FLIR camera will not be available.
)
timeout /t 3 /nobreak >nul
echo.

REM ── Step 3: Flask ML Server ──────────────────────────────────────────────
echo  [3/5] Starting Flask ML Server on port 5001...
if not exist "flask-ml\venv\Scripts\activate.bat" (
    echo  [ERROR] Python venv not found. Run install.bat first.
    pause & exit /b 1
)
start "Flask ML :5001" cmd /k "cd flask-ml && venv\Scripts\activate && py -3.10 run.py"
echo  [OK]   Flask ML starting on port 5001...
timeout /t 5 /nobreak >nul
echo.

REM ── Step 4: Express Backend ──────────────────────────────────────────────
echo  [4/5] Starting Express Backend on port 5000...
if not exist "backend\node_modules" (
    echo  [ERROR] Backend node_modules not found. Run install.bat first.
    pause & exit /b 1
)
start "Express :5000" cmd /k "cd backend && node src/server.js"
echo  [OK]   Express starting on port 5000...
timeout /t 3 /nobreak >nul
echo.

REM ── Step 5: React Frontend ───────────────────────────────────────────────
echo  [5/5] Starting React Frontend on port 5173...
if not exist "frontend\node_modules" (
    echo  [ERROR] Frontend node_modules not found. Run install.bat first.
    pause & exit /b 1
)
start "React :5173" cmd /k "cd frontend && npm run dev"
echo  [OK]   React starting on port 5173...
timeout /t 5 /nobreak >nul
echo.

REM ── Open browser ─────────────────────────────────────────────────────────
echo  Opening browser...
start http://localhost:5173
echo.
echo  ============================================================
echo   All services started!
echo.
echo   Application:    http://localhost:5173
echo   Express API:    http://localhost:5000
echo   Flask ML:       http://localhost:5001
echo   FLIR Bridge:    http://localhost:7654
echo   MongoDB:        localhost:27017
echo.
echo   Close this window to stop. Or close individual terminal
echo   windows (Flask ML, Express, React, FLIR Bridge).
echo  ============================================================
echo.
pause
