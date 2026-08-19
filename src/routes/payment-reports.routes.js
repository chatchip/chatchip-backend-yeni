const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// 📊 Haftalık binary kazançları
router.get('/weekly-earnings', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let whereClause = '';
        const params = [];
        
        if (startDate) { 
            params.push(startDate); 
            whereClause += ` AND DATE(wm.match_date) >= $${params.length}`; 
        }
        if (endDate) { 
            params.push(endDate); 
            whereClause += ` AND DATE(wm.match_date) <= $${params.length}`; 
        }
        
        const result = await pool.query(`
            SELECT 
                wm.*, 
                u.name as user_name 
            FROM weekly_matches wm 
            JOIN users u ON wm.user_id = u.id 
            WHERE 1=1 ${whereClause} 
            ORDER BY wm.match_date DESC
        `, params);
        
        const total = await pool.query(`
            SELECT COALESCE(SUM(earned),0) as total 
            FROM weekly_matches wm 
            WHERE 1=1 ${whereClause}
        `, params);
        
        res.json({ 
            success: true, 
            data: result.rows, 
            summary: { 
                totalEarned: parseFloat(total.rows[0].total) || 0, 
                count: result.rows.length 
            } 
        });
    } catch (error) {
        console.error('❌ Haftalık kazançlar hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📊 Aylık kariyer ödülleri
router.get('/career-earnings', async (req, res) => {
    try {
        const { month, year } = req.query;
        let whereClause = '';
        const params = [];
        
        if (month && year) {
            const startDate = `${year}-${month}-01`;
            const endDate = `${year}-${month}-${new Date(year, month, 0).getDate()}`;
            params.push(startDate);
            params.push(endDate);
            whereClause += ` AND DATE(ch.calc_date) >= $${params.length - 1} AND DATE(ch.calc_date) <= $${params.length}`;
        }
        
        const result = await pool.query(`
            SELECT 
                ch.*, 
                u.name as user_name 
            FROM career_history ch 
            JOIN users u ON ch.user_id = u.id 
            WHERE ch.reward > 0 ${whereClause} 
            ORDER BY ch.calc_date DESC
        `, params);
        
        const total = await pool.query(`
            SELECT COALESCE(SUM(reward),0) as total 
            FROM career_history ch 
            WHERE ch.reward > 0 ${whereClause}
        `, params);
        
        res.json({ 
            success: true, 
            data: result.rows, 
            summary: { 
                totalRewards: parseFloat(total.rows[0].total) || 0, 
                count: result.rows.length 
            } 
        });
    } catch (error) {
        console.error('❌ Kariyer ödülleri hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// 📊 Kullanıcı bazında tüm kazançlar
router.get('/user-earnings/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Binary kazançlar
        const weeklyResult = await pool.query(`
            SELECT 
                'weekly' as type,
                earned as amount,
                match_date as date
            FROM weekly_matches
            WHERE user_id = $1
            ORDER BY match_date DESC
        `, [userId]);
        
        // Kariyer ödülleri
        const careerResult = await pool.query(`
            SELECT 
                'career' as type,
                reward as amount,
                calc_date as date,
                old_career,
                new_career
            FROM career_history
            WHERE user_id = $1 AND reward > 0
            ORDER BY calc_date DESC
        `, [userId]);
        
        // Toplam kazanç
        const totalResult = await pool.query(`
            SELECT 
                COALESCE(
                    (SELECT SUM(earned) FROM weekly_matches WHERE user_id = $1), 0
                ) + COALESCE(
                    (SELECT SUM(reward) FROM career_history WHERE user_id = $1 AND reward > 0), 0
                ) as total_earnings
        `, [userId]);
        
        res.json({
            success: true,
            userId: parseInt(userId),
            weeklyEarnings: weeklyResult.rows,
            careerEarnings: careerResult.rows,
            totalEarnings: parseFloat(totalResult.rows[0].total_earnings) || 0
        });
    } catch (error) {
        console.error('❌ Kullanıcı kazançları hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
