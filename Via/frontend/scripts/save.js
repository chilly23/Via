function saveRoute(sourceCoords, destinationCoords, path) {
    var userID = prompt("Enter your UserID:");
    var dateTime = new Date().toISOString();
    fetch('/save-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userID: userID,
            timestamp: dateTime,
            source: sourceCoords,
            destination: destinationCoords,
            path: path
        })
    })
    .then(response => response.json())
    .then(data => {
        alert('Route saved successfully:', data);
    })
    .catch(error => {
        console.error('Error saving route:', error);
    });
}