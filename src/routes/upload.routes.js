const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const EXPIRY_MS = 24 * 60 * 60 * 1000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Sadece resim dosyaları yüklenebilir!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

router.post('/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenemedi!' });
        }

        const userId = req.user?.id || 1;
        const filePath = req.file.path;
        const fileName = req.file.filename;
        const originalName = req.file.originalname;
        const fileSize = req.file.size;

        console.log(`📤 Dosya yüklendi: ${fileName}`);

        const optimizedPath = path.join(uploadDir, `opt_${fileName}`);
        await sharp(filePath)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(optimizedPath);

        fs.unlinkSync(filePath);
        const finalFileName = `opt_${fileName}`;

        const expiresAt = new Date(Date.now() + EXPIRY_MS);
        const result = await pool.query(`
            INSERT INTO uploads (user_id, file_name, original_name, file_path, file_size, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [userId, finalFileName, originalName, `/uploads/${finalFileName}`, fileSize, expiresAt]);

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${finalFileName}`;

        res.json({
            success: true,
            fileId: result.rows[0].id,
            fileName: finalFileName,
            originalName: originalName,
            fileUrl: fileUrl,
            expiresAt: expiresAt,
            message: '✅ Dosya başarıyla yüklendi! (24 saat geçerli)'
        });

    } catch (error) {
        console.error('❌ Dosya yükleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || 1;

        const result = await pool.query(
            'SELECT file_path FROM uploads WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dosya bulunamadı' });
        }

        const filePath = path.join(__dirname, '../../', result.rows[0].file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await pool.query('DELETE FROM uploads WHERE id = $1', [id]);

        res.json({ success: true, message: 'Dosya silindi!' });

    } catch (error) {
        console.error('Dosya silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

async function cleanExpiredFiles() {
    try {
        console.log('🧹 Süresi dolan dosyalar temizleniyor...');
        const result = await pool.query(`
            SELECT id, file_path FROM uploads 
            WHERE expires_at < NOW()
        `);

        for (const row of result.rows) {
            const filePath = path.join(__dirname, '../../', row.file_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            await pool.query('DELETE FROM uploads WHERE id = $1', [row.id]);
        }

        console.log(`✅ ${result.rows.length} dosya temizlendi`);
    } catch (error) {
        console.error('❌ Temizlik hatası:', error);
    }
}

module.exports = { router, cleanExpiredFiles };
