#!/usr/bin/env python3
"""
Main server application that combines all components
"""
import os
import logging
import threading
import time
from datetime import datetime
from flask import Flask, send_from_directory
from flask_socketio import SocketIO
from flask_cors import CORS

# Import our custom handlers
from dbox import StorageHandler
from broadcast import BroadcastHandler
from trek import RouteHandler

class RouteServer:
    def __init__(self, config=None):
        self.config = config or {}
        self.app = None
        self.socketio = None
        self.storage_handler = None
        self.broadcast_handler = None
        self.route_handler = None
        self.cleanup_thread = None
        self._setup_logging()
        self._create_app()
        self._initialize_components()
    
    def _setup_logging(self):
        """Setup logging configuration"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)
    
    def _create_app(self):
        """Create and configure Flask application"""
        # Determine static folder path
        static_folder = self.config.get('static_folder')
        if not static_folder:
            static_folder = os.path.abspath(
                os.path.join(os.path.dirname(__file__), '../frontend')
            )
        
        # Create Flask app
        self.app = Flask(__name__, static_folder=static_folder)
        
        # Configure CORS
        CORS(self.app)
        
        # Configure SocketIO
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        
        # Set MongoDB URI
        mongo_uri = self.config.get('mongo_uri', 'mongodb://localhost:27017/Via')
        self.app.config["MONGO_URI"] = mongo_uri
        
        self.logger.info(f"1.Flask app created with static folder: {static_folder}")
        self.logger.info(f"2.MongoDB URI: {mongo_uri}")
    
    def _initialize_components(self):
        """Initialize all handler components"""
        # Initialize storage handler
        self.storage_handler = StorageHandler(self.app)
        
        # Initialize broadcast handler
        self.broadcast_handler = BroadcastHandler(
            socketio=self.socketio,
            storage_handler=self.storage_handler
        )
        self.broadcast_handler.init_socketio(self.socketio)
        
        # Initialize route handler
        self.route_handler = RouteHandler(
            storage_handler=self.storage_handler,
            broadcast_handler=self.broadcast_handler
        )
        
        # Register route blueprint
        self.app.register_blueprint(self.route_handler.blueprint)
        
        # Register static file routes
        self._register_static_routes()
        
        self.logger.info("3.All components initialized successfully")
    
    def _register_static_routes(self):
        """Register static file serving routes"""
        @self.app.route('/')
        def serve_html():
            return send_from_directory(self.app.static_folder, 'consolidated-html.html')
        
        @self.app.route('/<path:filename>')
        def serve_file(filename):
            full_path = os.path.join(self.app.static_folder, filename)
            if os.path.exists(full_path):
                return send_from_directory(self.app.static_folder, filename)
            return 'File not found', 404
    
    def _test_database_connection(self):
        """Test database connection and log results"""
        try:
            connected, message = self.storage_handler.test_connection()
            if connected:
                self.logger.info("4.MongoDB connection successful")
                # Initial cleanup
                self.storage_handler.cleanup_expired_routes()
                return True
            else:
                self.logger.warning(f"⚠️ MongoDB connection failed: {message}")
                self.logger.info("📝 Server will run in fallback mode using in-memory storage")
                return False
        except Exception as e:
            self.logger.error(f"❌ Database connection test failed: {e}")
            return False
    
    def _start_cleanup_thread(self):
        """Start background thread for periodic cleanup"""
        def cleanup_worker():
            while True:
                try:
                    time.sleep(3600)  # Run every hour
                    self.logger.info("🧹 Running periodic cleanup...")
                    
                    # Clean expired routes from storage
                    if self.storage_handler:
                        success, count = self.storage_handler.cleanup_expired_routes()
                        if success and count > 0:
                            self.logger.info(f"🗑️ Cleaned {count} expired routes from storage")
                    
                    # Clean inactive clients from broadcast handler
                    if self.broadcast_handler:
                        count = self.broadcast_handler.cleanup_inactive_clients()
                        if count > 0:
                            self.logger.info(f"🗑️ Cleaned {count} inactive clients")
                    
                except Exception as e:
                    self.logger.error(f"❌ Periodic cleanup error: {e}")
        
        self.cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        self.cleanup_thread.start()
        self.logger.info("🧹 Cleanup thread started")
    
    def run(self, host='0.0.0.0', port=3000, debug=False):
        """Run the server"""
        try:
            self.logger.info(f"🚀 Starting Route Sharing Server on {host}:{port}")
            
            # Test database connection
            db_connected = self._test_database_connection()
            
            # Start cleanup thread
            self._start_cleanup_thread()
            
            # Log server status
            self.logger.info("=" * 50)
            self.logger.info("🌟 Route Sharing Server Status:")
            self.logger.info(f"   📍 Host: {host}")
            self.logger.info(f"   🔌 Port: {port}")
            self.logger.info(f"   🗄️ Database: {'Connected' if db_connected else 'Fallback Mode'}")
            self.logger.info(f"   🐛 Debug: {debug}")
            self.logger.info("=" * 50)
            
            # Run the server
            self.socketio.run(
                self.app,
                host=host,
                port=port,
                debug=debug,
                use_reloader=False  # Disable reloader to prevent threading issues
            )
            
        except KeyboardInterrupt:
            self.logger.info("🛑 Server stopped by user")
        except Exception as e:
            self.logger.error(f"❌ Server error: {e}")
            raise
    
    def stop(self):
        """Stop the server gracefully"""
        self.logger.info("🛑 Shutting down server...")
        
        # Stop cleanup thread
        if self.cleanup_thread and self.cleanup_thread.is_alive():
            self.logger.info("🧹 Stopping cleanup thread...")
        
        # Disconnect all clients
        if self.broadcast_handler:
            self.broadcast_handler.broadcast_to_all('server-shutdown', {
                'message': 'Server is shutting down'
            })
        
        self.logger.info("✅ Server shutdown complete")
    
    def get_server_info(self):
        """Get current server information"""
        info = {
            'timestamp': datetime.utcnow().isoformat(),
            'database_connected': False,
            'connected_clients': 0,
            'active_routes': 0,
            'unique_users': 0
        }
        
        # Check database connection
        if self.storage_handler:
            connected, _ = self.storage_handler.test_connection()
            info['database_connected'] = connected
        
        # Get broadcast info
        if self.broadcast_handler:
            client_info = self.broadcast_handler.get_connected_clients_info()
            info.update(client_info)
        
        return info


def create_server(config=None):
    """Factory function to create server instance"""
    return RouteServer(config)


def load_config_from_env():
    """Load configuration from environment variables"""
    config = {
        'mongo_uri': os.environ.get('MONGO_URI', 'mongodb://localhost:27017/Via'),
        'static_folder': os.environ.get('STATIC_FOLDER'),
        'host': os.environ.get('HOST', '0.0.0.0'),
        'port': int(os.environ.get('PORT', 3000)),
        'debug': os.environ.get('DEBUG', 'false').lower() == 'true'
    }
    return config


if __name__ == '__main__':
    # Load configuration
    config = load_config_from_env()
    
    # Create and run server
    server = create_server(config)
    
    try:
        server.run(
            host=config['host'],
            port=config['port'],
            debug=config['debug']
        )
    except KeyboardInterrupt:
        server.stop()
    except Exception as e:
        logging.error(f"❌ Failed to start server: {e}")
        raise