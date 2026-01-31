# Testing & Validation Guide

To ensure the "Lie Detecting Hat" meets the hackathon track requirements, follow these validation steps.

## 1. Capital One - Best Financial Hack
**Goal:** Demonstrate "Financial Risk Assessment" using biometric data.
**Verification:**
1. Start the Backend: `npm start` (in `backend/`)
2. Start the Frontend: `npm start` (in `frontend/`)
3. Run the Hardware Simulator: `python hardware/ai_inference.py`
4. **Observe:**
   - The Frontend displays "Applicant Balance" and "Bank Balance".
   - The "Risk Score" fluctuates based on the simulated stress levels.
   - When you click "Deny (Risk/Lie)" when the Risk Score is high (>75), the Bank (Opponent) gains money.
   - This proves the system models financial risk (creditworthiness) using the Hat.

## 2. MLH - Best Use of Gemini API
**Goal:** Use Google Gemini for advanced data processing.
**Verification:**
1. Ensure `hardware/config.json` has a valid API Key (or use the mock fallback).
2. Check the Backend Console logs.
3. **Observe:**
   - Logs like: `[Gemini] Analysis: Statement lacks specificity.`
   - This confirms the Python script is generating text prompts, sending them to the Gemini model (or simulation logic), and using the "reasoning" to influence the lie probability.

## 3. MLH - Best Use of Presage
**Goal:** Use Presage for physiological state monitoring.
**Verification:**
1. Watch the Frontend "Live Biometrics" section.
2. **Observe:**
   - "HR" (Heart Rate) and "Stress" values updating in real-time.
   - These values are generated in `hardware/ai_inference.py` inside `analyze_frame_presage`.
   - The "Sensor Fusion" algorithm in Python explicitly uses `stress_index` to calculate the final `lie_probability`.

## Quick Test Script
You can manually trigger a "High Risk" event to test the UI without running the python loop:

**Windows PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/pi-data" -Method Post -ContentType "application/json" -Body '{
    "lie_probability": 85,
    "metrics": {
        "presage": { "heart_rate": 120, "stress_index": 0.9, "facial_emotions": {"fear": 0.8} },
        "gemini": { "reasoning": "Subject contradicted previous statement regarding income.", "deception_score": 0.9 }
    }
}'
```
Check the Frontend. The Risk Score should spike, and the Gemini explanation should appear.
