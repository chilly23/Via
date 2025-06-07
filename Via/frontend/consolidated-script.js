// Global variables
let map, sourceMarker, destinationMarker, isSettingSource = false, isSettingDestination = false;
let liveLocationMarker, accuracyCircle, control, userCoords;
let routesLayer, socket;
let mapInitialized = false;
let colors = ["blue", "red", "green", "purple", "orange", "brown", "pink"];
let colorIndex = 0;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    // Initialize Socket.io
    initializeSocket();

    // Get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var lat = position.coords.latitude;
            var lon = position.coords.longitude;
            var accuracy = position.coords.accuracy;

            initMap(lat, lon, accuracy);
            
            // Update connection status
            updateConnectionStatus("Connected");
        }, function (error) {
            console.error('Error getting location:', error);
            initMap(12.983960, 77.607966, 100); // Default location if geolocation fails
            updateConnectionStatus("Connected (No Location)");
        });
    } else {
        initMap(12.983960, 77.607966, 100); // Default location if geolocation not supported
        updateConnectionStatus("Connected (No Geolocation)");
    }

    // Setup event listeners
    setupEventListeners();
});

// Initialize Socket.io connection
function initializeSocket() {
    // Connect to the Socket.io server
    socket = io();

    socket.on("connect", () => {
        console.log("✅ Connected to Socket.io Server");
        updateConnectionStatus("Connected");
    });

    socket.on("disconnect", () => {
        console.log("❌ Disconnected from Socket.io Server");
        updateConnectionStatus("Disconnected", "red");

        if (routesLayer) {
            routesLayer.clearLayers();
        }
    });

    socket.on("route-update", (data) => {
        console.log("Received route update:", data);
        updateMapWithRoute(data.data);

        // Store this route in our active routes map if it belongs to another user
        if (data.data.socketId && data.data.userID) {
            existing-routes.set(data.data.socketId, data.data);
        }
        
        updateMapWithRoute(data.data);

    });

    socket.on("clientCount", (count) => {
        console.log(`Connected clients: ${count}`);
        updateConnectionStatus(`Connected (${count} online)`);
    });

    socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        updateConnectionStatus("Connection Error", "red");
    });
    
    // In initializeSocket() function, add this handler
    socket.on("existing-routes", (data) => {
        console.log("Received existing routes:", data);
        if (data.routes && Array.isArray(data.routes)) {

            // Clear previous routes layer
            if (routesLayer) {
                routesLayer.clearLayers();
            }
            
            // Add all existing routes to the map
            data.routes.forEach(route => {
                if (route.socketId && route.userID) {
                    existing-routes.set(route.socketId, route);
                }
                updateMapWithRoute(route);
            });
        }
    });

    socket.on("user-disconnected", (data) => {
        console.log("User disconnected:", data);
        removeRouteFromMap(data.socketId);
    });
}

function removeRouteFromMap(socketId) {
    if (existing-routes.has(socketId)) {
        const userData = existing-routes.get(socketId);
        existing-routes.delete(socketId);
        rebuildRoutesLayer();
        
        console.log(`🗑️ Removed route for user: ${userData.userID}`);
    }
}

function rebuildRoutesLayer() {
    if (routesLayer) {
        routesLayer.clearLayers();
        existing-routes.forEach(route => {
            updateMapWithRoute(route);
        });
        if (sourceMarker && destinationMarker) {
            control.setWaypoints([sourceMarker.getLatLng(), destinationMarker.getLatLng()]);
        }
    }
}

// Update connection status indicator
function updateConnectionStatus(message, color = "green") {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.backgroundColor = color === "red" ? "rgba(255,0,0,0.6)" : "rgba(0,128,0,0.6)";
    }
}

// Initialize map
function initMap(lat, lon, accuracy) {
    map = L.map('map', {zoomControl: false}).setView([lat, lon], 13);
    routesLayer = L.layerGroup().addTo(map);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add routing control
    control = L.Routing.control({
        waypoints: [],
        routeWhileDragging: true
    }).addTo(map);

    // Add current location marker
    liveLocationMarker = L.circleMarker([lat, lon], {
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 1,
        radius: 8
    }).addTo(map).bindPopup('You are here!');

    // Add accuracy circle
    accuracyCircle = L.circle([lat, lon], {
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 0.3,
        radius: accuracy
    }).addTo(map);

    userCoords = [lat, lon];
    mapInitialized = true;

    // Setup map click event
    map.on('click', function (e) {
        if (isSettingSource) {
            if (sourceMarker) {
                sourceMarker.setLatLng(e.latlng).update();
            } else {
                sourceMarker = L.marker(e.latlng).addTo(map).bindPopup('Source').openPopup();
            }
            isSettingSource = false;
            updateRouteWithMarkers();
        } else if (isSettingDestination) {
            if (destinationMarker) {
                destinationMarker.setLatLng(e.latlng).update();
            } else {
                destinationMarker = L.marker(e.latlng).addTo(map).bindPopup('Destination').openPopup();
            }
            isSettingDestination = false;
            updateRouteWithMarkers();
        }
    });
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
    document.getElementById('livloc').addEventListener('click', function() {
        map.setView(userCoords, 16);
    });

    const fromCurrentBtn = document.getElementById('from-current-btn');
    if (fromCurrentBtn) {
        fromCurrentBtn.addEventListener('click', function() {
            if (userCoords) {
                if (sourceMarker) {
                    sourceMarker.setLatLng(userCoords);
                } else {
                    sourceMarker = L.marker(userCoords).addTo(map).bindPopup('Source');
                }
                map.setView(userCoords, 13);
                updateRouteWithMarkers();
            } else {
                alert("Unable to retrieve your current location.");
            }
        });
    }

    // Toggle routing instructions
    document.getElementById('toggle-routing').addEventListener('click', toggleRouting);

    // Set up the suggestions for location inputs
    setupSearchSuggestions();
}

// Update the route based on existing markers
function updateRouteWithMarkers() {
    if (sourceMarker && destinationMarker) {
        control.setWaypoints([sourceMarker.getLatLng(), destinationMarker.getLatLng()]);
        broadcastRoute(sourceMarker.getLatLng(), destinationMarker.getLatLng());
    }
}

// Fetch coordinates for a location name
function getCoordinates(locationName) {
    return fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            } else {
                throw new Error('Location not found');
            }
        });
}

// Send route data to Socket.io
// Modify the broadcastRoute function
function broadcastRoute(sourceLatLng, destinationLatLng) {
    const userID = localStorage.getItem('userID') || generateUserID();
    const timestamp = new Date().toISOString();
    const path = control.getWaypoints().map(wp => [wp.latLng.lat, wp.latLng.lng]);
    
    const routeData = {
        userID: userID,
        timestamp: timestamp,
        source: [sourceLatLng.lat, sourceLatLng.lng],
        destination: [destinationLatLng.lat, destinationLatLng.lng],
        path: path,
        isNewRoute: true // Mark as a new route for proper map handling
    };

    console.log("🚀 Broadcasting route:", routeData);
    
    // Also update our own map with this route
    updateMapWithRoute(routeData);
    
    // Send to socket.io server
    socket.emit("message", routeData);
}

// Generate a random user ID if not already stored
function generateUserID() {
    const userID = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userID', userID);
    return userID;
}

function updateMapWithRoute(routeData) {
    if (!routeData || !routeData.source || !routeData.destination) {
        console.error("❌ Invalid route data received");
        return;
    }

    console.log("🔄 Updating map with route:", routeData);
    
    // Create latLng objects
    const sourceLatLng = Array.isArray(routeData.source) ? 
        L.latLng(routeData.source[0], routeData.source[1]) : 
        L.latLng(routeData.source.lat, routeData.source.lng);
    
    const destinationLatLng = Array.isArray(routeData.destination) ? 
        L.latLng(routeData.destination[0], routeData.destination[1]) : 
        L.latLng(routeData.destination.lat, routeData.destination.lng);

    // Choose color for the route - use userID to keep colors consistent
    const userId = routeData.userID || 'unknown';
    const colorIndex = Math.abs(hashCode(userId)) % colors.length;
    let routeColor = colors[colorIndex];

    // Add markers for the shared route
    L.marker(sourceLatLng, {
        icon: L.divIcon({
            className: 'custom-marker shared-source',
            html: `<div style="background-color:${routeColor}"></div>`,
            iconSize: [20, 20]
        })
    }).addTo(routesLayer).bindPopup(`Source: ${userId.substring(0, 8)}`);

    L.marker(destinationLatLng, {
        icon: L.divIcon({
            className: 'custom-marker shared-destination',
            html: `<div style="background-color:${routeColor}"></div>`,
            iconSize: [20, 20]
        })
    }).addTo(routesLayer).bindPopup(`Destination: ${userId.substring(0, 8)}`);

    // Calculate and display the actual route 
    L.Routing.control({
        waypoints: [sourceLatLng, destinationLatLng],
        routeWhileDragging: false,
        createMarker: () => null, // Don't create additional markers
        lineOptions: {
            styles: [{color: routeColor, opacity: 0.6, weight: 4}]
        },
        fitSelectedRoutes: false,
        showAlternatives: false,
        addWaypoints: false
    }).addTo(routesLayer);

    // Only adjust map bounds if this is a newly added route
    if (routeData.isNewRoute) {
        const bounds = routesLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

// Add a simple hash function to consistently generate colors based on userID
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

// Update route based on user input
function updateRoute() {
    var sourceName = document.getElementById('source').value;
    var destinationName = document.getElementById('destination').value;

    if (!sourceName.trim() || !destinationName.trim()) {
        showerror('* Source and Destination cannot be empty');
        return;
    }

    Promise.all([getCoordinates(sourceName), getCoordinates(destinationName)])
        .then(([sourceCoords, destinationCoords]) => {
            var sourceLatLng = L.latLng(sourceCoords[0], sourceCoords[1]);
            var destinationLatLng = L.latLng(destinationCoords[0], destinationCoords[1]);

            if (!sourceMarker) {
                sourceMarker = L.marker(sourceLatLng).addTo(map).bindPopup('Source').openPopup();
            } else {
                sourceMarker.setLatLng(sourceLatLng).update();
            }

            if (!destinationMarker) {
                destinationMarker = L.marker(destinationLatLng).addTo(map).bindPopup('Destination').openPopup();
            } else {
                destinationMarker.setLatLng(destinationLatLng).update();
            }

            updateMapWithRoute(sourceLatLng, destinationLatLng);

            // Broadcast the route so other users get the update
            broadcastRoute(sourceLatLng, destinationLatLng);
        })
        .catch(error => {
            console.error("Error updating route:", error);
            showerror('* Failed to fetch coordinates');
        });
}

// Toggle routing instructions visibility
function toggleRouting() {
    const routingContainers = document.querySelectorAll('.leaflet-routing-container');
    const toggleButton = document.getElementById('toggle-routing');

    routingContainers.forEach(container => {
        if (container.style.display === 'none') {
            container.style.display = 'block';
            toggleButton.innerText = 'Collapse';
        } else {
            container.style.display = 'none';
            toggleButton.innerText = 'Show Navigation';
        }
    });
}

// Display error message
function showError(message) {
    const sourceInput = document.getElementById('source');
    const destinationInput = document.getElementById('destination');

    sourceInput.style.border = '3px solid red';
    destinationInput.style.border = '3px solid red';
    
    let sourceErrorLabel = document.getElementById('source-error');
    let destinationErrorLabel = document.getElementById('destination-error');

    if (!sourceErrorLabel) {
        sourceErrorLabel = document.createElement('div');
        sourceErrorLabel.id = 'source-error';
        sourceErrorLabel.style.color = 'red';
        sourceErrorLabel.style.fontSize = '12px';
        sourceErrorLabel.textContent = message;
        sourceInput.parentNode.insertBefore(sourceErrorLabel, sourceInput);
    }

    if (!destinationErrorLabel) {
        destinationErrorLabel = document.createElement('div');
        destinationErrorLabel.id = 'destination-error';
        destinationErrorLabel.style.color = 'red';
        destinationErrorLabel.style.fontSize = '12px';
        destinationErrorLabel.textContent = message;
        destinationInput.parentNode.insertBefore(destinationErrorLabel, destinationInput);
    }
}

// Remove error messages
function removeError() {
    const sourceInput = document.getElementById('source');
    const destinationInput = document.getElementById('destination');

    sourceInput.style.border = '';
    destinationInput.style.border = '';

    const sourceErrorLabel = document.getElementById('source-error');
    const destinationErrorLabel = document.getElementById('destination-error');
    if (sourceErrorLabel) sourceErrorLabel.remove();
    if (destinationErrorLabel) destinationErrorLabel.remove();
}

// Setup search suggestions system
function setupSearchSuggestions() {
    document.getElementById('source').addEventListener('input', () => {
        handleInput('source', 'source-suggestions', 'source');
    });

    document.getElementById('destination').addEventListener('input', () => {
        handleInput('destination', 'destination-suggestions', 'destination');
    });

    document.getElementById('source').addEventListener('focus', () => {
        if (document.getElementById('source').value.trim() === '') {
            showRecentSearches('source', 'source-suggestions', 'source');
        }
    });

    document.getElementById('destination').addEventListener('focus', () => {
        if (document.getElementById('destination').value.trim() === '') {
            showRecentSearches('destination', 'destination-suggestions', 'destination');
        }
    });

    // Error removal on input
    document.getElementById('source').addEventListener('input', removeError);
    document.getElementById('destination').addEventListener('input', removeError);

    // Hide suggestions when clicking outside
    document.addEventListener("click", (event) => {
        const searchInput1 = document.getElementById("source");
        const searchInput2 = document.getElementById("destination");
        const suggestions1 = document.getElementById("source-suggestions");
        const suggestions2 = document.getElementById("destination-suggestions");

        if (suggestions1 && !searchInput1.contains(event.target) && !suggestions1.contains(event.target)) {
            suggestions1.style.display = "none";
        }
        if (suggestions2 && !searchInput2.contains(event.target) && !suggestions2.contains(event.target)) {
            suggestions2.style.display = "none";
        }
    });
}

// Fetch location suggestions
function fetchSuggestions(query, callback) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => callback(data))
        .catch(error => console.error("Error fetching suggestions:", error));
}

// Get recent searches from local storage
function getRecentSearches() {
    const recentSearches = localStorage.getItem('recentSearches');
    return recentSearches ? JSON.parse(recentSearches) : { source: [], destination: [] };
}

// Save search to recent searches
function saveSearch(type, query) {
    const recentSearches = getRecentSearches();

    // Limit to the 5 most recent searches
    if (!recentSearches[type].includes(query)) {
        recentSearches[type].unshift(query);
        recentSearches[type] = recentSearches[type].slice(0, 5);
    }

    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
}

// Show suggestions in the UI
function showSuggestions(elementId, suggestions) {
    const suggestionsContainer = document.getElementById(elementId);
    if (!suggestionsContainer) return;
    
    suggestionsContainer.innerHTML = '';

    suggestions.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.classList.add('suggestion-item');

        const icon = document.createElement('img');
        icon.src = 'https://img.icons8.com/ios-filled/50/000000/marker.png';
        icon.classList.add('suggestion-icon');

        const text = document.createElement('div');
        text.classList.add('suggestion-text');

        // For API suggestions, limit to the first 3 elements in display_name
        const shortName = typeof suggestion === 'string' 
            ? suggestion 
            : suggestion.display_name.split(', ').slice(0, 3).join(', ');
        text.innerText = shortName;

        suggestionItem.appendChild(icon);
        suggestionItem.appendChild(text);

        suggestionItem.addEventListener('click', () => {
            document.getElementById(elementId.replace('-suggestions', '')).value = shortName;
            saveSearch(elementId.replace('-suggestions', ''), shortName);
            suggestionsContainer.style.display = "none";
        });

        suggestionsContainer.appendChild(suggestionItem);
    });

    suggestionsContainer.style.display = suggestions.length > 0 ? "block" : "none";
}

// Handle input for suggestions
function handleInput(inputId, suggestionsId, type) {
    const query = document.getElementById(inputId).value;

    if (query.length > 0) {
        fetchSuggestions(query, suggestions => showSuggestions(suggestionsId, suggestions));
    } else {
        document.getElementById(suggestionsId).style.display = "none";
    }
}

// Show recent searches
function showRecentSearches(inputId, suggestionsId, type) {
    const recentSearches = getRecentSearches()[type];
    showSuggestions(suggestionsId, recentSearches);
}

// Update user location periodically
setInterval(function () {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var lat = position.coords.latitude;
            var lon = position.coords.longitude;
            userCoords = [lat, lon];

            if (liveLocationMarker && accuracyCircle) {
                liveLocationMarker.setLatLng([lat, lon]);
                accuracyCircle.setLatLng([lat, lon]);
                accuracyCircle.setRadius(position.coords.accuracy);
            } else if (!mapInitialized) {
                initMap(lat, lon, position.coords.accuracy);
            }
        }, function (error) {
            console.error("Geolocation error:", error.message);
        });
    }
}, 5000);
