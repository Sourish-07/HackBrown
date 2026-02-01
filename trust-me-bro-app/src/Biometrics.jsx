import React, { useRef, useEffect, useState } from 'react';

// Lightweight biometrics component: accesses camera+microphone, estimates
// heart rate from average green-channel variations and breath rate from
// audio envelope. Displays heart rate as a simple SVG line chart and
// shows breath rate as a number.

export default function Biometrics() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const presageIntervalRef = useRef(null);

  const [heartBpm, setHeartBpm] = useState(null);
  const [breathBpm, setBreathBpm] = useState(null);
  const [heartHistory, setHeartHistory] = useState([]);
  const [status, setStatus] = useState('disconnected');

  useEffect(() => {
    let mounted = true;
    const sampleRate = 10; // samples/sec for our envelope measurements
    const maxSamples = sampleRate * 12; // keep last 12s

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) return;
        setStatus('connected');
        // Video
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Audio
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        source.connect(analyserRef.current);

        const greenSamples = [];
        const audioEnv = [];

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const sampleIntervalMs = 1000 / sampleRate;

        // Backend endpoint (optional Vite env override)
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

        function sample() {
          // video frame -> compute average green channel
          const video = videoRef.current;
          if (video && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const data = frame.data;
              let gSum = 0;
              const pxCount = data.length / 4;
              // sample a subset for performance
              const step = Math.max(1, Math.floor(pxCount / 2000));
              for (let i = 1; i < data.length; i += 4 * step) {
                gSum += data[i];
              }
              const gAvg = gSum / (pxCount / step);
              greenSamples.push(gAvg);
              if (greenSamples.length > maxSamples) greenSamples.shift();
            } catch (e) {
              // cross-origin or other
            }
          }

          // audio envelope (RMS)
          if (analyserRef.current) {
            const buf = new Float32Array(analyserRef.current.fftSize);
            analyserRef.current.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            audioEnv.push(rms);
            if (audioEnv.length > maxSamples) audioEnv.shift();
          }

          // estimate heart rate from greenSamples
          if (greenSamples.length >= sampleRate * 4) {
            const bpm = estimateRateFromSignal(greenSamples, sampleRate, 40, 180);
            if (bpm) {
              setHeartBpm(Math.round(bpm));
              setHeartHistory(prev => {
                const next = [...prev, Math.round(bpm)];
                if (next.length > 40) next.shift();
                return next;
              });
            }
          }

          // estimate breath rate from audioEnv (slower)
          if (audioEnv.length >= sampleRate * 6) {
            const br = estimateRateFromSignal(audioEnv, sampleRate, 6, 36);
            if (br) setBreathBpm(Math.round(br));
          }

          rafRef.current = setTimeout(sample, sampleIntervalMs);
        }

        sample();

        // Periodically send a captured frame to backend which forwards to Presage
        presageIntervalRef.current = setInterval(() => {
          try {
            if (!videoRef.current || videoRef.current.videoWidth === 0) return;
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(async (blob) => {
              if (!blob) return;
              try {
                const form = new FormData();
                form.append('file', blob, 'frame.jpg');
                const endpoint = (BACKEND_URL || '') + '/api/presage/frame';
                const resp = await fetch(endpoint, {
                  method: 'POST',
                  body: form,
                });
                if (!resp.ok) {
                  console.warn('Backend Presage proxy returned', resp.status);
                  return;
                }
                const json = await resp.json();
                if (json.heartRate) setHeartBpm(Math.round(json.heartRate));
                if (json.breathRate) setBreathBpm(Math.round(json.breathRate));
              } catch (e) {
                console.warn('Presage proxy error', e);
              }
            }, 'image/jpeg', 0.8);
          } catch (e) {
            // ignore
          }
        }, 2000);
      } catch (e) {
        console.error('Biometrics: getUserMedia failed', e);
        setStatus('error');
      }
    }

    start();

    return () => {
      mounted = false;
      if (rafRef.current) clearTimeout(rafRef.current);
      if (presageIntervalRef.current) clearInterval(presageIntervalRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  // Simple autocorrelation-based rate estimator
  function estimateRateFromSignal(samples, sampleRate, minBpm, maxBpm) {
    if (!samples || samples.length < 10) return null;
    const len = samples.length;
    // remove mean
    const mean = samples.reduce((a, b) => a + b, 0) / len;
    const norm = samples.map(v => v - mean);
    const minLag = Math.floor((60 / maxBpm) * sampleRate);
    const maxLag = Math.ceil((60 / minBpm) * sampleRate);
    let bestLag = -1;
    let bestCorr = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < len - lag; i++) corr += norm[i] * norm[i + lag];
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestLag <= 0) return null;
    const rateBpm = 60 * sampleRate / bestLag;
    if (!isFinite(rateBpm) || rateBpm <= 0) return null;
    return rateBpm;
  }

  // Simple inline SVG sparkline for heart history
  function HeartSparkline({ data = [], width = 220, height = 50 }) {
    if (!data || data.length === 0) return <div style={{ width, height, lineHeight: `${height}px` }}>—</div>;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const len = data.length;
    const points = data.map((v, i) => {
      const x = (i / (len - 1)) * width;
      const y = height - ((v - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline fill="none" stroke="#ff0044" strokeWidth="2" points={points} />
      </svg>
    );
  }

  return (
    <div style={{ marginTop: 12, padding: 8, borderTop: '1px solid #eee' }}>
      <h4>Live Biometrics (Local Camera & Microphone)</h4>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* video element hidden from UI but still used for frame capture */}
        <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#ff0044' }}>{heartBpm ? `${heartBpm} BPM` : '—'}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Heart rate</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#0077ff' }}>{breathBpm ? `${breathBpm} BPM` : '—'}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Breath rate</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <HeartSparkline data={heartHistory} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>Status: {status}</div>
    </div>
  );
}
