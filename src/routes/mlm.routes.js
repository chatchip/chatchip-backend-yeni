const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const mlmEngine = require('../services/mlmEngine');

// 📊 MLM durumu
router.get('/status', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        console.log('📊 MLM status isteği - Kullanıcı ID:', userId);

        const user = await pool.query(`
            SELECT id, name, career_level, personal_purchases, kv, multiplier,
                   left_cv, right_cv, left_pv, right_pv, is_admin
            FROM users WHERE id = $1
        `, [userId]);
        
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        res.json({
            success: true,
            user: user.rows[0],
            message: 'MLM sistemi çalışıyor'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📊 Binary eşleştirme
router.post('/match', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const result = await mlmEngine.runWeeklyMatch(userId);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📊 Kariyer hesapla
router.post('/career', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        
        const leftPV = await mlmEngine.getLegPV(userId, 'left');
        const rightPV = await mlmEngine.getLegPV(userId, 'right');
        const newCareer = await mlmEngine.getCareer(leftPV, rightPV);
        const reward = await mlmEngine.getReward(newCareer);
        const kv = await mlmEngine.calculateKV(userId);
        const isActive = mlmEngine.isActive(kv);
        
        res.json({
            success: true,
            userId,
            leftPV,
            rightPV,
            career: newCareer,
            reward: isActive ? reward : 0,
            kv,
            isActive
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
