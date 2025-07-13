import logging
import json
from datetime import datetime, timedelta
from flask_pymongo import PyMongo
from bson import ObjectId

class StorageHandler:
    def __init__(self, app=None):
        self.mongo = None
        self.app = app
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize storage with Flask app"""
        app.config.setdefault("MONGO_URI", "mongodb://localhost:27017/Via")
        self.mongo = PyMongo(app)
        self.app = app
        
        # Custom JSON encoder for MongoDB ObjectId
        class JSONEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, ObjectId):
                    return str(obj)
                return super().default(obj)
        
        app.json_encoder = JSONEncoder
    
    def test_connection(self):
        """Test MongoDB connection"""
        try:
            self.mongo.db.routes.count_documents({})
            return True, "Connected"
        except Exception as e:
            return False, str(e)
    
    def save_route(self, route_data):
        """Save route to MongoDB with error handling"""
        try:
            # Use upsert to avoid race conditions
            filter_query = {
                'userID': route_data['userID'],
                'socketId': route_data['socketId']
            }
            
            update_data = {
                '$set': route_data,
                '$setOnInsert': {'created_at': datetime.utcnow().isoformat()}
            }
            
            result = self.mongo.db.routes.update_one(
                filter_query,
                update_data,
                upsert=True
            )
            
            if result.upserted_id:
                logging.info(f"✅ New route inserted for user: {route_data['userID']}")
                return True, "Route inserted"
            else:
                logging.info(f"📝 Route updated for user: {route_data['userID']}")
                return True, "Route updated"

        except Exception as e:
            logging.error(f"❌ Error saving to MongoDB: {e}")
            return False, str(e)
    
    def get_routes(self, user_id=None, limit=100, hours_back=24):
        """Get routes from database with filtering"""
        try:
            # Build query
            query = {}
            if user_id:
                query['userID'] = user_id
                
            # Get recent routes
            since_time = datetime.utcnow() - timedelta(hours=hours_back)
            query['timestamp'] = {'$gte': since_time.isoformat()}
            
            routes_cursor = self.mongo.db.routes.find(query).sort('timestamp', -1).limit(limit)
            routes_array = []
            
            for route in routes_cursor:
                route['_id'] = str(route['_id'])  # Convert ObjectId to string
                routes_array.append(route)
                
            return True, routes_array
            
        except Exception as e:
            logging.error(f"❌ Database error in get_routes: {e}")
            return False, str(e)
    
    def find_matching_routes(self, user_id, source, destination, path, hours_back=24):
        """Find matching routes for a user"""
        try:
            since_time = datetime.utcnow() - timedelta(hours=hours_back)
            routes_cursor = self.mongo.db.routes.find({
                'timestamp': {'$gte': since_time.isoformat()},
                'userID': {'$ne': user_id}  # Exclude user's own routes
            })

            matching_routes = []
            for route in routes_cursor:
                route['_id'] = str(route['_id'])  # Convert ObjectId to string
                
                # Check if paths match (exact match)
                if route.get('path') == path:
                    route['match_type'] = 'exact_path'
                    route['match_score'] = 100
                    matching_routes.append(route)
                # Check if source and destination are the same
                elif (source and destination and 
                      route.get('source') == source and 
                      route.get('destination') == destination):
                    route['match_type'] = 'same_endpoints'
                    route['match_score'] = 80
                    matching_routes.append(route)

            # Sort by match score (highest first)
            matching_routes.sort(key=lambda x: x.get('match_score', 0), reverse=True)
            return True, matching_routes

        except Exception as e:
            logging.error(f"❌ Database error in find_matching_routes: {e}")
            return False, str(e)
    
    def cleanup_expired_routes(self, hours_back=24):
        """Remove routes older than specified hours"""
        try:
            expiry_time = datetime.utcnow() - timedelta(hours=hours_back)
            result = self.mongo.db.routes.delete_many({
                'timestamp': {'$lt': expiry_time.isoformat()}
            })
            if result.deleted_count > 0:
                logging.info(f"🗑️ Cleaned up {result.deleted_count} expired routes")
            return True, result.deleted_count
        except Exception as e:
            logging.error(f"❌ Error cleaning expired routes: {e}")
            return False, str(e)
    
    def clean_invalid_routes(self):
        """Remove routes without required fields"""
        try:
            # Count total routes before cleanup
            original_count = self.mongo.db.routes.count_documents({})
            
            # Remove routes older than 48 hours
            expiry_time = datetime.utcnow() - timedelta(hours=48)
            expired_result = self.mongo.db.routes.delete_many({
                'timestamp': {'$lt': expiry_time.isoformat()}
            })
            
            # Remove routes without required fields
            invalid_result = self.mongo.db.routes.delete_many({
                '$or': [
                    {'userID': {'$exists': False}},
                    {'source': {'$exists': False}},
                    {'destination': {'$exists': False}},
                    {'path': {'$exists': False}}
                ]
            })
            
            new_count = self.mongo.db.routes.count_documents({})
            total_removed = expired_result.deleted_count + invalid_result.deleted_count
            
            return True, {
                'original_count': original_count,
                'new_count': new_count,
                'expired_removed': expired_result.deleted_count,
                'invalid_removed': invalid_result.deleted_count,
                'total_removed': total_removed
            }
            
        except Exception as e:
            logging.error(f"❌ Error cleaning invalid routes: {e}")
            return False, str(e)
    
    def get_route_count(self):
        """Get total number of routes"""
        try:
            count = self.mongo.db.routes.count_documents({})
            return True, count
        except Exception as e:
            logging.error(f"❌ Error getting route count: {e}")
            return False, str(e)