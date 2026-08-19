const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.post('/purchase/:id', async (req, res) => {
    let client;
    
    try {
        const { id } = req.params;
        
        console.log(`🔄 İade isteği alındı: Purchase ID ${id}`);

        client = await pool.connect();
        console.log(`✅ PostgreSQL bağlantısı alındı`);

        const purchase = await client.query(`
            SELECT 
                pr.id,
                pr.user_id,
                pr.plan_name,
                pr.amount,
                pr.cv,
                pr.kv,
                pr.status
            FROM purchase_requests pr
            WHERE pr.id = $1 AND pr.status = 'approved'
        `, [id]);

        if (purchase.rows.length === 0) {
            console.log(`⚠️ Satın alma bulunamadı: ID ${id}`);
            return res.status(404).json({ 
                success: false, 
                error: 'Satın alma bulunamadı veya zaten iptal edilmiş' 
            });
        }

        const data = purchase.rows[0];
        const userId = data.user_id;
        const amount = parseFloat(data.amount);
        const cv = parseFloat(data.cv) || 0;
        const kv = parseFloat(data.kv) || amount;

        let cleanPlan = data.plan_name;
        if (cleanPlan.includes('Lite')) cleanPlan = 'Lite';
        else if (cleanPlan.includes('Plus')) cleanPlan = 'Plus';
        else if (cleanPlan.includes('Pro')) cleanPlan = 'Pro';

        console.log(`🔄 İade: ${data.plan_name} → ${cleanPlan} ($${amount}) - Kullanıcı: ${userId}`);

        await client.query('BEGIN');

        // 1. Purchase request status güncelle
        await client.query(`
            UPDATE purchase_requests 
            SET status = 'refunded', updated_at = NOW() 
            WHERE id = $1
        `, [id]);
        console.log(`📝 Satın alma isteği güncellendi: status = refunded`);

        // 2. Kullanıcının KENDİ KV/CV/PV'lerini düşür
        await client.query(`
            UPDATE users SET 
                kv = GREATEST(kv - $1, 0),
                personal_cv = GREATEST(personal_cv - $2, 0),
                personal_pv = GREATEST(personal_pv - $2, 0),
                updated_at = NOW()
            WHERE id = $3
        `, [kv, cv, userId]);
        console.log(`📊 Kullanıcının kendi KV düşüldü: ${kv}, CV düşüldü: ${cv}`);

        // 3. İade edilen planı işaretle (pasif + refunded)
        await client.query(`
            UPDATE user_plans 
            SET is_active = false, is_refunded = true 
            WHERE user_id = $1 
            AND plan_type = $2 
            AND is_active = true
        `, [userId, cleanPlan]);
        console.log(`🗑️ İade edilen plan işaretlendi: ${cleanPlan}`);

        // 🔥 4. ÜST KOLLARDAKİ CV/PV'Yİ DÜŞÜR (distributeRefundToUpline)
        // Bu fonksiyon, kullanıcının sponsor'undan başlayarak
        // tüm üst kollardaki left_cv/right_cv/left_pv/right_pv'yi düşürür
        console.log(`📤 Üst kollardan CV/PV düşülüyor...`);
        await distributeRefundToUpline(client, userId, cv);
        console.log(`✅ Üst kollardan CV/PV düşüldü`);

        // 5. KALAN PLANLAR ARASINDAN EN İYİSİNİ OTOMATİK AKTİF YAP
        console.log(`🔄 Kullanıcının kalan planları arasından en iyisi seçiliyor...`);
        
        const bestPlanResult = await client.query(`
            SELECT id, plan_type, expires_at 
            FROM user_plans 
            WHERE user_id = $1 
            AND expires_at > NOW()
            AND is_refunded = false
            ORDER BY 
                CASE plan_type 
                    WHEN 'Pro' THEN 3 
                    WHEN 'Plus' THEN 2 
                    WHEN 'Lite' THEN 1 
                    ELSE 0 
                END DESC,
                expires_at DESC
            LIMIT 1
        `, [userId]);

        // Tüm planları pasif yap
        await client.query(`UPDATE user_plans SET is_active = false WHERE user_id = $1`, [userId]);

        if (bestPlanResult.rows.length > 0) {
            const bestPlan = bestPlanResult.rows[0];
            
            // En iyi planı aktif yap
            await client.query(`UPDATE user_plans SET is_active = true WHERE id = $1`, [bestPlan.id]);
            
            // Kullanıcıyı güncelle
            await client.query(`
                UPDATE users SET 
                    plan_type = $1, 
                    plan_expires_at = $2,
                    plan_started_at = NOW()
                WHERE id = $3
            `, [bestPlan.plan_type, bestPlan.expires_at, userId]);
            
            console.log(`✅ Kalan planlar arasından EN İYİSİ seçildi: ${bestPlan.plan_type} (bitiş: ${bestPlan.expires_at})`);
        } else {
            // Hiç plan kalmadı → free
            await client.query(`
                UPDATE users SET 
                    plan_type = 'free',
                    plan_expires_at = NULL,
                    plan_started_at = NULL,
                    multiplier = 0
                WHERE id = $1
            `, [userId]);
            console.log(`📌 Kullanıcı ${userId} için kalan plan yok, free yapıldı`);
        }

        await client.query('COMMIT');
        console.log(`✅ TRANSACTION COMMIT YAPILDI!`);

        // 6. Kariyer güncelle (refund sonrası - üst kollar güncellenir)
        try {
            console.log(`🔄 İade sonrası kariyer güncelleniyor: Kullanıcı ${userId}`);
            const careerService = require('../services/careerService');
            if (careerService && typeof careerService.updateCareerForUpline === 'function') {
                await careerService.updateCareerForUpline(userId);
                console.log(`✅ İade sonrası kariyer güncelleme tamamlandı!`);
            }
        } catch (careerError) {
            console.error('⚠️ Kariyer güncellenirken hata:', careerError.message);
        }

        const finalUser = await pool.query(`
            SELECT id, name, kv, plan_type, plan_expires_at, multiplier,
                   left_cv, right_cv, left_pv, right_pv, personal_cv, personal_pv
            FROM users WHERE id = $1
        `, [userId]);

        console.log(`📊 Son durum:`, finalUser.rows[0]);

        res.json({
            success: true,
            message: `✅ ${data.plan_name} iade edildi! En iyi plan aktif yapıldı.`,
            refunded: { plan: data.plan_name, amount, kv, cv },
            user: finalUser.rows[0]
        });

    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (e) {}
        }
        console.error('❌ İade hatası:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (client) { client.release(); }
    }
});

module.exports = router;

// ============================================================
// 🔥 ÜST KOLLARDAKİ CV/PV'Yİ DÜŞÜR (distributeRefundToUpline)
// ============================================================
async function distributeRefundToUpline(client, userId, amount) {
    console.log(`📤 Üst kollara CV/PV dağıtımı başlıyor... (Kullanıcı: ${userId}, Miktar: ${amount})`);
    
    let currentId = userId;
    let chain = [];
    let maxLoop = 20;
    let loopCount = 0;
    
    while (loopCount < maxLoop) {
        loopCount++;
        
        const result = await client.query(
            `SELECT id, sponsor_id, position FROM users WHERE id = $1`,
            [currentId]
        );
        
        if (result.rows.length === 0) {
            console.log(`   ⚠️ ${currentId} bulunamadı`);
            break;
        }
        
        const user = result.rows[0];
        const sponsorId = user.sponsor_id;
        const position = user.position;
        
        console.log(`   🔍 Kullanıcı ${currentId}: sponsor=${sponsorId}, position=${position}`);
        
        if (!sponsorId) {
            console.log(`   ℹ️ ${currentId} kök kullanıcı (sponsor yok)`);
            break;
        }
        
        if (sponsorId === currentId) {
            console.log(`   ⚠️ Döngü tespit edildi: ${currentId} → ${sponsorId}`);
            break;
        }
        
        chain.push(sponsorId);
        
        console.log(`   🔄 ${currentId} → ${sponsorId} (${position} kol) - Miktar: ${amount}`);
        
        if (position === 'left') {
            await client.query(`
                UPDATE users SET 
                    left_cv = GREATEST(left_cv - $1, 0),
                    left_pv = GREATEST(left_pv - $1, 0)
                WHERE id = $2
            `, [amount, sponsorId]);
            console.log(`   ✅ Sol kol: ${sponsorId} için left_cv ve left_pv düşüldü (${amount})`);
        } else if (position === 'right') {
            await client.query(`
                UPDATE users SET 
                    right_cv = GREATEST(right_cv - $1, 0),
                    right_pv = GREATEST(right_pv - $1, 0)
                WHERE id = $2
            `, [amount, sponsorId]);
            console.log(`   ✅ Sağ kol: ${sponsorId} için right_cv ve right_pv düşüldü (${amount})`);
        } else {
            console.log(`   ⚠️ Pozisyon belirsiz: ${position}`);
        }
        
        currentId = sponsorId;
    }
    
    console.log(`✅ Üst kollardan CV/PV düşüldü: ${chain.join(' → ')} (${loopCount} adım)`);
}
