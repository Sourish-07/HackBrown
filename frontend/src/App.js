import React, { useState, useEffect } from 'react';
import { GameWebSocket } from './websocket';
// import { LieMeter } from './components/LieMeter'; // Placeholder

function App() {
  const [gameState, setGameState] = useState(null);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const socket = new GameWebSocket('ws://localhost:3000', (data) => {
      if (data.type === 'UPDATE' || data.type === 'INIT' || data.type === 'BET_RESULT') {
        setGameState(data.data);
      }
    });
    socket.connect();
    setWs(socket);
  }, []);

  const handleBet = (type) => {
    if (ws) ws.sendBet(type);
  };

  if (!gameState) return <div>Connecting...</div>;

  return (
    <div className="App">
      <h1>Lie Detecting Hat - Financial Risk Analysis</h1>
      
      <div className="meter-section">
        <h2>Risk Score: {gameState.risk_score} / 100</h2>
        <h3>Lie Probability: {gameState.lie_probability}%</h3>
        {/* Visual Meter Component would go here */}
      </div>

      <div className="game-section">
        <h3>Round: {gameState.round} | Stake: ${gameState.stake}</h3>
        <div className="scores">
            <p>Applicant Balance: ${gameState.scores.hat_player_balance}</p>
            <p>Bank Balance: ${gameState.scores.opponent_balance}</p>
        </div>
        
        <div className="controls">
          <button onClick={() => handleBet('truth')}>Approve (Truth)</button>
          <button onClick={() => handleBet('lie')}>Deny (Risk/Lie)</button>
        </div>

        {gameState.hat_decision && (
            <div className="result">
                Last Decision: {gameState.hat_decision}
            </div>
        )}
      </div>
      
      <div className="debug">
        <h4>Live Biometrics (Presage):</h4>
        <pre>
            HR: {gameState.metrics?.presage?.heart_rate || '--'} BPM <br/>
            Stress: {gameState.metrics?.presage?.stress_index || '--'} <br/>
        </pre>
        <h4>AI Analysis (Gemini):</h4>
        <p>{gameState.metrics?.gemini?.reasoning || 'Waiting for statement...'}</p>
      </div>
    </div>
  );
}

export default App;
