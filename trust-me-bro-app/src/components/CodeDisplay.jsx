// src/components/CodeDisplay.jsx
import React from 'react';
import QRCode from 'react-qr-code'; // New import for QR codes
import './CodeDisplay.css';

export default function CodeDisplay({ gamePin }) {
  const pin = gamePin && gamePin.length === 4 ? gamePin : '----';
  const isLoading = pin === '----';
  const baseUrl = window.location.origin; // Dynamic for dev/prod
  const playerUrl = `${baseUrl}/?player&pin=${pin}`; // Embed pin for auto-join

  return (
    <div className="qr-display">
      <h2>Player Connect</h2>
      <div className="qr-container">
        <div className="qr-card player1">
          <h3>Player 1</h3>
          {isLoading ? (
            <div className="qr-loading">Generating...</div>
          ) : (
            <div className="qr-code">
              <QRCode value={playerUrl} size={180} />
            </div>
          )}
          <p>Scan to join as Player 1</p>
        </div>
        <div className="qr-card player2">
          <h3>Player 2</h3>
          {isLoading ? (
            <div className="qr-loading">Generating...</div>
          ) : (
            <div className="qr-code">
              <QRCode value={playerUrl} size={180} />
            </div>
          )}
          <p>Scan to join as Player 2</p>
        </div>
      </div>
      <div className="instructions">
        <p>Game Code: <strong>{pin}</strong></p>
        <p>Enter this 4-digit code on your phone to join if not scanning.</p>
      </div>
    </div>
  );
}