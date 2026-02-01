# Trust Me Bro

## Overview
This project is a real-time lie detection system integrated into a wearable hat, designed for Hack@Brown 2026. It combines biometric sensors, AI inference, and a gamified financial risk assessment interface. The system analyzes physiological signals (e.g., heart rate, stress levels) and linguistic cues to compute a lie probability score, which is used in a betting game simulating financial decision-making, such as credit approval or fraud detection.

Key features:
- **Hardware**: Raspberry Pi-based sensor fusion using computer vision for biometrics and Google Gemini for deception analysis.
- **Backend**: Node.js server handling data ingestion, game logic, and real-time updates via WebSockets.
- **Frontend**: React dashboard for visualizing biometrics, risk scores, and placing bets (truth/lie).

The project targets hackathon tracks like Capital One's Best Financial Hack (risk modeling), MLH's Best Use of Gemini API (linguistic analysis), and Best Use of Presage (physiological monitoring).

## Tech Stack
- **Hardware/Edge**: Python 3 with OpenCV, NumPy, Requests, Google Generative AI (Gemini), and mocked Presage SDK.
- **Backend**: Node.js, Express.js, WebSocket (ws), CORS, Body-Parser.
- **Frontend**: React.js, Chart.js for visualizations.
- **Other**: JSON for configs, HTTP/WS for communication.

## Installation

### Prerequisites
- Node.js (v18+)
- Python 3.8+
- Raspberry Pi (optional for real hardware; simulator works on any machine)
- API Keys: Google Gemini (for text analysis), Presage (for biometrics; mocked if unavailable)

### Setup Steps

1. **Clone the Repository**
   ```
   git clone https://github.com/Sourish-07/HackBrown.git
   cd HackBrown
   ```

2. **Backend**
   ```
   cd backend
   npm install
   ```

3. **Frontend**
   ```
   cd frontend
   npm install
   ```

4. **Hardware**
   ```
   cd hardware
   pip install -r requirements.txt
   cp config.example.json config.json
   ```
   Edit `config.json`:
   - Set `api_endpoint` to your backend URL (default: `http://localhost:3000/api/pi-data`).
   - Add `gemini_api_key` (required for real Gemini; fallback mock otherwise).
   - Add `presage_api_key` if using actual Presage SDK.

## Usage

1. **Start Backend**
   ```
   cd backend
   npm start
   ```
   Server runs on `http://localhost:3000`. WebSocket at `ws://localhost:3000`.

2. **Start Frontend**
   ```
   cd frontend
   npm start
   ```
   Opens at `http://localhost:3000` (React default; proxies to backend if configured).

3. **Run Hardware Inference**
   ```
   cd hardware
   python ai_inference.py
   ```
   Simulates camera input and sends data to backend every 2 seconds. In real setup, connects to Raspberry Pi camera.

4. **Interact**
   - Open the frontend in a browser to view live biometrics (heart rate, stress, emotions), risk score, and game state (balances, stake).
   - Place bets via the UI (truth or lie) to simulate financial decisions.
   - Backend logs show Gemini reasoning and risk updates.
   - Use the `/api/reset` endpoint to reset the game.

## How It Works

### Hardware (ai_inference.py)
- Captures video frames from camera (OpenCV).
- Analyzes physiology using mocked Presage functions: extracts heart rate, breathing, stress, and facial emotions (randomized for demo; real SDK would use video-based rPPG).
- Analyzes transcribed statements with Google Gemini: prompts for deception score and reasoning.
- Fuses data with weights (stress 30%, fear 20%, linguistic 50%) to compute lie probability (0-100).
- Sends JSON payload to backend: `{lie_probability, timestamp, metrics: {presage, gemini}}`.

### Backend
- **server.js**: Sets up Express for REST APIs and WebSocket for real-time. Handles Pi data POST, updates game logic, broadcasts state.
- **game_logic.js**: Manages game state (rounds, balances, stakes). Updates risk score from AI data. Processes bets: compares to thresholds (high risk >75 = lie, low <40 = truth). Adjusts balances, logs history.
- **utils.js**: Formats data for consistent broadcasting (timestamps, scores, metrics).

### Frontend
- React app with components for dashboard (inferred from dependencies: uses Chart.js for biometric charts).
- Connects to WebSocket for live updates: displays risk score, biometrics, Gemini reasoning, and bet buttons.
- Bets sent via WS; results update balances in real-time.

### Data Flow
1. Hardware → Backend (HTTP POST with AI metrics).
2. Backend processes, updates risk/game state.
3. Backend → Frontend (WS broadcast: updates, bet results).
4. Frontend → Backend (WS: bet placements).

## Testing
See [TESTING.md](TESTING.md) for detailed validation steps, including API curls for simulation and track-specific verifications.

## Limitations & Future Work
- Presage and Gemini are partially mocked for demo (real keys enable full functionality).
- No actual audio transcription (assumes pre-transcribed text).
- Enhance with real sensors (e.g., microphone for STT).
- Add more financial metrics (e.g., dynamic payouts based on risk confidence).

## Contributors
- Sourish Mudumby Venugopal
- Rayhan Mohamed
- Shrish Mudumby Venugopal
- Lauren Bell

Built during Hack@Brown 2026.
