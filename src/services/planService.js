const pool = require('../config/database');

class PlanService {
    
    // 🔥 Kullanıcının planını güncelle
    async updateUserPlan(userId, planName) {
        let cleanPlan = planName;
        if (planName.includes('Lite')) cleanPlan = 'Lite';
        else if (planName.includes('Plus')) cleanPlan = 'Plus';
        else if (planName.includes('Pro')) cleanPlan = 'Pro';
        else if (planName.includes('Coach')) cleanPlan = 'Coach.AI';
        
        await pool.query(
            'UPDATE users SET plan_type = $1, plan_started_at = NOW() WHERE id = $2',
            [cleanPlan, userId]
        );
        
        return { success: true, plan: cleanPlan };
    }

    // 🔥 Kullanıcının planını getir
    async getUserPlan(userId) {
        const result = await pool.query(
            'SELECT plan_type, plan_started_at, plan_expires_at FROM users WHERE id = $1',
            [userId]
        );
        if (result.rows.length === 0) return null;
        
        const data = result.rows[0];
        const now = new Date();
        const expires = new Date(data.plan_expires_at);
        
        return {
            type: data.plan_type || 'free',
            startedAt: data.plan_started_at,
            expiresAt: data.plan_expires_at,
            isExpired: now > expires,
            remainingHours: Math.max(0, Math.floor((expires - now) / (1000 * 60 * 60))),
            remainingMinutes: Math.max(0, Math.floor(((expires - now) % (1000 * 60 * 60)) / (1000 * 60)))
        };
    }

    // 🔥 Plan süresini uzat
    async extendPlan(userId, duration) {
        const now = new Date();
        let expiresAt;
        
        switch(duration) {
            case 'monthly': expiresAt = new Date(now.setMonth(now.getMonth() + 1)); break;
            case 'quarterly': expiresAt = new Date(now.setMonth(now.getMonth() + 3)); break;
            case 'yearly': expiresAt = new Date(now.setFullYear(now.getFullYear() + 1)); break;
            default: expiresAt = new Date(now.setMonth(now.getMonth() + 1));
        }
        
        await pool.query(`
            UPDATE users SET plan_expires_at = $1, plan_started_at = NOW() WHERE id = $2
        `, [expiresAt, userId]);
        
        return { success: true, expiresAt };
    }
}

module.exports = new PlanService();
