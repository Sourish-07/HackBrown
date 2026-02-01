import React, { useEffect, useState } from 'react';
import './QRDisplay.css';

export function QRDisplay({ gamePin }) {
  // Always display the backend-provided gamePin, fallback to '------' if missing
  const pin = gamePin && typeof gamePin === 'string' ? gamePin : '------';

  return (
    <div className="qr-display">
      <h2>Waiting for Players</h2>
      <div className="game-code-display">
        <div className="pin-label">Game Code</div>
        <div className="pin-code">{pin}</div>
        <p className="pin-instruction">Share this code with both players</p>
      </div>
      <div className="instructions">
        <h3>How to Join:</h3>
        <ol>
          <li>📱 Give each player a phone</li>
          <li>🔑 Tell them the Game Code above</li>
          <li>⌨️ They enter the code on their phone to join</li>
          <li>✅ Game starts when both players connect</li>
        </ol>
      </div>
    </div>
  );
}

export default QRDisplay;
