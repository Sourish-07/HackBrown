# Backend - Lie Detecting Hat

Node.js + Express + WebSocket server.

## Installation
```bash
npm install
```

## Running
```bash
npm start
```
Runs on `http://localhost:3000`.

## API

### POST /api/pi-data
Send JSON data from the Raspberry Pi.
Body:
```json
{
  "lie_probability": 78,
  "facial_analysis": {
    "happiness": 0.1,
    "fear": 0.5
  }
}
```

### WebSocket
Connect to `ws://localhost:3000`.
- Receives: `{ type: 'UPDATE', data: { ... } }`
- Send Bet:
```json
{
  "type": "BET",
  "payload": "truth" // or "lie"
}
```
