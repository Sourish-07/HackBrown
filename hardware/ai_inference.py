import time
import json
import random
import requests
import cv2
import numpy as np
import pyaudio
import wave
import base64
import io
from threading import Thread
from queue import Queue

# Load config
with open('config.json') as f:
    config = json.load(f)

BACKEND_URL = config['api_endpoint']
OPENROUTER_KEY = config.get('openrouter_api_key', '')
APP_ORIGIN = config.get('app_origin', 'http://localhost')
APP_TITLE = config.get('app_title', 'Inference Hat')
GEMINI_MODEL = config.get(
    'gemini_model',
    'google/gemini-2.5-flash-native-audio-preview-12-2025'
)

# Audio configuration
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
RECORD_SECONDS = 3  # Analyze every 3 seconds of audio

# Queue for audio samples
audio_queue = Queue()


def capture_frames():
    # Placeholder for camera capture
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


def audio_to_base64_wav(audio_frames, rate=RATE, channels=CHANNELS):
    """Convert raw audio frames to base64-encoded WAV data."""
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)  # 16-bit audio
        wav_file.setframerate(rate)
        wav_file.writeframes(b''.join(audio_frames))

    wav_buffer.seek(0)
    wav_data = wav_buffer.read()
    return base64.b64encode(wav_data).decode('utf-8')


def audio_capture_thread():
    """Continuously captures microphone input and enqueues chunks."""
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
        while True:
            frames = []
            for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
                data = stream.read(CHUNK, exception_on_overflow=False)
                frames.append(data)

            audio_queue.put(frames)
    except Exception as e:
        print(f"Audio capture error: {e}")
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()


def analyze_audio_gemini(audio_frames):
    """Send audio to Gemini 2.5 Flash native audio model via OpenRouter."""
    if not OPENROUTER_KEY or "YOUR_" in OPENROUTER_KEY:
        return {
            "deception_score": 0.5,
            "reasoning": "OpenRouter not configured",
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
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": APP_ORIGIN,
                "X-Title": APP_TITLE,
            },
            json={
                "model": GEMINI_MODEL,
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
            timeout=30,
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


def main():
    print("Starting AI Inference Hat (Gemini 2.5 native audio)...")

    # Start audio capture thread
    audio_thread = Thread(target=audio_capture_thread, daemon=True)
    audio_thread.start()

    cap = cv2.VideoCapture(0)

    gemini_analysis = {
        "deception_score": 0.5,
        "reasoning": "Initializing...",
        "transcript": "",
    }

    try:
        while True:
            # When a new audio chunk is ready, analyze it
            if not audio_queue.empty():
                current_audio = audio_queue.get()
                print("Analyzing audio with Gemini 2.5 native audio...")
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
import time
import json
import random
import requests
import cv2
import numpy as np
import pyaudio
import wave
import base64
import io
from threading import Thread
from queue import Queue, Empty, Full

# Load config
with open('config.json') as f:
    config = json.load(f)

BACKEND_URL = config['api_endpoint']
OPENROUTER_KEY = config.get('openrouter_api_key', '')
APP_ORIGIN = config.get('app_origin', 'http://localhost')
APP_TITLE = config.get('app_title', 'Inference Hat')
GEMINI_MODEL = config.get(
    'gemini_model',
    'google/gemini-2.5-flash-native-audio-preview-12-2025'
)

# Audio configuration
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
RECORD_SECONDS = 3  # Analyze every 3 seconds of audio

# Queues for audio capture and Gemini analysis results
audio_queue = Queue(maxsize=5)
analysis_queue = Queue(maxsize=1)


def capture_frames():
    # Placeholder for camera capture
    pass


def analyze_frame_presage(frame):
    """
    Simulates PresageTech Physiology SDK.
    In production this would run the actual SDK against camera frames.
    """
    return {
        "heart_rate": int(random.gauss(80, 5)),
        "breathing_rate": int(random.gauss(16, 2)),
        "stress_index": round(random.random(), 2),
        "engagement": round(random.random(), 2),
        "facial_emotions": {
            "happiness": round(random.random(), 2),
            "surprise": round(random.random(), 2),
            "fear": round(random.random(), 2),
            "neutral": round(random.random(), 2)
        }
    }


def audio_to_base64_wav(audio_frames, rate=RATE, channels=CHANNELS):
    """Convert raw PCM frames into a base64-encoded WAV payload."""
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)  # 16-bit audio
        wav_file.setframerate(rate)
        wav_file.writeframes(b''.join(audio_frames))

    wav_buffer.seek(0)
    wav_data = wav_buffer.read()
    return base64.b64encode(wav_data).decode('utf-8')


def audio_capture_thread():
    """Continuously captures microphone input and enqueues chunks for analysis."""
    p = pyaudio.PyAudio()
    print("Starting audio capture...")

    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK
    )

    print("Audio stream opened. Recording...")

    try:
        while True:
            frames = []
            for _ in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
                data = stream.read(CHUNK, exception_on_overflow=False)
                frames.append(data)

            try:
                audio_queue.put(frames, timeout=1)
            except Full:
                print("Audio queue full; dropping stale audio chunk.")
    except Exception as e:
        print(f"Audio capture error: {e}")
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()


def analyze_audio_gemini(audio_frames):
    """Send an audio clip to the Gemini Flash audio model via OpenRouter."""
    if not OPENROUTER_KEY or "YOUR_" in OPENROUTER_KEY:
        return {
            "deception_score": 0.5,
            "reasoning": "OpenRouter not configured",
            "transcript": ""
        }

    if not audio_frames:
        return {
            "deception_score": 0.5,
            "reasoning": "No audio data",
            "transcript": ""
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
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": APP_ORIGIN,
                "X-Title": APP_TITLE
            },
            json={
                "model": GEMINI_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                        audio_queue.put(frames, timeout=1)
                        # Handle queue full scenario
                        except Full:
                            print("Audio queue full; dropping stale audio chunk.")
                                }
                            }
                        ]
                    }
                ],
                "response_format": {"type": "json_object"}
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            text = data['choices'][0]['message']['content'].strip()

            try:
                parsed = json.loads(text)
                if 'deception_score' in parsed:
                    return {
                        "deception_score": float(parsed['deception_score']),
                        "reasoning": parsed.get('reasoning', ''),
                        "transcript": parsed.get('transcript', '')
                    }
            except Exception:
                import re

                        ''' LEGACY DUPLICATE CODE BELOW (DISABLED)
                        import json
                        '''
                match = re.search(r"(\{[\s\S]*\})", text)
                if match:
                    try:
                        parsed = json.loads(match.group(1))
                        if 'deception_score' in parsed:
                            return {
                                "deception_score": float(parsed['deception_score']),
                                "reasoning": parsed.get('reasoning', ''),
                                "transcript": parsed.get('transcript', '')
                            }
                    except Exception:
                        pass

            transcript = ""
            if "transcript" in text.lower():
                lines = text.split('\n')
                for line in lines:
                    if 'transcript' in line.lower() and ':' in line:
                        transcript = line.split(':', 1)[1].strip().strip('"\'')
                        break

            lowered = text.lower()
            if any(keyword in lowered for keyword in ("lie", "decept", "hesitat")):
                return {
                    "deception_score": 0.75,
                    "reasoning": text[:200],
                    "transcript": transcript
                }

            return {
                "deception_score": 0.5,
                "reasoning": text[:200],
                "transcript": transcript
            }

        print(f"OpenRouter API error: {response.status_code} - {response.text}")
        return {
            "deception_score": 0.5,
            "reasoning": f"API error: {response.status_code}",
            "transcript": ""
        }

    except Exception as e:
        print(f"OpenRouter request failed: {e}")
        return {
            "deception_score": 0.5,
            "reasoning": f"Request failed: {str(e)}",
            "transcript": ""
        }


def audio_analysis_thread():
            '''  # END LEGACY DUPLICATE CODE
    """Process queued audio chunks with Gemini without blocking the UI loop."""
    print(f"Starting audio analysis worker with model {GEMINI_MODEL}...")
    while True:
        frames = audio_queue.get()
        if frames is None:
            break

        result = analyze_audio_gemini(frames)

        try:
            analysis_queue.put(result, timeout=1)
        except Full:
            try:
                analysis_queue.get_nowait()
            except Empty:
                pass
            analysis_queue.put(result)


def main():
    print("Starting AI Inference Hat (Advanced Mode)...")

    audio_thread = Thread(target=audio_capture_thread, daemon=True)
    audio_thread.start()

    analysis_thread = Thread(target=audio_analysis_thread, daemon=True)
    analysis_thread.start()

    cap = cv2.VideoCapture(0)

    gemini_analysis = {"deception_score": 0.5, "reasoning": "Initializing...", "transcript": ""}

    try:
        while True:
            # ret, frame = cap.read()
            # if not ret:
            #     break

            try:
                gemini_analysis = analysis_queue.get_nowait()
                print("Received new Gemini analysis update.")
                print(f"Transcript: {gemini_analysis.get('transcript', 'N/A')}")
            except Empty:
                pass

            presage_data = analyze_frame_presage(None)

            W_stress = 0.3
            W_fear = 0.2
            W_gemini = 0.5

            stress_score = presage_data['stress_index']
            fear_score = presage_data['facial_emotions']['fear']
            linguistic_score = gemini_analysis['deception_score']

            raw_lie_prob = (stress_score * W_stress) + \
                           (fear_score * W_fear) + \
                           (linguistic_score * W_gemini)

            lie_prob = min(max(raw_lie_prob * 100, 0), 100)

            payload = {
                "lie_probability": round(lie_prob, 1),
                "timestamp": time.time(),
                "transcript": gemini_analysis.get('transcript', ''),
                "metrics": {
                    "presage": presage_data,
                    "gemini": gemini_analysis
                }
            }

            try:
                response = requests.post(BACKEND_URL, json=payload)
                transcript_preview = gemini_analysis.get('transcript', '')[:50]
                print(f"\n{'='*60}")
                print(f"Lie Probability: {lie_prob}% | HR: {presage_data['heart_rate']} BPM")
                print(f"Transcript: {transcript_preview}{'...' if len(gemini_analysis.get('transcript', '')) > 50 else ''}")
                print(f"Analysis: {gemini_analysis['reasoning'][:100]}")
                print(f"{'='*60}\n")
            except Exception as e:
                print(f"Connection error: {e}")

            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        cap.release()
        try:
            audio_queue.put_nowait(None)
        except Full:
            pass


if __name__ == "__main__":
    main()import time
import json
import random
import requests
import cv2
import numpy as np
import pyaudio
import wave
import base64
import io
from threading import Thread
from queue import Queue, Empty, Full

# Load config
with open('config.json') as f:
    config = json.load(f)

BACKEND_URL = config['api_endpoint']
OPENROUTER_KEY = config.get('openrouter_api_key', '')
APP_ORIGIN = config.get('app_origin', 'http://localhost')
APP_TITLE = config.get('app_title', 'Inference Hat')
GEMINI_MODEL = config.get(
    'gemini_model',
    'google/gemini-2.5-flash-native-audio-preview-12-2025'
)

# Audio configuration
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
RECORD_SECONDS = 3  # Analyze every 3 seconds of audio

# Queue for audio samples
audio_queue = Queue()

def capture_frames():
    # Placeholder for camera capture
    pass

def analyze_frame_presage(frame):
    """
    Simulates PresageTech Physiology SDK
    In a real app, this would use the Presage SDK to extract:
    GEMINI_MODEL = config.get('gemini_model', 'google/gemini-2.5-flash-native-audio-preview-12-2025')
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
    analysis_queue = Queue(maxsize=1)
            "fear": round(random.random(), 2),
            "neutral": round(random.random(), 2)
        }
    }

def audio_to_base64_wav(audio_frames, rate=RATE, channels=CHANNELS):
    """
    Convert raw audio frames to base64-encoded WAV file.
    """
    # Create a WAV file in memory
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(channels)
                # Put the audio chunk in the queue (drop oldest if consumer lags)
                try:
                    audio_queue.put(frames, timeout=1)
                except Full:
                    print("Audio queue full; dropping stale audio chunk.")
        wav_file.writeframes(b''.join(audio_frames))
    
    # Get WAV data and encode to base64
    wav_buffer.seek(0)
    wav_data = wav_buffer.read()
    base64_audio = base64.b64encode(wav_data).decode('utf-8')
    
    return base64_audio

def audio_capture_thread():
    """
    Continuously captures audio chunks.
    Runs in a separate thread.
    """
    p = pyaudio.PyAudio()
    
    print("Starting audio capture...")
    
    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK
    )
    
    print("Audio stream opened. Recording...")
    
    try:
        while True:
            frames = []
            # Record for RECORD_SECONDS
            for i in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
                data = stream.read(CHUNK, exception_on_overflow=False)
                frames.append(data)
            
            # Put the audio chunk in the queue
            audio_queue.put(frames)
            
    except Exception as e:
        print(f"Audio capture error: {e}")
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()

def analyze_audio_gemini(audio_frames):
    """
    Uses OpenRouter API with Gemini 2.0 Flash to analyze audio directly for deception indicators.
    """
    if not OPENROUTER_KEY or "YOUR_" in OPENROUTER_KEY:
        return {
            "deception_score": 0.5, 
            "reasoning": "OpenRouter not configured",
            "transcript": ""
                    "model": GEMINI_MODEL,
    
    if not audio_frames:
        return {
            "deception_score": 0.5, 
            "reasoning": "No audio data",
            "transcript": ""
        }
    
    # Convert audio to base64
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
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": APP_ORIGIN,
                "X-Title": APP_TITLE
            },
            json={
                "model": "gemini-2.5-flash-native-audio-preview-12-2025",  # Gemini 2.0 Flash with audio support
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "mime_type": "audio/wav",
                                    "audio": base64_audio
                                }
                            }
                        ]
                    }
                ],
                "response_format": {"type": "json_object"}
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            text = data['choices'][0]['message']['content'].strip()
            
            # Attempt to extract JSON object from text
            try:
                # Try direct JSON parse
                parsed = json.loads(text)
                if 'deception_score' in parsed:
                    return {
                        "deception_score": float(parsed['deception_score']), 
                        "reasoning": parsed.get('reasoning', ''),
                        "transcript": parsed.get('transcript', '')
                    }
            except Exception:
                # Try to find JSON substring
                import re
                m = re.search(r"(\{[\s\S]*\})", text)
                if m:
                    try:
                        parsed = json.loads(m.group(1))
                        if 'deception_score' in parsed:
                            return {
                                "deception_score": float(parsed['deception_score']), 
                                "reasoning": parsed.get('reasoning', ''),
                                "transcript": parsed.get('transcript', '')
                            }
                    except Exception:
                        pass
            
            # Heuristic fallback - try to extract transcript from text
            transcript = ""
    def audio_analysis_thread():
        """Runs Gemini analysis on captured audio without blocking the main loop."""
        print(f"Starting audio analysis worker with model {GEMINI_MODEL}...")
        while True:
            frames = audio_queue.get()
            if frames is None:
                break  # Allows graceful shutdown if sentinel is provided

            result = analyze_audio_gemini(frames)

            try:
                analysis_queue.put(result, timeout=1)
            except Full:
                try:
                    analysis_queue.get_nowait()  # Drop stale result
                except Empty:
                    pass
                analysis_queue.put(result)
            if "transcript" in text.lower():
                # Try to extract transcript
                lines = text.split('\n')
                for line in lines:
                    if 'transcript' in line.lower() and ':' in line:
                        transcript = line.split(':', 1)[1].strip().strip('"\'')
                        break
            
            # Heuristic deception detection
            lowered = text.lower()
            if 'lie' in lowered or 'decept' in lowered or 'hesitat' in lowered:
                return {
                    "deception_score": 0.75, 
                    "reasoning": text[:200],
                    "transcript": transcript
                }
            
            return {
                "deception_score": 0.5, 
                "reasoning": text[:200],
                "transcript": transcript
            }
        else:
            print(f"OpenRouter API error: {response.status_code} - {response.text}")
            return {
                "deception_score": 0.5, 
                "reasoning": f"API error: {response.status_code}",
                "transcript": ""
            }
            
    except Exception as e:
        print(f"OpenRouter request failed: {e}")
        return {
            "deception_score": 0.5, 
            "reasoning": f"Request failed: {str(e)}",
            "transcript": ""
        }

def main():
    print("Starting AI Inference Hat (Advanced Mode)...")
    
    # Start audio capture thread
    audio_thread = Thread(target=audio_capture_thread, daemon=True)
    audio_thread.start()
    
    cap = cv2.VideoCapture(0) # Open default camera
    
    current_audio = None
    gemini_analysis = {"deception_score": 0.5, "reasoning": "Initializing...", "transcript": ""}
    
    try:
        while True:
            # ret, frame = cap.read()
            # if not ret: break
            
            # Check for new audio chunks
            if not audio_queue.empty():
                current_audio = audio_queue.get()
                # Analyze the audio with Gemini
                print("Analyzing audio with Gemini 2.0 Flash...")
                gemini_analysis = analyze_audio_gemini(current_audio)
                print(f"Transcript: {gemini_analysis.get('transcript', 'N/A')}")
            
            # 1. Visual/Physiological Analysis (Presage Mock)
            presage_data = analyze_frame_presage(None)
            
            # 2. Audio analysis is done above when new audio arrives
            
            # 3. Sensor Fusion Algorithm
            # Combine cues: High stress + Micro-expressions of fear + Gemini linguistic markers
            
            # Weights
            W_stress = 0.3
            W_fear = 0.2
            W_gemini = 0.5
            
            stress_score = presage_data['stress_index']
            fear_score = presage_data['facial_emotions']['fear']
            # Allow worker threads to exit cleanly if the program stops
            try:
                audio_queue.put_nowait(None)
            except Full:
                pass
            linguistic_score = gemini_analysis['deception_score']
            
            raw_lie_prob = (stress_score * W_stress) + \
                           (fear_score * W_fear) + \
                           (linguistic_score * W_gemini)
            
            # Normalize to 0-100
            lie_prob = min(max(raw_lie_prob * 100, 0), 100)
            
            payload = {
                "lie_probability": round(lie_prob, 1),
                "timestamp": time.time(),
                "transcript": gemini_analysis.get('transcript', ''),
                "metrics": {
                    "presage": presage_data,
                    "gemini": gemini_analysis
                }
            }
            
            try:
                # Send to backend
                response = requests.post(BACKEND_URL, json=payload)
                transcript_preview = gemini_analysis.get('transcript', '')[:50]
                print(f"\n{'='*60}")
                print(f"Lie Probability: {lie_prob}% | HR: {presage_data['heart_rate']} BPM")
                print(f"Transcript: {transcript_preview}{'...' if len(gemini_analysis.get('transcript', '')) > 50 else ''}")
                print(f"Analysis: {gemini_analysis['reasoning'][:100]}")
                print(f"{'='*60}\n")
            except Exception as e:
                print(f"Connection error: {e}")
            
            time.sleep(0.5)  # Check more frequently
            
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        cap.release()

if __name__ == "__main__":
    main()