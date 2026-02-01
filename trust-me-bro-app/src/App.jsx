import React, { useState, useEffect } from 'react';
import { GameWebSocket } from './websocket';
import QRDisplay from './QRDisplay';
import './App.css';
// lazy import to avoid earlier bundling issues
const BiometricsLazy = React.lazy(() => import('./Biometrics'));

function App() {
  const [gameState, setGameState] = useState(null);
  const [betResult, setBetResult] = useState(null);
  const [ws, setWs] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gamePin, setGamePin] = useState('');
  const [displayedGuess, setDisplayedGuess] = useState(null);
  const [displayedSelection, setDisplayedSelection] = useState(null);
  const [showGuessAnim, setShowGuessAnim] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(null);

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
        // update wager on main; do NOT show declared choice
        setGameState(prev => ({ ...prev, currentWager: data.data.wager }));
      } else if (data.type === 'GUESS_MADE') {
        // Show the guess briefly with animation
        setDisplayedGuess(data.data.guess);
        setShowGuessAnim(true);
        setTimeout(() => setShowGuessAnim(false), 1200);
      } else if (data.type === 'COUNTDOWN') {
        setCountdownRemaining(data.data.seconds);
      } else if (data.type === 'PHASE_UPDATE' || data.type === 'BIOMETRICS_UPDATE') {
        setGameState(data.data);
      } else if (data.type === 'RESULT' || data.type === 'RESULT_PHASE') {
        setBetResult(data.data);
        setGameState(prev => ({ ...prev, ...data.data }));
        // clear displayed declared/guess after showing result
        setTimeout(() => {
          setDisplayedSelection(null);
          setDisplayedGuess(null);
        }, 2000);
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
      {countdownRemaining !== null && (
        <div className="main-countdown">Next round: {countdownRemaining}s</div>
      )}
      <header>
        <h1>TRUST ME BRO</h1>
        <p>a lying game</p>
        <div className="game-info">
          Round {gameState.round} | Player {subjectPlayer} Interrogator
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
              {metrics.gemini && metrics.gemini.reasoning && (
                <div>
                  <p><strong>AI Analysis:</strong> {metrics.gemini.reasoning}</p>
                  {metrics.gemini.tone_summary && (
                    <p><strong>Tone:</strong> {metrics.gemini.tone_summary}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Local biometrics component (camera + mic) */}
          <div>
            {/* lazy-load the component to avoid import cycles in some setups */}
              <React.Suspense fallback={<div style={{padding:8}}>Loading biometrics…</div>}>
              <BiometricsLazy presage={metrics.presage} />
            </React.Suspense>
          </div>
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
                {displayedGuess && showGuessAnim && (
                  <p className="guess-banner">Guess: <strong>{displayedGuess.toUpperCase()}</strong></p>
                )}
                {/* Subject selection is not shown; main shows the guess and then the result */}
                <p className="phase-text">
                  {gameState.gamePhase === 'wagering' && '⏳ Waiting for wager...'}
                  {gameState.gamePhase === 'statement' && '🎤 Subject making statement...'}
                  {gameState.gamePhase === 'guessing' && '🤔 Interrogator deciding...'}
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