const pool = require('../config/database');
const {
    KV_MULTIPLIERS,
    CAREER_LEVELS,
    CAREER_REQUIREMENTS,
    CAREER_REWARDS,
    CAREER_ORDER,
    MIN_KV_FOR_ACTIVE,
    CONVERSION
} = require('../utils/constants');

class MLMEngine {
    
    getKvMultiplier(kv) {
        for (const rule of KV_MULTIPLIERS) {
            if (rule.max === null && kv >= rule.min) return rule.multiplier;
            if (kv >= rule.min && kv <= rule.max) return rule.multiplier;
        }
        return 0;
    }

    isActive(kv) {
        return kv >= MIN_KV_FOR_ACTIVE;
    }

    async calculateBranchCV(userId, leg) {
        const result = await pool.query(`
            WITH RECURSIVE branch AS (
                SELECT id, personal_cv 
                FROM users 
                WHERE sponsor_id = $1 AND position = $2
                UNION ALL
                SELECT u.id, u.personal_cv 
                FROM users u
                INNER JOIN branch b ON u.sponsor_id = b.id
            )
            SELECT COALESCE(SUM(personal_cv), 0) as total
            FROM branch
        `, [userId, leg]);
        return parseFloat(result.rows[0].total) || 0;
    }

    async calculateBranchPV(userId, leg) {
        const result = await pool.query(`
            WITH RECURSIVE branch AS (
                SELECT id, personal_pv 
                FROM users 
                WHERE sponsor_id = $1 AND position = $2
                UNION ALL
                SELECT u.id, u.personal_pv 
                FROM users u
                INNER JOIN branch b ON u.sponsor_id = b.id
            )
            SELECT COALESCE(SUM(personal_pv), 0) as total
            FROM branch
        `, [userId, leg]);
        return parseFloat(result.rows[0].total) || 0;
    }

    async calculateKV(userId) {
        const userResult = await pool.query(`
            SELECT kv FROM users WHERE id = $1
        `, [userId]);
        if (userResult.rows.length > 0 && userResult.rows[0].kv > 0) {
            return parseFloat(userResult.rows[0].kv) || 0;
        }
        const result = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM kv_history
            WHERE user_id = $1 
            AND earned_at >= NOW() - INTERVAL '1 year'
        `, [userId]);
        return parseFloat(result.rows[0].total) || 0;
    }

    async updateKV(userId, amount) {
        await pool.query(`
            INSERT INTO kv_history (user_id, amount, earned_at)
            VALUES ($1, $2, NOW())
        `, [userId, amount]);
        const totalKV = await this.calculateKV(userId);
        await pool.query(`
            UPDATE users SET kv = $1, kv_updated_at = NOW() WHERE id = $2
        `, [totalKV, userId]);
        return totalKV;
    }

    calculateBinaryEarnings(weakCV, multiplier) {
        return Math.round((weakCV * multiplier) * 100) / 100;
    }

    // ============================================================
    // 📊 KARİYER HESAPLA (DÜZELTİLMİŞ - HATASIZ!)
    // ============================================================
    evaluateCareer(leftPV, rightPV, counts) {
        const c = counts || {};
        
        const lg = c.greenDiamonds || 0;
        const rg = c.rightGreenDiamonds || 0;
        const lb = c.blueDiamonds || 0;
        const rb = c.rightBlueDiamonds || 0;
        const ld = c.diamonds || 0;
        const rd = c.rightDiamonds || 0;
        const le = c.emeralds || 0;
        const re = c.rightEmeralds || 0;
        const ll = c.leaders || 0;
        const rl = c.rightLeaders || 0;
        const ls = c.stars || 0;
        const rs = c.rightStars || 0;
        const lp = c.pioneers || 0;
        const rp = c.rightPioneers || 0;

        if (leftPV >= 1000 && rightPV >= 1000) {
            return CAREER_LEVELS.PIONEER;
        }
        if (lg >= 2 && rg >= 2) {
            return CAREER_LEVELS.RED_DIAMOND;
        }
        if (lb >= 2 && rb >= 2) {
            return CAREER_LEVELS.GREEN_DIAMOND;
        }
        if (ld >= 2 && rd >= 2) {
            return CAREER_LEVELS.BLUE_DIAMOND;
        }
        if (le >= 2 && re >= 2) {
            return CAREER_LEVELS.DIAMOND;
        }
        if (ll >= 2 && rl >= 2) {
            return CAREER_LEVELS.EMERALD;
        }
        if (ls >= 2 && rs >= 2) {
            return CAREER_LEVELS.LEADER;
        }
        if (lp >= 2 && rp >= 2) {
            return CAREER_LEVELS.STAR;
        }

        return CAREER_LEVELS.STARTER;
    }

    async getLegCareerCounts(userId) {
        const query = `
            WITH RECURSIVE leg_members AS (
                SELECT id, career_level, position
                FROM users 
                WHERE sponsor_id = $1
                UNION ALL
                SELECT u.id, u.career_level, u.position
                FROM users u
                INNER JOIN leg_members lm ON u.sponsor_id = lm.id
            )
            SELECT 
                COUNT(CASE WHEN position = 'left' AND career_level = 'Pioneer' THEN 1 END) as left_pioneers,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Pioneer' THEN 1 END) as right_pioneers,
                COUNT(CASE WHEN position = 'left' AND career_level = 'Star' THEN 1 END) as left_stars,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Star' THEN 1 END) as right_stars,
                COUNT(CASE WHEN position = 'left' AND career_level = 'Leader' THEN 1 END) as left_leaders,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Leader' THEN 1 END) as right_leaders,
                COUNT(CASE WHEN position = 'left' AND career_level = 'Emerald' THEN 1 END) as left_emeralds,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Emerald' THEN 1 END) as right_emeralds,
                COUNT(CASE WHEN position = 'left' AND career_level = 'Diamond' THEN 1 END) as left_diamonds,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Diamond' THEN 1 END) as right_diamonds,
                COUNT(CASE WHEN position = 'left' AND career_level = 'Blue Diamond' THEN 1 END) as left_blue_diamonds,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Blue Diamond' THEN 1 END) as right_blue_diamonds,
                COUNT(CASE WHEN position = 'left' AND career_level = 'Green Diamond' THEN 1 END) as left_green_diamonds,
                COUNT(CASE WHEN position = 'right' AND career_level = 'Green Diamond' THEN 1 END) as right_green_diamonds
            FROM leg_members
        `;
        const result = await pool.query(query, [userId]);
        const r = result.rows[0] || {};
        return {
            pioneers: parseInt(r.left_pioneers) || 0,
            rightPioneers: parseInt(r.right_pioneers) || 0,
            stars: parseInt(r.left_stars) || 0,
            rightStars: parseInt(r.right_stars) || 0,
            leaders: parseInt(r.left_leaders) || 0,
            rightLeaders: parseInt(r.right_leaders) || 0,
            emeralds: parseInt(r.left_emeralds) || 0,
            rightEmeralds: parseInt(r.right_emeralds) || 0,
            diamonds: parseInt(r.left_diamonds) || 0,
            rightDiamonds: parseInt(r.right_diamonds) || 0,
            blueDiamonds: parseInt(r.left_blue_diamonds) || 0,
            rightBlueDiamonds: parseInt(r.right_blue_diamonds) || 0,
            greenDiamonds: parseInt(r.left_green_diamonds) || 0,
            rightGreenDiamonds: parseInt(r.right_green_diamonds) || 0
        };
    }

    getCareerReward(career) {
        return CAREER_REWARDS[career] || 0;
    }

    getCareerRank(career) {
        return CAREER_ORDER.indexOf(career);
    }

    isHigherCareer(career1, career2) {
        return this.getCareerRank(career1) > this.getCareerRank(career2);
    }

    async runWeeklyMatch(userId) {
        const leftCV = await this.calculateBranchCV(userId, 'left');
        const rightCV = await this.calculateBranchCV(userId, 'right');
        const isLeftWeak = leftCV <= rightCV;
        const weakCV = Math.min(leftCV, rightCV);
        const strongCV = Math.max(leftCV, rightCV);
        if (weakCV === 0) {
            return { userId, matched: 0, weakLeg: isLeftWeak ? 'left' : 'right', status: 'no_match' };
        }
        const kv = await this.calculateKV(userId);
        const multiplier = this.getKvMultiplier(kv);
        if (!this.isActive(kv)) {
            await pool.query(`UPDATE users SET left_cv = 0, right_cv = 0 WHERE id = $1`, [userId]);
            return { userId, matched: 0, weakLeg: isLeftWeak ? 'left' : 'right', status: 'passive' };
        }
        const earnings = this.calculateBinaryEarnings(weakCV, multiplier);
        if (isLeftWeak) {
            await pool.query(`UPDATE users SET left_cv = 0, right_cv = right_cv - $1 WHERE id = $2`, [weakCV, userId]);
        } else {
            await pool.query(`UPDATE users SET right_cv = 0, left_cv = left_cv - $1 WHERE id = $2`, [weakCV, userId]);
        }
        await pool.query(`
            INSERT INTO weekly_matches (user_id, left_cv, right_cv, weak_leg, matched_amount, earned, match_date)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [userId, leftCV, rightCV, isLeftWeak ? 'left' : 'right', weakCV, earnings]);
        return {
            userId,
            leftCV,
            rightCV,
            weakLeg: isLeftWeak ? 'left' : 'right',
            matched: weakCV,
            remaining: strongCV - weakCV,
            earned: earnings,
            status: 'success'
        };
    }

    async getLegPV(userId, leg) {
        return await this.calculateBranchPV(userId, leg);
    }

    getReward(career) {
        return this.getCareerReward(career);
    }
}

module.exports = new MLMEngine();
