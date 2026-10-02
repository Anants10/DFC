@echo off
title DFCCIL - First Time Setup
color 0A
echo.
echo  ============================================================
echo   DFCCIL Railway Track Crack Detection System
echo   First-Time Installation
echo   ECG Lab, IIT Roorkee
echo  ============================================================
echo.

if not exist "backend" (
    echo  [ERROR] Run this from the project root folder.
    pause & exit /b 1
)

echo  [1/5] Checking Python 3.10...
py -3.10 --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python 3.10 not found.
    echo          Download: https://www.python.org/downloads/release/python-31011/
    pause & exit /b 1
)
py -3.10 --version
echo  [OK] Python 3.10 found.
echo.

echo  [2/5] Setting up Python virtual environment...
cd flask-ml
if exist "venv" (
    echo  [SKIP] venv already exists.
) else (
    py -3.10 -m venv venv
    if errorlevel 1 ( echo [ERROR] venv creation failed. & pause & exit /b 1 )
    echo  [OK] Virtual environment created.
)
echo.

echo  [3/5] Installing Python packages (takes 5-10 minutes)...
call venv\Scripts\activate.bat
pip install --upgrade pip --quiet
pip install -r requirements.txt
if errorlevel 1 ( echo [ERROR] Python packages failed. & pause & exit /b 1 )
echo  [OK] Python packages installed.
call venv\Scripts\deactivate.bat
cd ..
echo.

echo  [4/5] Installing Express backend packages...
cd backend
call npm install
if errorlevel 1 ( echo [ERROR] Backend npm install failed. & pause & exit /b 1 )
cd ..
echo  [OK] Backend packages installed.
echo.

echo  [5/5] Installing React frontend packages...
cd frontend
call npm install
if errorlevel 1 ( echo [ERROR] Frontend npm install failed. & pause & exit /b 1 )
cd ..
echo  [OK] Frontend packages installed.
echo.

echo  ============================================================
echo   INSTALLATION COMPLETE!
echo.
echo   Before running, also ensure:
echo   1. MongoDB is installed:  https://www.mongodb.com/try/download/community
echo   2. FFmpeg is installed:   winget install FFmpeg
echo   3. .NET SDK 10 installed: https://dotnet.microsoft.com/download
echo      (Only needed for FLIR T1020 camera)
echo.
echo   FLIR Atlas SDK DLLs: Copy from
echo     C:\Program Files\FLIR Systems\Atlas SDK\Bin\x64\Release\
echo     into the flir-service\libs\ folder before using FLIR.
echo.
echo   Now run:  start.bat
echo  ============================================================
pause
