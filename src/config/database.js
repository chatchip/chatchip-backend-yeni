const { Pool } = require('pg');
require('dotenv').config();

console.log('🔍 Veritabanı bağlantısı kontrol ediliyor...');
console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? '✅ VAR' : '❌ YOK');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL bulunamadı!');
    process.exit(1);
}

console.log('🔗 Bağlanılıyor...');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL bağlantısı başarılı!'))
    .catch((err) => {
        console.error('❌ PostgreSQL hatası:', err.message);
        console.error('📋 Hata detayı:', err);
    });

module.exports = pool;
