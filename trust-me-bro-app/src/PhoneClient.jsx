import React, { useState, useEffect } from 'react';
import { GameWebSocket } from './websocket';
import './PhoneClient.css';

export function PhoneClient() {
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState('waiting');
  const [wager, setWager] = useState('');
  const [wagerSubmitted, setWagerSubmitted] = useState(false);
  const [declaredChoice, setDeclaredChoice] = useState(null);
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [assignedPlayerId, setAssignedPlayerId] = useState(null);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(null);

  useEffect(() => {
    const socket = new GameWebSocket('ws://localhost:3000', (data) => {
      console.log('[Phone] Received:', data);
      if (data.type === 'INIT') {
        setGameState(data.data);
      } else if (data.type === 'PLAYER_ASSIGNED') {
        setAssignedPlayerId(data.playerId);
      } else if (data.type === 'PIN_ERROR') {
        setPinError(data.message);
      } else if (data.type === 'GAME_START') {
        setGameState(data.data);
        setPhase('wagering');
      } else if (data.type === 'PHASE_UPDATE') {
        setGameState(data.data);
        if (data.data.gamePhase === 'statement') {
          setPhase('statement');
          setWagerSubmitted(true);
        } else if (data.data.gamePhase === 'guessing') {
          setPhase('guessing');
        } else if (data.data.gamePhase === 'results') {
          setPhase('results');
        }
      } else if (data.type === 'COUNTDOWN') {
        setCountdownRemaining(data.data.seconds);
        setCountdownActive(true);
        if (typeof data.data.seconds === 'number' && data.data.seconds <= 0) {
          setCountdownActive(false);
        }
      } else if (data.type === 'RESULT') {
        setGameState(data.data);
        setPhase('results');
      } else if (data.type === 'NEXT_ROUND') {
        setGameState(data.data);
        setPhase('wagering');
        setWagerSubmitted(false);
        setWager('');
        setDeclaredChoice(null);
        setCountdownActive(false);
        setCountdownRemaining(null);
      }
    });
    socket.connect();
    setWs(socket);

    return () => {
      if (socket && socket.ws) socket.ws.close();
    };
  }, []);

  // Handle PIN submit
  const handlePinSubmit = (e) => {
    e.preventDefault();
    setPinError('');
    if (ws && ws.ws && pin.length === 4) {
      ws.ws.send(JSON.stringify({
        type: 'REGISTER',
        clientType: 'player',
        pin: pin
      }));
    } else {
      setPinError('Please enter the 4-digit code');
    }
  };

  if (!assignedPlayerId) {
    return (
      <div className="phone-connecting">
        <h2>Join Game</h2>
        <form onSubmit={handlePinSubmit} className="pin-form">
          <label htmlFor="pin-input">Enter Game Code:</label>
          <input
            id="pin-input"
            type="text"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            autoFocus
            className="pin-input"
          />
          <button type="submit" className="pin-submit">Join</button>
        </form>
        {pinError && <div className="pin-error">{pinError}</div>}
      </div>
    );
  }

    // If player is assigned but we haven't received the game state yet,
    // show a small connected/waiting message instead of a blank screen.
    if (assignedPlayerId && !gameState) {
      return (
        <div className="phone-connecting">
          <h2>Connected as Player {assignedPlayerId}</h2>
          <p>Waiting for game state...</p>
          <div className="robot-idle">🤖</div>
        </div>
      );
    }

  const pid = assignedPlayerId;
  const isSubject = gameState?.subjectPlayer === pid;
  const isGuesser = gameState?.guesserPlayer === pid;
  const balance = pid === 1 ? (gameState?.scores?.player_1_balance ?? 0) : (gameState?.scores?.player_2_balance ?? 0);

  // Determine if this player currently needs to take action
  const needsAction = (() => {
    if (!gameState) return false;
    const gp = gameState.gamePhase;
    if (gp === 'wagering' && isGuesser) return true; // place wager
    if (gp === 'statement' && isSubject) return true; // make statement / press ready
    if (gp === 'guessing' && isSubject) return true; // make the guess (hat-wearer guesses)
    return false;
  })();

  const handleWagerSubmit = () => {
    if (wager && ws) {
      setLoading(true);
      ws.ws.send(JSON.stringify({
        type: 'SET_WAGER',
        payload: parseInt(wager)
      }));
    }
  };

  const handleReadyStatement = () => {
    if (ws) {
      ws.ws.send(JSON.stringify({ type: 'READY_STATEMENT' }));
    }
  };

  const handleStartGuess = () => {
    if (ws) {
      ws.ws.send(JSON.stringify({ type: 'START_GUESS' }));
    }
  };

  const handleGuess = (guess) => {
    if (ws) {
      setLoading(true);
      ws.ws.send(JSON.stringify({
        type: 'MAKE_GUESS',
        payload: guess
      }));
    }
  };

  const handleNextRound = () => {
    if (ws) {
      ws.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));
    }
  };

  const handleSkipCountdown = () => {
    if (ws && ws.ws) {
      ws.ws.send(JSON.stringify({ type: 'SKIP_COUNTDOWN' }));
    }
  };

  return (
    <div className="phone-client">
      <header className="phone-header">
        <h1>TRUST ME BRO</h1>
        <p>Player {assignedPlayerId}</p>
        <p className="balance">Balance: ${balance}</p>
      </header>

      {countdownActive && (
        <div className="countdown-overlay">
          <p>Next round starts in {countdownRemaining}s</p>
          <button className="btn-skip" onClick={handleSkipCountdown}>Skip</button>
        </div>
      )}

      <div className="phone-content">
        {/* Wagering Phase - Suspect Only (choose declared truth/lie too) */}
        {phase === 'wagering' && isGuesser && (
          <div className="wagering-screen">
            <h2>Place Your Wager & Declare</h2>
            <p>You're the Suspect — select whether you'll tell the truth or lie when making your statement.</p>
            <div className="declare-row">
              <button
                type="button"
                className={`btn ${declaredChoice === 'truth' ? 'approve' : ''}`}
                onClick={() => setDeclaredChoice('truth')}
              >
                I will tell the TRUTH
              </button>
              <button
                type="button"
                className={`btn ${declaredChoice === 'lie' ? 'deny' : ''}`}
                onClick={() => setDeclaredChoice('lie')}
              >
                I will tell a LIE
              </button>
            </div>
            <input
              type="number"
              min="1"
              max={balance}
              value={wager}
              onChange={(e) => setWager(e.target.value)}
              placeholder={`Enter amount (max: $${balance})`}
              className="wager-input"
              disabled={wagerSubmitted}
            />
            <button
              className="btn-primary"
              onClick={() => {
                if (!declaredChoice) {
                  setPinError('Please select truth or lie');
                  return;
                }
                if (!wager) {
                  setPinError('Please enter a wager');
                  return;
                }
                setPinError('');
                setWagerSubmitted(true);
                if (ws && ws.ws) {
                  ws.ws.send(JSON.stringify({
                    type: 'SET_WAGER',
                    payload: { amount: parseInt(wager, 10), declared: declaredChoice }
                  }));
                }
              }}
              disabled={wagerSubmitted || loading}
            >
              {loading ? 'Submitting...' : 'Submit Wager & Declare'}
            </button>
            {wagerSubmitted && <p className="success">Wager set: ${wager}</p>}
          </div>
        )}

        {/* Statement phase no longer requires a button; subject will see guessing UI when wager is set */}

        {/* Guessing Phase - now shown to the Interrogator (hat wearer) */}
        {phase === 'guessing' && isSubject && (
          <div className="guessing-screen">
            <h2>Interrogator: Make Your Guess</h2>
            <p>Wager: ${gameState.currentWager}</p>
            <div className="guess-buttons">
              <button
                className="btn-truth"
                onClick={() => handleGuess('truth')}
                disabled={loading}
              >
                ✓ TRUTH
              </button>
              <button
                className="btn-lie"
                onClick={() => handleGuess('lie')}
                disabled={loading}
              >
                ✗ LIE
              </button>
            </div>
          </div>
        )}

        {/* Results Phase */}
        {phase === 'results' && (
          <div className="results-screen">
            <h2>Round Results</h2>
            <p className="message">{gameState.message || 'Round complete'}</p>
            <p className="outcome">Actual: <strong>{gameState.actual_outcome?.toUpperCase()}</strong></p>
            <p className="balances">
              P1: ${gameState.scores?.player_1_balance || 0} | P2: ${gameState.scores?.player_2_balance || 0}
            </p>
            <button
              className="btn-primary"
              onClick={handleNextRound}
              disabled={loading}
            >
              Next Round
            </button>
          </div>
        )}

        {/* Waiting for Other Player */}
        {phase === 'waiting' && (
          <div className="waiting-screen">
            <h2>Waiting for Other Player...</h2>
            <p>Connected players: {gameState.connectedPlayers?.length || 0}/2</p>
            {/* Show robot only if there is nothing required of this player */}
            {!needsAction && <div className="robot-idle">🤖</div>}
          </div>
        )}

        {/* Idle when not the active role */}
        {phase === 'wagering' && !isGuesser && (
          <div className="idle-screen">
            <h2>Waiting for Suspect to Place Wager</h2>
            {!needsAction && <div className="robot-idle">🤖</div>}
          </div>
        )}

        {phase === 'statement' && !isSubject && (
          <div className="idle-screen">
            <h2>Waiting for Subject to Finish Statement</h2>
            {!needsAction && <div className="robot-idle">🤖</div>}
          </div>
        )}

        {phase === 'guessing' && !isGuesser && (
          <div className="idle-screen">
            <h2>Waiting for Interrogator to Choose</h2>
            {!needsAction && <div className="robot-idle">🤖</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default PhoneClient;
