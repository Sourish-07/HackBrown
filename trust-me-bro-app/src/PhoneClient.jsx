import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { GameWebSocket } from './websocket';
import './PhoneClient.css';

export default function PhoneClient() {
  const { pin: urlPin } = useParams();
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState('join');
  const [wager, setWager] = useState('');
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState(urlPin || '');
  const [pinError, setPinError] = useState('');
  const [assignedPlayerId, setAssignedPlayerId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Waiting for input...');
  const [declared, setDeclared] = useState(null);
  const [countdownRemaining, setCountdownRemaining] = useState(null);
  const [actionNote, setActionNote] = useState('');

  useEffect(() => {
    const socket = new GameWebSocket(null, (data) => {
      console.log('[PhoneClient] WS message:', data);

      if (data.type === 'INIT') {
        setGameState(data.data);
        if (data.playerId) setAssignedPlayerId(data.playerId);
        setLoading(false);
        setPinError('');
        return;
      }
      if (data.type === 'PLAYER_ASSIGNED') {
        setAssignedPlayerId(data.playerId);
        setLoading(false);
        setPinError('');
        return;
      }
      if (data.type === 'PIN_ERROR') {
        setPinError(data.message || 'Invalid code');
        setLoading(false);
        return;
      }
      if (data.type === 'GAME_START' || data.type === 'PLAYERS_UPDATE' || data.type === 'PHASE_UPDATE' || data.type === 'NEXT_ROUND') {
        if (data.data) setGameState(data.data);
        if (data.type === 'NEXT_ROUND') setDeclared(null);
        return;
      }
      if (data.type === 'COUNTDOWN') {
        setCountdownRemaining(data.data.seconds);
        return;
      }
      if (data.type === 'RESULT' || data.type === 'RESULT_PHASE') {
        if (data.data) setGameState((prev) => ({ ...prev, ...data.data }));
        return;
      }
      if (data.type === 'DECLARED') {
        setDeclared(data.declared);
        setActionNote('Statement registered.');
      }
      if (data.type === 'ERROR') {
        setActionNote(data.message || 'Error');
      }
    });

    socket.connect();
    setWs(socket);

    return () => {
      socket.ws?.close();
    };
  }, []);

  useEffect(() => {
    if (gameState?.gamePhase) setPhase(gameState.gamePhase);
  }, [gameState?.gamePhase]);

  useEffect(() => {
    if (urlPin && ws && !loading && !assignedPlayerId) {
      setPin(urlPin);
      handlePinSubmit({ preventDefault: () => {} });
    }
  }, [urlPin, ws]);

  const role = useMemo(() => {
    if (!gameState || !assignedPlayerId) return null;
    if (gameState.subjectPlayer === assignedPlayerId) return 'subject';
    if (gameState.guesserPlayer === assignedPlayerId) return 'guesser';
    return 'spectator';
  }, [gameState, assignedPlayerId]);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pin.length !== 4 || loading || !ws?.ws) return;

    setLoading(true);
    setPinError('');
    setConnectionStatus('Connecting to game...');

    ws.sendMessage({
      type: 'REGISTER',
      clientType: 'player',
      pin: pin
    });
  };

  const handleWagerSubmit = () => {
    const amount = Number(wager);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionNote('Enter a valid wager amount.');
      return;
    }
    ws?.sendMessage({
      type: 'SET_WAGER',
      payload: { amount }
    });
    setActionNote('Wager sent.');
    setWager('');
  };

  const handleGuess = (guess) => {
    ws?.sendMessage({
      type: 'MAKE_GUESS',
      payload: guess
    });
    setActionNote('Guess submitted.');
  };

  const handleDeclare = (value) => {
    ws?.sendMessage({
      type: 'DECLARE_STATEMENT',
      payload: { declared: value }
    });
  };

  const handleSkipCountdown = () => {
    ws?.sendMessage({ type: 'SKIP_COUNTDOWN' });
  };

  if (!assignedPlayerId) {
    return (
      <div className="phone-client">
        <div className="overlay-content">
          <header className="phone-header">
            <h1>TRUST ME BRO</h1>
            <p>Enter 4-digit game code</p>
          </header>

          <form onSubmit={handlePinSubmit} className="join-form">
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="----"
              maxLength={4}
              autoFocus
              disabled={loading}
            />
            <button type="submit" disabled={loading || pin.length !== 4}>
              {loading ? 'Connecting...' : 'Join Game'}
            </button>
            {pinError && <p className="error">{pinError}</p>}
            <p className="status-text">{connectionStatus}</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-client">
      <div className="overlay-content game-active">
        <div className="player-header">
          <h2>Player {assignedPlayerId}</h2>
          <p className="role-tag">{role ? role.toUpperCase() : 'LOADING'}</p>
          <p className="phase-tag">Phase: {phase.toUpperCase()}</p>
        </div>

        {countdownRemaining !== null && (
          <div className="countdown-banner">
            Next round in {countdownRemaining}s
            <button type="button" onClick={handleSkipCountdown}>Skip</button>
          </div>
        )}

        {role === 'guesser' && phase === 'wagering' && (
          <div className="action-panel">
            <label>Set your wager</label>
            <input
              type="number"
              placeholder="Wager amount"
              value={wager}
              onChange={(e) => setWager(e.target.value)}
            />
            <button type="button" onClick={handleWagerSubmit}>Place Wager</button>
          </div>
        )}

        {role === 'subject' && phase === 'wagering' && (
          <div className="action-panel">
            <label>Declare your intent (private)</label>
            <div className="choice-row">
              <button type="button" onClick={() => handleDeclare('truth')}>Truth</button>
              <button type="button" onClick={() => handleDeclare('lie')}>Lie</button>
            </div>
            <p className="mini-note">{declared ? `Declared: ${declared.toUpperCase()}` : 'Optional - for audit logs only.'}</p>
          </div>
        )}

        {role === 'guesser' && phase === 'guessing' && (
          <div className="action-panel">
            <label>Make your guess</label>
            <div className="choice-row">
              <button type="button" onClick={() => handleGuess('truth')}>Truth</button>
              <button type="button" onClick={() => handleGuess('lie')}>Lie</button>
            </div>
          </div>
        )}

        {(role === 'subject' && phase === 'guessing') && (
          <div className="action-panel">
            <label>Waiting for guess...</label>
            <p className="mini-note">Hold steady while the system analyzes.</p>
          </div>
        )}

        {phase === 'results' && (
          <div className="action-panel">
            <label>Round complete</label>
            <p className="mini-note">Awaiting next round.</p>
          </div>
        )}

        {actionNote && <p className="status-text">{actionNote}</p>}
      </div>
    </div>
  );
}
