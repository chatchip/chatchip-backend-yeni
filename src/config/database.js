const { Pool } = require('pg');
require('dotenv').config();

// TLS sertifika kontrolünü devre dışı bırak
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('🔍 Veritabanı bağlantısı başlatılıyor...');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL bulunamadı!');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL bağlantısı başarılı!'))
    .catch((err) => {
        console.error('❌ PostgreSQL hatası:', err.message);
        console.error('📋 Hata kodu:', err.code);
    });

module.exports = pool;
