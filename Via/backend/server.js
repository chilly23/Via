const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io'); // Change to Socket.io

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = socketIo(server); // Initialize Socket.io

app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cors());

const filePath = path.join(__dirname, 'routes.json');
let connectedClients = 0; // Track number of connected clients

// Ensure routes file exists
if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([]));
}

// 🟢 Socket.io Connection
io.on("connection", (socket) => {
    console.log("✅ New Socket.io client connected");
    connectedClients++;
    
    // Emit current client count to all clients
    io.emit("clientCount", connectedClients);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (!err) {
            try {
                const routesArray = JSON.parse(data) || [];
                // Send all existing routes to the new client
                socket.emit("existing-routes", { routes: routesArray });
            } catch (parseError) {
                console.error('❌ Error parsing routes JSON:', parseError);
            }
        }
    });

    socket.on("message", (messageData) => {
        let routeData;
        try {
            // Check if data is already parsed
            routeData = typeof messageData === 'object' ? messageData : JSON.parse(messageData);
        } catch (error) {
            console.error("❌ Error parsing Socket message:", error);
            return;
        }

        console.log("📢 Broadcasting new route:", routeData);
        
        // Broadcast to all clients except the sender
        socket.broadcast.emit("route-update", { data: routeData });

        // Save the route
        saveRoute(routeData);
    });

    socket.on("disconnect", () => {
        console.log("❌ Client disconnected");
        connectedClients--;
        io.emit("clientCount", connectedClients);
    });
});

// 📝 Save route data to file
function saveRoute(routeData) {
    const { userID, timestamp, source, destination, path } = routeData;
    if (!userID || !source || !destination || !path) {
        console.error('❌ Invalid route data:', routeData);
        return;
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        let routesArray = [];
        if (!err) {
            try {
                routesArray = JSON.parse(data) || [];
            } catch (parseError) {
                console.error('❌ Error parsing routes JSON:', parseError);
            }
        }

        routesArray.push(routeData);
        console.log("✅ Saving route to file");

        fs.writeFile(filePath, JSON.stringify(routesArray, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('❌ Error saving route:', writeErr);
                return;
            }
            console.log('🟢 Route saved successfully:', routeData);
        });
    });
}

// 🔍 Find matching routes
app.post('/find-matching-routes', (req, res) => {
    const { userID, path } = req.body;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('❌ Error reading routes file:', err);
            return res.status(500).json({ message: 'Failed to read routes' });
        }

        let routesArray;
        try {
            routesArray = JSON.parse(data);
        } catch (parseError) {
            console.error('❌ Error parsing JSON:', parseError);
            return res.status(500).json({ message: 'Failed to parse routes data' });
        }

        const matchingRoutes = routesArray.filter(route => 
            JSON.stringify(route.path) === JSON.stringify(path) && route.userID !== userID
        );

        res.status(200).json({
            message: matchingRoutes.length > 0 ? '✅ Matching routes found' : '⚠ No matching routes found',
            data: matchingRoutes
        });
    });
});

// Get all saved routes
app.get('/routes', (req, res) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('❌ Error reading routes file:', err);
            return res.status(500).json({ message: 'Failed to read routes' });
        }

        let routesArray;
        try {
            routesArray = JSON.parse(data);
        } catch (parseError) {
            console.error('❌ Error parsing JSON:', parseError);
            return res.status(500).json({ message: 'Failed to parse routes data' });
        }

        res.status(200).json({
            message: '✅ Routes retrieved successfully',
            data: routesArray
        });
    });
});

// 🏠 Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'consolidated-html.html'));
});

// 🚀 Start the server
server.listen(PORT, () => {
    console.log(`🌍 Server running on http://localhost:${PORT}`);
});
