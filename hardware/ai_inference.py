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
CAMERA_INDEX = 0

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH) as f:
    config = json.load(f)

BACKEND_URL = config["api_endpoint"]
OPENROUTER_KEY = config.get("openrouter_api_key", "")
APP_ORIGIN = config.get("app_origin", "http://localhost")
APP_TITLE = config.get("app_title", "Inference Hat")

# ElevenLabs configuration
ELEVENLABS_API_KEY = config.get("elevenlabs_api_key", "")
ELEVENLABS_VOICE_ID = config.get("elevenlabs_voice_id", "")
ELEVENLABS_TTS_MODEL = config.get("elevenlabs_tts_model", "eleven_multilingual_v2")
ELEVENLABS_STT_MODEL = config.get("elevenlabs_stt_model", "scribe_v2")
ELEVENLABS_LANGUAGE_CODE = config.get("elevenlabs_language_code", "en")
ELEVENLABS_BASE_URL = config.get("elevenlabs_base_url", "https://api.elevenlabs.io")
ELEVENLABS_TTS_OUTPUT_FORMAT = config.get("elevenlabs_tts_output_format", "pcm_16000")
ELEVENLABS_TIMEOUT = config.get("elevenlabs_timeout_s", 45)

LIE_THRESHOLD = config.get("lie_threshold", 70)
TRUTH_THRESHOLD = config.get("truth_threshold", 30)
AUDIO_CALLOUT_COOLDOWN_S = config.get("audio_callout_cooldown_s", 12)
HAT_AUDIO_CALLOUTS_ENABLED = config.get("hat_audio_callouts_enabled", False)

# Backend extras for hat callouts
def _derive_backend_base(api_url):
    if not api_url:
        return ""
    if "/api" in api_url:
        return api_url.split("/api", 1)[0].rstrip("/")
    return api_url.rstrip("/")


BACKEND_BASE_URL = config.get("backend_base_url") or _derive_backend_base(BACKEND_URL)
HAT_CALLOUT_ENDPOINT = config.get("hat_callout_endpoint") or (
    f"{BACKEND_BASE_URL}/api/hat-callout" if BACKEND_BASE_URL else ""
)

# Insult pools for ElevenLabs callouts
LIE_INSULTS = [
    "U dirty liar.",
    "I hate people like you.",
    "Stop poisoning the air with your lies.",
    "You really said that with a straight face?",
]

TRUTH_INSULTS = [
    "Wow, truth? That's not like you.",
    "You actually said something honest? Shocking.",
    "Wait... you're being sincere?",
]

# Track cooldown for hat audio callouts
last_callout_play_ts = 0

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

def audio_frames_to_wav_bytes(audio_frames, rate=RATE, channels=CHANNELS):
    """Convert raw audio frames to binary WAV data."""
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)  # 16-bit audio
        wav_file.setframerate(rate)
        wav_file.writeframes(b"".join(audio_frames))

    wav_buffer.seek(0)
    return wav_buffer.read()


def audio_to_base64_wav(audio_frames, rate=RATE, channels=CHANNELS):
    """Convert raw audio frames to base64-encoded WAV data."""
    wav_data = audio_frames_to_wav_bytes(audio_frames, rate=rate, channels=channels)
    return base64.b64encode(wav_data).decode("utf-8")


# ---------- ElevenLabs helpers ----------

def transcribe_audio_elevenlabs(audio_frames):
    """Send audio chunk to ElevenLabs Speech-to-Text."""
    if not ELEVENLABS_API_KEY or not audio_frames:
        return {"text": "", "words": []}

    wav_bytes = audio_frames_to_wav_bytes(audio_frames)
    url = f"{ELEVENLABS_BASE_URL.rstrip('/')}/v1/speech-to-text"
    headers = {"xi-api-key": ELEVENLABS_API_KEY}
    data = {
        "model_id": ELEVENLABS_STT_MODEL,
        "language_code": ELEVENLABS_LANGUAGE_CODE,
    }
    files = {
        "file": ("chunk.wav", wav_bytes, "audio/wav"),
    }

    try:
        response = requests.post(
            url,
            headers=headers,
            data=data,
            files=files,
            timeout=ELEVENLABS_TIMEOUT,
        )
        if response.status_code == 200:
            payload = response.json()
            return {
                "text": payload.get("text", "").strip(),
                "words": payload.get("words", []),
                "raw": payload,
            }
        print(f"ElevenLabs STT error: {response.status_code} - {response.text[:200]}")
    except Exception as exc:
        print(f"ElevenLabs STT request failed: {exc}")

    return {"text": "", "words": []}


def fetch_hat_callout_from_backend():
    """Poll backend for the next queued hat callout."""
    if not HAT_AUDIO_CALLOUTS_ENABLED or not HAT_CALLOUT_ENDPOINT:
        return None
    try:
        response = requests.get(HAT_CALLOUT_ENDPOINT, timeout=5)
        if response.status_code == 200:
            payload = response.json()
            if payload.get("pending") and payload.get("callout"):
                return payload["callout"]
    except Exception as exc:
        print(f"Hat callout poll failed: {exc}")
    return None


def build_callout_text(callout):
    """Craft the spoken text for a hat callout."""
    if not callout:
        return ""
    if callout.get("event") and callout.get("event") != "guess":
        return ""

    guess = (callout.get("guess") or "").lower()
    player = callout.get("player") or callout.get("guesser") or "the guesser"
    transcript = (callout.get("transcript") or "").strip()
    quoted_statement = f"\"{transcript}\"" if transcript else "that statement"

    if guess == "lie":
        insult = random.choice(LIE_INSULTS)
        opposite = (
            f"Opposite translation: not ({transcript})."
            if transcript
            else "Opposite translation: reality disagrees."
        )
        return (
            f"Player {player} says you're lying about {quoted_statement}. "
            f"{insult} {opposite}"
        )

    if guess == "truth":
        insult = random.choice(TRUTH_INSULTS)
        validation = (
            f"Validated truth for {quoted_statement}."
            if transcript
            else "Validated truth on record."
        )
        return (
            f"Player {player} begrudgingly says you're telling the truth. "
            f"{validation} {insult}"
        )

    return ""


def parse_pcm_settings(fmt):
    """Return playback settings for ElevenLabs PCM output."""
    if not fmt.startswith("pcm_"):
        return None
    try:
        sample_rate = int(fmt.split("_", 1)[1])
    except (ValueError, IndexError):
        return None
    return {
        "sample_rate": sample_rate,
        "channels": 1,
        "sample_width": 2,
    }


def play_pcm_audio(audio_bytes, playback_settings):
    """Play raw PCM audio bytes using PyAudio."""
    if not audio_bytes:
        return False

    p = pyaudio.PyAudio()
    try:
        stream = p.open(
            format=p.get_format_from_width(playback_settings["sample_width"]),
            channels=playback_settings["channels"],
            rate=playback_settings["sample_rate"],
            output=True,
        )
        chunk_size = 4096
        for idx in range(0, len(audio_bytes), chunk_size):
            stream.write(audio_bytes[idx : idx + chunk_size])
        stream.stop_stream()
        stream.close()
        return True
    except Exception as exc:
        print(f"Audio playback error: {exc}")
        return False
    finally:
        p.terminate()


def speak_text_elevenlabs(text):
    """Convert text to speech via ElevenLabs and play it out loud."""
    if not text:
        return False
    if not (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID):
        print("Hat callout skipped: ElevenLabs credentials missing.")
        return False

    playback_settings = parse_pcm_settings(ELEVENLABS_TTS_OUTPUT_FORMAT)
    if not playback_settings:
        print("Hat callout skipped: pcm_* output format required.")
        return False

    url = f"{ELEVENLABS_BASE_URL.rstrip('/')}/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/stream"
    params = {"output_format": ELEVENLABS_TTS_OUTPUT_FORMAT}
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    body = {
        "text": text,
        "model_id": ELEVENLABS_TTS_MODEL,
        "voice_settings": {
            "stability": 0.3,
            "similarity_boost": 0.75,
            "style": 0.2,
            "use_speaker_boost": True,
        },
    }
    try:
        response = requests.post(
            url,
            params=params,
            headers=headers,
            json=body,
            timeout=ELEVENLABS_TIMEOUT,
            stream=True,
        )
        if response.status_code != 200:
            print(f"ElevenLabs TTS error: {response.status_code} - {response.text[:200]}")
            return False
        audio_chunks = []
        for chunk in response.iter_content(chunk_size=4096):
            if chunk:
                audio_chunks.append(chunk)
        audio_bytes = b"".join(audio_chunks)
        return play_pcm_audio(audio_bytes, playback_settings)
    except Exception as exc:
        print(f"ElevenLabs TTS request failed: {exc}")
        return False


def process_hat_callouts():
    """Poll backend for player decisions and speak callouts."""
    global last_callout_play_ts
    if not HAT_AUDIO_CALLOUTS_ENABLED:
        return
    now = time.time()
    if now - last_callout_play_ts < AUDIO_CALLOUT_COOLDOWN_S:
        return

    callout = fetch_hat_callout_from_backend()
    if not callout:
        return

    text = build_callout_text(callout)
    if not text:
        return

    print(f"[Hat] Playing callout: {text}")
    if speak_text_elevenlabs(text):
        last_callout_play_ts = time.time()


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


"""OpenRouter-based Gemini 3 Flash audio analysis for the Inference Hat."""


# ---------- OpenRouter / Gemini integration ----------

def analyze_audio_gemini(audio_frames, transcript_hint=""):
    """
    Send a 20s audio chunk to Gemini 3 Flash via the Gemini API.
    Expects the model to return JSON with transcript, deception_score, reasoning.
    """
    if not GEMINI_API_KEY:
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
    if transcript_hint:
        prompt += (
            f"\n\nTranscript candidate (from ElevenLabs STT) to assist your analysis:\n"
            f"{transcript_hint}\n"
            "Cross-check the audio against this text and refine the deception score."
        )

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
                                    "mime_type": "audio/wav",
                                    "audio": base64_audio,
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
            text = data["choices"][0]["message"]["content"].strip()

            # Try to parse as JSON directly
            try:
                parsed = json.loads(text)
                if "deception_score" in parsed:
                    return {
                        "deception_score": float(parsed["deception_score"]),
                        "reasoning": parsed.get("reasoning", ""),
                        "transcript": parsed.get("transcript") or transcript_hint,
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
                                "transcript": parsed.get("transcript") or transcript_hint,
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

            if not transcript and transcript_hint:
                transcript = transcript_hint
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


# ---------- Main loop ----------

def main():
    print("Starting AI Inference Hat (Gemini 3 Flash, 20s audio)...")
    if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID and not HAT_AUDIO_CALLOUTS_ENABLED:
        print(
            "ElevenLabs is configured but hat audio callouts are disabled. "
            "Set hat_audio_callouts_enabled to true in config.json to enable speech."
        )
    if HAT_AUDIO_CALLOUTS_ENABLED and not HAT_CALLOUT_ENDPOINT:
        print(
            "Hat audio callouts enabled, but no hat callout endpoint is configured. "
            "Set hat_callout_endpoint or backend_base_url in config.json."
        )

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
                print("Analyzing 20s audio chunk (ElevenLabs STT + Gemini)...")
                stt_result = transcribe_audio_elevenlabs(current_audio)
                transcript_hint = stt_result.get("text", "")
                if transcript_hint:
                    print(f"[ElevenLabs STT] Transcript: {transcript_hint[:80]}{'...' if len(transcript_hint) > 80 else ''}")
                gemini_analysis = analyze_audio_gemini(current_audio, transcript_hint=transcript_hint)
                if transcript_hint and not gemini_analysis.get("transcript"):
                    gemini_analysis["transcript"] = transcript_hint
                if stt_result.get("words"):
                    gemini_analysis["words"] = stt_result["words"]
                print(f"Transcript used: {gemini_analysis.get('transcript', 'N/A')}")

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

            process_hat_callouts()
            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        cap.release()


if __name__ == "__main__":
    main()
