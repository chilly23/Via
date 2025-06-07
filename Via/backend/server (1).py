from flask import Flask, request, jsonify, send_from_directory
import json
import os
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import logging

app = Flask(__name__, static_folder='public')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")
logging.basicConfig(level=logging.INFO)

# File path for storing routes
FILE_PATH = os.path.join(os.path.dirname(__file__), 'routes.json')
connected_clients = 0
active_routes = {}  # In-memory storage for active routes

# Ensure routes file exists
if not os.path.exists(FILE_PATH):
    with open(FILE_PATH, 'w') as f:
        json.dump([], f)

@socketio.on('connect')
def handle_connect():
    global connected_clients
    connected_clients += 1
    client_sid = request.sid  # Get the client's socket ID
    logging.info(f"✅ New Socket.io client connected: {client_sid}")
    
    # Emit current client count to all clients
    socketio.emit('clientCount', connected_clients)
    
    # Send existing routes to the new client
    try:
        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)
        emit('existing-routes', {'routes': routes_array})
    except Exception as e:
        logging.error(f"❌ Error reading routes JSON: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    global connected_clients, active_routes
    connected_clients = max(0, connected_clients - 1)
    client_sid = request.sid
    
    # Notify others that this client disconnected
    if client_sid in active_routes:
        socketio.emit('user-disconnected', {'socketId': client_sid}, broadcast=True, include_self=False)
        del active_routes[client_sid]
        
    logging.info(f"❌ Client disconnected: {client_sid}")
    socketio.emit('clientCount', connected_clients)

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
        
        logging.info(f"📢 Broadcasting new route from {client_sid}: {route_data}")
        
        # Broadcast to all clients except sender
        socketio.emit('route-update', {'data': route_data}, broadcast=True, include_self=False)
        
        # Save the route
        save_route(route_data)
    except Exception as e:
        logging.error(f"❌ Error parsing Socket message: {e}")

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

    routes_array.append(route_data)
    logging.info("✅ Saving route to file")

    try:
        with open(FILE_PATH, 'w') as f:
            json.dump(routes_array, f, indent=2)
        logging.info(f"🟢 Route saved successfully: {route_data}")
    except Exception as e:
        logging.error(f"❌ Error saving route: {e}")

@app.route('/find-matching-routes', methods=['POST'])
def find_matching_routes():
    try:
        data = request.get_json()
        user_id = data.get('userID')
        path = data.get('path')

        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)

        matching_routes = [
            route for route in routes_array
            if route.get('path') == path and route.get('userID') != user_id
        ]

        return jsonify({
            'message': '✅ Matching routes found' if matching_routes else '⚠ No matching routes found',
            'data': matching_routes
        }), 200
    except Exception as e:
        logging.error(f"❌ Error in find-matching-routes: {e}")
        return jsonify({'message': 'Failed to process routes'}), 500

@app.route('/routes', methods=['GET'])
def get_routes():
    try:
        with open(FILE_PATH, 'r') as f:
            routes_array = json.load(f)
        return jsonify({
            'message': '✅ Routes retrieved successfully',
            'data': routes_array
        }), 200
    except Exception as e:
        logging.error(f"❌ Error reading routes file: {e}")
        return jsonify({'message': 'Failed to read routes'}), 500

@app.route('/')
def serve_html():
    return send_from_directory(app.static_folder, 'consolidated-html.html')

# Catch-all to serve static files (like CSS, JS, images)
@app.route('/<path:filename>')
def serve_file(filename):
    return send_from_directory('public', filename)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=3000, debug=True)