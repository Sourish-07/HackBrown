import React from 'react';
import { useNavigate } from 'react-router-dom';
import './landing.css';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-grid">
        <div className="landing-left">
          <div className="landing-title">
            <h1>TRUST ME BRO</h1>
            <p className="subtitle">High-stakes lie detection</p>
          </div>
          <div className="landing-card">
            <h2>How it works</h2>
            <ul>
              <li>Admin opens the big screen dashboard.</li>
              <li>Players join from phones with the game code.</li>
              <li>Subject speaks. Guesser bets. System scores risk.</li>
            </ul>
          </div>
        </div>

        <div className="landing-right">
          <div className="landing-actions">
            <button className="btn-admin" onClick={() => navigate('/admin')}>
              Open Admin Screen
            </button>
            <button className="btn-player" onClick={() => navigate('/player')}>
              Join as Player
            </button>
          </div>
          <div className="landing-foot">
            Use the same network for all devices.
          </div>
        </div>
      </div>
    </div>
  );
}
