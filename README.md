# Lie-Detecting Hat Hackathon Project

## Overview
A wearable hat that detects lies (via webcam + mic), processes the data using AI, and streams live results (lie probability + facial analysis) to a web UI.

## Structure
- `hardware/`: Raspberry Pi code (AI Inference, Camera capture).
- `backend/`: Node.js Server & Game Logic.
- `frontend/`: Web UI (React/HTML).

## Setup & Run

### Backend
1. `cd backend`
2. `npm install`
3. `npm start`
   - Server runs on port 3000.

### Hardware (Raspberry Pi)
1. `cd hardware`
2. Install dependencies (see `requirements.txt`).
3. Run `python ai_inference.py`.

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm start`

## Hackathon Roadmap
See the full roadmap in the project documentation.
