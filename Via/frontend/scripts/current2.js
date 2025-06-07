document.getElementById('from-current-btn').addEventListener('click', function () {
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