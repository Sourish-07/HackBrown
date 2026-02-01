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

// Track connected clients by type
const clientMap = {
    main: null,           // Main spectator screen
    player_1: null,       // Player 1 phone
    player_2: null        // Player 2 phone
};

// Countdown state for inter-round delay
let countdownInterval = null;
let countdownRemaining = 0;
let countdownActive = false;

// Queue for hat audio callouts (played via ElevenLabs on the hardware)
const hatCalloutQueue = [];
const MAX_HAT_CALLOUTS = 5;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- REST API Endpoints ---

// Endpoint for Raspberry Pi to send analysis data
app.post('/api/pi-data', (req, res) => {
    const data = req.body; 
    
    if (typeof data.lie_probability === 'undefined') {
        return res.status(400).json({ error: 'Missing lie_probability' });
    }

    gameLogic.updateAiData(data);

    if(data.metrics && data.metrics.gemini) {
        console.log(`[Gemini] Analysis: ${data.metrics.gemini.reasoning}`);
    }
    console.log(`[System] Risk Score Updated: ${gameLogic.currentRiskScore}`);

    broadcastMain({
        type: 'BIOMETRICS_UPDATE',
        data: gameLogic.getState()
    });

    res.json({ status: 'received' });
});

// Endpoint to reset game
app.post('/api/reset', (req, res) => {
    gameLogic.reset();
    broadcastToAll({
        type: 'GAME_RESET',
        data: gameLogic.getState()
    });
    res.json({ status: 'reset' });
});

// Hat hardware polls this endpoint to retrieve queued TTS callouts
app.get('/api/hat-callout', (req, res) => {
    if (!hatCalloutQueue.length) {
        return res.json({ pending: false });
    }
    const nextCallout = hatCalloutQueue.shift();
    return res.json({ pending: true, callout: nextCallout });
});

// --- WebSocket Logic ---

wss.on('connection', (ws) => {
    console.log('[WS] New connection');
    let clientType = null;
    let playerId = null;

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);
            console.log('[WS] Message:', parsed.type);

            // Registration: client identifies itself
            if (parsed.type === 'REGISTER') {
                if (parsed.clientType === 'player') {
                    // Player joins with PIN, assigned by join order
                    const result = gameLogic.registerPlayer(ws, parsed.pin);
                    if (!result.success) {
                        ws.send(JSON.stringify({ type: 'PIN_ERROR', message: result.message }));
                        return;
                    }
                    clientType = `player_${result.playerId}`;
                    playerId = result.playerId;
                    clientMap[clientType] = ws;
                    ws.send(JSON.stringify({ type: 'PLAYER_ASSIGNED', playerId: result.playerId }));
                } else {
                    clientType = parsed.clientType; // 'main'
                    clientMap[clientType] = ws;
                }
                console.log(`[WS] Registered: ${clientType} (player ${playerId || ''})`);
                // Send current state to client
                ws.send(JSON.stringify({
                    type: 'INIT',
                    data: { ...gameLogic.getState(), gamePin: gameLogic.gamePin },
                    clientType: clientType,
                    playerId: playerId
                }));
                // Always broadcast the current PIN to main display
                if (clientType === 'main') {
                    ws.send(JSON.stringify({
                        type: 'GAME_PIN',
                        gamePin: gameLogic.gamePin
                    }));
                }
                // Notify main screen of status
                broadcastMain({
                    type: 'PLAYERS_UPDATE',
                    data: gameLogic.getState()
                });
                // If both players connected, start the round and notify them
                if (gameLogic.bothPlayersConnected()) {
                    // Assign roles according to join order: first joiner = subject (hat), second = guesser
                    if (typeof gameLogic.assignRolesFromJoinOrder === 'function') {
                        gameLogic.assignRolesFromJoinOrder();
                    } else {
                        // fallback: keep previous defaults
                        gameLogic.gamePhase = 'wagering';
                    }
                    broadcastToAll({ type: 'GAME_START', data: gameLogic.getState() });
                }
            }
            
            // Player sets wager (may include declared truth/lie)
            if (parsed.type === 'SET_WAGER') {
                const payload = parsed.payload;
                const result = gameLogic.setWager(payload);
                if (result.success) {
                    // Notify main and players of wager and phase change
                    // Do NOT broadcast the declarer's declared choice to main/clients
                    broadcastMain({
                        type: 'WAGER_SET',
                        data: { wager: result.wager, guesser: gameLogic.guesserPlayer }
                    });
                    broadcastToAll({
                        type: 'PHASE_UPDATE',
                        data: gameLogic.getState()
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: result.error }));
                }
            }

            // READY_STATEMENT is no longer used in this flow; subject does not press ready.

            // Start guessing phase
            if (parsed.type === 'START_GUESS') {
                gameLogic.startGuessing();
                broadcastMain({
                    type: 'GUESSING_PHASE',
                    data: gameLogic.getState()
                });
                broadcastToAll({
                    type: 'PHASE_UPDATE',
                    data: gameLogic.getState()
                });
            }

            // Guesser makes guess
            if (parsed.type === 'MAKE_GUESS') {
                const guess = parsed.payload;
                const stateSnapshot = gameLogic.getState();
                queueHatCallout({
                    event: 'guess',
                    guess,
                    player: gameLogic.guesserPlayer,
                    subject: gameLogic.subjectPlayer,
                    transcript: stateSnapshot?.lastAiData?.transcript
                        || stateSnapshot?.lastAiData?.metrics?.gemini?.transcript
                        || '',
                    round: stateSnapshot.round,
                    timestamp: Date.now()
                });
                // Broadcast the guess immediately so main can show it
                broadcastToAll({ type: 'GUESS_MADE', data: { guess, guesser: gameLogic.guesserPlayer } });

                // Compute result
                const result = gameLogic.makeGuess(guess);

                // Pause 2s to allow main to show the guess animation, then broadcast result
                setTimeout(() => {
                    broadcastMain({ type: 'RESULT_PHASE', data: result });
                    broadcastToAll({ type: 'RESULT', data: result });

                    // Start 10s inter-round countdown (broadcast each second).
                    // Clear any existing countdown
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                    countdownRemaining = 10;
                    countdownActive = true;
                    // broadcast initial countdown state
                    broadcastToAll({ type: 'COUNTDOWN', data: { seconds: countdownRemaining } });
                    countdownInterval = setInterval(() => {
                        countdownRemaining -= 1;
                        if (countdownRemaining <= 0) {
                            clearInterval(countdownInterval);
                            countdownInterval = null;
                            countdownActive = false;
                            // Advance to next round
                            gameLogic.nextRound();
                            broadcastToAll({ type: 'NEXT_ROUND', data: gameLogic.getState() });
                        } else {
                            broadcastToAll({ type: 'COUNTDOWN', data: { seconds: countdownRemaining } });
                        }
                    }, 1000);
                }, 2000);
            }

            // Skip countdown request from any client
            if (parsed.type === 'SKIP_COUNTDOWN') {
                if (countdownActive) {
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                    countdownActive = false;
                    // Immediately advance to next round
                    gameLogic.nextRound();
                    broadcastToAll({ type: 'NEXT_ROUND', data: gameLogic.getState() });
                }
            }

            // Next round
            if (parsed.type === 'NEXT_ROUND') {
                gameLogic.nextRound();
                broadcastToAll({
                    type: 'NEXT_ROUND',
                    data: gameLogic.getState()
                });
            }

        } catch (e) {
            console.error('[WS] Error:', e);
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message' }));
        }
    });

    ws.on('close', () => {
        if (clientType) {
            clientMap[clientType] = null;
            console.log(`[WS] Disconnected: ${clientType}`);
        }
    });
});

function queueHatCallout(callout) {
    if (!callout || !callout.guess || callout.event !== 'guess') {
        return;
    }
    hatCalloutQueue.push(callout);
    if (hatCalloutQueue.length > MAX_HAT_CALLOUTS) {
        hatCalloutQueue.shift();
    }
}

/**
 * Broadcast to main screen only
 */
function broadcastMain(msgObj) {
    if (clientMap.main && clientMap.main.readyState === WebSocket.OPEN) {
        clientMap.main.send(JSON.stringify(msgObj));
    }
}

/**
 * Broadcast to all connected clients
 */
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
