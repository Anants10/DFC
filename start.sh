#!/bin/bash
# DFCCIL Crack Detection System - Linux/Mac startup script

echo ""
echo "============================================================"
echo " DFCCIL Railway Track Crack Detection System"
echo " Starting all services..."
echo "============================================================"
echo ""

# Check we're in the right directory
if [ ! -d "backend" ]; then
    echo "[ERROR] Run this script from the project root folder."
    exit 1
fi

# ── 1. MongoDB ───────────────────────────────────────────────────────────────
echo "[1/5] Starting MongoDB..."
if command -v systemctl &>/dev/null; then
    sudo systemctl start mongod 2>/dev/null && echo "[OK]   MongoDB started via systemctl" || echo "[INFO] Trying mongod directly..."
fi
if ! pgrep -x mongod > /dev/null; then
    mkdir -p ~/data/db
    mongod --dbpath ~/data/db --fork --logpath /tmp/mongod.log 2>/dev/null && echo "[OK] mongod started" || echo "[WARN] Could not start MongoDB. Start it manually."
fi
sleep 2

# ── 2. Flask ML Server ───────────────────────────────────────────────────────
echo ""
echo "[2/5] Starting Flask ML Server on port 5001..."
if [ ! -d "flask-ml/venv" ]; then
    echo "[ERROR] Python venv not found. Run: cd flask-ml && py -3.10 -m venv venv && pip install -r requirements.txt"
    exit 1
fi
cd flask-ml
source venv/bin/activate
python run.py &
FLASK_PID=$!
cd ..
echo "[OK]   Flask ML started (PID: $FLASK_PID)"
sleep 4

# ── 3. Express Backend ───────────────────────────────────────────────────────
echo ""
echo "[3/5] Starting Express Backend on port 5000..."
cd backend
node src/server.js &
EXPRESS_PID=$!
cd ..
echo "[OK]   Express started (PID: $EXPRESS_PID)"
sleep 2

# ── 4. React Frontend ────────────────────────────────────────────────────────
echo ""
echo "[4/5] Starting React Frontend on port 5173..."
cd frontend
npm run dev &
REACT_PID=$!
cd ..
echo "[OK]   React started (PID: $REACT_PID)"
sleep 4

# ── 5. Open browser ──────────────────────────────────────────────────────────
echo ""
echo "[5/5] Opening browser..."
if command -v xdg-open &>/dev/null; then xdg-open http://localhost:5173
elif command -v open &>/dev/null; then open http://localhost:5173
fi

echo ""
echo "============================================================"
echo " All services started!"
echo ""
echo " Application:  http://localhost:5173"
echo " Express API:  http://localhost:5000"
echo " Flask ML:     http://localhost:5001"
echo " MongoDB:      localhost:27017"
echo ""
echo " PIDs — Flask: $FLASK_PID  Express: $EXPRESS_PID  React: $REACT_PID"
echo " Press Ctrl+C to stop all services."
echo "============================================================"

# Wait and cleanup on Ctrl+C
trap "echo 'Stopping...'; kill $FLASK_PID $EXPRESS_PID $REACT_PID 2>/dev/null; exit" INT
wait
