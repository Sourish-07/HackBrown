/**
 * Helper functions for formatting data
 */

/**
 * Formats the game state and AI data into a consistent JSON structure for the frontend.
 * 
 * @param {Object} gameState - Current state of the game (round, scores, etc.)
 * @param {Object} aiData - Data received from the Raspberry Pi (lie prob, facial analysis)
 * @param {Object} decision - Latest decision/bet info
 * @returns {Object} Formatted JSON object
 */
function formatBroadcastData(gameState, aiData, decision) {
    return {
        timestamp: Date.now(),
        round: gameState.round || 1,
        // Updated for Financial Track
        scores: gameState.scores || { hat_player_balance: 1000, opponent_balance: 1000 },
        
        // AI Data
        lie_probability: aiData ? aiData.lie_probability : 0,
        risk_score: gameState.riskScore || 0,
        // Support for new Metrics structure
        metrics: aiData ? aiData.metrics : {},
        facial_analysis: (aiData && aiData.metrics && aiData.metrics.presage) 
            ? aiData.metrics.presage.facial_emotions 
            : (aiData ? aiData.facial_analysis : {}),
        
        // Game Context
        stake: gameState.currentStake || 0,
        hat_decision: decision ? decision.type : null, 
        
        // Status
        game_status: gameState.status || 'waiting' 
    };
}

module.exports = {
    formatBroadcastData
};
