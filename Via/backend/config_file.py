"""
Configuration settings for the Route Sharing Server
"""
import os
from datetime import timedelta

class Config:
    """Base configuration class"""
    
    # Flask Configuration
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-here'
    
    # MongoDB Configuration
    MONGO_URI = os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/Via'
    
    # Server Configuration
    HOST = os.environ.get('HOST') or '0.0.0.0'
    PORT = int(os.environ.get('PORT') or 3000)
    DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    # Static Files
    STATIC_FOLDER = os.environ.get('STATIC_FOLDER') or None
    
    # Route Configuration
    ROUTE_EXPIRY_HOURS = int(os.environ.get('ROUTE_EXPIRY_HOURS') or 24)
    MAX_ROUTES_PER_REQUEST = int(os.environ.get('MAX_ROUTES_PER_REQUEST') or 1000)
    
    # Cleanup Configuration
    CLEANUP_INTERVAL_HOURS = int(os.environ.get('CLEANUP_INTERVAL_HOURS') or 1)
    CLIENT_TIMEOUT_HOURS = int(os.environ.get('CLIENT_TIMEOUT_HOURS') or 24)
    
    # Admin Configuration
    ADMIN_SECRET_KEY = os.environ.get('ADMIN_SECRET_KEY') or 'admin-secret-key'
    
    # CORS Configuration
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')
    
    # Logging Configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL') or 'INFO'
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    # SocketIO Configuration
    SOCKETIO_ASYNC_MODE = os.environ.get('SOCKETIO_ASYNC_MODE') or 'threading'
    SOCKETIO_LOGGER = os.environ.get('SOCKETIO_LOGGER', 'false').lower() == 'true'
    SOCKETIO_ENGINEIO_LOGGER = os.environ.get('SOCKETIO_ENGINEIO_LOGGER', 'false').lower() == 'true'


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    LOG_LEVEL = 'DEBUG'
    MONGO_URI = 'mongodb://localhost:27017/Via_dev'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    LOG_LEVEL = 'WARNING'
    # Use environment variables for production settings
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'change-this-in-production'
    ADMIN_SECRET_KEY = os.environ.get('ADMIN_SECRET_KEY') or 'change-this-in-production'


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
    MONGO_URI = 'mongodb://localhost:27017/Via_test'
    ROUTE_EXPIRY_HOURS = 1  # Shorter expiry for testing
    CLEANUP_INTERVAL_HOURS = 0.1  # More frequent cleanup for testing


# Configuration mapping
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config(config_name=None):
    """Get configuration class based on environment"""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    return config_map.get(config_name, DevelopmentConfig)


def load_config_dict(config_name=None):
    """Load configuration as dictionary"""
    config_class = get_config(config_name)
    config_dict = {}
    
    for key in dir(config_class):
        if not key.startswith('_'):
            config_dict[key.lower()] = getattr(config_class, key)
    
    return config_dict


def validate_config(config_dict):
    """Validate configuration settings"""
    errors = []
    
    # Required settings
    required_settings = ['MONGO_URI', 'HOST', 'PORT']
    for setting in required_settings:
        if not config_dict.get(setting.lower()):
            errors.append(f"Missing required setting: {setting}")
    
    # Validate port
    port = config_dict.get('port')
    if port and (not isinstance(port, int) or port < 1 or port > 65535):
        errors.append(f"Invalid port number: {port}")
    
    # Validate expiry hours
    expiry_hours = config_dict.get('route_expiry_hours')
    if expiry_hours and (not isinstance(expiry_hours, int) or expiry_hours < 1):
        errors.append(f"Invalid route expiry hours: {expiry_hours}")
    
    # Validate max routes
    max_routes = config_dict.get('max_routes_per_request')
    if max_routes and (not isinstance(max_routes, int) or max_routes < 1):
        errors.append(f"Invalid max routes per request: {max_routes}")
    
    return errors


def print_config_summary(config_dict):
    """Print configuration summary"""
    print("\n" + "=" * 50)
    print("🔧 Configuration Summary:")
    print("=" * 50)
    
    # Server settings
    print(f"📍 Host: {config_dict.get('host', 'N/A')}")
    print(f"🔌 Port: {config_dict.get('port', 'N/A')}")
    print(f"🐛 Debug: {config_dict.get('debug', 'N/A')}")
    print(f"🗄️ MongoDB: {config_dict.get('mongo_uri', 'N/A')}")
    
    # Route settings
    print(f"⏰ Route Expiry: {config_dict.get('route_expiry_hours', 'N/A')} hours")
    print(f"📊 Max Routes: {config_dict.get('max_routes_per_request', 'N/A')}")
    
    # Cleanup settings
    print(f"🧹 Cleanup Interval: {config_dict.get('cleanup_interval_hours', 'N/A')} hours")
    print(f"⏳ Client Timeout: {config_dict.get('client_timeout_hours', 'N/A')} hours")
    
    # Security settings
    print(f"🔐 Secret Key: {'Set' if config_dict.get('secret_key') else 'Not Set'}")
    print(f"🛡️ Admin Key: {'Set' if config_dict.get('admin_secret_key') else 'Not Set'}")
    
    print("=" * 50)


# Environment variable loading helpers
def load_env_file(filepath='.env'):
    """Load environment variables from file"""
    if not os.path.exists(filepath):
        return
    
    try:
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())
    except Exception as e:
        print(f"Warning: Could not load {filepath}: {e}")


def setup_environment():
    """Setup environment variables"""
    # Load from .env file if it exists
    load_env_file()
    
    # Set default values if not already set
    defaults = {
        'FLASK_ENV': 'development',
        'MONGO_URI': 'mongodb://localhost:27017/Via',
        'HOST': '0.0.0.0',
        'PORT': '3000',
        'DEBUG': 'false',
        'ROUTE_EXPIRY_HOURS': '24',
        'MAX_ROUTES_PER_REQUEST': '1000',
        'CLEANUP_INTERVAL_HOURS': '1',
        'CLIENT_TIMEOUT_HOURS': '24',
        'ADMIN_SECRET_KEY': 'admin-secret-key',
        'LOG_LEVEL': 'INFO'
    }
    
    for key, value in defaults.items():
        os.environ.setdefault(key, value)


if __name__ == '__main__':
    # Demo configuration loading
    setup_environment()
    
    config_dict = load_config_dict()
    print_config_summary(config_dict)
    
    # Validate configuration
    errors = validate_config(config_dict)
    if errors:
        print("\n❌ Configuration Errors:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("\n✅ Configuration is valid")