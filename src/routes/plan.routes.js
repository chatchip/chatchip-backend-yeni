const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// 📊 Kullanıcının plan bilgisini getir
router.get('/status', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        
        const result = await pool.query(`
            SELECT plan_type, plan_started_at, plan_expires_at 
            FROM users WHERE id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        
        const user = result.rows[0];
        const now = new Date();
        const expires = new Date(user.plan_expires_at);
        const isExpired = now > expires;
        const remainingHours = Math.max(0, Math.floor((expires - now) / (1000 * 60 * 60)));
        const remainingMinutes = Math.max(0, Math.floor(((expires - now) % (1000 * 60 * 60)) / (1000 * 60)));
        
        // 🔥 Bitiş tarihini formatla
        const expiresFormatted = expires.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        res.json({
            success: true,
            plan: {
                type: user.plan_type,
                startedAt: user.plan_started_at,
                expiresAt: user.plan_expires_at,
                expiresFormatted: expiresFormatted,
                isExpired: isExpired,
                remainingHours: remainingHours,
                remainingMinutes: remainingMinutes,
                isActive: !isExpired && user.plan_type !== 'expired'
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔄 Plan yenile (satın alma sonrası)
router.post('/renew', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { planType, duration } = req.body;
        
        let expiresAt;
        const now = new Date();
        
        switch(duration) {
            case '24h':
                expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
            case 'monthly':
                expiresAt = new Date(now.setMonth(now.getMonth() + 1));
                break;
            case 'yearly':
                expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
                break;
            default:
                expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }
        
        await pool.query(`
            UPDATE users 
            SET plan_type = $1, 
                plan_started_at = NOW(), 
                plan_expires_at = $2
            WHERE id = $3
        `, [planType || 'free', expiresAt, userId]);
        
        res.json({
            success: true,
            message: 'Plan yenilendi!',
            expiresAt: expiresAt
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
