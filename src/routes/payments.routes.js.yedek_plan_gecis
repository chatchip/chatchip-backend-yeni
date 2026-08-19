const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const purchaseService = require('../services/purchaseService');

// 📊 Ödeme geçmişi
router.get('/history', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const result = await pool.query(`
            SELECT id, plan_name, period, amount, cv, kv, payment_method, status, created_at,
                   TO_CHAR(created_at, 'DD.MM.YYYY HH24:MI') as created_at_formatted
            FROM payments
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 20
        `, [userId]);
        res.json({ success: true, payments: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🛒 Ödeme oluştur
router.post('/create', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { planName, period, amount, cv, kv, paymentMethod } = req.body;

        if (!planName || !amount) {
            return res.status(400).json({ error: 'Plan adı ve miktar gerekli' });
        }

        const paymentMethod_ = paymentMethod || 'bank_transfer';
        const status = paymentMethod_ === 'bank_transfer' ? 'pending' : 'pending';

        const result = await pool.query(`
            INSERT INTO payments (user_id, plan_name, period, amount, cv, kv, payment_method, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING id, status
        `, [userId, planName, period || 'monthly', amount, cv || 0, kv || amount, paymentMethod_, status]);

        if (paymentMethod_ === 'bank_transfer') {
            await pool.query(`
                INSERT INTO purchase_requests (user_id, plan_name, period, amount, cv, status, created_at)
                VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
            `, [userId, planName, period || 'monthly', amount, cv || 0]);
        }

        if (paymentMethod_ === 'credit_card') {
            return res.json({
                success: true,
                message: 'Kredi kartı ile ödeme başlatıldı.',
                paymentId: result.rows[0].id,
                redirectUrl: '/payment/checkout/' + result.rows[0].id
            });
        }

        res.json({
            success: true,
            message: '✅ Ödeme kaydı oluşturuldu! Admin onayı bekleniyor.',
            paymentId: result.rows[0].id,
            status: result.rows[0].status
        });
    } catch (error) {
        console.error('Payment create error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Ödeme onayla (admin)
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user?.id || 1;

        const payment = await pool.query(`
            SELECT user_id, plan_name, period, amount, cv, kv FROM payments WHERE id = $1 AND status = 'pending'
        `, [id]);

        if (payment.rows.length === 0) {
            return res.status(404).json({ error: 'Ödeme bulunamadı veya zaten işlem görmüş' });
        }

        const { user_id, plan_name, period, amount, cv, kv } = payment.rows[0];

        // 🔥 Plan tipini temizle
        let cleanPlan = 'Lite';
        if (plan_name && typeof plan_name === 'string') {
            const planNameLower = plan_name.toLowerCase();
            if (planNameLower.includes('lite')) cleanPlan = 'Lite';
            else if (planNameLower.includes('plus')) cleanPlan = 'Plus';
            else if (planNameLower.includes('pro')) cleanPlan = 'Pro';
        }
        console.log('📝 Temizlenen plan:', plan_name, '→', cleanPlan);

        // 🔥 KALAN SÜREYE EKLEME ile satın alma işlemini gerçekleştir
        const result = await purchaseService.processPurchase(
            user_id, 
            amount, 
            cv || 0, 
            kv || amount, 
            cleanPlan, 
            period || 'monthly'
        );

        // Ödemeyi onayla
        await pool.query(`
            UPDATE payments SET status = 'completed', approved_by = $1, updated_at = NOW() WHERE id = $2
        `, [adminId, id]);

        await pool.query(`
            UPDATE purchase_requests SET status = 'approved', updated_at = NOW() 
            WHERE user_id = $1 AND plan_name = $2 AND status = 'pending'
        `, [user_id, plan_name]);

        res.json({
            success: true,
            message: `✅ Ödeme onaylandı! Kalan süreye eklendi.`,
            plan: result.plan,
            expiresAt: result.expiresAt,
            remainingDays: result.remainingDays
        });
    } catch (error) {
        console.error('Payment approve error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
