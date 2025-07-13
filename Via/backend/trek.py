import logging
from datetime import datetime
from flask import Blueprint, request, jsonify

class RouteHandler:
    def __init__(self, storage_handler=None, broadcast_handler=None):
        self.storage_handler = storage_handler
        self.broadcast_handler = broadcast_handler
        self.blueprint = self.create_blueprint()
    
    def create_blueprint(self):
        """Create Flask blueprint with all route endpoints"""
        bp = Blueprint('routes', __name__)
        
        # Register all route endpoints
        bp.add_url_rule('/find-matching-routes', 'find_matching_routes', 
                       self.find_matching_routes, methods=['POST'])
        bp.add_url_rule('/routes', 'get_routes', 
                       self.get_routes, methods=['GET'])
        bp.add_url_rule('/active-users', 'get_active_users', 
                       self.get_active_users, methods=['GET'])
        bp.add_url_rule('/clean-routes', 'clean_routes', 
                       self.clean_routes, methods=['POST'])
        bp.add_url_rule('/health', 'health_check', 
                       self.health_check, methods=['GET'])
        
        return bp
    
    def find_matching_routes(self):
        """Find matching routes for a user"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'message': '❌ No data provided'}), 400
                
            user_id = data.get('userID')
            source = data.get('source')
            destination = data.get('destination')
            path = data.get('path')

            if not user_id or not path:
                return jsonify({'message': '❌ Invalid request parameters'}), 400

            # Try to get matching routes from storage
            matching_routes = []
            if self.storage_handler:
                success, routes = self.storage_handler.find_matching_routes(
                    user_id, source, destination, path
                )
                if success:
                    matching_routes = routes
                else:
                    logging.warning(f"⚠️ Storage unavailable, using fallback: {routes}")
            
            # Fallback to in-memory routes if storage fails
            if not matching_routes and self.broadcast_handler:
                matching_routes = self.broadcast_handler.get_fallback_matching_routes(
                    user_id, source, destination, path
                )

            return jsonify({
                'message': '✅ Matching routes found' if matching_routes else '⚠️ No matching routes found',
                'data': matching_routes,
                'count': len(matching_routes)
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error in find-matching-routes: {e}")
            return jsonify({'message': 'Failed to process routes'}), 500
    
    def get_routes(self):
        """Get routes with optional filtering"""
        try:
            user_id = request.args.get('userID')
            limit = min(int(request.args.get('limit', 100)), 1000)  # Max 1000 routes
            hours_back = int(request.args.get('hours', 24))
            
            routes_array = []
            
            # Try to get routes from storage
            if self.storage_handler:
                success, routes = self.storage_handler.get_routes(
                    user_id=user_id, limit=limit, hours_back=hours_back
                )
                if success:
                    routes_array = routes
                else:
                    logging.warning(f"⚠️ Storage unavailable, using fallback: {routes}")
            
            # Fallback to in-memory routes if storage fails
            if not routes_array and self.broadcast_handler:
                for route_data in self.broadcast_handler.active_routes.values():
                    if not user_id or route_data.get('userID') == user_id:
                        routes_array.append(route_data)
                routes_array = routes_array[:limit]
                
            return jsonify({
                'message': '✅ Routes retrieved successfully',
                'data': routes_array,
                'count': len(routes_array)
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error reading routes: {e}")
            return jsonify({'message': 'Failed to read routes'}), 500
    
    def get_active_users(self):
        """Get information about active users and connections"""
        try:
            info = {}
            
            # Get info from broadcast handler
            if self.broadcast_handler:
                info = self.broadcast_handler.get_connected_clients_info()
            else:
                info = {
                    'connected_clients': 0,
                    'active_routes': 0,
                    'unique_users': 0,
                    'socket_ids': []
                }
            
            return jsonify({
                'message': '✅ Active users retrieved successfully',
                **info
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error getting active users: {e}")
            return jsonify({'message': 'Failed to get active users'}), 500
    
    def clean_routes(self):
        """Admin endpoint to clean up old or invalid routes"""
        try:
            auth_key = request.headers.get('Authorization')
            if auth_key != 'admin-secret-key':
                return jsonify({'message': 'Unauthorized'}), 401
            
            # Try to clean routes from storage
            if self.storage_handler:
                success, result = self.storage_handler.clean_invalid_routes()
                if success:
                    return jsonify({
                        'message': '✅ Routes cleaned successfully',
                        **result
                    }), 200
                else:
                    logging.warning(f"⚠️ Storage cleanup failed: {result}")
            
            # Fallback to in-memory cleanup
            cleared_count = 0
            if self.broadcast_handler:
                cleared_count = self.broadcast_handler.clear_all_routes()
            
            return jsonify({
                'message': '⚠️ DB unavailable, cleaned in-memory routes only',
                'in_memory_routes_cleared': cleared_count
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error cleaning routes: {e}")
            return jsonify({'message': 'Failed to clean routes'}), 500
    
    def health_check(self):
        """Health check endpoint"""
        try:
            # Test storage connection
            db_status = "not_configured"
            if self.storage_handler:
                connected, message = self.storage_handler.test_connection()
                if connected:
                    db_status = "connected"
                else:
                    db_status = f"error: {message}"
                    logging.warning(f"⚠️ Database health check failed: {message}")
            
            # Get connection info
            connection_info = {}
            if self.broadcast_handler:
                connection_info = self.broadcast_handler.get_connected_clients_info()
            
            return jsonify({
                'status': 'healthy',
                'timestamp': datetime.utcnow().isoformat(),
                'database': db_status,
                'fallback_mode': db_status.startswith('error'),
                **connection_info
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error in health check: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }), 500
    
    def create_route(self):
        """Create a new route (POST /routes)"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'message': '❌ No data provided'}), 400
            
            required_fields = ['userID', 'source', 'destination', 'path']
            if not all(field in data for field in required_fields):
                return jsonify({'message': '❌ Missing required fields'}), 400
            
            # Add timestamp
            data['timestamp'] = datetime.utcnow().isoformat()
            
            # Save to storage if available
            if self.storage_handler:
                success, message = self.storage_handler.save_route(data)
                if not success:
                    logging.warning(f"⚠️ Storage save failed: {message}")
            
            # Broadcast to connected clients
            if self.broadcast_handler:
                self.broadcast_handler.broadcast_to_all('route-update', {'data': data}, include_self=False)
            
            return jsonify({
                'message': '✅ Route created successfully',
                'data': data
            }), 201
            
        except Exception as e:
            logging.error(f"❌ Error creating route: {e}")
            return jsonify({'message': 'Failed to create route'}), 500
    
    def update_route(self, route_id):
        """Update an existing route (PUT /routes/<id>)"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'message': '❌ No data provided'}), 400
            
            # Add update timestamp
            data['updated_at'] = datetime.utcnow().isoformat()
            
            # Update in storage if available
            if self.storage_handler:
                # This would need to be implemented in storage handler
                success, message = self.storage_handler.update_route(route_id, data)
                if not success:
                    return jsonify({'message': f'❌ Failed to update route: {message}'}), 400
            
            # Broadcast update to connected clients
            if self.broadcast_handler:
                self.broadcast_handler.broadcast_to_all('route-updated', {
                    'route_id': route_id,
                    'data': data
                }, include_self=False)
            
            return jsonify({
                'message': '✅ Route updated successfully',
                'data': data
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error updating route: {e}")
            return jsonify({'message': 'Failed to update route'}), 500
    
    def delete_route(self, route_id):
        """Delete a route (DELETE /routes/<id>)"""
        try:
            # Delete from storage if available
            if self.storage_handler:
                # This would need to be implemented in storage handler
                success, message = self.storage_handler.delete_route(route_id)
                if not success:
                    return jsonify({'message': f'❌ Failed to delete route: {message}'}), 400
            
            # Broadcast deletion to connected clients
            if self.broadcast_handler:
                self.broadcast_handler.broadcast_to_all('route-deleted', {
                    'route_id': route_id
                }, include_self=False)
            
            return jsonify({
                'message': '✅ Route deleted successfully'
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error deleting route: {e}")
            return jsonify({'message': 'Failed to delete route'}), 500
    
    def get_route_stats(self):
        """Get route statistics"""
        try:
            stats = {
                'total_routes': 0,
                'active_routes': 0,
                'unique_users': 0,
                'connected_clients': 0
            }
            
            # Get storage stats
            if self.storage_handler:
                success, count = self.storage_handler.get_route_count()
                if success:
                    stats['total_routes'] = count
            
            # Get broadcast stats
            if self.broadcast_handler:
                info = self.broadcast_handler.get_connected_clients_info()
                stats.update({
                    'active_routes': info.get('active_routes', 0),
                    'unique_users': info.get('unique_users', 0),
                    'connected_clients': info.get('connected_clients', 0)
                })
            
            return jsonify({
                'message': '✅ Route statistics retrieved successfully',
                'stats': stats
            }), 200
            
        except Exception as e:
            logging.error(f"❌ Error getting route stats: {e}")
            return jsonify({'message': 'Failed to get route statistics'}), 500