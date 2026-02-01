import React, { useState, useEffect } from 'react';
import { GameWebSocket } from './websocket';
import './App.css';

function App() {
  const [gameState, setGameState] = useState(null);
  const [betResult, setBetResult] = useState(null);
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const socket = new GameWebSocket('ws://localhost:3000', (data) => {
      console.log('Received from backend:', data);
      
      if (data.type === 'INIT') {
        setGameState(data.data);
        setBetResult(null);
      } else if (data.type === 'UPDATE') {
        setGameState(data.data);
      } else if (data.type === 'BET_RESULT') {
        setBetResult(data.data);
        setGameState(data.state);
        setLoading(false);
      }
    });
    socket.connect();
    setWs(socket);

    return () => {
      if (socket && socket.ws) {
        socket.ws.close();
      }
    };
  }, []);

  const handleBet = (type) => {
    if (ws) {
      setLoading(true);
      ws.sendBet(type);
    }
  };

  if (!gameState) {
    return (
      <div className="App connecting">
        <h1>Lie Detecting Hat</h1>
        <p>Connecting to backend...</p>
      </div>
    );
  }

  // map backend broadcast fields to local variables
  const riskScore = typeof gameState.risk_score !== 'undefined' ? gameState.risk_score : (gameState.riskScore || 0);
  const lieProbability = typeof gameState.lie_probability !== 'undefined' ? gameState.lie_probability : 0;
  const roundNum = gameState.round || 1;
  const stake = gameState.stake || gameState.currentStake || 0;
  const scores = gameState.scores || { hat_player_balance: 0, opponent_balance: 0 };
  const metrics = gameState.metrics || {};

  const riskLevel = riskScore >= 75 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';
  const riskColor = riskScore >= 75 ? '#ff4444' : riskScore >= 40 ? '#ffaa00' : '#44aa44';

  return (
    <div className="App">
      <header>
        <h1>🎩 Lie Detecting Hat - Financial Risk Analysis</h1>
        <p>Advanced Biometric & AI-Driven Credit Risk Assessment</p>
      </header>

      <div className="game-container">
        {/* Risk Assessment Panel */}
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
                  <p>💓 Heart Rate: {metrics.presage.heart_rate ?? '—'} BPM</p>
                  <p>📊 Stress Index: {typeof metrics.presage.stress_index === 'number' ? (metrics.presage.stress_index * 100).toFixed(1) + '%' : '—'}</p>
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

        {/* Financial Panel */}
        <div className="financial-panel">
          <h3>Round {roundNum} | Current Stake: ${stake}</h3>
          
          <div className="balances">
            <div className="balance-card player">
              <h4>Your Balance</h4>
              <p className="balance-amount">${scores.hat_player_balance}</p>
            </div>
            <div className="balance-card opponent">
              <h4>Bank Balance</h4>
              <p className="balance-amount">${scores.opponent_balance}</p>
            </div>
          </div>

          {/* Decision Buttons */}
          <div className="decision-buttons">
            <button 
              className="btn approve"
              onClick={() => handleBet('truth')}
              disabled={loading}
            >
              ✓ APPROVE (Truth)
            </button>
            <button 
              className="btn deny"
              onClick={() => handleBet('lie')}
              disabled={loading}
            >
              ✗ DENY (Fraud)
            </button>
          </div>

          {/* Result Display */}
          {betResult && (
            <div className={`bet-result ${betResult.winner}`}>
              <h3>{betResult.message}</h3>
              {betResult.actual_outcome && (
                <p>Actual Outcome: <strong>{betResult.actual_outcome.toUpperCase()}</strong></p>
              )}
              {betResult.new_scores && (
                <p>Your Balance: ${betResult.new_scores.hat_player_balance} | Bank: ${betResult.new_scores.opponent_balance}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;