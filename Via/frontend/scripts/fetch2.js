function getCoordinates(locationName) {
            return fetch(`https://nominatim.openstreetmap.org/search?q=${locationName}&format=json`)
                .then(response => response.json())
                .then(data => {
                    if (data.length > 0) {
                        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                    } else {
                        throw new Error('Location not found');
                    }
                });
        }