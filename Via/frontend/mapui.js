let sourceMarker, destinationMarker, isSettingSource = false, isSettingDestination = false;
let map;
let liveLocationMarker, accuracyCircle, control, userCoords;
let routesLayer, socket;
let mapInitialized = false;
let existingRoutes = new Map(); // Fixed: proper Map declaration
let sharedRouteControls = new Map(); // maps socketId or userID to routing control
let lastroute = null;


// Initialize map
function initMap(lat, lon, accuracy) {
    map = L.map('map', {zoomControl: false}).setView([lat, lon], 13);
    routesLayer = L.layerGroup().addTo(map);
    routesLayer1 = L.layerGroup().addTo(map);


    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);


    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add routing control
    control = L.Routing.control({
        waypoints: [],
        routeWhileDragging: true,
        createMarker: () => null
    }).addTo(map);

    const routingcontainer = control.getContainer();
    routingcontainer.id = "main-routing-panel"; // Give it a clear ID for targeting


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
        radius: Math.min(accuracy, 1000)
    }).addTo(map);

    userCoords = [lat, lon];
    mapInitialized = true;

    // Setup map click event
    map.on('click', function (e) {
        if (isSettingSource) {
            if (sourceMarker) {
                sourceMarker.setLatLng(e.latlng).update();
            } else {
                sourceMarker = L.marker(e.latlng, {
                    icon: L.divIcon({
                        className: 'custom-source-pin',
                        iconSize: [16, 16]
                    })
                }).addTo(map).bindPopup('Source');
            }
            isSettingSource = false;
            updateRouteWithMarkers();
        } else if (isSettingDestination) {
            if (destinationMarker) {
                destinationMarker.setLatLng(e.latlng).update();
            } else {
                destinationMarker = L.marker(e.latlng, {
                    icon: L.divIcon({
                        className: 'custom-destination-pin',
                        iconSize: [16, 16]
                    })
                }).addTo(map).bindPopup('Destination');
            }
            isSettingDestination = false;
            updateRouteWithMarkers();
        }
    });
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

function setCurrentLocationAsSource() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async function (position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            if (userCoords) {
                map.setView(userCoords, 16);
            }
            
            // sourceMarker.setLatLng(userCoords);
            document.getElementById('source').value = userCoords
                    
            if (sourceMarker) {
                sourceMarker.setLatLng(userCoords).update();
            } else {
                sourceMarker = L.marker(userCoords, {
                    icon: L.divIcon({
                        className: 'custom-source-pin',
                        iconSize: [16, 16]
                    })
                }).addTo(map).bindPopup('Source');
            }
                    
            map.setView(userCoords, 13);
            updateRouteWithMarkers();

            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const data = await res.json();
                const locationName = data.display_name || "Unknown Location";

                // Set the location name in the input field
                document.getElementById('source').value = locationName;

            } catch (error) {
                console.error("Reverse geocoding failed:", error);
                document.getElementById('source').value = "Location fetch failed";
            }
        }, function (error) {
            console.error("Geolocation error:", error);
            document.getElementById('source').value = "Unable to access location";
        });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}



locbutt1 = document.getElementById('livloc');
locbutt2 = document.getElementById('livloc2');
locbutt1.addEventListener('click', () => {
    map.setView(userCoords, 16);
});

locbutt2.addEventListener('click', () => {
    map.setView(userCoords, 16);
});


// Update route based on user input
function updateRoute() {
    var sourceName = document.getElementById('source').value;
    var destinationName = document.getElementById('destination').value;

    if (lastroute) {map.removeControl(lastroute);}
    if (routesLayer){routesLayer.clearLayers();}
    if (routesLayer1){routesLayer1.clearLayers();}


    // map.eachLayer(function (layer) {
    //     if (!(layer instanceof L.TileLayer)) {
    //         map.removeLayer(layer);
    //     }
    // });

    sharedRouteControls.forEach((control, key) => {
        map.removeControl(control);
    });
    sharedRouteControls.clear();

    

    if (!sourceName.trim()) {
        showError('* Source cannot be empty', 'source');
        return;
    }
    if (!destinationName.trim()) {
        showError('* Destination cannot be empty', 'destination');
        return;
    }


    Promise.all([getCoordinates(sourceName), getCoordinates(destinationName)])
        .then(([sourceCoords, destinationCoords]) => {
            var sourceLatLng = L.latLng(sourceCoords[0], sourceCoords[1]);
            var destinationLatLng = L.latLng(destinationCoords[0], destinationCoords[1]);

            if (!sourceMarker) {
                sourceMarker = L.marker(sourceLatLng, {
                    icon: L.divIcon({
                        className: 'custom-source-pin',
                        iconSize: [16, 16]
                    })
                }).addTo(map).bindPopup('Source');
            } else {
                sourceMarker.setLatLng(sourceLatLng).update();
            }

            if (!destinationMarker) {
                destinationMarker = L.marker(destinationLatLng, {
                    icon: L.divIcon({
                        className: 'custom-destination-pin',
                        iconSize: [16, 16]
                    })
                }).addTo(map).bindPopup('Destination');
            } else {
                destinationMarker.setLatLng(destinationLatLng).update();
            }

            // Update route control
            control.setWaypoints([sourceLatLng, destinationLatLng]);

            // Broadcast the route so other users get the update
            broadcastRoute(sourceLatLng, destinationLatLng);
        })
        .catch(error => {
            console.error("Error updating route:", error);
            showError('* Failed to fetch coordinates');
        });
}



const toggleBtn = document.getElementById('toggle-routing');
document.getElementById("toggle-routing").addEventListener("click", () => {
    const panel = document.getElementById("main-routing-panel");
    if (panel.style.display === "none") {
      panel.style.display = "block";
      toggleBtn.innerText = 'Collapse';
    } else {
      panel.style.display = "none";
      toggleBtn.innerText = 'Show Navigation';
    }
  });      

// Display error message
function showError(message, label) {
const sourceInput = document.getElementById('source');
const destinationInput = document.getElementById('destination');

let sourceErrorLabel = document.getElementById('source-error');
let destinationErrorLabel = document.getElementById('destination-error');

if (!sourceErrorLabel && sourceInput && label == "source") {
    sourceInput.style.border = '3px solid red';
    
    // Get the position of the source input
    const rect = sourceInput.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    sourceErrorLabel = document.createElement('div');
    sourceErrorLabel.id = 'source-error';
    sourceErrorLabel.style.cssText = `
        position: absolute;
        top: ${rect.top + scrollTop - 25}px;
        left: ${rect.left + scrollLeft}px;
        color: red;
        font-size: 12px;
        background-color: white;
        padding: 2px 5px;
        border: 1px solid red;
        border-radius: 3px;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        white-space: nowrap;
    `;
    sourceErrorLabel.textContent = message;
    document.body.appendChild(sourceErrorLabel);
}

if (!destinationErrorLabel && destinationInput && label == "destination") {
    destinationInput.style.border = '3px solid red';
    
    // Get the position of the destination input
    const rect = destinationInput.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    destinationErrorLabel = document.createElement('div');
    destinationErrorLabel.id = 'destination-error';
    destinationErrorLabel.style.cssText = `
        position: absolute;
        top: ${rect.top + scrollTop - 25}px;
        left: ${rect.left + scrollLeft}px;
        color: red;
        font-size: 12px;
        background-color: white;
        padding: 2px 5px;
        border: 1px solid red;
        border-radius: 3px;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        white-space: nowrap;
    `;
    destinationErrorLabel.textContent = message;
    document.body.appendChild(destinationErrorLabel);
}
}

// Enhanced version that handles window resize and scroll events
function showErrorAdvanced(message, label) {
const sourceInput = document.getElementById('source');
const destinationInput = document.getElementById('destination');

let sourceErrorLabel = document.getElementById('source-error');
let destinationErrorLabel = document.getElementById('destination-error');

function positionErrorLabel(inputElement, errorLabel) {
    const rect = inputElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    errorLabel.style.top = `${rect.top + scrollTop - 25}px`;
    errorLabel.style.left = `${rect.left + scrollLeft}px`;
    errorLabel.style.width = `${rect.width}px`; // Match input width
}

if (!sourceErrorLabel && sourceInput && label == "source") {
    sourceInput.style.border = '3px solid red';
    
    sourceErrorLabel = document.createElement('div');
    sourceErrorLabel.id = 'source-error';
    sourceErrorLabel.className = 'floating-error';
    sourceErrorLabel.style.cssText = `
        position: absolute;
        color: red;
        font-size: 12px;
        background-color: rgba(255, 255, 255, 0.95);
        padding: 3px 8px;
        border: 1px solid red;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 2px 6px rgba(255, 0, 0, 0.3);
        font-weight: 500;
        text-align: center;
        backdrop-filter: blur(2px);
    `;
    sourceErrorLabel.textContent = message;
    document.body.appendChild(sourceErrorLabel);
    
    // Position the error label
    positionErrorLabel(sourceInput, sourceErrorLabel);
    
    // Update position on scroll/resize
    const updateSourcePosition = () => positionErrorLabel(sourceInput, sourceErrorLabel);
    window.addEventListener('scroll', updateSourcePosition);
    window.addEventListener('resize', updateSourcePosition);
    
    // Store cleanup function
    sourceErrorLabel._cleanup = () => {
        window.removeEventListener('scroll', updateSourcePosition);
        window.removeEventListener('resize', updateSourcePosition);
    };
}

if (!destinationErrorLabel && destinationInput && label == "destination") {
    destinationInput.style.border = '3px solid red';
    
    destinationErrorLabel = document.createElement('div');
    destinationErrorLabel.id = 'destination-error';
    destinationErrorLabel.className = 'floating-error';
    destinationErrorLabel.style.cssText = `
        position: absolute;
        color: red;
        font-size: 12px;
        background-color: rgba(255, 255, 255, 0.95);
        padding: 3px 8px;
        border: 1px solid red;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 2px 6px rgba(255, 0, 0, 0.3);
        font-weight: 500;
        text-align: center;
        backdrop-filter: blur(2px);
    `;
    destinationErrorLabel.textContent = message;
    document.body.appendChild(destinationErrorLabel);
    
    // Position the error label
    positionErrorLabel(destinationInput, destinationErrorLabel);
    
    // Update position on scroll/resize
    const updateDestPosition = () => positionErrorLabel(destinationInput, destinationErrorLabel);
    window.addEventListener('scroll', updateDestPosition);
    window.addEventListener('resize', updateDestPosition);
    
    // Store cleanup function
    destinationErrorLabel._cleanup = () => {
        window.removeEventListener('scroll', updateDestPosition);
        window.removeEventListener('resize', updateDestPosition);
    };
}
}

// Updated removeError function to handle positioned elements
function removeError() {
const sourceInput = document.getElementById('source');
const destinationInput = document.getElementById('destination');

if (sourceInput) sourceInput.style.border = '';
if (destinationInput) destinationInput.style.border = '';

const sourceErrorLabel = document.getElementById('source-error');
const destinationErrorLabel = document.getElementById('destination-error');

if (sourceErrorLabel) sourceErrorLabel.remove();
if (destinationErrorLabel) destinationErrorLabel.remove();
}


// Setup search suggestions system
function setupSearchSuggestions() {
const sourceInput = document.getElementById('source');
const destinationInput = document.getElementById('destination');

if (sourceInput) {
    sourceInput.addEventListener('input', () => {
        handleInput('source', 'source-suggestions', 'source');
    });

    sourceInput.addEventListener('focus', () => {
        if (sourceInput.value.trim() === '') {
            showRecentSearches('source', 'source-suggestions', 'source');
        }
    });

    // Error removal on input
    sourceInput.addEventListener('input', removeError);
}

if (destinationInput) {
    destinationInput.addEventListener('input', () => {
        handleInput('destination', 'destination-suggestions', 'destination');
    });

    destinationInput.addEventListener('focus', () => {
        if (destinationInput.value.trim() === '') {
            showRecentSearches('destination', 'destination-suggestions', 'destination');
        }
    });

    // Error removal on input
    destinationInput.addEventListener('input', removeError);
}

// Hide suggestions when clicking outside
document.addEventListener("click", (event) => {
    const suggestions1 = document.getElementById("source-suggestions");
    const suggestions2 = document.getElementById("destination-suggestions");

    if (suggestions1 && sourceInput && !sourceInput.contains(event.target) && !suggestions1.contains(event.target)) {
        suggestions1.style.display = "none";
    }
    if (suggestions2 && destinationInput && !destinationInput.contains(event.target) && !suggestions2.contains(event.target)) {
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
const inputElement = document.getElementById(inputId);
if (!inputElement) return;

const query = inputElement.value;

if (query.length > 0) {
    fetchSuggestions(query, suggestions => showSuggestions(suggestionsId, suggestions));
} else {
    const suggestionsElement = document.getElementById(suggestionsId);
    if (suggestionsElement) {
        suggestionsElement.style.display = "none";
    }
}
}

// Show recent searches
function showRecentSearches(inputId, suggestionsId, type) {
const recentSearches = getRecentSearches()[type];
showSuggestions(suggestionsId, recentSearches);
}