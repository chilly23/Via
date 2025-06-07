let mapInitialized = false;

setInterval(function () {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var lat = position.coords.latitude;
            var lon = position.coords.longitude;

            if (liveLocationMarker) {
                liveLocationMarker.setLatLng([lat, lon]);
                accuracyCircle.setLatLng([lat, lon]);
            } else if (!mapInitialized) {
                initMap(lat, lon, position.coords.accuracy);
                mapInitialized = true;
            }
        }, function (error) {
            console.error("Geolocation error:", error.message);
        });
    }
}, 5000);
