const { Pool } = require('pg');
require('dotenv').config();

// Node.js TLS sertifika doğrulamasını devre dışı bırak (self-signed sertifikalar için)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? '✅ VAR' : '❌ YOK');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL bulunamadı!');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL bağlantısı başarılı!'))
    .catch((err) => console.error('❌ PostgreSQL hatası:', err.message));

module.exports = pool;
