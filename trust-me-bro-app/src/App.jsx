import React, { useState, useEffect } from 'react';
import { GameWebSocket } from './websocket';
import QRDisplay from './QRDisplay';
import './App.css';

function App() {
  const [gameState, setGameState] = useState(null);
  const [betResult, setBetResult] = useState(null);
  const [ws, setWs] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gamePin, setGamePin] = useState('');

  useEffect(() => {
    const socket = new GameWebSocket('ws://localhost:3000', (data) => {
      console.log('[Main] Received:', data);
      if (data.type === 'INIT') {
        setGameState(data.data);
        if (data.data.gamePin) setGamePin(data.data.gamePin);
      } else if (data.type === 'GAME_PIN') {
        setGamePin(data.gamePin);
      } else if (data.type === 'GAME_START') {
        setGameState(data.data);
        setGameStarted(true);
      } else if (data.type === 'PLAYERS_UPDATE') {
        setGameState(data.data);
      } else if (data.type === 'WAGER_SET') {
        setGameState(prev => ({ ...prev, currentWager: data.data.wager }));
      } else if (data.type === 'PHASE_UPDATE' || data.type === 'BIOMETRICS_UPDATE') {
        setGameState(data.data);
      } else if (data.type === 'RESULT' || data.type === 'RESULT_PHASE') {
        setBetResult(data.data);
        setGameState(prev => ({ ...prev, ...data.data }));
      } else if (data.type === 'NEXT_ROUND') {
        setGameState(data.data);
        setBetResult(null);
      }
    });
    socket.connect();
    setWs(socket);
    setTimeout(() => {
      socket.ws.send(JSON.stringify({
        type: 'REGISTER',
        clientType: 'main',
        playerId: null
      }));
    }, 500);
    return () => {
      if (socket && socket.ws) socket.ws.close();
    };
  }, []);

  if (!gameState) {
    return (
      <div className="App connecting">
        <h1>TRUST ME BRO</h1>
        <p>⏳ Starting up...</p>
      </div>
    );
  }

  // Before game starts: show QR codes
  if (!gameStarted) {
    return (
      <div className="App">
        <header>
          <h1>TRUST ME BRO</h1>
          <p>a lying game</p>
        </header>

        <div className="waiting-split">
          {/* Left: Risk Score & Status */}
          <div className="waiting-left">
            <div className="risk-panel">
              <h2>Waiting on Biometrics</h2>
              <div className="status-icon">⏳</div>
              <p>Game will start when players join</p>
            </div>
          </div>

          {/* Right: Game PIN & Player Status */}
          <div className="waiting-right">
            <QRDisplay gamePin={gamePin} />
            <div className="player-status">
              <h3>Connected Players: {Object.keys(gameState.connectedPlayers || {}).length}/2</h3>
              {gameState.connectedPlayers?.[1] && <p className="connected">✓ Player 1</p>}
              {!gameState.connectedPlayers?.[1] && <p className="waiting">⏳ Player 1</p>}
              {gameState.connectedPlayers?.[2] && <p className="connected">✓ Player 2</p>}
              {!gameState.connectedPlayers?.[2] && <p className="waiting">⏳ Player 2</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Game in progress
  const riskScore = gameState.riskScore || 0;
  const riskLevel = riskScore >= 75 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
  const riskColor = riskScore >= 75 ? '#ff4444' : riskScore >= 40 ? '#ffaa00' : '#44aa44';
  const metrics = gameState.lastAiData?.metrics || {};

  const subjectPlayer = gameState.subjectPlayer || 1;

  return (
    <div className="App game-view">
      <header>
        <h1>TRUST ME BRO</h1>
        <p>a lying game</p>
        <div className="game-info">
          Round {gameState.round} | Player {subjectPlayer} Wearing Hat
        </div>
      </header>

      <div className="game-container">
        {/* Left: Risk Score & Biometrics */}
        <div className="risk-panel">
          <div className="risk-score-display" style={{ borderColor: riskColor }}>
            <h2>Risk Score</h2>
            <div className="score-number" style={{ color: riskColor }}>
              {riskScore}
            </div>
            <p className="risk-level" style={{ color: riskColor }}>
              {riskLevel} RISK
            </p>
          </div>

          {(metrics && Object.keys(metrics).length > 0) && (
            <div className="metrics">
              <h3>Live Biometrics</h3>
              {metrics.presage && (
                <div>
                  <p>Heart Rate: {metrics.presage.heart_rate ?? '—'} BPM</p>
                  <p>Stress Index: {typeof metrics.presage.stress_index === 'number' ? (metrics.presage.stress_index * 100).toFixed(1) + '%' : '—'}</p>
                </div>
              )}
              {metrics.gemini && metrics.gemini.reasoning && (
                <div>
                  <p><strong>AI Analysis:</strong> {metrics.gemini.reasoning}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Game Status & Wager */}
        <div className="financial-panel">
          <h3>Round {gameState.round}</h3>
          
          {/* Player Balances */}
          <div className="balances">
            <div className="balance-card player1" style={{ borderColor: '#00ff88' }}>
              <h4>Player 1</h4>
              <p className="balance-amount" style={{ color: '#00ff88' }}>${gameState.scores?.player_1_balance || 0}</p>
            </div>
            <div className="balance-card player2" style={{ borderColor: '#ff0044' }}>
              <h4>Player 2</h4>
              <p className="balance-amount" style={{ color: '#ff0044' }}>${gameState.scores?.player_2_balance || 0}</p>
            </div>
          </div>

          {/* Wager Display */}
          {gameState.currentWager > 0 && (
            <div className="wager-display">
              <p>Current Wager: <strong>${gameState.currentWager}</strong></p>
              <p className="phase-text">
                {gameState.gamePhase === 'wagering' && '⏳ Waiting for wager...'}
                {gameState.gamePhase === 'statement' && '🎤 Subject making statement...'}
                {gameState.gamePhase === 'guessing' && '🤔 Guesser deciding...'}
                {gameState.gamePhase === 'results' && '📊 Results...'}
              </p>
            </div>
          )}

          {/* Result Display */}
          {betResult && (
            <div className="bet-result" style={{
              borderColor: betResult.winner?.includes('player_1') ? '#00ff88' : '#ff0044'
            }}>
              <h3>{betResult.message}</h3>
              {betResult.actual_outcome && (
                <p>Actual: <strong>{betResult.actual_outcome.toUpperCase()}</strong></p>
              )}
              <p className="wager-result">Wager: ${betResult.wager}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;