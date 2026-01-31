# Lie-Detecting Hat: Advanced Biometric Risk Assessment System

> **HackBrown 2026 Project**
> *Integrating Capital One Financial Analysis, Google Gemini AI, and PresageTech Biometrics.*

##  Project Overview
This project transforms a standard webcam and microphone into a high-stakes **Financial Risk Assessment Tool**. By fusing physiological data (Heart Rate, Stress) with linguistic analysis (LLM-based deception detection), we determine the "creditworthiness" of a subject in real-time.

##  Hackathon Tracks Implemented

### 1. Capital One - Best Financial Hack 
**The "Loan Interview" Protocol:**
- Instead of a simple "Lie Detector", we built a **Financial Risk Engine**.
- The backend tracks **Applicant Balance** vs. **Bank Reserves**.
- A high "Risk Score" (derived from stress + deception) triggers a "Deny/Fraud" recommendation.
- Game Theory: The banker (opponent) bets on the risk model to protect capital.

### 2. MLH - Best Use of Gemini API 
**Linguistic Deception Analysis:**
- We use **Google Gemini 1.5 Pro** to analyze spoken statements in real-time.
- The Python hardware client captures audio transcripts and prompts Gemini to identify:
  - Hesitation markers
  - Contradictions
  - Distancing language
- **Tech:** `google.generativeai` Python SDK streaming analysis to the Node.js backend.

### 3. MLH - Best Use of Presage 
**Human Sensing Layer:**
- We simulate the **PresageTech Physiology SDK** to extract clinical-grade biometrics from video:
  - **Heart Rate (BPM)**
  - **Stress Index (HRV-derived)**
  - **Facial Emotions (Micro-expressions)**
- **Sensor Fusion:** These metrics are mathematically weighted against Gemini output to calculate the final Risk Score.

---

##  Tech Stack & Structure

- **Hardware (`/hardware`)**: 
  - Python client for Raspberry Pi / Laptop.
  - Runs Computer Vision (OpenCV) and connects to Gemini API.
  - Sends JSON telemetry to Backend via REST API.
- **Backend (`/backend`)**: 
  - Node.js + Express + WebSockets (`ws`).
  - Manages Game State, Financial Logic, and real-time broadcasting.
- **Frontend (`/frontend`)**: 
  - React.js Dashboard.
  - Visualizes Risk Scores, Live Biometrics, and Financial Balances.

##  Quick Start

### 1. Backend (Server)
```bash
cd backend
npm install
npm start
# Runs on http://localhost:3000
```

### 2. Frontend (UI)
```bash
cd frontend
npm install
npm start
# Opens in browser
```

### 3. Hardware (Data Source)
```bash
# In a new terminal
.\venv\Scripts\Activate.ps1
cd hardware
python ai_inference.py
```
*Note: Ensure `hardware/config.json` has your valid API keys.*

##  Testing
See [TESTING.md](./TESTING.md) for detailed validation steps and manual API triggers.
