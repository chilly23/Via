from flask import Flask, request, jsonify, send_from_directory
import json
import os
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import logging
import time

app = Flask(__name__, static_folder='public')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")
logging.basicConfig(level=logging.INFO)

# File path for storing routes
FILE_PATH = os.path.join(os.path.dirname(__file__), 'routes.json')
connected_clients = {}  # Track connected clients with their socket IDs
active_routes = {}  # In-memory storage for active routes

# Ensure routes file exists and is properly initialized
if not os.path.exists(FILE_PATH):
    with open(FILE_PATH, 'w') as f:
        json.dump([], f)
else:
    # Check if file is empty or corrupted
    try:
        with open(FILE_PATH, 'r') as f:
            file_content = f.read().strip()
            if not file_content:  # File is empty
                with open(FILE_PATH, 'w') as f:
                    json.dump([], f)
            else:
                # Validate JSON
                try:
                    json.loads(file_content)
                except json.JSONDecodeError:
                    # If JSON is invalid, reinitialize it
                    logging.warning("❌ routes.json file is corrupted. Reinitializing.")
                    with open(FILE_PATH, 'w') as f:
                        json.dump([], f)
    except Exception as e:
        logging.error(f"❌ Error checking routes file: {e}")
        # Reinitialize the file
        with open(FILE_PATH, 'w') as f:
            json.dump([], f)

@socketio.on('connect')
def handle_connect():
    client_sid = request.sid  # Get the client's socket ID
    connected_clients[client_sid] = {
        'connected_at': time.time(),
        'routes': []
    }
    
    logging.info(f"✅ New Socket.io client connected: {client_sid}")
    
    # Emit current client count to all clients
    client_count = len(connected_clients)
    socketio.emit('clientCount', client_count)
    
    # Send existing routes to the new client
    try:
        # Make sure the file exists and has valid JSON
        if os.path.exists(FILE_PATH) and os.path.getsize(FILE_PATH) > 0:
            try:
                with open(FILE_PATH, 'r') as f:
                    routes_array = json.load(f)
                emit('existing-routes', {'routes': routes_array})
            except json.JSONDecodeError:
                logging.error("❌ Invalid JSON in routes file, sending empty routes")
                emit('existing-routes', {'routes': []})
        else:
            # If file doesn't exist or is empty, send empty array
            emit('existing-routes', {'routes': []})
    except Exception as e:
        logging.error(f"❌ Error reading routes JSON: {e}")
        # Send empty array as fallback
        emit('existing-routes', {'routes': []})

@socketio.on('disconnect')
def handle_disconnect():
    client_sid = request.sid
    
    # Remove from connected clients
    if client_sid in connected_clients:
        del connected_clients[client_sid]
    
    # Notify others that this client disconnected
    if client_sid in active_routes:
        socketio.emit('user-disconnected', {'socketId': client_sid}, broadcast=True, include_self=False)
        del active_routes[client_sid]
        
    logging.info(f"❌ Client disconnected: {client_sid}")
    socketio.emit('clientCount', len(connected_clients))

@socketio.on('message')
def handle_message(message_data):
    try:
        # Ensure message_data is a dict
        route_data = message_data if isinstance(message_data, dict) else json.loads(message_data)
        
        # Add socket ID to the route data
        client_sid = request.sid
        route_data['socketId'] = client_sid
        
        # Store in active routes
        active_routes[client_sid] = route_data
        
        # Update client's routes in connected_clients
        if client_sid in connected_clients:
            connected_clients[client_sid]['routes'].append(route_data)
        
        logging.info(f"📢 Broadcasting new route from {client_sid}")
        
        # Broadcast to all clients except sender
        socketio.emit('route-update', {'data': route_data}, broadcast=True, include_self=False)
        
        # Save the route
        save_route(route_data)
    except Exception as e:
        logging.error(f"❌ Error parsing Socket message: {e}")
        logging.error(f"Message data: {message_data}")

def save_route(route_data):
    required_fields = ['userID', 'source', 'destination', 'path']
    if not all(field in route_data for field in required_fields):
        logging.error(f"❌ Invalid route data: {route_data}")
        return

    try:
        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)
    except Exception as e:
        logging.error(f"❌ Error parsing routes JSON: {e}")
        routes_array = []

    # Check if a route from this user already exists and update it
    updated = False
    for i, route in enumerate(routes_array):
        if route.get('userID') == route_data.get('userID') and route.get('socketId') == route_data.get('socketId'):
            routes_array[i] = route_data
            updated = True
            break
    
    # If no existing route found, append the new one
    if not updated:
        routes_array.append(route_data)
    
    logging.info("✅ Saving route to file")

    try:
        with open(FILE_PATH, 'w') as f:
            json.dump(routes_array, f, indent=2)
        logging.info(f"🟢 Route saved successfully for user: {route_data.get('userID')}")
    except Exception as e:
        logging.error(f"❌ Error saving route: {e}")

@app.route('/find-matching-routes', methods=['POST'])
def find_matching_routes():
    try:
        data = request.get_json()
        user_id = data.get('userID')
        source = data.get('source')
        destination = data.get('destination')
        path = data.get('path')

        if not user_id or not path:
            return jsonify({'message': '❌ Invalid request parameters'}), 400

        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)

        # Find routes with matching path or similar source/destination
        matching_routes = []
        for route in routes_array:
            # Skip user's own routes
            if route.get('userID') == user_id:
                continue
                
            # Check if paths match
            if route.get('path') == path:
                route['match_type'] = 'exact_path'
                matching_routes.append(route)
            # Check if source and destination are close enough
            elif source and destination and route.get('source') and route.get('destination'):
                # Implement proximity check logic here if needed
                # For now, just check if they're the same points
                if (route.get('source') == source and route.get('destination') == destination):
                    route['match_type'] = 'same_endpoints'
                    matching_routes.append(route)

        return jsonify({
            'message': '✅ Matching routes found' if matching_routes else '⚠ No matching routes found',
            'data': matching_routes,
            'count': len(matching_routes)
        }), 200
    except Exception as e:
        logging.error(f"❌ Error in find-matching-routes: {e}")
        return jsonify({'message': 'Failed to process routes'}), 500

@app.route('/routes', methods=['GET'])
def get_routes():
    try:
        user_id = request.args.get('userID')
        
        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)
        
        # Filter by user ID if provided
        if user_id:
            routes_array = [route for route in routes_array if route.get('userID') == user_id]
            
        return jsonify({
            'message': '✅ Routes retrieved successfully',
            'data': routes_array,
            'count': len(routes_array)
        }), 200
    except Exception as e:
        logging.error(f"❌ Error reading routes file: {e}")
        return jsonify({'message': 'Failed to read routes'}), 500

@app.route('/active-users', methods=['GET'])
def get_active_users():
    try:
        return jsonify({
            'message': '✅ Active users retrieved successfully',
            'count': len(connected_clients),
            'users': list(connected_clients.keys())
        }), 200
    except Exception as e:
        logging.error(f"❌ Error getting active users: {e}")
        return jsonify({'message': 'Failed to get active users'}), 500

@app.route('/clean-routes', methods=['POST'])
def clean_routes():
    """Admin endpoint to clean up old or invalid routes"""
    try:
        auth_key = request.headers.get('Authorization')
        # Simple auth check - in production, use proper authentication
        if auth_key != 'admin-secret-key':
            return jsonify({'message': 'Unauthorized'}), 401
            
        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)
            
        original_count = len(routes_array)
        
        # Remove routes without required fields
        valid_routes = []
        for route in routes_array:
            if all(field in route for field in ['userID', 'source', 'destination', 'path']):
                valid_routes.append(route)
                
        with open(FILE_PATH, 'w') as f:
            json.dump(valid_routes, f, indent=2)
            
        return jsonify({
            'message': '✅ Routes cleaned successfully',
            'original_count': original_count,
            'new_count': len(valid_routes),
            'removed': original_count - len(valid_routes)
        }), 200
    except Exception as e:
        logging.error(f"❌ Error cleaning routes: {e}")
        return jsonify({'message': 'Failed to clean routes'}), 500

@app.route('/')
def serve_html():
    return send_from_directory(app.static_folder, 'consolidated-html.html')

# Catch-all to serve static files (like CSS, JS, images)
@app.route('/<path:filename>')
def serve_file(filename):
    return send_from_directory('public', filename)

if __name__ == '__main__':
    print("🚀 Starting Route Sharing Server...")
    print(f"📁 Using routes file: {FILE_PATH}")
    socketio.run(app, host='0.0.0.0', port=3000, debug=True)