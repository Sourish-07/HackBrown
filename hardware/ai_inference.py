import time
import json
import random
import requests
import cv2
import pyaudio
import wave
import base64
import io
import os
from threading import Thread
from queue import Queue

# ---------- Config ----------

with open("config.json") as f:
    config = json.load(f)

BACKEND_URL = config["api_endpoint"]
OPENROUTER_KEY = config.get("openrouter_api_key", "")
PRESAGE_KEY = config.get("presage_api_key", "")
APP_ORIGIN = config.get("app_origin", "http://localhost")
APP_TITLE = config.get("app_title", "Inference Hat")
CAMERA_INDEX = config.get("camera_index", 0)

OPENROUTER_MODEL = config.get("openrouter_model", "google/gemini-3-flash-preview")

# ---------- Audio configuration ----------

CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
RECORD_SECONDS = 20  # Analyze every 20 seconds of audio

# Queue for audio samples (each item is a list of raw frames)
audio_queue = Queue()

# ---------- Video configuration for Presage ----------

VIDEO_FPS = 30
VIDEO_SECONDS = 20  # Analyze every 20 seconds of video, similar to audio

# Queue for video frames lists
video_queue = Queue()

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

# ---------- OpenRouter / Gemini integration ----------

def analyze_audio_gemini(audio_frames):
    """Send a 20s audio chunk to a Gemini model via OpenRouter."""
    if not OPENROUTER_KEY or "YOUR_" in OPENROUTER_KEY:
        return {
            "deception_score": 0.5,
            "reasoning": "OpenRouter API key not configured",
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

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": APP_ORIGIN,
                "X-Title": APP_TITLE,
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "format": "wav",
                                    "data": base64_audio,
                                },
                            },
                        ],
                    }
                ],
                "response_format": {"type": "json_object"},
            },
            timeout=60,
        )

        if response.status_code == 200:
            data = response.json()

            # OpenRouter chat/completions: content can be a string or list
            message = data["choices"][0]["message"]
            content = message.get("content", "")
            if isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, dict):
                        if "text" in part:
                            text_parts.append(part["text"])
                        elif part.get("type") in ("text", "output_text") and "text" in part:
                            text_parts.append(part["text"])
                text = "\n".join(text_parts).strip()
            else:
                text = str(content).strip()

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

        print(f"OpenRouter API error: {response.status_code} - {response.text}")
        return {
            "deception_score": 0.5,
            "reasoning": f"API error: {response.status_code}",
            "transcript": "",
        }

    except Exception as e:
        print(f"OpenRouter request failed: {e}")
        return {
            "deception_score": 0.5,
            "reasoning": f"Request failed: {str(e)}",
            "transcript": "",
        }

# ---------- Presage API integration ----------

def mock_presage_data():
    """Mock Presage data when API key is not set or API call fails."""
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

def analyze_video_presage(video_frames):
    """Analyze video frames using Presage API if key is provided, else mock."""
    if not PRESAGE_KEY or "YOUR_" in PRESAGE_KEY:
        print("Presage API key not configured, using mock data")
        return mock_presage_data()

    if not video_frames:
        return mock_presage_data()

    # Create MP4 video in temporary file
    try:
        height, width, _ = video_frames[0].shape
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        temp_filename = 'temp.mp4'
        writer = cv2.VideoWriter(temp_filename, fourcc, VIDEO_FPS, (width, height), True)

        for frame in video_frames:
            writer.write(frame)

        writer.release()

        with open(temp_filename, 'rb') as f:
            video_data = f.read()

        os.remove(temp_filename)

        base64_video = base64.b64encode(video_data).decode('utf-8')

        # Send to Presage API
        # NOTE: Replace 'https://physiology.presagetech.com/api/v1/analyze' with the actual Presage API endpoint for video analysis
        response = requests.post(
            "https://physiology.presagetech.com/api/v1/analyze",
            headers={
                "Authorization": f"Bearer {PRESAGE_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "video": base64_video,
                "format": "mp4",
                "biometrics": ["heart_rate", "breathing_rate", "stress_index", "engagement", "facial_emotions"]
            },
            timeout=60
        )

        if response.status_code == 200:
            data = response.json()
            # Assume the response has the expected structure; adjust parsing as per actual API response
            return {
                "heart_rate": data.get("heart_rate", int(random.gauss(80, 5))),
                "breathing_rate": data.get("breathing_rate", int(random.gauss(16, 2))),
                "stress_index": data.get("stress_index", round(random.random(), 2)),
                "engagement": data.get("engagement", round(random.random(), 2)),
                "facial_emotions": data.get("facial_emotions", {
                    "happiness": round(random.random(), 2),
                    "surprise": round(random.random(), 2),
                    "fear": round(random.random(), 2),
                    "neutral": round(random.random(), 2),
                }),
            }
        else:
            print(f"Presage API error: {response.status_code} - {response.text}")
            return mock_presage_data()

    except Exception as e:
        print(f"Presage request failed: {e}")
        return mock_presage_data()

def video_capture_thread():
    """Continuously captures video frames and enqueues 20s chunks."""
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print("Error opening video capture")
        return

    print("Video capture started...")

    frames = []
    frames_per_20s = VIDEO_FPS * VIDEO_SECONDS

    try:
        while True:
            ret, frame = cap.read()
            if ret:
                frames.append(frame)
            if len(frames) >= frames_per_20s:
                video_queue.put(frames[:frames_per_20s])
                frames = frames[frames_per_20s:]  # Overlap if more
            time.sleep(1 / VIDEO_FPS)
    except Exception as e:
        print(f"Video capture error: {e}")
    finally:
        cap.release()

# ---------- Main loop ----------

def main():
    print("Starting AI Inference Hat (Gemini 3 Flash, 20s audio/video)...")

    audio_thread = Thread(target=audio_capture_thread, daemon=True)
    audio_thread.start()

    video_thread = Thread(target=video_capture_thread, daemon=True)
    video_thread.start()

    gemini_analysis = {
        "deception_score": 0.5,
        "reasoning": "Initializing...",
        "transcript": "",
    }

    presage_data = mock_presage_data()  # Initial mock

    try:
        while True:
            # When a new 20-second audio chunk is ready, analyze it
            if not audio_queue.empty():
                current_audio = audio_queue.get()
                print("Analyzing 20s audio chunk with Gemini 3 Flash...")
                gemini_analysis = analyze_audio_gemini(current_audio)
                print(f"Transcript: {gemini_analysis.get('transcript', 'N/A')}")

            # When a new 20-second video chunk is ready, analyze it
            if not video_queue.empty():
                current_video = video_queue.get()
                print("Analyzing 20s video chunk with Presage...")
                presage_data = analyze_video_presage(current_video)

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

if __name__ == "__main__":
    main()