import React, { useState, useEffect, Suspense } from 'react';
import { GameWebSocket } from './websocket';
import './App.css';
const Biometrics = React.lazy(() => import('./components/Biometrics'));

function App() {
  const [gameState, setGameState] = useState(null);
  const [betResult, setBetResult] = useState(null);
  const [ws, setWs] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gamePin, setGamePin] = useState('');
  const [displayedGuess, setDisplayedGuess] = useState(null);
  const [showGuessAnim, setShowGuessAnim] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(null);
  const [connectionNote, setConnectionNote] = useState('Connecting to backend...');

  useEffect(() => {
    const socket = new GameWebSocket(null, (data) => {
      console.log('[Main] Received:', data);
      if (data.type === 'INIT') {
        setGameState(data.data);
        if (data.data?.gamePin) setGamePin(data.data.gamePin);
        setConnectionNote('Connected');
        return;
      }
      if (data.type === 'GAME_PIN') {
        setGamePin(data.gamePin);
        return;
      }
      if (data.type === 'GAME_RESET') {
        setGameState(data.data);
        setBetResult(null);
        if (data.data?.gamePin) setGamePin(data.data.gamePin);
        setCountdownRemaining(null);
        setDisplayedGuess(null);
        return;
      }
      if (data.type === 'GAME_START') {
        setGameState(data.data);
        setGameStarted(true);
        return;
      }
      if (data.type === 'PLAYERS_UPDATE' || data.type === 'PHASE_UPDATE' || data.type === 'BIOMETRICS_UPDATE' || data.type === 'NEXT_ROUND') {
        if (data.data) setGameState(data.data);
        if (data.type === 'NEXT_ROUND') setBetResult(null);
        return;
      }
      if (data.type === 'WAGER_SET') {
        setGameState((prev) => ({ ...prev, currentWager: data.data.wager }));
        return;
      }
      if (data.type === 'GUESS_MADE') {
        setDisplayedGuess(data.data.guess);
        setShowGuessAnim(true);
        setTimeout(() => setShowGuessAnim(false), 1500);
        return;
      }
      if (data.type === 'COUNTDOWN') {
        setCountdownRemaining(data.data.seconds);
        return;
      }
      if (data.type === 'RESULT' || data.type === 'RESULT_PHASE') {
        setBetResult(data.data);
        setGameState((prev) => ({ ...prev, ...data.data }));
        setTimeout(() => setDisplayedGuess(null), 3000);
      }
    });

    socket.connect();
    setWs(socket);

    const registerTimer = setTimeout(() => {
      socket.sendMessage({
        type: 'REGISTER',
        clientType: 'main'
      });
    }, 300);

    return () => {
      clearTimeout(registerTimer);
      socket.ws?.close();
    };
  }, []);

  useEffect(() => {
    const connected = (gameState?.connectedPlayers?.length || 0) >= 2;
    if (connected && !gameStarted) setGameStarted(true);
    if (!connected && gameStarted) setGameStarted(false);
  }, [gameState, gameStarted]);

  if (!gameState) {
    return (
      <div className="App connecting">
        <h1>TRUST ME BRO</h1>
        <p className="blink">{connectionNote}</p>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="App">
        <header>
          <h1>TRUST ME BRO</h1>
          <p>Lie detection - high stakes</p>
        </header>

        <div className="waiting-split">
          <div className="waiting-left">
            <div className="risk-panel">
              <h2>Biometric Sync</h2>
              <div className="status-icon pulse">[SYNC]</div>
              <p>Awaiting player connection</p>
            </div>
          </div>

          <div className="waiting-right">
            <div className="code-big">
              <h2>GAME CODE</h2>
              <div className="pin-display">{gamePin || '----'}</div>
              <p className="pin-note">
                Tell players to go to:
                <span className="pin-url">{window.location.origin}/player</span>
              </p>
            </div>

            <div className="player-status">
              <h3>Neural Interfaces</h3>
              <p className={gameState.connectedPlayers?.[1] ? 'connected' : 'waiting'}>
                {gameState.connectedPlayers?.[1] ? 'Player 1 synced' : 'Waiting on Player 1'}
              </p>
              <p className={gameState.connectedPlayers?.[2] ? 'connected' : 'waiting'}>
                {gameState.connectedPlayers?.[2] ? 'Player 2 synced' : 'Waiting on Player 2'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const riskScore = gameState.riskScore || 0;
  const riskLevel = riskScore >= 75 ? 'CRITICAL' : riskScore >= 40 ? 'ELEVATED' : 'NOMINAL';
  const riskColor = riskScore >= 75 ? '#ff0044' : riskScore >= 40 ? '#ffaa00' : '#00ff88';
  const metrics = gameState.lastAiData?.metrics || {};
  const subjectPlayer = gameState.subjectPlayer || 1;
  const guesserPlayer = gameState.guesserPlayer || 2;

  return (
    <div className="App game-view">
      {countdownRemaining !== null && (
        <div className="countdown-main pulse-glow">
          Neural reset in {countdownRemaining}s
        </div>
      )}
      <header>
        <h1>TRUST ME BRO</h1>
        <p>Round {gameState.round} | Subject: Player {subjectPlayer} | Guesser: Player {guesserPlayer}</p>
      </header>
      <div className="game-container">
        <div className="risk-panel">
          <div className="risk-score-display" style={{ borderColor: riskColor, boxShadow: `0 0 30px ${riskColor}40` }}>
            <h2>RISK LEVEL</h2>
            <div className="score-number pulse-glow" style={{ color: riskColor }}>
              {riskScore}
            </div>
            <p className="risk-level" style={{ color: riskColor }}>{riskLevel}</p>
          </div>
          {Object.keys(metrics).length > 0 && (
            <div className="metrics scan-border">
              <h3>Sensor Feed</h3>
              {metrics.presage && (
                <p>HR: {metrics.presage.heart_rate || '--'} bpm | Stress: {metrics.presage.stress_index?.toFixed(2) || '--'} | Breathing: {metrics.presage.breathing_rate || '--'}</p>
              )}
              {metrics.gemini?.reasoning && (
                <p className="ai-reason">AI: {metrics.gemini.reasoning}</p>
              )}
            </div>
          )}
          <Suspense fallback={<div className="loading">Sensor initializing...</div>}>
            <Biometrics presage={metrics.presage} />
          </Suspense>
        </div>

        <div className="financial-panel">
          <h3>Economy Node</h3>
          <div className="balances">
            <div className="balance-card player" style={{ borderColor: '#00ff88' }}>
              <h4>P1</h4>
              <div className="balance-amount">${gameState.scores?.player_1_balance || 0}</div>
            </div>
            <div className="balance-card opponent" style={{ borderColor: '#ff0044' }}>
              <h4>P2</h4>
              <div className="balance-amount">${gameState.scores?.player_2_balance || 0}</div>
            </div>
          </div>

          {gameState.currentWager > 0 && (
            <div className="wager-display scan-border">
              <p>Wager Active: <strong>${gameState.currentWager}</strong></p>
              {displayedGuess && showGuessAnim && (
                <p className="guess-banner fade-pop">Declared: <strong>{displayedGuess.toUpperCase()}</strong></p>
              )}
              <p className="phase-text glow">
                {gameState.gamePhase === 'wagering' && 'Awaiting wager...'}
                {gameState.gamePhase === 'statement' && 'Statement phase active'}
                {gameState.gamePhase === 'guessing' && 'Guesser analyzing...'}
                {gameState.gamePhase === 'results' && 'Result processing...'}
              </p>
            </div>
          )}

          <div className="decision-buttons processing">
            <button className="btn approve" disabled>
              Controls on phones
            </button>
            <button className="btn deny" disabled>
              Waiting for players
            </button>
          </div>

          {betResult && (
            <div className="bet-result fade-in" style={{
              borderColor: betResult.winner?.includes('player_1') ? '#00ff88' : '#ff0044',
              boxShadow: `0 0 25px ${betResult.winner?.includes('player_1') ? '#00ff8840' : '#ff004440'}`
            }}>
              <h3>{betResult.message}</h3>
              {betResult.actual_outcome && <p>Truth: <strong>{betResult.actual_outcome.toUpperCase()}</strong></p>}
              <p>Wager Outcome: ${betResult.wager || 0}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
