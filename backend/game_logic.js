/**
 * Game Logic for Lie Detecting Hat
 * Advanced Financial & Risk Analysis Mode
 */

class GameLogic {
    constructor() {
        this.reset();
    }

    reset() {
        this.round = 1;
        this.scores = {
            hat_player_balance: 1000, // Capital One: Virtual Currency
            opponent_balance: 1000
        };
        this.currentStake = 50;
        this.status = 'active'; 
        this.history = [];
        this.lastAiData = null;
        
        // Financial Risk Metrics
        this.currentRiskScore = 0; // 0-100 (High Risk)
    }

    /**
     * Process new data from the Hat (Raspberry Pi)
     * @param {Object} aiData - { lie_probability: number, metrics: { presage, gemini } }
     */
    updateAiData(aiData) {
        this.lastAiData = aiData;
        
        // Calculate Dynamic Financial Risk Score
        // If High Stress (Presage) + Deceptive Language (Gemini) -> High Risk
        // This simulates a "Credit Risk" or "Insurance Fraud" risk model
        if (aiData.metrics) {
            const stress = aiData.metrics.presage.stress_index * 100;
            const lieProb = aiData.lie_probability;
            
            // Risk Algorithm
            this.currentRiskScore = (stress * 0.4) + (lieProb * 0.6);
        } else {
            // Fallback for legacy/simple data
            this.currentRiskScore = aiData.lie_probability || 0;
        }
    }

    /**
     * Handle a bet from the opponent (Loan Officer / Interrogator)
     * @param {string} bet - 'truth' (Approve) or 'lie' (Deny/Flag Fraud)
     */
    placeBet(bet) {
        if (!this.lastAiData) {
            return { error: "No data from hat yet" };
        }

        const risk = this.currentRiskScore;
        let actualOutcome = 'uncertain';

        // Thresholds
        if (risk >= 75) actualOutcome = 'lie';      // High Risk -> Likely Fraud
        else if (risk <= 40) actualOutcome = 'truth'; // Low Risk -> Safe
        else actualOutcome = 'uncertain';

        let result = {};

        // Financial Calculation
        // Dynamic payout based on risk? (Optional advanced feature)
        // For MVP: Fixed stake
        
        if (actualOutcome !== 'uncertain') {
            const won = (bet === actualOutcome);
            
            if (won) {
                // Opponent (Bank) correctly identified risk/safety
                this.scores.opponent_balance += this.currentStake;
                this.scores.hat_player_balance -= this.currentStake;
                result = { winner: 'opponent', message: `Correct! System Risk Score: ${Math.round(risk)}` };
            } else {
                // Opponent was wrong
                this.scores.hat_player_balance += this.currentStake;
                this.scores.opponent_balance -= this.currentStake;
                result = { winner: 'hat_player', message: `Wrong! System Risk Score: ${Math.round(risk)}` };
            }

            // Save to history (Audit Log)
            this.history.push({
                round: this.round,
                timestamp: Date.now(),
                risk_score: risk,
                metrics: this.lastAiData.metrics,
                bet: bet,
                outcome: actualOutcome,
                payout: this.currentStake
            });

            // Advance round
            this.round++;
            
            // Increase stakes dynamically (Capital One: High stakes banking)
            this.currentStake += 10; 
            
        } else {
            result = { winner: 'none', message: "Risk Analysis Inconclusive (40-75%). Audit Required." };
        }

        return {
            ...result,
            new_scores: this.scores,
            actual_outcome: actualOutcome,
            risk_score: risk
        };
    }
    
    getState() {
        return {
            round: this.round,
            scores: this.scores,
            currentStake: this.currentStake,
            status: this.status,
            riskScore: Math.round(this.currentRiskScore),
            lastAiData: this.lastAiData
        };
    }
}

module.exports = new GameLogic();
