import time
import json
import random
import requests
import cv2
import google.generativeai as genai
import numpy as np

# Load config
with open('config.json') as f:
    config = json.load(f)

BACKEND_URL = config['api_endpoint']
GEMINI_KEY = config.get('gemini_api_key', '')

# Setup Gemini
if GEMINI_KEY and "YOUR_GEMINI" not in GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel('gemini-1.5-pro-latest')
else:
    model = None
    print("Warning: Gemini API Key missing or default.")

def capture_frames():
    # Placeholder for camera capture
    pass

def analyze_frame_presage(frame):
    """
    Simulates PresageTech Physiology SDK
    In a real app, this would use the Presage SDK to extract:
    - Heart Rate (BPM)
    - Breathing Rate
    - Stress Level (HRV derived)
    - Engagement/Focus
    """
    # Mocking realistic physiological data
    return {
        "heart_rate": int(random.gauss(80, 5)), # Normal distribution around 80
        "breathing_rate": int(random.gauss(16, 2)),
        "stress_index": round(random.random(), 2), # 0.0 - 1.0
        "engagement": round(random.random(), 2),
        "facial_emotions": {
            "happiness": round(random.random(), 2),
            "surprise": round(random.random(), 2),
            "fear": round(random.random(), 2),
            "neutral": round(random.random(), 2)
        }
    }

def analyze_audio_gemini(text_transcript):
    """
    Uses Gemini API to analyze text for deception indicators.
    """
    if not model:
        return {"deception_score": 0.5, "reasoning": "Gemini not configured"}
    prompt = f"""
    Analyze the following statement for signs of deception, hesitation, or contradiction.
    Statement: "{text_transcript}"

    Return a JSON object with:
    - deception_score (0.0 to 1.0, where 1.0 is high likelihood of lie)
    - reasoning (short explanation)
    """

    # Try a few common client call patterns and extract text robustly
    attempts = []
    try:
        # Some versions expose a top-level helper
        attempts.append(lambda: genai.generate_text(model="gemini-1.5-pro", prompt=prompt))
    except Exception:
        pass
    try:
        # Chat-style API
        attempts.append(lambda: genai.chat.completions.create(model="gemini-1.5-pro", messages=[{"role": "user", "content": prompt}]))
    except Exception:
        pass
    try:
        # If caller created a model object (older patterns)
        attempts.append(lambda: model.generate(prompt))
    except Exception:
        pass
    try:
        attempts.append(lambda: model.generate_content(prompt))
    except Exception:
        pass

    for attempt in attempts:
        try:
            resp = attempt()
            # Try several common response shapes
            text = None
            if resp is None:
                continue
            # handle genai.generate_text -> resp.text or resp.output
            if hasattr(resp, 'text'):
                text = resp.text
            elif isinstance(resp, dict) and 'output' in resp:
                # service SDK sometimes returns dict with 'output'
                out = resp.get('output')
                if isinstance(out, list) and len(out) > 0:
                    text = out[0].get('content') if isinstance(out[0], dict) else str(out[0])
            elif isinstance(resp, dict) and 'candidates' in resp:
                c = resp.get('candidates')
                if isinstance(c, list) and len(c) > 0:
                    text = c[0].get('content') or c[0].get('message') or str(c[0])
            else:
                # fallback to str()
                text = str(resp)

            if not text:
                continue

            # Attempt to extract JSON object from text
            text = text.strip()
            # If text contains a JSON blob, try to parse it
            try:
                # direct JSON
                parsed = json.loads(text)
                if 'deception_score' in parsed:
                    return {"deception_score": float(parsed['deception_score']), "reasoning": parsed.get('reasoning', '')}
            except Exception:
                # Try to find a JSON substring
                import re
                m = re.search(r"(\{[\s\S]*\})", text)
                if m:
                    try:
                        parsed = json.loads(m.group(1))
                        if 'deception_score' in parsed:
                            return {"deception_score": float(parsed['deception_score']), "reasoning": parsed.get('reasoning', '')}
                    except Exception:
                        pass

            # If we couldn't parse JSON, do a small heuristic: look for percentage or 'likely lie'
            lowered = text.lower()
            if 'lie' in lowered or 'decept' in lowered:
                # conservative score
                return {"deception_score": 0.75, "reasoning": (lowered[:200])}
            # fallback to neutral
            return {"deception_score": 0.5, "reasoning": text[:200]}
        except Exception as e:
            print(f"Gemini attempt failed: {e}")

    # If we reached here, all attempts failed
    print("Gemini: all client attempts failed or returned no usable text")
    return {"deception_score": 0.5, "reasoning": "Gemini unavailable or unsupported client - using fallback"}

def main():
    print("Starting AI Inference Hat (Advanced Mode)...")
    
    cap = cv2.VideoCapture(0) # Open default camera
    
    try:
        while True:
            # ret, frame = cap.read()
            # if not ret: break
            
            # 1. Visual/Physiological Analysis (Presage Mock)
            presage_data = analyze_frame_presage(None)
            
            # 2. Audio/Text Analysis (Gemini Mock for loop)
            # In real app, Speech-to-Text happens here.
            # We'll simulate a statement every 5 seconds.
            current_statement = "I honestly didn't eat the last cookie."
            gemini_analysis = analyze_audio_gemini(current_statement)
            
            # 3. Sensor Fusion Algorithm
            # Combine cues: High stress + Micro-expressions of fear + Gemini linguistic markers
            
            # Weights
            W_stress = 0.3
            W_fear = 0.2
            W_gemini = 0.5
            
            stress_score = presage_data['stress_index']
            fear_score = presage_data['facial_emotions']['fear']
            linguistic_score = gemini_analysis['deception_score']
            
            raw_lie_prob = (stress_score * W_stress) + \
                           (fear_score * W_fear) + \
                           (linguistic_score * W_gemini)
            
            # Normalize to 0-100
            lie_prob = min(max(raw_lie_prob * 100, 0), 100)
            
            payload = {
                "lie_probability": round(lie_prob, 1),
                "timestamp": time.time(),
                "metrics": {
                    "presage": presage_data,
                    "gemini": gemini_analysis
                }
            }
            
            try:
                # Send to backend
                response = requests.post(BACKEND_URL, json=payload)
                print(f"Sent: {lie_prob}% | HR: {presage_data['heart_rate']} | Reason: {gemini_analysis['reasoning']}")
            except Exception as e:
                print(f"Connection error: {e}")
            
            time.sleep(2) # Send every 2 seconds
            
    except KeyboardInterrupt:
        print("Stopping...")
    finally:
        cap.release()

if __name__ == "__main__":
    main()
