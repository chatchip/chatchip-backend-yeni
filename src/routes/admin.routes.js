const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const adminAuth = require('../middleware/adminAuth');

router.use(adminAuth);

// 📊 Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) FROM users');
        const chats = await pool.query('SELECT COUNT(*) FROM chat_history');
        const purchases = await pool.query('SELECT COALESCE(SUM(kv), 0) FROM users');
        
        res.json({
            users: parseInt(users.rows[0].count),
            chats: parseInt(chats.rows[0].count),
            totalKV: parseFloat(purchases.rows[0].coalesce) || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 👥 Tüm kullanıcılar
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, name, email, phone, tc_no, position, 
                career_level, kv, left_cv, right_cv, left_pv, right_pv,
                personal_cv, personal_pv, plan_type, plan_expires_at,
                is_admin, created_at, bank_name, iban, bank_account_holder
            FROM users 
            ORDER BY id
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 👤 Kullanıcı güncelle
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, email, phone, tc_no,
            career_level, plan_type, is_admin,
            kv, left_cv, right_cv, left_pv, right_pv, personal_pv
        } = req.body;

        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // 🔥 PLAN SÜRESİNİ HESAPLA (Kesin çözüm)
        let expiresAt = null;
        const now = new Date();
        
        if (plan_type === 'free') {
            expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 saat
        } else if (plan_type === 'Lite') {
            expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 gün
        } else if (plan_type === 'Plus') {
            expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 gün
        } else if (plan_type === 'Pro') {
            expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 gün
        }

        console.log(`📝 Plan: ${plan_type}, Bitiş: ${expiresAt}`);

        // 🔥 KULLANICIYI GÜNCELLE (plan_expires_at DAHİL)
        await pool.query(`
            UPDATE users SET 
                name = COALESCE($1, name),
                email = COALESCE($2, email),
                phone = COALESCE($3, phone),
                tc_no = COALESCE($4, tc_no),
                career_level = COALESCE($5, career_level),
                plan_type = COALESCE($6, plan_type),
                plan_expires_at = $7,
                is_admin = COALESCE($8, is_admin),
                kv = COALESCE($9, kv),
                left_cv = COALESCE($10, left_cv),
                right_cv = COALESCE($11, right_cv),
                left_pv = COALESCE($12, left_pv),
                right_pv = COALESCE($13, right_pv),
                personal_pv = COALESCE($14, personal_pv),
                updated_at = NOW()
            WHERE id = $15
        `, [
            name, email, phone, tc_no,
            career_level, plan_type, expiresAt, is_admin,
            kv, left_cv, right_cv, left_pv, right_pv, personal_pv,
            id
        ]);

        // 🔥 USER_PLANS TABLOSUNU GÜNCELLE
        if (plan_type && plan_type !== 'free') {
            // Tüm planları pasif yap
            await pool.query(`UPDATE user_plans SET is_active = false WHERE user_id = $1`, [id]);
            
            // Yeni plan ekle
            const version = plan_type === 'Lite' ? '1.0' : plan_type === 'Plus' ? '2.0' : '2.1';
            await pool.query(`
                INSERT INTO user_plans (user_id, plan_type, version, started_at, expires_at, is_active)
                VALUES ($1, $2, $3, NOW(), $4, true)
            `, [id, plan_type, version, expiresAt]);
            
            console.log(`✅ ${plan_type} planı eklendi (bitiş: ${expiresAt})`);
        } else if (plan_type === 'free') {
            // Tüm planları pasif yap
            await pool.query(`UPDATE user_plans SET is_active = false WHERE user_id = $1`, [id]);
            console.log(`✅ Free plana geçildi, tüm planlar pasif yapıldı`);
        }

        res.json({
            success: true,
            message: 'Kullanıcı başarıyla güncellendi!'
        });
    } catch (error) {
        console.error('Kullanıcı güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🗑️ Kullanıcı sil
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user?.id || 1;

        if (parseInt(id) === adminId) {
            return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz!' });
        }

        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Kullanıcı başarıyla silindi!'
        });
    } catch (error) {
        console.error('Kullanıcı silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

// 📜 Kullanıcı satın alma geçmişi
router.get('/users/:id/purchases', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT 
                pr.id,
                pr.plan_name,
                pr.amount,
                pr.cv,
                pr.kv,
                pr.status,
                pr.created_at
            FROM purchase_requests pr
            WHERE pr.user_id = $1
            ORDER BY pr.created_at DESC
        `, [id]);

        res.json({
            success: true,
            purchases: result.rows
        });
    } catch (error) {
        console.error('Satın alma geçmişi hatası:', error);
        res.status(500).json({ error: error.message });
    }
});
