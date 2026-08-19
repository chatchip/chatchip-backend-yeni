const { Pool } = require('pg');
require('dotenv').config();

console.log('🔍 Veritabanı bağlantısı (ayrı değişkenler) kontrol ediliyor...');

// Railway'in sağladığı ayrı değişkenleri kullan
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL bağlantısı başarılı!'))
    .catch((err) => {
        console.error('❌ PostgreSQL hatası:', err.message);
        console.error('📋 Hata detayı:', err);
    });

module.exports = pool;
