const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const pool = require('../config/database');

// ============================================================
// 🔐 GİRİŞ
// ============================================================
router.post('/login', async (req, res) => {
    try {
        console.log('📨 Login isteği:', req.body.email);
        const { email, password } = req.body;
        
        if (!email || !password) {
            console.log('❌ Email veya şifre boş');
            return res.status(400).json({ error: 'Email ve şifre gerekli' });
        }

        const user = await User.findByEmail(email);
        
        if (!user) {
            console.log('❌ Kullanıcı bulunamadı:', email);
            return res.status(401).json({ error: 'Email veya şifre hatalı' });
        }

        console.log('👤 Kullanıcı bulundu:', user.email);
        console.log('🔑 Hash karşılaştırılıyor...');
        
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            console.log('❌ Şifre yanlış');
            return res.status(401).json({ error: 'Email veya şifre hatalı' });
        }

        console.log('✅ Şifre doğru, token oluşturuluyor...');

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET || 'supersecretkey',
            { expiresIn: '7d' }
        );

        console.log('✅ Login başarılı:', user.email);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                career_level: user.career_level,
                is_admin: user.is_admin,
                plan_type: user.plan_type || 'free'
            }
        });
    } catch (error) {
        console.error('❌ Login hatası:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📝 KAYIT
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password, sponsor_id, position } = req.body;
        
        console.log('📝 Register isteği:', { name, email, sponsor_id, position });

        const existing = await User.findByEmail(email);
        if (existing) {
            return res.status(400).json({ error: 'Bu email zaten kullanılıyor' });
        }

        if (!sponsor_id) {
            return res.status(400).json({ error: 'Sponsor ID zorunludur!' });
        }

        const sponsor = await User.findById(sponsor_id);
        if (!sponsor) {
            return res.status(404).json({ error: 'Sponsor bulunamadı!' });
        }

        const legCheck = await pool.query(`
            SELECT COUNT(*) as count FROM users WHERE sponsor_id = $1 AND position = $2
        `, [sponsor_id, position]);

        const count = parseInt(legCheck.rows[0].count) || 0;

        if (count >= 1) {
            return res.status(400).json({ 
                error: `Bu sponsorun ${position === 'left' ? 'Sol' : 'Sağ'} kolu zaten dolu!` 
            });
        }

        const password_hash = await bcrypt.hash(password, 10);
        
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        const user = await pool.query(`
            INSERT INTO users (name, email, phone, password_hash, sponsor_id, position, career_level, plan_type, plan_started_at, plan_expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'Starter', 'free', NOW(), $7)
            RETURNING id, name, email, career_level, plan_type, plan_expires_at
        `, [name, email, phone, password_hash, sponsor_id, position, expiresAt]);

        const token = jwt.sign(
            { id: user.rows[0].id, email: user.rows[0].email },
            process.env.JWT_SECRET || 'supersecretkey',
            { expiresIn: '7d' }
        );

        console.log('✅ Kayıt başarılı:', user.rows[0].email, 'Sponsor:', sponsor_id);

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user.rows[0].id,
                name: user.rows[0].name,
                email: user.rows[0].email,
                career_level: user.rows[0].career_level,
                plan_type: user.rows[0].plan_type,
                plan_expires_at: user.rows[0].plan_expires_at
            }
        });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🔑 ŞİFRE SIFIRLAMA İSTEĞİ
// ============================================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'E-posta adresi gerekli' });
        }

        const user = await User.findByEmail(email);
        if (!user) {
            return res.json({ 
                success: true, 
                message: 'Eğer bu email kayıtlıysa, şifre sıfırlama linki gönderildi.' 
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(`
            UPDATE users 
            SET reset_token = $1, reset_token_expires = $2 
            WHERE id = $3
        `, [resetToken, expiresAt, user.id]);

        const resetLink = `http://localhost:3000/public/reset-password.html?token=${resetToken}`;
        
        console.log('========================================');
        console.log('📧 ŞİFRE SIFIRLAMA LİNKİ:');
        console.log('🔗', resetLink);
        console.log('⏰ 15 dakika geçerli');
        console.log('👤 Kullanıcı:', user.email);
        console.log('========================================');

        res.json({
            success: true,
            message: 'Şifre sıfırlama linki e-posta adresinize gönderildi.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🔑 ŞİFREYİ SIFIRLA
// ============================================================
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token ve yeni şifre gerekli' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
        }

        const result = await pool.query(`
            SELECT id, email FROM users 
            WHERE reset_token = $1 AND reset_token_expires > NOW()
        `, [token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token' });
        }

        const user = result.rows[0];
        const newHash = await bcrypt.hash(newPassword, 10);

        await pool.query(`
            UPDATE users 
            SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL 
            WHERE id = $2
        `, [newHash, user.id]);

        res.json({
            success: true,
            message: 'Şifreniz başarıyla güncellendi!'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🔍 EN SAĞDAKİ / EN SOLDKİ BOŞ POZİSYONU BUL
// ============================================================
router.get('/find-sponsor/:position', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const position = req.params.position || 'left';
        
        console.log(`🔍 ${position} pozisyonunda boş yer aranıyor... Kullanıcı ID: ${userId}`);

        let currentId = userId;
        let currentName = null;
        let depth = 0;
        const maxDepth = 50;

        while (depth < maxDepth) {
            const result = await pool.query(`
                SELECT id, name FROM users 
                WHERE sponsor_id = $1 AND position = $2
                ORDER BY id
                LIMIT 1
            `, [currentId, position]);

            if (result.rows.length === 0) {
                const userResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [currentId]);
                currentName = userResult.rows[0]?.name || 'Kullanıcı';
                console.log(`✅ ${position} kolunda hiç üye yok, boş pozisyon: ${currentId} (${currentName})`);
                break;
            }

            const nextId = result.rows[0].id;
            currentName = result.rows[0].name;
            
            if (nextId === currentId) {
                console.log(`⚠️ Aynı kullanıcıya takıldı: ${currentId}, döngü kırılıyor.`);
                break;
            }
            
            currentId = nextId;
            depth++;
            console.log(`📍 ${position} kolunda ilerleniyor: ${currentId} (${currentName}), derinlik: ${depth}`);
        }

        if (!currentName) {
            const userResult = await pool.query(`SELECT name FROM users WHERE id = $1`, [currentId]);
            currentName = userResult.rows[0]?.name || 'Kullanıcı';
        }

        const legCheck = await pool.query(`
            SELECT COUNT(*) as count FROM users WHERE sponsor_id = $1 AND position = $2
        `, [currentId, position]);

        const count = parseInt(legCheck.rows[0].count) || 0;

        if (count >= 1) {
            console.log(`⚠️ ${currentId}'nin ${position} kolu dolu, sponsor olarak kendisi kullanılıyor`);
        }

        console.log('✅ Boş pozisyon bulundu:', { id: currentId, name: currentName, position });

        res.json({
            success: true,
            sponsor: {
                id: currentId,
                name: currentName
            },
            position: position
        });
    } catch (error) {
        console.error('Sponsor bulma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🔍 Sponsor bilgisi getir
router.get('/sponsor/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT id, name, email FROM users WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sponsor bulunamadı!' });
        }

        res.json({
            success: true,
            sponsor: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 💳 IBAN bilgilerini güncelle
router.put('/update-bank', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { bank_name, iban, tc_no, bank_account_holder } = req.body;

        await pool.query(`
            UPDATE users 
            SET bank_name = COALESCE($1, bank_name),
                iban = COALESCE($2, iban),
                tc_no = COALESCE($3, tc_no),
                bank_account_holder = COALESCE($4, bank_account_holder),
                updated_at = NOW()
            WHERE id = $5
        `, [bank_name, iban, tc_no, bank_account_holder, userId]);

        res.json({
            success: true,
            message: 'Banka bilgileri güncellendi!'
        });
    } catch (error) {
        console.error('IBAN güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// 💳 IBAN bilgilerini getir
router.get('/get-bank', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const result = await pool.query(`
            SELECT bank_name, iban, tc_no, bank_account_holder 
            FROM users WHERE id = $1
        `, [userId]);

        res.json({
            success: true,
            data: result.rows[0] || {}
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 📄 REGISTER SAYFASINI SERVE ET
// ============================================================
router.get('/register', (req, res) => {
    const position = req.query.position || '';
    res.redirect(`/register.html?position=${position}`);
});

module.exports = router;
