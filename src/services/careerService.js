const pool = require('../config/database');
const mlmEngine = require('./mlmEngine');

class CareerService {
    
    // 📊 Aylık kariyer hesapla
    async calculateMonthlyCareers() {
        console.log('🔄 Aylık kariyer hesaplama başlıyor...');
        const users = await pool.query('SELECT id FROM users');
        const results = [];
        for (const user of users.rows) {
            const result = await this.calculateUserCareer(user.id);
            results.push(result);
        }
        console.log('✅ Aylık kariyer hesaplama tamamlandı!');
        return results;
    }

    // 📊 Tek kullanıcı için kariyer hesapla
    async calculateUserCareer(userId) {
        try {
            console.log(`📊 Kariyer hesaplanıyor: ${userId}`);
            
            const leftPV = await mlmEngine.getLegPV(userId, 'left');
            const rightPV = await mlmEngine.getLegPV(userId, 'right');
            const counts = await mlmEngine.getLegCareerCounts(userId);
            const newCareer = mlmEngine.evaluateCareer(leftPV, rightPV, counts);
            
            console.log(`📊 Sol PV: ${leftPV}, Sağ PV: ${rightPV}, Yeni Kariyer: ${newCareer}`);
            
            const user = await pool.query('SELECT career_level, highest_career FROM users WHERE id = $1', [userId]);
            const oldCareer = user.rows[0]?.career_level || 'Starter';
            const reward = await mlmEngine.getReward(newCareer);
            const kv = await mlmEngine.calculateKV(userId);
            const isActive = mlmEngine.isActive(kv);
            const finalReward = isActive ? reward : 0;
            
            await pool.query(`
                UPDATE users SET 
                    career_level = $1,
                    highest_career = CASE 
                        WHEN $2 > highest_career THEN $2 
                        ELSE highest_career 
                    END
                WHERE id = $3
            `, [newCareer, newCareer, userId]);
            
            await pool.query(`
                INSERT INTO career_history (user_id, old_career, new_career, left_pv, right_pv, reward, promoted)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [userId, oldCareer, newCareer, leftPV, rightPV, finalReward, oldCareer !== newCareer]);
            
            if (finalReward > 0) {
                await pool.query(`
                    UPDATE users SET 
                        total_rewards = COALESCE(total_rewards, 0) + $1,
                        available_balance = COALESCE(available_balance, 0) + $1
                    WHERE id = $2
                `, [finalReward, userId]);
                console.log(`💰 Kullanıcı ${userId} ${finalReward}$ kariyer ödülü kazandı!`);
            }
            
            return {
                userId,
                oldCareer,
                newCareer,
                leftPV,
                rightPV,
                reward: finalReward,
                promoted: oldCareer !== newCareer,
                status: 'success'
            };
        } catch (error) {
            console.error(`❌ calculateUserCareer hatası (${userId}):`, error.message);
            console.error(error.stack);
            return { userId, status: 'error', error: error.message };
        }
    }

    // 📊 Aylık PV'leri sıfırla
    async resetMonthlyPV() {
        await pool.query('UPDATE users SET left_pv = 0, right_pv = 0');
        console.log('✅ Tüm PV\'ler sıfırlandı');
    }

    // 📊 Kariyerleri sıfırla (Starter'a döndür)
    async resetCareers() {
        await pool.query(`UPDATE users SET career_level = 'Starter'`);
        console.log('✅ Tüm kariyerler sıfırlandı (Starter)');
    }

    // ============================================================
    // 🔥 GENEL KARİYER GÜNCELLEME (TEK KULLANICI) - DÜZELTİLDİ
    // ============================================================
    async updateUserCareer(userId) {
        try {
            const targetId = typeof userId === 'object' ? userId.id : userId;
            if (!targetId) {
                console.error(`❌ updateUserCareer hatası: Geçersiz userId`, userId);
                return null;
            }
            console.log(`🔄 Kariyer güncelleniyor (GENEL): Kullanıcı ${targetId}`);
            
            const result = await this.calculateUserCareer(targetId);
            
            console.log(`📊 Kariyer sonucu:`, result);
            
            if (result && result.status === 'success') {
                console.log(`✅ Kariyer güncellendi: ${result.oldCareer} → ${result.newCareer}`);
            } else {
                console.warn(`⚠️ Kariyer güncellenemedi:`, result);
            }
            return result;
        } catch (error) {
            console.error(`❌ Kariyer güncelleme hatası (${userId}):`, error.message);
            console.error(error.stack);
            return null;
        }
    }

    // ============================================================
    // 🔥 TÜM ÜST KOLLARI KARİYER GÜNCELLE (KENDİSİ DAHİL!) - DÜZELTİLDİ
    // ============================================================
    async updateCareerForUpline(userId) {
        console.log(`🔄 Üst kollar kariyer güncelleniyor... (Başlangıç: ${userId})`);
        
        try {
            // 🔥 ÖNCE KENDİSİNİ GÜNCELLE!
            const selfResult = await this.updateUserCareer(userId);
            console.log(`   ✅ ${userId} nolu kullanıcının kariyeri güncellendi:`, selfResult?.newCareer || 'Hata');
            
            let currentId = userId;
            let chain = [];
            let maxLoop = 20;
            let loopCount = 0;
            
            while (loopCount < maxLoop) {
                loopCount++;
                
                const result = await pool.query(
                    'SELECT sponsor_id FROM users WHERE id = $1',
                    [currentId]
                );
                
                if (result.rows.length === 0) break;
                
                const sponsorId = result.rows[0].sponsor_id;
                if (!sponsorId) break;
                
                chain.push(sponsorId);
                
                const sponsorResult = await this.updateUserCareer(sponsorId);
                console.log(`   ✅ ${sponsorId} nolu kullanıcının kariyeri güncellendi:`, sponsorResult?.newCareer || 'Hata');
                
                currentId = sponsorId;
            }
            
            console.log(`✅ Üst kollar güncellendi: ${chain.join(' → ')} (${chain.length} kişi)`);
            return chain;
        } catch (error) {
            console.error(`❌ updateCareerForUpline hatası:`, error.message);
            console.error(error.stack);
            return [];
        }
    }
}

module.exports = new CareerService();
