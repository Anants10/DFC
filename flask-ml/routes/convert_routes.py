# flask-ml/routes/convert_routes.py
import os, subprocess, shutil, tempfile
from flask import Blueprint, request, Response, jsonify, current_app

convert_bp = Blueprint('convert', __name__)

def _ffmpeg_available():
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, timeout=5)
        return True
    except Exception:
        return False

@convert_bp.route('/convert_video', methods=['POST'])
def convert_video():
    if 'video' not in request.files:
        return jsonify({'ok': False, 'error': 'No video file provided'}), 400

    if not _ffmpeg_available():
        return jsonify({'ok': False, 'error': 'FFmpeg not installed. Run: winget install FFmpeg (Windows) or sudo apt install ffmpeg (Linux)'}), 503

    video_file = request.files['video']
    in_fd, in_path  = tempfile.mkstemp(suffix=os.path.splitext(video_file.filename or '.mpg')[1])
    out_fd, out_path = tempfile.mkstemp(suffix='.mp4')
    os.close(in_fd); os.close(out_fd)

    try:
        # Write input in chunks
        with open(in_path, 'wb') as f:
            chunk_size = 8 * 1024 * 1024
            while True:
                chunk = video_file.stream.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)

        # FFmpeg H.264 conversion
        cmd = ['ffmpeg', '-y', '-i', in_path,
               '-c:v', 'libx264', '-preset', 'ultrafast',
               '-crf', '28', '-an', '-movflags', '+faststart',
               out_path]
        result = subprocess.run(cmd, capture_output=True, timeout=300)

        # Fallback: stream copy if encode fails
        if result.returncode != 0:
            cmd2 = ['ffmpeg', '-y', '-i', in_path, '-c:v', 'copy', '-an', '-movflags', '+faststart', out_path]
            subprocess.run(cmd2, capture_output=True, timeout=300)

        with open(out_path, 'rb') as f:
            mp4_bytes = f.read()

        return Response(mp4_bytes, mimetype='video/mp4',
                        headers={'Content-Length': str(len(mp4_bytes)),
                                 'Accept-Ranges': 'bytes'})
    except subprocess.TimeoutExpired:
        return jsonify({'ok': False, 'error': 'FFmpeg conversion timed out'}), 504
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        for p in (in_path, out_path):
            try: os.unlink(p)
            except: pass
