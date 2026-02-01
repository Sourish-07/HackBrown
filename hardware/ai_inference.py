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
    model = genai.GenerativeModel('gemini-3-pro-preview')
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
    # Local fallback analyzer (simple heuristics for tone/deception)
    def local_tone_and_deception(txt: str):
        t = (txt or '').strip()
        lowered = t.lower()
        hesitation_count = lowered.count('um') + lowered.count('uh') + lowered.count('hmm')
        question_marks = t.count('?')
        exclamations = t.count('!')
        length = len(t.split())

        # Tone heuristics
        if hesitation_count >= 2 or question_marks > 1:
            tone = 'hesitant'
        elif exclamations > 0:
            tone = 'agitated'
        elif length < 4:
            tone = 'curt'
        else:
            tone = 'calm'

        # Deception heuristics: hedging, over-assertion, hesitations
        score = 0.5
        if hesitation_count >= 2:
            score += 0.18
        if any(w in lowered for w in ['honestly', "to be honest", 'really', "i swear"]):
            score += 0.08
        if any(w in lowered for w in ['did not', "didn't", 'no', 'never']) and question_marks > 0:
            score += 0.12
        if exclamations > 0:
            score += 0.06
        if length < 4:
            score += 0.05

        score = max(0.0, min(1.0, score))
        reasoning = f"Local heuristic: tone={tone}; hesitations={hesitation_count}; qmarks={question_marks}; exclaims={exclamations}"
        return {"deception_score": round(score, 2), "reasoning": reasoning, "tone_summary": f"sounds {tone}"}

    if not model:
        return {"deception_score": 0.5, "reasoning": "Gemini not configured, using local fallback", "tone_summary": local_tone_and_deception(text_transcript)['tone_summary']}

    prompt = f"""
Analyze the following statement for signs of deception, hesitation, or contradiction.
Statement: "{text_transcript}"

Return a short JSON object with keys:
- deception_score (0.0 to 1.0)
- reasoning (short explanation)
- tone_summary (short phrase like 'sounds nervous' or 'calm')
Example:
{"deception_score": 0.72, "reasoning": "stammering and hedging detected", "tone_summary": "sounds hesitant"}
"""

    # Build a list of call patterns to try; some genai SDKs differ by version
    attempts = []
    try:
        if hasattr(genai, 'generate_text'):
            attempts.append(lambda: genai.generate_text(model="gemini-1.5-pro", prompt=prompt))
    except Exception:
        pass
    try:
        if hasattr(genai, 'chat') and hasattr(genai.chat, 'completions'):
            attempts.append(lambda: genai.chat.completions.create(model="gemini-1.5-pro", messages=[{"role": "user", "content": prompt}]))
    except Exception:
        pass
    try:
        if model and hasattr(model, 'generate'):
            attempts.append(lambda: model.generate(prompt=prompt))
    except Exception:
        pass
    try:
        if model and hasattr(model, 'generate_content'):
            attempts.append(lambda: model.generate_content(prompt=prompt))
    except Exception:
        pass

    for attempt in attempts:
        try:
            resp = attempt()
            if resp is None:
                continue

            # Try to extract text from multiple known shapes
            text = None
            # genai.generate_text -> object with 'text' or 'output'
            if hasattr(resp, 'text'):
                text = resp.text
            elif isinstance(resp, dict) and 'output' in resp:
                out = resp.get('output')
                if isinstance(out, list) and len(out) > 0:
                    first = out[0]
                    if isinstance(first, dict):
                        text = first.get('content') or first.get('text') or str(first)
                    else:
                        text = str(first)
            elif isinstance(resp, dict) and 'candidates' in resp:
                c = resp.get('candidates')
                if isinstance(c, list) and len(c) > 0:
                    text = c[0].get('content') or c[0].get('message') or str(c[0])
            else:
                text = str(resp)

            if not text:
                continue

            # Try parse JSON
            try:
                parsed = json.loads(text)
                if 'deception_score' in parsed:
                    # Ensure tone_summary present
                    if 'tone_summary' not in parsed:
                        parsed['tone_summary'] = local_tone_and_deception(text_transcript)['tone_summary']
                    return {"deception_score": float(parsed['deception_score']), "reasoning": parsed.get('reasoning', ''), "tone_summary": parsed.get('tone_summary')}
            except Exception:
                # try to extract JSON substring
                import re
                m = re.search(r"(\{[\s\S]*\})", text)
                if m:
                    try:
                        parsed = json.loads(m.group(1))
                        if 'deception_score' in parsed:
                            if 'tone_summary' not in parsed:
                                parsed['tone_summary'] = local_tone_and_deception(text_transcript)['tone_summary']
                            return {"deception_score": float(parsed['deception_score']), "reasoning": parsed.get('reasoning', ''), "tone_summary": parsed.get('tone_summary')}
                    except Exception:
                        pass

            lowered = text.lower()
            # heuristics on returned text
            if 'lie' in lowered or 'decept' in lowered:
                return {"deception_score": 0.75, "reasoning": text[:300], "tone_summary": local_tone_and_deception(text_transcript)['tone_summary']}

            # fallback: return neutral with text as reasoning
            return {"deception_score": 0.5, "reasoning": text[:300], "tone_summary": local_tone_and_deception(text_transcript)['tone_summary']}
        except Exception as e:
            # Detect quota/message hints
            err = str(e)
            print(f"Gemini attempt failed: {err}")
            if 'quota' in err.lower() or '429' in err:
                return {"deception_score": 0.5, "reasoning": "Gemini quota exceeded - using fallback", "tone_summary": local_tone_and_deception(text_transcript)['tone_summary']}

    # If we reached here, all attempts failed — return local heuristic
    print("Gemini: all client attempts failed or returned no usable text")
    return local_tone_and_deception(text_transcript)

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
            
            # Normalize to 1-100 (ensure non-zero visible risk)
            lie_prob = min(max(raw_lie_prob * 100, 1), 100)
            
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
