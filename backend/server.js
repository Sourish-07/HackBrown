const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

const gameLogic = require('./game_logic');
const { formatBroadcastData } = require('./utils');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- REST API Endpoints ---

// Endpoint for Raspberry Pi to send analysis data
app.post('/api/pi-data', (req, res) => {
    const data = req.body; 
    // Expecting: { lie_probability: number, metrics: { presage, gemini } }
    
    if (typeof data.lie_probability === 'undefined') {
        return res.status(400).json({ error: 'Missing lie_probability' });
    }

    // Update Game Logic
    gameLogic.updateAiData(data);

    // Log for demo purposes
    if(data.metrics && data.metrics.gemini) {
        console.log(`[Gemini] Analysis: ${data.metrics.gemini.reasoning}`);
    }
    console.log(`[System] Risk Score Updated: ${gameLogic.currentRiskScore}`);

    // Broadcast to all connected WebSocket clients (Frontend)
    broadcastState();

    res.json({ status: 'received' });
});

// Endpoint to reset game
app.post('/api/reset', (req, res) => {
    gameLogic.reset();
    broadcastState();
    res.json({ status: 'reset', state: gameLogic.getState() });
});

// --- WebSocket Logic ---

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    // Send initial state
    ws.send(JSON.stringify({
        type: 'INIT',
        data: formatBroadcastData(gameLogic.getState(), gameLogic.lastAiData, null)
    }));

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);

            // Handle messages from Frontend (e.g., placing a bet)
            if (parsed.type === 'BET') {
                const bet = parsed.payload; // 'truth' or 'lie'
                const result = gameLogic.placeBet(bet);
                
                // Broadcast result of the bet
                broadcastToAll({
                    type: 'BET_RESULT',
                    data: result,
                    state: formatBroadcastData(gameLogic.getState(), gameLogic.lastAiData, null)
                });
            }
            
            // Handle messages from Pi (if Pi uses WS instead of REST)
            if (parsed.type === 'PI_DATA') {
                const aiData = parsed.payload;
                gameLogic.updateAiData(aiData);
                broadcastState();
            }

        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

/**
 * Broadcast current game state to all connected clients
 */
function broadcastState() {
    const broadcastData = formatBroadcastData(gameLogic.getState(), gameLogic.lastAiData, null);
    broadcastToAll({
        type: 'UPDATE',
        data: broadcastData
    });
}

function broadcastToAll(msgObj) {
    const msgString = JSON.stringify(msgObj);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msgString);
        }
    });
}

// Start Server
server.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready`);
});
