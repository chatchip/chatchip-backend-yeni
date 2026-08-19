const pool = require('../config/database');
const mlmEngine = require('./mlmEngine');

class BinaryService {
    
    // 📊 Haftalık binary eşleştirme
    async runWeeklyMatch() {
        console.log('🔄 Haftalık binary eşleştirme başlıyor...');
        const users = await pool.query('SELECT id FROM users');
        const results = [];
        
        for (const user of users.rows) {
            const result = await mlmEngine.runWeeklyMatch(user.id);
            results.push(result);
        }
        
        console.log('✅ Haftalık binary eşleştirme tamamlandı!');
        return results;
    }

    // 📊 Tek kullanıcı için eşleştirme
    async matchUser(userId) {
        return await mlmEngine.runWeeklyMatch(userId);
    }

    // 📊 Haftalık kazançları getir
    async getWeeklyEarnings(userId, limit = 10) {
        const result = await pool.query(`
            SELECT * FROM weekly_matches 
            WHERE user_id = $1 
            ORDER BY match_date DESC 
            LIMIT $2
        `, [userId, limit]);
        return result.rows;
    }
}

module.exports = new BinaryService();
