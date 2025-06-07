
// Handle map clicks for setting source and destination
map.on('click', function (e) {
    if (isSettingSource) {
        if (sourceMarker) {
            sourceMarker.setLatLng(e.latlng).update();
        } else {
            sourceMarker = L.marker(e.latlng).addTo(map).bindPopup('Source').openPopup();
        }
        isSettingSource = false; // Reset the flag
    } else if (isSettingDestination) {
        if (destinationMarker) {
            destinationMarker.setLatLng(e.latlng).update();
        } else {
            destinationMarker = L.marker(e.latlng).addTo(map).bindPopup('Destination').openPopup();
        }
        isSettingDestination = false; // Reset the flag
    }
});