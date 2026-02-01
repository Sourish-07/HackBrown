import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';

export default function ThreeBackground() {
  const pointsRef = useRef();
  const lineRef = useRef();

  // Dummy chart data: simulated "neural waves" (array of points for 3D line)
  const chartPoints = Array.from({ length: 50 }, (_, i) => new THREE.Vector3(i / 5, Math.sin(i / 5) * 2 + Math.random() * 0.5, 0));

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.1; // Slow rotate particles
    }
    if (lineRef.current) {
      lineRef.current.rotation.z += delta * 0.05; // Animate chart wave
    }
  });

  return (
    <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} color="#00ff88" />
      <Grid args={[20, 20]} position={[0, -5, 0]} cellColor="#00ff88" sectionColor="#00ffff" fadeDistance={30} />
      <Points ref={pointsRef} limit={5000} range={20}>
        <PointMaterial transparent color="#00ff88" size={0.05} sizeAttenuation depthWrite={false} />
      </Points>
      <Line ref={lineRef} points={chartPoints} color="#ff0044" lineWidth={2} position={[-5, 0, -5]} />
    </Canvas>
  );
}