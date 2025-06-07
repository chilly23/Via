function initMap(lat, lon, accuracy) {
            map = L.map('map', {zoomControl: false}).setView([lat, lon], 13);

            L.control.zoom({
                position: 'bottomright'}).addTo(map);

            // https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
            //https://tile.thunderforest.com/mobile-atlas/{z}/{x}/{y}.png?apikey=9f8d2dfc4aa8483f87fa26dada8818bf

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            // var glowingMarker = L.divIcon({
            // className: 'glow-dot'});

            // L.marker([12.9716, 77.5946], { icon: glowingMarker }).addTo(map);

            // control = L.Routing.control({
            //     waypoints: [],
            //     routeWhileDragging: true
            //     // lineOptions: {
            //     //     styles: [
            //     //         {color: 'blue', opacity: 1, weight: 5}]}
            //         }).addTo(map);

            liveLocationMarker = L.circleMarker([lat, lon], {
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 1,
                radius: 8
            }).addTo(map).bindPopup('You are here!');

            accuracyCircle = L.circle([lat, lon], {
                color: '#007bff',
                fillColor: '#007bff',
                fillOpacity: 0.3,
                radius: accuracy
            }).addTo(map);

            userCoords = [lat, lon]; // Store the user's coordinates
        }