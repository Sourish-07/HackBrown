import React, { useEffect, useRef, useState } from 'react';

// Simple live chart for heart rate (red) and breathing (blue sine)
export default function VitalsChart({ presage }) {
  const width = 800;
  const height = 200;
  const maxPoints = 160; // how many samples to keep

  const [heartSamples, setHeartSamples] = useState([]); // numeric
  const [breathSamples, setBreathSamples] = useState([]); // numeric (sine signal)
  const lastPresageRef = useRef(null);
  const tRef = useRef(0);

  // Update lastPresage when prop changes
  useEffect(() => {
    if (presage) lastPresageRef.current = presage;
  }, [presage]);

  // Sampling loop: generate a new sample every 200ms
  useEffect(() => {
    const interval = setInterval(() => {
      const p = lastPresageRef.current;
      const now = Date.now() / 1000;
      tRef.current += 0.2; // step in seconds

      // Heart rate: if available, add that value; otherwise repeat last
      const hr = p && p.heart_rate ? p.heart_rate : (heartSamples.length ? heartSamples[heartSamples.length - 1] : 0);

      // Breathing: generate sine sample based on breathing_rate (breaths per minute)
      let breathVal = 0;
      if (p && p.breathing_rate) {
        const breathsPerSec = p.breathing_rate / 60.0;
        const phase = 2 * Math.PI * breathsPerSec * tRef.current;
        // amplitude scaled to make visible on chart
        breathVal = Math.sin(phase) * 1.0;
      } else {
        breathVal = breathSamples.length ? breathSamples[breathSamples.length - 1] : 0;
      }

      setHeartSamples(prev => {
        const next = [...prev, hr].slice(-maxPoints);
        return next;
      });
      setBreathSamples(prev => {
        const next = [...prev, breathVal].slice(-maxPoints);
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [heartSamples.length, breathSamples.length]);

  // Helpers to convert samples to SVG polyline points
  function samplesToPath(samples, ymin, ymax) {
    if (!samples || samples.length === 0) return '';
    const n = samples.length;
    return samples.map((s, i) => {
      const x = (i / (maxPoints - 1)) * width;
      // clamp s to ymin/ymax range
      const v = Math.max(Math.min(s, ymax), ymin);
      const y = height - ((v - ymin) / (ymax - ymin)) * height;
      return `${x},${y}`;
    }).join(' ');
  }

  // Heart rates typically 40-140
  const heartPath = samplesToPath(heartSamples, 40, 140);
  // Breath signal range -1..1
  const breathPath = samplesToPath(breathSamples, -1, 1);

  return (
    <div style={{border: '1px solid #ddd', padding: 8, width: width}}>
      <div style={{display: 'flex', justifyContent: 'space-between'}}>
        <div><strong>Heart (red)</strong></div>
        <div><strong>Breathing (blue)</strong></div>
      </div>
      <svg width={width} height={height} style={{background:'#fff'}}>
        {/* breathing sine (blue) - scaled to middle of chart */}
        <polyline
          points={breathPath}
          fill="none"
          stroke="#0077ff"
          strokeWidth={2}
          strokeOpacity={0.9}
        />

        {/* heart rate (red) */}
        <polyline
          points={heartPath}
          fill="none"
          stroke="#ff0033"
          strokeWidth={2}
          strokeOpacity={0.95}
        />
      </svg>
    </div>
  );
}
