const pool = require('../config/database');
const { updateUserMultiplierWithClient } = require('./multiplierHelper');

const PLAN_VERSION_MAP = {
    'Lite': '1.0',
    'Plus': '2.0',
    'Pro': '2.1'
};

// Plan öncelik sırası (büyük = daha yüksek öncelik)
const PLAN_PRIORITY = { 'Pro': 3, 'Plus': 2, 'Lite': 1, 'free': 0 };

class PurchaseService {
    
    // 🔥 TRANSACTION ile satın alma - PLAN STACKING DÜZELTİLDİ!
    async processPurchase(userId, amount, cv, kv, planName, period) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            console.log(`🔄 ${userId} için satın alma işleniyor: $${amount}, Plan: ${planName}, Period: ${period}`);

            // 1. Plan tipini temizle
            let cleanPlan = planName;
            if (planName.includes('Lite')) cleanPlan = 'Lite';
            else if (planName.includes('Plus')) cleanPlan = 'Plus';
            else if (planName.includes('Pro')) cleanPlan = 'Pro';
            else {
                await client.query('ROLLBACK');
                return { success: false, error: 'Geçersiz plan' };
            }

            // 2. Versiyonu belirle
            const version = PLAN_VERSION_MAP[cleanPlan];
            if (!version) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Versiyon bulunamadı' };
            }

            // 3. Yeni planın süresini hesapla
            let durationMs = 0;
            const periodLower = (period || 'monthly').toLowerCase();
            switch(periodLower) {
                case 'monthly': durationMs = 30 * 24 * 60 * 60 * 1000; break;
                case 'quarterly': durationMs = 90 * 24 * 60 * 60 * 1000; break;
                case 'semiannual': durationMs = 180 * 24 * 60 * 60 * 1000; break;
                case 'yearly': durationMs = 365 * 24 * 60 * 60 * 1000; break;
                default: durationMs = 30 * 24 * 60 * 60 * 1000;
            }
            
            const now = new Date();
            const newPlanExpiresAt = new Date(now.getTime() + durationMs);
            
            console.log(`📅 Yeni plan süresi: ${periodLower}, Bitiş: ${newPlanExpiresAt}`);

            // 4. Mevcut aktif planı kontrol et
            const currentActivePlan = await client.query(`
                SELECT id, plan_type, expires_at 
                FROM user_plans 
                WHERE user_id = $1 
                AND is_active = true 
                AND is_refunded = false 
                AND expires_at > NOW()
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

            const newPlanPriority = PLAN_PRIORITY[cleanPlan] || 0;
            
            // 5. Yeni planı user_plans tablosuna ekle (önce pasif)
            const insertResult = await client.query(`
                INSERT INTO user_plans (user_id, plan_type, version, started_at, expires_at, is_active, is_refunded)
                VALUES ($1, $2, $3, NOW(), $4, false, false)
                RETURNING id
            `, [userId, cleanPlan, version, newPlanExpiresAt]);

            console.log(`✅ Yeni plan eklendi: ${cleanPlan} (${version}), ID: ${insertResult.rows[0].id}, Bitiş: ${newPlanExpiresAt}`);

            // 6. Plan stacking mantığı
            let activePlanId = insertResult.rows[0].id;
            let activePlanType = cleanPlan;
            let activePlanExpiresAt = newPlanExpiresAt;

            if (currentActivePlan.rows.length > 0) {
                const currentPlan = currentActivePlan.rows[0];
                const currentPriority = PLAN_PRIORITY[currentPlan.plan_type] || 0;
                
                console.log(`📊 Mevcut aktif plan: ${currentPlan.plan_type} (öncelik: ${currentPriority}), Yeni plan: ${cleanPlan} (öncelik: ${newPlanPriority})`);
                
                if (newPlanPriority > currentPriority) {
                    // 🔥 Yeni plan DAHA YÜKSEK öncelikli → yeni plan aktif, eski plan bekle
                    console.log(`⬆️ ${cleanPlan} > ${currentPlan.plan_type}, yeni plan aktif oluyor, eski plan beklemeye alınıyor`);
                    
                    // Eski planı pasif yap (bekleme)
                    await client.query(`
                        UPDATE user_plans SET is_active = false WHERE id = $1
                    `, [currentPlan.id]);
                    
                    // Yeni planı aktif yap
                    await client.query(`
                        UPDATE user_plans SET is_active = true WHERE id = $1
                    `, [insertResult.rows[0].id]);
                    
                    activePlanId = insertResult.rows[0].id;
                    activePlanType = cleanPlan;
                    activePlanExpiresAt = newPlanExpiresAt;
                    
                    console.log(`✅ ${cleanPlan} aktif, ${currentPlan.plan_type} beklemede (${currentPlan.expires_at} bitiş)`);
                    
                } else if (newPlanPriority === currentPriority) {
                    // 🔥 AYNI öncelik → süreleri stack (topla)
                    console.log(`🔄 ${cleanPlan} == ${currentPlan.plan_type}, süreler stackleniyor`);
                    
                    const currentExpires = new Date(currentPlan.expires_at);
                    const newExpires = new Date(now.getTime() + durationMs);
                    
                    // İki süreyi topla
                    const totalMs = (currentExpires - now) + durationMs;
                    const stackedExpiresAt = new Date(now.getTime() + totalMs);
                    
                    console.log(`📊 Kalan: ${Math.round((currentExpires - now) / (1000 * 60 * 60 * 24))} gün + ${Math.round(durationMs / (1000 * 60 * 60 * 24))} gün = ${Math.round(totalMs / (1000 * 60 * 60 * 24))} gün`);
                    
                    // Mevcut planın süresini uzat
                    await client.query(`
                        UPDATE user_plans SET expires_at = $1 WHERE id = $2
                    `, [stackedExpiresAt, currentPlan.id]);
                    
                    // Yeni planı pasif yap (zaten beklemede)
                    await client.query(`
                        UPDATE user_plans SET is_active = false WHERE id = $1
                    `, [insertResult.rows[0].id]);
                    
                    // Yeni planın süresini de güncelle (stack)
                    await client.query(`
                        UPDATE user_plans SET expires_at = $1 WHERE id = $2
                    `, [stackedExpiresAt, insertResult.rows[0].id]);
                    
                    activePlanId = currentPlan.id;
                    activePlanType = currentPlan.plan_type;
                    activePlanExpiresAt = stackedExpiresAt;
                    
                    console.log(`✅ ${currentPlan.plan_type} süresi uzatıldı, yeni bitiş: ${stackedExpiresAt}`);
                    
                } else {
                    // 🔥 Yeni plan DAHA DÜŞÜK öncelikli → eski plan devam, yeni plan bekle
                    console.log(`⬇️ ${cleanPlan} < ${currentPlan.plan_type}, mevcut plan devam ediyor, yeni plan beklemeye alınıyor`);
                    
                    // Yeni planı pasif yap (bekleme)
                    await client.query(`
                        UPDATE user_plans SET is_active = false WHERE id = $1
                    `, [insertResult.rows[0].id]);
                    
                    activePlanId = currentPlan.id;
                    activePlanType = currentPlan.plan_type;
                    activePlanExpiresAt = currentPlan.expires_at;
                    
                    console.log(`✅ ${currentPlan.plan_type} devam ediyor, ${cleanPlan} beklemede (${newPlanExpiresAt} bitiş)`);
                }
            } else {
                // 🔥 Hiç aktif plan yok → yeni plan aktif
                console.log(`📌 Hiç aktif plan yok, ${cleanPlan} aktif oluyor`);
                await client.query(`
                    UPDATE user_plans SET is_active = true WHERE id = $1
                `, [insertResult.rows[0].id]);
                
                activePlanId = insertResult.rows[0].id;
                activePlanType = cleanPlan;
                activePlanExpiresAt = newPlanExpiresAt;
                
                console.log(`✅ ${cleanPlan} aktif, bitiş: ${newPlanExpiresAt}`);
            }

            // 7. Kullanıcı verilerini güncelle
            await client.query(`
                UPDATE users SET 
                    kv = kv + $1,
                    personal_cv = personal_cv + $2,
                    personal_pv = personal_pv + $2,
                    plan_type = $3,
                    plan_expires_at = $4,
                    updated_at = NOW()
                WHERE id = $5
            `, [kv, cv, activePlanType, activePlanExpiresAt, userId]);

            // 8. KV geçmişine ekle
            if (kv > 0) {
                await client.query(`
                    INSERT INTO kv_history (user_id, amount, earned_at)
                    VALUES ($1, $2, NOW())
                `, [userId, kv]);
            }

            // 9. Çarpanı güncelle (client ile)
            await updateUserMultiplierWithClient(client, userId);

            // 10. Üst kollara dağıt (client ile)
            await this.distributeToUplineWithClient(client, userId, cv);

            await client.query('COMMIT');
            
            console.log(`✅ Transaction başarılı: ${activePlanType} planı aktif (bitiş: ${activePlanExpiresAt})`);
            
            return { 
                success: true, 
                plan: activePlanType,
                version: version,
                expiresAt: activePlanExpiresAt,
                planId: activePlanId,
                totalPlans: await this.getUserPlans(userId)
            };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Transaction hatası:', error);
            return { success: false, error: error.message };
        } finally {
            client.release();
        }
    }

    // 🔥 En iyi planı aktif yap (Refund ve Cron için)
    async activateBestPlan(userId) {
        const result = await pool.query(`
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
        await pool.query(`UPDATE user_plans SET is_active = false WHERE user_id = $1`, [userId]);

        if (result.rows.length > 0) {
            const { id, plan_type, expires_at } = result.rows[0];
            await pool.query(`UPDATE user_plans SET is_active = true WHERE id = $1`, [id]);
            await pool.query(`
                UPDATE users SET plan_type = $1, plan_expires_at = $2 WHERE id = $3
            `, [plan_type, expires_at, userId]);
            console.log(`✅ ${plan_type} planı aktif yapıldı (bitiş: ${expires_at})`);
            return { success: true, plan_type, expires_at };
        } else {
            await pool.query(`UPDATE users SET plan_type = 'free', plan_expires_at = NULL WHERE id = $1`, [userId]);
            console.log(`📌 Kullanıcı ${userId} için plan yok, free yapıldı`);
            return { success: true, plan_type: 'free' };
        }
    }

    // 🔥 Plan süresi dolanları kontrol et
    async checkAndSwitchExpiredPlans() {
        console.log('🔄 Plan süresi kontrolü başlıyor...');
        try {
            const expiredResult = await pool.query(`
                UPDATE user_plans 
                SET is_active = false 
                WHERE is_active = true AND expires_at < NOW()
                RETURNING user_id, plan_type
            `);

            if (expiredResult.rows.length > 0) {
                console.log(`⏰ ${expiredResult.rows.length} plan süresi doldu, pasif yapıldı`);
                const userIds = [...new Set(expiredResult.rows.map(r => r.user_id))];
                for (const userId of userIds) {
                    await this.activateBestPlan(userId);
                }
            } else {
                console.log('✅ Süresi dolan plan yok');
            }
        } catch (error) {
            console.error('❌ Plan kontrol hatası:', error);
        }
    }

    // 🔥 Üst kollara dağıt (client ile - transaction için)
    async distributeToUplineWithClient(client, userId, amount) {
        console.log(`📤 ${userId} için üst kollara dağıtım başlıyor...`);
        let currentId = userId;
        let chain = [];
        let maxLoop = 20;
        
        while (maxLoop-- > 0) {
            const result = await client.query(
                'SELECT sponsor_id, position FROM users WHERE id = $1',
                [currentId]
            );
            
            if (result.rows.length === 0) break;
            
            const sponsorId = result.rows[0].sponsor_id;
            const position = result.rows[0].position;
            
            if (!sponsorId) break;
            
            chain.push(sponsorId);
            
            if (position === 'left') {
                await client.query(`
                    UPDATE users SET 
                        left_cv = left_cv + $1, 
                        left_pv = left_pv + $1 
                    WHERE id = $2
                `, [amount, sponsorId]);
            } else if (position === 'right') {
                await client.query(`
                    UPDATE users SET 
                        right_cv = right_cv + $1, 
                        right_pv = right_pv + $1 
                    WHERE id = $2
                `, [amount, sponsorId]);
            }
            currentId = sponsorId;
        }
        console.log(`✅ Dağıtım tamamlandı: ${chain.join(' → ')}`);
        return chain;
    }

    // 🔥 Üst kollara dağıt (pool ile - normal)
    async distributeToUpline(userId, amount) {
        return this.distributeToUplineWithClient(pool, userId, amount);
    }

    async getUserPlans(userId) {
        const result = await pool.query(`
            SELECT id, plan_type, version, started_at, expires_at, is_active, is_refunded
            FROM user_plans 
            WHERE user_id = $1 
            AND is_refunded = false
            ORDER BY 
                CASE plan_type 
                    WHEN 'Pro' THEN 3 
                    WHEN 'Plus' THEN 2 
                    WHEN 'Lite' THEN 1 
                    ELSE 0 
                END DESC,
                expires_at DESC
        `, [userId]);
        return result.rows;
    }
}

module.exports = new PurchaseService();
