const axios = require('axios');
const fs = require('fs');

// Read config.json (relative path from tests/ → hardware/)
const config = JSON.parse(fs.readFileSync('../hardware/config.json', 'utf8'));

// Helper function to send API requests
const sendApiRequest = async (url, method = 'GET', data = null, headers = {}, responseType = 'json') => {
  try {
    const response = await axios({ method, url, data, headers, responseType });
    return { success: true, data: response.data };
  } catch (error) {
    const errDetail = error.response 
      ? (error.response.data instanceof Buffer ? 'Binary error response' : error.response.data) 
      : error.message;
    console.error(`Error during API request to ${url}:`, errDetail);
    return { success: false, error: errDetail };
  }
};

// ────────────────────────────────────────────────
// Gemini (via OpenRouter) Stress Test
// ────────────────────────────────────────────────
describe('Gemini API Stress Test (OpenRouter)', () => {
  it('should handle multiple requests to Gemini API', async () => {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const numberOfRequests = 5;

    const headers = {
      'Authorization': `Bearer ${config.openrouter_api_key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'Stress Test',
    };

    const requestBody = {
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'Say hello for stress test' }],
    };

    const results = await Promise.all(
      Array(numberOfRequests).fill().map(() => sendApiRequest(url, 'POST', requestBody, headers))
    );

    const successes = results.filter(r => r.success).length;
    console.log(`Gemini: ${successes}/${numberOfRequests} succeeded`);

    expect(successes).toBeGreaterThanOrEqual(3);
  });
});

// ────────────────────────────────────────────────
// ElevenLabs TTS Stress Test – SEQUENTIAL + PROPER TIMEOUT
// ────────────────────────────────────────────────
describe('ElevenLabs API Stress Test', () => {
  // This is the reliable place to set timeout for slow/sequential API tests
  // Applies to all it() blocks inside this describe
  jest.setTimeout(45000); // 45 seconds — safe for 8 requests + real TTS latency

  it('should handle multiple sequential requests to ElevenLabs TTS', async () => {
    const voiceId = config.elevenlabs_voice_id;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const numberOfRequests = 8;
    const results = [];
    const failures = [];

    const headers = {
      'xi-api-key': config.elevenlabs_api_key,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    };

    const requestBody = {
      text: 'This is a stress test sentence. Hello from the hat project.',
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    };

    for (let i = 0; i < numberOfRequests; i++) {
      const result = await sendApiRequest(url, 'POST', requestBody, headers, 'arraybuffer');
      if (result.success) {
        results.push(result);
        console.log(`ElevenLabs request ${i + 1}/${numberOfRequests} → OK`);
      } else {
        failures.push(result.error);
        console.log(
          `ElevenLabs request ${i + 1}/${numberOfRequests} → FAILED: ${
            typeof result.error === 'object' ? JSON.stringify(result.error, null, 2) : result.error
          }`
        );
      }
      // Delay prevents any residual concurrency/queue pressure
      await new Promise(r => setTimeout(r, 1200)); // 1.2 seconds
    }

    console.log(`ElevenLabs final: ${results.length} succeeded, ${failures.length} failed`);
    expect(results.length + failures.length).toBe(numberOfRequests);
    expect(results.length).toBeGreaterThanOrEqual(6); // Allows minor flake but still meaningful
  });
});

// ────────────────────────────────────────────────
// Presage Physiology API Stress Test
// ────────────────────────────────────────────────
describe('Presage API Stress Test', () => {
  it('should handle multiple requests to Presage API', async () => {
    const url = 'https://physiology.presagetech.com/api/v1/analyze';
    const numberOfRequests = 5;

    const headers = {
      'Authorization': `Bearer ${config.presage_api_key}`,
      'Content-Type': 'application/json',
    };

    const requestBody = {
      video: 'base64_dummy_video_string_for_testing_only',
      format: 'mp4',
      biometrics: ['heart_rate', 'breathing_rate', 'stress_index', 'engagement', 'facial_emotions'],
    };

    const results = await Promise.all(
      Array(numberOfRequests).fill().map(() => sendApiRequest(url, 'POST', requestBody, headers))
    );

    const successes = results.filter(r => r.success).length;
    console.log(`Presage: ${successes}/${numberOfRequests} succeeded`);

    expect(successes).toBeGreaterThanOrEqual(2); // lenient due to dummy data
  });
});