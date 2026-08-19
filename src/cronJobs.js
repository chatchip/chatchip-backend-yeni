const cron = require('node-cron');
const pool = require('./config/database');
const binaryService = require('./services/binaryService');
const careerService = require('./services/careerService');
const mlmEngine = require('./services/mlmEngine');
const purchaseService = require('./services/purchaseService');
const { updateAllMultipliers } = require('./services/multiplierHelper');

const BATCH_SIZE = 100;

// ============================================================
// 🔄 HAFTALIK BINARY EŞLEŞTİRME (Her Pazar 23:59)
// ============================================================
cron.schedule('59 23 * * 0', async () => {
    console.log('🔄 [CRON] Haftalık binary eşleştirme başlıyor...');
    console.log(`📅 ${new Date().toLocaleString('tr-TR')}`);
    
    try {
        let offset = 0;
        let hasMore = true;
        let totalEarnings = 0;
        let matchedCount = 0;
        let processedCount = 0;
        
        while (hasMore) {
            const users = await pool.query(`
                SELECT id, kv FROM users 
                ORDER BY id 
                LIMIT $1 OFFSET $2
            `, [BATCH_SIZE, offset]);
            
            if (users.rows.length === 0) {
                hasMore = false;
                break;
            }
            
            console.log(`📊 ${offset + 1} - ${offset + users.rows.length} arası kullanıcılar işleniyor...`);
            
            for (const user of users.rows) {
                const result = await mlmEngine.runWeeklyMatch(user.id);
                if (result.status === 'success') {
                    totalEarnings += result.earned || 0;
                    matchedCount++;
                }
                processedCount++;
            }
            
            offset += BATCH_SIZE;
        }
        
        await pool.query(`
            UPDATE users 
            SET left_cv = 0, right_cv = 0 
            WHERE kv < 45
        `);
        
        console.log(`✅ ${matchedCount} kullanıcı eşleştirildi (${processedCount} işlendi)`);
        console.log(`💰 Toplam kazanç: $${totalEarnings.toFixed(2)}`);
        console.log('✅ [CRON] Haftalık binary eşleştirme tamamlandı!');
        
    } catch (error) {
        console.error('❌ [CRON] Haftalık eşleştirme hatası:', error);
    }
});

// ============================================================
// 🔄 AYLIK KARİYER HESAPLAMA (Her ay sonu 23:59)
// ============================================================
cron.schedule('59 23 L * *', async () => {
    console.log('🔄 [CRON] Aylık kariyer hesaplama başlıyor...');
    console.log(`📅 ${new Date().toLocaleString('tr-TR')}`);
    
    try {
        let offset = 0;
        let hasMore = true;
        let promotedCount = 0;
        
        while (hasMore) {
            const users = await pool.query(`
                SELECT id FROM users 
                ORDER BY id 
                LIMIT $1 OFFSET $2
            `, [BATCH_SIZE, offset]);
            
            if (users.rows.length === 0) {
                hasMore = false;
                break;
            }
            
            console.log(`📊 ${offset + 1} - ${offset + users.rows.length} arası kullanıcılar işleniyor...`);
            
            for (const user of users.rows) {
                const result = await careerService.calculateUserCareer(user.id);
                if (result.promoted) {
                    promotedCount++;
                    console.log(`   ⭐ ${result.userId}: ${result.oldCareer} → ${result.newCareer}`);
                }
            }
            
            offset += BATCH_SIZE;
        }
        
        await careerService.resetMonthlyPV();
        
        console.log(`✅ ${promotedCount} kullanıcı terfi etti`);
        console.log('✅ [CRON] Aylık kariyer hesaplama tamamlandı!');
        
    } catch (error) {
        console.error('❌ [CRON] Aylık kariyer hatası:', error);
    }
});

// ============================================================
// 🔄 GÜNLÜK PLAN KONTROLÜ (Her gün 00:00)
// ============================================================
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 [CRON] Günlük plan kontrolü başlıyor...');
    console.log(`📅 ${new Date().toLocaleString('tr-TR')}`);
    
    try {
        await purchaseService.checkAndSwitchExpiredPlans();
        
        const expired = await pool.query(`
            SELECT id, name, email, plan_type, plan_expires_at 
            FROM users 
            WHERE plan_expires_at < NOW() 
            AND plan_type != 'free'
        `);
        
        if (expired.rows.length > 0) {
            console.log(`⚠️ ${expired.rows.length} kullanıcının planı sona erdi:`);
            expired.rows.forEach(u => {
                console.log(`   - ${u.name} (${u.email}): ${u.plan_type} planı bitti`);
            });
        } else {
            console.log('✅ Planı biten kullanıcı yok');
        }
        
    } catch (error) {
        console.error('❌ [CRON] Plan kontrol hatası:', error);
    }
});

// ============================================================
// 🔄 GÜNLÜK ÇARPAN GÜNCELLEME (Her gün 00:05)
// ============================================================
cron.schedule('5 0 * * *', async () => {
    console.log('🔄 [CRON] Günlük çarpan güncelleme başlıyor...');
    console.log(`📅 ${new Date().toLocaleString('tr-TR')}`);
    try {
        const result = await updateAllMultipliers();
        if (result) {
            console.log(`✅ ${result.length} kullanıcının çarpanı güncellendi`);
        }
        console.log('✅ [CRON] Günlük çarpan güncelleme tamamlandı!');
    } catch (error) {
        console.error('❌ [CRON] Günlük çarpan güncelleme hatası:', error);
    }
});

// ============================================================
// 🗑️ SÜRESİ DOLAN DOSYALARI TEMİZLE (Her saat)
// ============================================================
const { cleanExpiredFiles } = require('./routes/upload.routes');

cron.schedule('0 * * * *', async () => {
    console.log('🔄 [CRON] Süresi dolan dosyalar temizleniyor...');
    await cleanExpiredFiles();
});

console.log('✅ Cron job\'lar başlatıldı!');
console.log('   📅 Haftalık eşleştirme: Her Pazar 23:59 (Chunk: 100)');
console.log('   📅 Aylık kariyer: Her ay sonu 23:59 (Chunk: 100)');
console.log('   📅 Günlük plan kontrolü: Her gün 00:00');
console.log('   📅 Günlük çarpan: Her gün 00:05');
console.log('   📅 Dosya temizleme: Her saat başı');
