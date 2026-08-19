const pool = require('../config/database');

class User {
    static async findById(id) {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0];
    }

    static async findByEmail(email) {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0];
    }

    static async create(data) {
        const { name, email, phone, password_hash, sponsor_id, position } = data;
        const result = await pool.query(
            `INSERT INTO users (name, email, phone, password_hash, sponsor_id, position, career_level)
             VALUES ($1, $2, $3, $4, $5, $6, 'Starter')
             RETURNING id, name, email, career_level`,
            [name, email, phone, password_hash, sponsor_id || null, position || null]
        );
        return result.rows[0];
    }

    static async update(id, data) {
        const fields = Object.keys(data).map((key, i) => `${key} = $${i + 1}`).join(', ');
        const values = [...Object.values(data), id];
        const result = await pool.query(
            `UPDATE users SET ${fields}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
            values
        );
        return result.rows[0];
    }

    // 🔥 TREE - TÜM SÜTUNLAR GELİYOR
    static async getTree(userId) {
        const result = await pool.query(`
            WITH RECURSIVE tree AS (
                SELECT 
                    id, name, email, phone, sponsor_id, position, 
                    career_level, highest_career,
                    personal_purchases, left_cv, right_cv, left_pv, right_pv,
                    kv, plan_type, plan_started_at, plan_expires_at,
                    is_admin, created_at,
                    0 as depth
                FROM users WHERE id = $1
                UNION ALL
                SELECT 
                    u.id, u.name, u.email, u.phone, u.sponsor_id, u.position,
                    u.career_level, u.highest_career,
                    u.personal_purchases, u.left_cv, u.right_cv, u.left_pv, u.right_pv,
                    u.kv, u.plan_type, u.plan_started_at, u.plan_expires_at,
                    u.is_admin, u.created_at,
                    t.depth + 1
                FROM users u
                INNER JOIN tree t ON u.sponsor_id = t.id
            )
            SELECT * FROM tree ORDER BY depth, position
        `, [userId]);
        return result.rows;
    }

    static async getLegStats(userId, leg) {
        const result = await pool.query(`
            WITH RECURSIVE branch AS (
                SELECT id, personal_purchases FROM users WHERE sponsor_id = $1 AND position = $2
                UNION ALL
                SELECT u.id, u.personal_purchases FROM users u
                INNER JOIN branch b ON u.sponsor_id = b.id
            )
            SELECT COUNT(*) as count, COALESCE(SUM(personal_purchases), 0) as total
            FROM branch
        `, [userId, leg]);
        return {
            count: parseInt(result.rows[0].count) || 0,
            total: parseFloat(result.rows[0].total) || 0
        };
    }

    static async getAllUsers() {
        const result = await pool.query(`
            SELECT id, name, email, career_level, is_admin, created_at 
            FROM users 
            ORDER BY id
        `);
        return result.rows;
    }
}

module.exports = User;
