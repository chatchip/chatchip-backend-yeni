const pool = require('../config/database');

class ChatHistory {
    static async create(data) {
        const { user_id, version, coach_type, message, response } = data;
        const result = await pool.query(
            `INSERT INTO chat_history (user_id, version, coach_type, message, response)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [user_id, version || '1.0', coach_type || 'mlm', message, response || '']
        );
        return result.rows[0];
    }

    static async findByUser(userId, limit = 20) {
        const result = await pool.query(
            `SELECT * FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    }
}

module.exports = ChatHistory;
