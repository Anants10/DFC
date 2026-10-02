"""
Flask ML Server entry point.
Run: py -3.10 run.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import create_app

if __name__ == "__main__":
    port = int(os.environ.get("ML_PORT", 5001))
    app  = create_app()
    print(f"\n🔬 Flask ML Server → http://localhost:{port}")
    print(f"   Upload your .keras model via the React UI.\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
