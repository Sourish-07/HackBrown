/**
 * Game Logic for Lie Detecting Hat
 * Two-Player Mode with Wagering
 */

class GameLogic {
    constructor() {
        this.reset();
    }

    reset() {
        this.round = 1;
        this.gamePhase = 'waiting'; // waiting, wagering, statement, guessing, results
        // Roles will be assigned when players join. Start null until both joined.
        this.subjectPlayer = null; // who's wearing the hat (1 or 2)
        this.guesserPlayer = null; // who's guessing
        this.scores = {
            player_1_balance: 1000,
            player_2_balance: 1000
        };
        this.currentWager = 0;
        this.status = 'active'; 
        this.history = [];
        this.lastAiData = null;
        this.lastGuess = null;
        // Player connection tracking
        this.connectedPlayers = {}; // { 1: socketId, 2: socketId }
        this.joinOrder = [];
        // Always generate a new 4-digit numeric PIN on reset
        this.gamePin = this.generatePin();
        // Financial Risk Metrics
        this.currentRiskScore = 0; // 0-100
        console.log(`[Game] New game PIN: ${this.gamePin}`);
    }



    /**
     * Assign roles based on join order: first joiner = subject (hat), second = guesser
     */
    assignRolesFromJoinOrder() {
        if (this.joinOrder.length >= 2) {
            const first = this.joinOrder[0];
            const second = this.joinOrder[1];
            this.subjectPlayer = first;
            this.guesserPlayer = second;
            // Ensure gamePhase starts at wagering once roles set
            this.gamePhase = 'wagering';
        }
    }

    /**
     * Register a player connection by join order, using PIN
     */
    registerPlayer(socketId, pin) {
        if (pin !== this.gamePin) {
            return { success: false, message: 'Invalid PIN' };
        }
        // Assign player number by join order
        let playerId;
        if (this.joinOrder.length === 0) {
            playerId = 1;
        } else if (this.joinOrder.length === 1) {
            playerId = 2;
        } else {
            return { success: false, message: 'Game full' };
        }
        this.connectedPlayers[playerId] = socketId;
        this.joinOrder.push(playerId);
        console.log(`[Game] Player ${playerId} connected with PIN ${pin}`);
        return { success: true, playerId, message: 'Registered' };
    }

    /**
     * Check if both players are connected
     */
    bothPlayersConnected() {
        return this.joinOrder.length === 2;
    }
    /**
     * Get the current game PIN
     */
    getPin() {
        return this.gamePin;
    }
    /**
     * Generate a random 4-digit numeric PIN
     */
    generatePin() {
        return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    }

    /**
     * Set wager for current guesser
     */
    setWager(payload) {
        // payload can be a number or an object { amount, declared }
        let amount = typeof payload === 'number' ? payload : payload?.amount;
        const declared = typeof payload === 'object' ? payload.declared : undefined;
        const maxBalance = this.guesserPlayer === 1 ? this.scores.player_1_balance : this.scores.player_2_balance;
        if (amount > 0 && amount <= maxBalance) {
            this.currentWager = amount;
            if (declared) this.lastDeclared = declared; // 'truth' or 'lie'
            // Once wager and declared choice are set, move directly to guessing so the subject can make a guess
            this.gamePhase = 'guessing';
            return { success: true, wager: this.currentWager, declared: this.lastDeclared };
        }
        return { success: false, error: 'Invalid wager' };
    }

    /**
     * Process new data from the Hat (Raspberry Pi)
     */
    updateAiData(aiData) {
        this.lastAiData = aiData;
        
        if (aiData.metrics && aiData.metrics.presage) {
            const stress = aiData.metrics.presage.stress_index * 100;
            const lieProb = aiData.lie_probability;
            this.currentRiskScore = (stress * 0.4) + (lieProb * 0.6);
        } else {
            this.currentRiskScore = aiData.lie_probability || 0;
        }
    }

    /**
     * Subject player makes statement, move to guessing phase
     */
    startGuessing() {
        this.gamePhase = 'guessing';
        return { status: 'guessing_started', wager: this.currentWager };
    }

    /**
     * Guesser makes a guess (truth or lie)
     */
    makeGuess(guess) {
        this.lastGuess = guess;
        const risk = this.currentRiskScore;
        let actualOutcome = 'uncertain';

        if (risk >= 75) actualOutcome = 'lie';
        else if (risk <= 40) actualOutcome = 'truth';

        let result = {};

        if (actualOutcome !== 'uncertain') {
            const guessCorrect = (guess === actualOutcome);
            
            if (guessCorrect) {
                // Guesser wins
                if (this.guesserPlayer === 1) {
                    this.scores.player_1_balance += this.currentWager;
                    this.scores.player_2_balance -= this.currentWager;
                } else {
                    this.scores.player_2_balance += this.currentWager;
                    this.scores.player_1_balance -= this.currentWager;
                }
                result = { winner: `player_${this.guesserPlayer}`, message: `Player ${this.guesserPlayer} Correct!` };
            } else {
                // Subject wins
                if (this.guesserPlayer === 1) {
                    this.scores.player_2_balance += this.currentWager;
                    this.scores.player_1_balance -= this.currentWager;
                } else {
                    this.scores.player_1_balance += this.currentWager;
                    this.scores.player_2_balance -= this.currentWager;
                }
                result = { winner: `player_${this.subjectPlayer}`, message: `Player ${this.subjectPlayer} Correct!` };
            }

            this.history.push({
                round: this.round,
                timestamp: Date.now(),
                subject: this.subjectPlayer,
                guesser: this.guesserPlayer,
                wager: this.currentWager,
                guess: guess,
                outcome: actualOutcome,
                correct: guessCorrect,
                risk_score: risk,
                metrics: this.lastAiData ? this.lastAiData.metrics : null,
                statement_type: this.lastDeclared || null
            });

            this.gamePhase = 'results';
        } else {
            result = { winner: 'none', message: 'Inconclusive. Audit Required.' };
            this.gamePhase = 'results';
        }

        return {
            ...result,
            scores: this.scores,
            actual_outcome: actualOutcome,
            risk_score: Math.round(risk),
            wager: this.currentWager
        };
    }

    /**
     * Move to next round (swap roles)
     */
    nextRound() {
        [this.subjectPlayer, this.guesserPlayer] = [this.guesserPlayer, this.subjectPlayer];
        this.round++;
        this.currentWager = 0;
        this.lastGuess = null;
        this.currentRiskScore = 0;
        this.lastAiData = null;
        this.gamePhase = 'wagering';
        
        return { status: 'next_round', round: this.round, subject: this.subjectPlayer, guesser: this.guesserPlayer };
    }
    
    getState() {
        return {
            round: this.round,
            gamePhase: this.gamePhase,
            subjectPlayer: this.subjectPlayer,
            guesserPlayer: this.guesserPlayer,
            scores: this.scores,
            currentWager: this.currentWager,
            status: this.status,
            riskScore: Math.round(this.currentRiskScore),
            lastAiData: this.lastAiData,
            lastGuess: this.lastGuess,
            connectedPlayers: Object.keys(this.connectedPlayers).map(p => parseInt(p))
        };
    }
}

module.exports = new GameLogic();
