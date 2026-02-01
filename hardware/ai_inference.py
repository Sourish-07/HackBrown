import time
import json
import random
import requests
import cv2
import pyaudio
import wave
import base64
import io
from threading import Thread
from queue import Queue


# ---------- Config ----------

with open("config.json") as f:
    config = json.load(f)

BACKEND_URL = config["api_endpoint"]
GEMINI_API_KEY = config.get("gemini_api_key", "")
CAMERA_INDEX = config.get("camera_index", 0)

# Use a valid Gemini 3 Flash model string for the Gemini API
GEMINI_MODEL = config.get("gemini_model", "gemini-3-flash-preview")
# If user accidentally puts an OpenRouter-style "google/..." string, strip prefix
if GEMINI_MODEL.startswith("google/"):
    GEMINI_MODEL = GEMINI_MODEL.split("/", 1)[1]

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"

# ---------- Audio configuration ----------

CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
RECORD_SECONDS = 20  # Analyze every 20 seconds of audio

# Queue for audio samples (each item is a list of raw frames)
audio_queue = Queue()


# ---------- Mock camera / physiology ----------

def capture_frames():
    """Placeholder for camera capture (not used yet)."""
    pass


def analyze_frame_presage(frame):
    """Mock PresageTech physiology analysis from camera frames."""
    return {
        "heart_rate": int(random.gauss(80, 5)),
        "breathing_rate": int(random.gauss(16, 2)),
        "stress_index": round(random.random(), 2),
        "engagement": round(random.random(), 2),
        "facial_emotions": {
            "happiness": round(random.random(), 2),
            "surprise": round(random.random(), 2),
            "fear": round(random.random(), 2),
            "neutral": round(random.random(), 2),
        },
    }


# ---------- Audio helpers ----------

def audio_to_base64_wav(audio_frames, rate=RATE, channels=CHANNELS):
    """Convert raw audio frames to base64-encoded WAV data."""
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)  # 16-bit audio
        wav_file.setframerate(rate)
        wav_file.writeframes(b"".join(audio_frames))

    wav_buffer.seek(0)
    wav_data = wav_buffer.read()
    return base64.b64encode(wav_data).decode("utf-8")


def audio_capture_thread():
    """Continuously captures microphone input and enqueues 20s chunks."""
    p = pyaudio.PyAudio()
    print("Starting audio capture...")

    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK,
    )

    print("Audio stream opened. Recording...")

    try:
        frames_per_20s = int(RATE / CHUNK * RECORD_SECONDS)
        while True:
            frames = []
            for _ in range(frames_per_20s):
                data = stream.read(CHUNK, exception_on_overflow=False)
                frames.append(data)
            audio_queue.put(frames)
    except Exception as e:
        print(f"Audio capture error: {e}")
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()


# ---------- Gemini integration ----------

def analyze_audio_gemini(audio_frames):
    """
    Send a 20s audio chunk to Gemini 3 Flash via the Gemini API.
    Expects the model to return JSON with transcript, deception_score, reasoning.
    """
    if not GEMINI_API_KEY:
        return {
            "deception_score": 0.5,
            "reasoning": "Gemini API key not configured",
            "transcript": "",
        }

    if not audio_frames:
        return {
            "deception_score": 0.5,
            "reasoning": "No audio data",
            "transcript": "",
        }

    base64_audio = audio_to_base64_wav(audio_frames)

    prompt = """Analyze this audio clip for signs of deception, hesitation, or contradiction in the speaker's voice and words.

Consider:
- Vocal hesitation or uncertainty
- Speech patterns and pauses
- Tone and emotional content
- Linguistic markers of deception
- Content contradictions

First, transcribe what was said, then analyze it.

Return a JSON object with:
- transcript (what the person said)
- deception_score (0.0 to 1.0, where 1.0 is high likelihood of lie)
- reasoning (short explanation based on vocal and linguistic cues)"""

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": "audio/wav",
                            "data": base64_audio,
                        }
                    },
                ],
            }
        ]
    }

    try:
        response = requests.post(
            f"{GEMINI_API_URL}/models/{GEMINI_MODEL}:generateContent",
            params={"key": GEMINI_API_KEY},
            headers={"Content-Type": "application/json"},
            json=body,
            timeout=60,
        )

        if response.status_code == 200:
            data = response.json()

            # Extract text from candidates -> content -> parts
            text_parts = []
            try:
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    for part in parts:
                        if "text" in part:
                            text_parts.append(part["text"])
            except Exception:
                pass

            text = "\n".join(text_parts).strip()

            # Try to parse as JSON directly
            try:
                parsed = json.loads(text)
                if "deception_score" in parsed:
                    return {
                        "deception_score": float(parsed["deception_score"]),
                        "reasoning": parsed.get("reasoning", ""),
                        "transcript": parsed.get("transcript", ""),
                    }
            except Exception:
                # Try to pull JSON object out of a longer string
                import re

                match = re.search(r"(\{[\s\S]*\})", text)
                if match:
                    try:
                        parsed = json.loads(match.group(1))
                        if "deception_score" in parsed:
                            return {
                                "deception_score": float(parsed["deception_score"]),
                                "reasoning": parsed.get("reasoning", ""),
                                "transcript": parsed.get("transcript", ""),
                            }
                    except Exception:
                        pass

            # Fallbacks if the model didn't return clean JSON
            transcript = ""
            if "transcript" in text.lower():
                for line in text.split("\n"):
                    if "transcript" in line.lower() and ":" in line:
                        transcript = line.split(":", 1)[1].strip().strip("'\"")
                        break

            lowered = text.lower()
            if any(k in lowered for k in ("lie", "decept", "hesitat")):
                return {
                    "deception_score": 0.75,
                    "reasoning": text[:200],
                    "transcript": transcript,
                }

            return {
                "deception_score": 0.5,
                "reasoning": text[:200],
                "transcript": transcript,
            }

        print(f"Gemini API error: {response.status_code} - {response.text}")
        return {
            "deception_score": 0.5,
            "reasoning": f"API error: {response.status_code}",
            "transcript": "",
        }

    except Exception as e:
        print(f"Gemini API request failed: {e}")
        return {
            "deception_score": 0.5,
            "reasoning": f"Request failed: {str(e)}",
            "transcript": "",
        }


# ---------- Main loop ----------

def main():
    print("Starting AI Inference Hat (Gemini 3 Flash, 20s audio)...")

    audio_thread = Thread(target=audio_capture_thread, daemon=True)
    audio_thread.start()

    cap = cv2.VideoCapture(CAMERA_INDEX)

    gemini_analysis = {
        "deception_score": 0.5,
        "reasoning": "Initializing...",
        "transcript": "",
    }

    try:
        while True:
            # When a new 20-second audio chunk is ready, analyze it
            if not audio_queue.empty():
                current_audio = audio_queue.get()
                print("Analyzing 20s audio chunk with Gemini 3 Flash...")
                gemini_analysis = analyze_audio_gemini(current_audio)
                print(f"Transcript: {gemini_analysis.get('transcript', 'N/A')}")

            presage_data = analyze_frame_presage(None)

            # Simple sensor fusion of physiology + audio analysis
            W_stress = 0.3
            W_fear = 0.2
            W_gemini = 0.5

            stress_score = presage_data["stress_index"]
            fear_score = presage_data["facial_emotions"]["fear"]
            linguistic_score = gemini_analysis["deception_score"]

            raw_lie_prob = (
                stress_score * W_stress
                + fear_score * W_fear
                + linguistic_score * W_gemini
            )

            lie_prob = min(max(raw_lie_prob * 100, 0), 100)

            payload = {
                "lie_probability": round(lie_prob, 1),
                "timestamp": time.time(),
                "transcript": gemini_analysis.get("transcript", ""),
                "metrics": {
                    "presage": presage_data,
                    "gemini": gemini_analysis,
                },
            }

            try:
                response = requests.post(BACKEND_URL, json=payload)
                transcript_preview = gemini_analysis.get("transcript", "")[:50]
                print(f"\n{'='*60}")
                print(
                    f"Lie Probability: {lie_prob}% | HR: {presage_data['heart_rate']} BPM"
                )
                print(
                    f"Transcript: {transcript_preview}{'...' if len(gemini_analysis.get('transcript', '')) > 50 else ''}"
                )
                print(f"Analysis: {gemini_analysis['reasoning'][:100]}")
                print(f"{'='*60}\n")
            except Exception as e:
                print(f"Connection error: {e}")

            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        cap.release()


if __name__ == "__main__":
    main()