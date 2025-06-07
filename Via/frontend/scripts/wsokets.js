const io = socketIo(server, {
    cors: {
        origin: "*",  // Allow all origins (change as needed)
        methods: ["GET", "POST"]
    }
});

const socket = io(window.location.origin); // Automatically adapt to the current domain


// Send route data to WebSocket
function broadcastRoute(sourceCoords, destinationCoords) {
    const routeData = {
        source: { lat: sourceCoords[0], lng: sourceCoords[1] },
        destination: { lat: destinationCoords[0], lng: destinationCoords[1] }
    };
    socket.emit("new-route", routeData);
}

socket.on("route-update", (routeData) => {
    console.log("📥 Received route update:", routeData);
    updateMapWithRoute(routeData.source, routeData.destination);
});


// Update map when a new route is received
function updateMapWithRoute(sourceCoords, destinationCoords) {
    console.log("🔄 Updating map with route:", sourceCoords, destinationCoords);
    
    var sourceLatLng = L.latLng(sourceCoords.lat, sourceCoords.lng);
    var destinationLatLng = L.latLng(destinationCoords.lat, destinationCoords.lng);

    if (!sourceMarker) sourceMarker = L.marker(sourceLatLng).addTo(map).bindPopup('Source').openPopup();
    else sourceMarker.setLatLng(sourceLatLng).update();

    if (!destinationMarker) destinationMarker = L.marker(destinationLatLng).addTo(map).bindPopup('Destination').openPopup();
    else destinationMarker.setLatLng(destinationLatLng).update();

    // Ensure control exists before setting waypoints
    if (control) {
        control.setWaypoints([sourceLatLng, destinationLatLng]);
    } else {
        console.error("❌ Routing control not initialized");
    }
}


// Modify updateRoute function to send updates
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

            if (sourceMarker) sourceMarker.setLatLng(sourceLatLng).update();
            else sourceMarker = L.marker(sourceLatLng).addTo(map).bindPopup('Source').openPopup();

            if (destinationMarker) destinationMarker.setLatLng(destinationLatLng).update();
            else destinationMarker = L.marker(destinationLatLng).addTo(map).bindPopup('Destination').openPopup();

            control.setWaypoints([sourceLatLng, destinationLatLng]);

            // Broadcast the route to all connected tabs
            broadcastRoute(sourceLatLng, destinationLatLng);
        })
        .catch(error => {
            console.error("Error updating route:", error);
            showerror('* Failed to fetch coordinates');
        });
}
