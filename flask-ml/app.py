import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from routes.health_routes  import health_bp
from routes.model_routes   import model_bp
from routes.predict_routes import predict_bp
from routes.convert_routes import convert_bp
from routes.flir_routes    import flir_bp
from utils.model_state     import ModelState
from utils.upload_manager  import UploadManager

def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024 * 1024  # 1 GB

    CORS(app, resources={r"/*": {"origins": "*"}})

    # Singletons shared across all blueprints
    app.model_state    = ModelState()
    app.upload_manager = UploadManager()

    app.register_blueprint(health_bp)
    app.register_blueprint(model_bp)
    app.register_blueprint(predict_bp)
    app.register_blueprint(convert_bp)
    app.register_blueprint(flir_bp)

    print(f"   Models dir : {app.upload_manager.models_dir}")
    print(f"   Cracks dir : {app.upload_manager.cracks_dir}")
    return app
