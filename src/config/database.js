const { Pool } = require('pg');
require('dotenv').config();

// Railway'de DATABASE_URL kullan
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL bağlantısı başarılı!'))
    .catch((err) => console.error('❌ PostgreSQL hatası:', err.message));

module.exports = pool;
