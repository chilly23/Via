import logging
import json
import time
from datetime import datetime
from flask_socketio import SocketIO, emit

class BroadcastHandler:
    def __init__(self, socketio=None, storage_handler=None):
        self.socketio = socketio
        self.storage_handler = storage_handler
        self.connected_clients = {}
        self.active_routes = {}
    
    def init_socketio(self, socketio):
        """Initialize with SocketIO instance"""
        self.socketio = socketio
        self.setup_events()
    
    def setup_events(self):
        """Setup SocketIO event handlers"""
        @self.socketio.on('connect')
        def handle_connect():
            return self.handle_client_connect()
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            return self.handle_client_disconnect()
        
        @self.socketio.on('message')
        def handle_message(message_data):
            return self.handle_route_message(message_data)
    
    def handle_client_connect(self):
        """Handle new client connection"""
        from flask import request
        
        client_sid = request.sid
        self.connected_clients[client_sid] = {
            'connected_at': time.time(),
            'routes': []
        }
        
        logging.info(f"✅ New Socket.io client connected: {client_sid}")
        
        # Emit current client count to all clients
        client_count = len(self.connected_clients)
        self.socketio.emit('clientCount', client_count)
        
        # Send existing active routes to the new client
        try:
            routes_array = self.get_existing_routes()
            emit('existing-routes', {'routes': routes_array})
            logging.info(f"📤 Sent {len(routes_array)} existing routes to new client")
            
        except Exception as e:
            logging.error(f"❌ Error sending existing routes: {e}")
            emit('existing-routes', {'routes': []})
    
    def handle_client_disconnect(self):
        """Handle client disconnection"""
        from flask import request
        
        client_sid = request.sid
        
        # Remove from connected clients
        if client_sid in self.connected_clients:
            del self.connected_clients[client_sid]
        
        # Remove from active routes and notify others
        if client_sid in self.active_routes:
            self.socketio.emit('user-disconnected', {'socketId': client_sid}, include_self=False)
            del self.active_routes[client_sid]
            
        logging.info(f"❌ Client disconnected: {client_sid}")
        self.socketio.emit('clientCount', len(self.connected_clients))
    
    def handle_route_message(self, message_data):
        """Handle route message from client"""
        from flask import request
        
        try:
            # Ensure message_data is a dict
            route_data = message_data if isinstance(message_data, dict) else json.loads(message_data)
            
            # Validate required fields
            required_fields = ['userID', 'source', 'destination']
            if not all(field in route_data for field in required_fields):
                logging.error(f"❌ Missing required fields in route data: {route_data}")
                emit('error', {'message': 'Missing required route data'})
                return
            
            # Add socket ID and timestamp
            client_sid = request.sid
            route_data['socketId'] = client_sid
            route_data['timestamp'] = datetime.utcnow().isoformat()
            
            # Validate via points if provided
            if 'via' in route_data and route_data['via']:
                if not isinstance(route_data['via'], list):
                    route_data['via'] = []
                else:
                    # Validate each via point
                    valid_via = []
                    for via_point in route_data['via']:
                        if isinstance(via_point, list) and len(via_point) >= 2:
                            try:
                                lat, lng = float(via_point[0]), float(via_point[1])
                                valid_via.append([lat, lng])
                            except (ValueError, TypeError):
                                continue
                    route_data['via'] = valid_via
            else:
                route_data['via'] = []
            
            # Store in active routes
            self.active_routes[client_sid] = route_data
            
            # Update client's routes in connected_clients
            if client_sid in self.connected_clients:
                self.connected_clients[client_sid]['routes'].append(route_data)
            
            logging.info(f"📢 Broadcasting new route from {client_sid}")
            
            # Broadcast to all other clients
            self.socketio.emit('route-update', {'data': route_data}, include_self=False)
            
            # Save the route to storage if available
            if self.storage_handler:
                success, message = self.storage_handler.save_route(route_data)
                if not success:
                    logging.warning(f"⚠️ Route broadcast continued despite storage failure: {message}")
            
        except Exception as e:
            logging.error(f"❌ Error parsing Socket message: {e}")
            logging.error(f"Message data: {message_data}")
            emit('error', {'message': 'Failed to process route data'})

    def get_existing_routes(self):
        """Get existing routes from storage or fallback to in-memory"""
        if self.storage_handler:
            success, routes = self.storage_handler.get_routes(limit=100, hours_back=24)
            if success:
                return routes
            else:
                logging.warning(f"⚠️ Storage unavailable, using in-memory routes")
        
        # Fallback to in-memory routes
        return list(self.active_routes.values())
    
    def get_connected_clients_info(self):
        """Get information about connected clients"""
        active_user_ids = set()
        for client_data in self.connected_clients.values():
            for route in client_data.get('routes', []):
                active_user_ids.add(route.get('userID'))
        
        return {
            'connected_clients': len(self.connected_clients),
            'active_routes': len(self.active_routes),
            'unique_users': len(active_user_ids),
            'socket_ids': list(self.connected_clients.keys())
        }
    
    def broadcast_to_all(self, event_name, data, include_self=True):
        """Broadcast message to all connected clients"""
        try:
            self.socketio.emit(event_name, data, include_self=include_self)
            logging.info(f"📢 Broadcasted {event_name} to all clients")
        except Exception as e:
            logging.error(f"❌ Error broadcasting {event_name}: {e}")
    
    def broadcast_to_client(self, client_sid, event_name, data):
        """Broadcast message to specific client"""
        try:
            self.socketio.emit(event_name, data, room=client_sid)
            logging.info(f"📤 Sent {event_name} to client {client_sid}")
        except Exception as e:
            logging.error(f"❌ Error sending {event_name} to {client_sid}: {e}")
    
    def cleanup_inactive_clients(self, max_age_hours=24):
        """Remove clients that have been inactive for too long"""
        try:
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            
            inactive_clients = []
            for client_sid, client_data in self.connected_clients.items():
                if current_time - client_data['connected_at'] > max_age_seconds:
                    inactive_clients.append(client_sid)
            
            for client_sid in inactive_clients:
                if client_sid in self.connected_clients:
                    del self.connected_clients[client_sid]
                if client_sid in self.active_routes:
                    del self.active_routes[client_sid]
                    
            if inactive_clients:
                logging.info(f"🗑️ Cleaned up {len(inactive_clients)} inactive clients")
                
            return len(inactive_clients)
            
        except Exception as e:
            logging.error(f"❌ Error cleaning inactive clients: {e}")
            return 0
    
    def get_fallback_matching_routes(self, user_id, source, destination, path):
        """Get matching routes from in-memory storage (fallback)"""
        try:
            matching_routes = []
            for route_data in self.active_routes.values():
                if (route_data.get('userID') != user_id and 
                    route_data.get('path') == path):
                    route_data['match_type'] = 'exact_path'
                    route_data['match_score'] = 100
                    matching_routes.append(route_data)
                elif (route_data.get('userID') != user_id and 
                      source and destination and
                      route_data.get('source') == source and 
                      route_data.get('destination') == destination):
                    route_data['match_type'] = 'same_endpoints'
                    route_data['match_score'] = 80
                    matching_routes.append(route_data)
            
            # Sort by match score
            matching_routes.sort(key=lambda x: x.get('match_score', 0), reverse=True)
            return matching_routes
            
        except Exception as e:
            logging.error(f"❌ Error in fallback matching routes: {e}")
            return []
    
    def clear_all_routes(self):
        """Clear all active routes (for admin purposes)"""
        try:
            cleared_count = len(self.active_routes)
            self.active_routes.clear()
            
            # Clear routes from connected clients
            for client_data in self.connected_clients.values():
                client_data['routes'] = []
            
            logging.info(f"🗑️ Cleared {cleared_count} active routes")
            return cleared_count
            
        except Exception as e:
            logging.error(f"❌ Error clearing routes: {e}")
            return 0