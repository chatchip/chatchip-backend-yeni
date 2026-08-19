const pool = require('../config/database');
const mlmEngine = require('./mlmEngine');

// 📊 Tek kullanıcının çarpanını güncelle (pool ile - normal)
async function updateUserMultiplier(userId) {
    try {
        const result = await pool.query('SELECT kv FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            console.log(`⚠️ Kullanıcı ${userId} bulunamadı`);
            return null;
        }
        const kv = parseFloat(result.rows[0].kv) || 0;
        const multiplier = mlmEngine.getKvMultiplier(kv);
        await pool.query('UPDATE users SET multiplier = $1 WHERE id = $2', [multiplier, userId]);
        console.log(`📊 Çarpan güncellendi: Kullanıcı ${userId}, KV: ${kv}, Çarpan: ${multiplier}`);
        return multiplier;
    } catch (error) {
        console.error('❌ Çarpan güncelleme hatası:', error);
        return null;
    }
}

// 📊 Tek kullanıcının çarpanını güncelle (client ile - transaction için)
async function updateUserMultiplierWithClient(client, userId) {
    try {
        const result = await client.query('SELECT kv FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            console.log(`⚠️ Kullanıcı ${userId} bulunamadı`);
            return null;
        }
        const kv = parseFloat(result.rows[0].kv) || 0;
        const multiplier = mlmEngine.getKvMultiplier(kv);
        await client.query('UPDATE users SET multiplier = $1 WHERE id = $2', [multiplier, userId]);
        console.log(`📊 Çarpan güncellendi (transaction): Kullanıcı ${userId}, KV: ${kv}, Çarpan: ${multiplier}`);
        return multiplier;
    } catch (error) {
        console.error('❌ Çarpan güncelleme hatası:', error);
        return null;
    }
}

// 📊 Tüm kullanıcıların çarpanlarını güncelle
async function updateAllMultipliers() {
    try {
        console.log('🔄 Tüm kullanıcıların çarpanları güncelleniyor...');
        const result = await pool.query(`
            UPDATE users 
            SET multiplier = 
                CASE 
                    WHEN kv BETWEEN 0 AND 44 THEN 0
                    WHEN kv BETWEEN 45 AND 74 THEN 0.09
                    WHEN kv BETWEEN 75 AND 104 THEN 0.10
                    WHEN kv BETWEEN 105 AND 179 THEN 0.11
                    WHEN kv BETWEEN 180 AND 299 THEN 0.12
                    WHEN kv BETWEEN 300 AND 419 THEN 0.13
                    WHEN kv >= 420 THEN 0.15
                    ELSE 0
                END
            RETURNING id, kv, multiplier;
        `);
        console.log(`✅ ${result.rows.length} kullanıcının çarpanı güncellendi`);
        return result.rows;
    } catch (error) {
        console.error('❌ Toplu çarpan güncelleme hatası:', error);
        return null;
    }
}

module.exports = { updateUserMultiplier, updateUserMultiplierWithClient, updateAllMultipliers };
