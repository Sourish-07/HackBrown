import React, { useState, useEffect } from 'react';
import { GameWebSocket } from './websocket';

function App() {
  const [gameState, setGameState] = useState(null);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const socket = new GameWebSocket('ws://localhost:3001', (data) => {
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

      <h2>Risk Score:  {gameState.risk_score} / 100</h2>
      <h3>Lie Probability: {gameState.lie_probability}%</h3>

      <h3>Round: {gameState.round} | Stake: ${gameState.stake}</h3>

      <p>Applicant Balance: ${gameState.scores.hat_player_balance}</p>
      <p>Bank Balance: ${gameState.scores.opponent_balance}</p>

      <button onClick={() => handleBet('truth')}>Approve</button>
      <button onClick={() => handleBet('lie')}>Deny</button>

      <p>Last Decision: {gameState.hat_decision}</p>
    </div>
  );
}

export default App;
