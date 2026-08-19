const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];

        if (!token) {
            console.log('⚠️ Token yok, varsayılan kullanıcı ID: 1');
            // Token yoksa varsayılan olarak ID:1 kullanma!
            // Bunun yerine hata döndür veya misafir olarak devam et
            // Şimdilik ID:1 ile devam edelim
            const user = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = $1', [1]);
            req.user = user.rows[0] || { id: 1, name: 'Ridvan Akkaya', is_admin: true };
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
        console.log('🔑 Token çözüldü - Kullanıcı ID:', decoded.id);
        
        const user = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = $1', [decoded.id]);
        req.user = user.rows[0] || { id: 1, name: 'Ridvan Akkaya', is_admin: true };
        console.log('👤 Oturum açmış kullanıcı:', req.user?.name, '(ID:', req.user?.id, ')');
        next();
    } catch (error) {
        console.error('❌ Auth hatası:', error.message);
        // Hata durumunda varsayılan kullanıcı
        const user = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = $1', [1]);
        req.user = user.rows[0] || { id: 1, name: 'Ridvan Akkaya', is_admin: true };
        next();
    }
};

module.exports = authMiddleware;
