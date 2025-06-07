// Ensure the script waits until DOM is fully loaded
document.addEventListener("DOMContentLoaded", function() {
    if (typeof io === "undefined") {
        console.error("❌ Socket.IO not loaded! Make sure the script is included in HTML.");
        return;
    }

    const socket = io("http://localhost:3000"); 

    socket.on("connect", () => {
        console.log("✅ Connected to WebSocket Server");
    });

    socket.on("route-update", (routeData) => {
        console.log("📥 Received route update:", routeData);
        updateMapWithRoute(routeData.source, routeData.destination);
    });
});


routesLayer = L.layerGroup().addTo(map);
let colors = ["blue", "red", "green", "purple", "orange", "brown", "pink"];
let colorIndex = 0;

function broadcastRoute(sourceCoords, destinationCoords) {
    const routeData = {
        source: { lat: sourceCoords.lat, lng: sourceCoords.lng },
        destination: { lat: destinationCoords.lat, lng: destinationCoords.lng }
    };
    console.log("Sending route update:", routeData);
    socket.emit("new-route", routeData);
}


function updateMapWithRoute(sourceCoords, destinationCoords) {
    console.log("Adding new route:", sourceCoords, destinationCoords);

    var sourceLatLng = L.latLng(sourceCoords.lat, sourceCoords.lng);
    var destinationLatLng = L.latLng(destinationCoords.lat, destinationCoords.lng);

    let routeColor = colors[colorIndex % colors.length]; // Rotate colors
    colorIndex++;

    let newRoute = L.polyline([sourceLatLng, destinationLatLng], {
        color: routeColor,
        weight: 5,
        opacity: 0.8
    }).addTo(routesLayer);

    // Remove previous control if exists
    if (control) {
        map.removeControl(control);
    }

    // Create a new routing control
    control = L.Routing.control({
        waypoints: [sourceLatLng, destinationLatLng],
        routeWhileDragging: true,
        createMarker: () => null // Hide default markers
    }).addTo(map);

    routesLayer.addLayer(newRoute);
}

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
