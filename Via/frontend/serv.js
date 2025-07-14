let colors = ["blue", "red", "green", "purple", "orange", "brown", "pink"];
let colorIndex = 0;
let currentUserID;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {

    currentUserID = localStorage.getItem('userID') || generateUserID();
    console.log('Current User ID:', currentUserID);
    // Initialize Socket.io
    initializeSocket();

    // Get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var lat = position.coords.latitude;
            var lon = position.coords.longitude;
            var accuracy = position.coords.accuracy;

            initMap(lat, lon, accuracy);
            
            updateConnectionStatus("Connected");
        }, function (error) {
            console.error('Error getting location:', error);
            initMap(12.983960, 77.607966, 100);
            updateConnectionStatus("Connected (No Location)");
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        });
    } else {
        initMap(12.983960, 77.607966, 100);
        updateConnectionStatus("Connected (No Geolocation)");
    }

    // Setup event listeners
    setupEventListeners();
});

// Initialize Socket.io connection
// Initialize Socket.io connection
function initializeSocket() {
    try {
        // Connect to the Socket.io server
        socket = io({
            transports: ['websocket', 'polling'],
            upgrade: true,
            timeout: 20000,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        socket.on("connect", () => {
            console.log("✅ Connected to Socket.io Server");
            console.log("Socket ID:", socket.id);
            updateConnectionStatus("Connected");
        });

        socket.on("disconnect", (reason) => {
            console.log("❌ Disconnected from Socket.io Server:", reason);
            updateConnectionStatus("Disconnected", "red");

            // Clear routes layer when disconnected
            if (routesLayer) {
                routesLayer.clearLayers();
            }
            
            // Clear existing routes
            existingRoutes.clear();
        });

        socket.on("route-update", (data) => {
            console.log("📍 Received route update:", data);
            
            if (data && data.data) {
                // Store this route in our active routes map
                if (data.data.socketId && data.data.userID) {
                    existingRoutes.set(data.data.socketId, data.data);
                }
                
                // Update map with the new route
                updateMapWithRoute(data.data);
            }
        });

        socket.on("clientCount", (count) => {
            console.log(`👥 Connected clients: ${count}`);
            updateConnectionStatus(`Connected (${count} online)`);
        });

        socket.on("connect_error", (error) => {
            console.error("❌ Socket connection error:", error);
            updateConnectionStatus("Connection Error", "red");
        });
        
        socket.on("error", (error) => {
            console.error("❌ Socket error:", error);
            updateConnectionStatus("Socket Error", "orange");
        });
        
        // Handle existing routes from server
        socket.on("existing-routes", (data) => {
            console.log("📋 Received existing routes:", data);
            
            if (data && data.routes && Array.isArray(data.routes)) {
                // Clear previous routes
                if (routesLayer) {
                    routesLayer.clearLayers();
                }
                existingRoutes.clear();
                
                // Add all existing routes to the map
                data.routes.forEach(route => {
                    if (route && route.socketId && route.userID) {
                        existingRoutes.set(route.socketId, route);
                        updateMapWithRoute(route);
                    }
                });
                
                console.log(`📍 Loaded ${data.routes.length} existing routes`);
            }
        });

        socket.on("user-disconnected", (data) => {
            console.log("👋 User disconnected:", data);
            if (data && data.socketId) {
                removeRouteFromMap(data.socketId);
            }
        });

        socket.on("reconnect", (attemptNumber) => {
            console.log("🔄 Reconnected after", attemptNumber, "attempts");
            updateConnectionStatus("Reconnected");
        });

        socket.on("reconnect_error", (error) => {
            console.error("❌ Reconnection failed:", error);
            updateConnectionStatus("Reconnection Failed", "red");
        });
        
    } catch (error) {
        console.error("❌ Error initializing socket:", error);
        updateConnectionStatus("Socket Init Error", "red");
    }
}

function removeRouteFromMap(socketId) {
    if (existingRoutes.has(socketId)) {
        const userData = existingRoutes.get(socketId);
        existingRoutes.delete(socketId);
        rebuildRoutesLayer();
        
        console.log(`🗑️ Removed route for user: ${userData.userID}`);
    }
}

function rebuildRoutesLayer() {
    if (routesLayer) {
        routesLayer.clearLayers();
        
        // Re-add all existing routes
        existingRoutes.forEach(route => {
            updateMapWithRoute(route);
        });
        
        // Re-add current user's route if it exists
        if (sourceMarker && destinationMarker && control) {
            try {
                control.setWaypoints([sourceMarker.getLatLng(), destinationMarker.getLatLng()]);
            } catch (error) {
                console.error("Error setting waypoints:", error);
            }
        }
    }
}

// Update connection status indicator
function updateConnectionStatus(message, color = "green") {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = message;
        
        // Set background color based on status
        let backgroundColor;
        switch (color) {
            case "red":
                backgroundColor = "rgba(255, 0, 0, 0.8)";
                break;
            case "orange":
                backgroundColor = "rgba(255, 165, 0, 0.8)";
                break;
            case "green":
            default:
                backgroundColor = "rgba(0, 128, 0, 0.8)";
                break;
        }
        
        statusElement.style.backgroundColor = backgroundColor;
        statusElement.style.color = "white";
        statusElement.style.padding = "5px 10px";
        statusElement.style.borderRadius = "5px";
        statusElement.style.fontSize = "12px";
    }
}

// Generate a random user ID if not already stored
function generateUserID() {
    const userID = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userID', userID);
    return userID;
}

// Add a simple hash function to consistently generate colors based on userID
function hashCode(str) {
    let hash = 0;
    if (!str || str.length === 0) return hash;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Choose color for the route - use userID to keep colors consistent
function getUserColor(userID) {
    if (!userID) return colors[0];
    
    const hash = hashCode(userID);
    return colors[hash % colors.length];
}

function updateMapWithRoute(routeData) {
    if (!routeData || !routeData.source || !routeData.destination) {
        console.error("❌ Invalid route data received");
        return;
    }

    console.log("🔄 Updating map with route:", routeData);

    const userId = routeData.userID || 'unknown';
    const routeColor = getUserColor(userId)
    
    // Create latLng objects
    const sourceLatLng = Array.isArray(routeData.source) ? 
        L.latLng(routeData.source[0], routeData.source[1]) : 
        L.latLng(routeData.source.lat, routeData.source.lng);
    
    const destinationLatLng = Array.isArray(routeData.destination) ? 
        L.latLng(routeData.destination[0], routeData.destination[1]) : 
        L.latLng(routeData.destination.lat, routeData.destination.lng);


    // Add markers for the shared route
    L.marker(sourceLatLng, {
        icon: L.divIcon({
            className: 'custom-marker shared-source',
            html: `<div style="background-color:${routeColor}; width: 20px; height: 20px; border: 2px solid white; border-radius: 50%; "></div>`,
            iconSize: [20, 20]
        })
    }).addTo(routesLayer).bindPopup(`Source: ${userId.substring(0, 8)}`);

    L.marker(destinationLatLng, {
        icon: L.divIcon({
            className: 'custom-marker shared-destination',
            html: `<div style="background-color:${routeColor}; width: 20px; height: 20px; border: 2px solid white;"></div>`,
            iconSize: [20, 20]
        })
    }).addTo(routesLayer).bindPopup(`Destination: ${userId.substring(0, 8)}`);

    // Calculate and display the actual route 
    lastroute = L.Routing.control({
        waypoints: [sourceLatLng, destinationLatLng],
        routeWhileDragging: false,
        createMarker: () => false, // Don't create additional markers
        lineOptions: {
            styles: [{color: routeColor, opacity: 0.6, weight: 4}]
        },
        fitSelectedRoutes: false,
        showAlternatives: false,
        addWaypoints: false,
        show: false
    }).addTo(map);

    if (routeData.socketId) {
        sharedRouteControls.set(routeData.socketId, routeControl);
    }

    const container = lastroute.getContainer();
    container.classList.add('leaflet-routing-container-hide');  // Prevent toggle


    // Only adjust map bounds if this is a newly added route
    // if (routeData.isNewRoute) {
    //     const bounds = routesLayer.getBounds();
    //     if (bounds.isValid()) {
    //         map.fitBounds(bounds, { padding: [50, 50] });
    //     }
    // }
}

// Set up event listeners
function setupEventListeners() {
    // Route button
    document.getElementById('route-btn').addEventListener('click', updateRoute);
    
    // Enter key for route search
    document.addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            document.getElementById("route-btn").click();
        }
    });

    // Set source/destination buttons - check if elements exist first
    const setSourceBtn = document.getElementById('set-source-btn');
    const setDestBtn = document.getElementById('set-destination-btn');
    
    if (setSourceBtn) {
        setSourceBtn.addEventListener('click', function() {
            isSettingSource = true;
            isSettingDestination = false;
            updateConnectionStatus("Click on map to set source");
        });
    }

    if (setDestBtn) {
        setDestBtn.addEventListener('click', function() {
            isSettingSource = false;
            isSettingDestination = true;
            updateConnectionStatus("Click on map to set destination");
        });
    }

    // Current location buttons

    const fromCurrentBtn = document.getElementById('from-current-btn');
    if (fromCurrentBtn) {
        fromCurrentBtn.addEventListener('click', setCurrentLocationAsSource);
    }

    const fromCurrentBtn1 = document.getElementById('liveicon');
    if (fromCurrentBtn1) {
        fromCurrentBtn1.addEventListener('click', setCurrentLocationAsSource);
    }

    // Toggle routing instructions
    // const toggleBtn = document.getElementById('toggle-routing');
    // if (toggleBtn) {
    //     toggleBtn.addEventListener('click', toggleRouting);
    // }

    // Set up the suggestions for location inputs
    setupSearchSuggestions();
}

// Update user location periodically
function startLocationTracking() {
    if (!navigator.geolocation) {
        console.log("❌ Geolocation not supported");
        return;
    }
    
    const locationOptions = {
        enableHighAccuracy: true,
        maximumAge: 30000, // 30 seconds
        timeout: 10000 // 10 seconds
    };
    
    const watchId = navigator.geolocation.watchPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            userCoords = [lat, lon];
            
            // Update live location marker
            if (liveLocationMarker && accuracyCircle) {
                liveLocationMarker.setLatLng([lat, lon]);
                accuracyCircle.setLatLng([lat, lon]);
                accuracyCircle.setRadius(Math.min(accuracy, 200));
            } else if (!mapInitialized) {
                initMap(lat, lon, accuracy);
            }
        },
        function(error) {
            console.error("❌ Geolocation error:", error.message);
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    console.log("User denied geolocation request");
                    break;
                case error.POSITION_UNAVAILABLE:
                    console.log("Location information unavailable");
                    break;
                case error.TIMEOUT:
                    console.log("Location request timed out");
                    break;
            }
        },
        locationOptions
    );
    
    // Store watch ID for cleanup if needed
    window.locationWatchId = watchId;
}

// Start location tracking after a delay
setTimeout(startLocationTracking, 2000);