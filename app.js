const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authMiddleware = require('./middleware/auth');
const routes = require('./routes');
const paymentRoutes = require('./routes/payments.routes');
const { router: uploadRoutes } = require('./routes/upload.routes');
const paymentReportsRoutes = require('./routes/payment-reports.routes');
const refundRoutes = require('./routes/refund.routes');
const fluxService = require('./services/fluxService');

const app = express();

// 🔥 RATE LIMITING - DDoS koruması
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 200, // Her IP'den 200 istek
    message: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika bekleyin.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Admin panel için özel limit
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Admin işlemleri için çok fazla istek.',
});

// Görsel üretim için özel limit
const imageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Görsel üretim limitine ulaştınız. Lütfen bekleyin.',
});

// 🔥 CORS - Tüm domain'ler eklendi
app.use(cors({
    origin: [
        'https://www.thechatchip.com',
        'https://chatchip-app-production.up.railway.app',
        'https://www.thechatchip.com',
        'https://thechatchip.com',
        'https://api.thechatchip.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// 🔥 Rate limit'leri uygula
app.use('/api/', limiter);
app.use('/api/admin/', adminLimiter);
app.use('/api/image/generate', imageLimiter);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'ChatChip API çalışıyor! 🚀' });
});

// 🔥 Görsel üretim rotası (Flux AI)
app.post('/api/image/generate', authMiddleware, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt gerekli' });
        }
        
        console.log(`🎨 Görsel üretiliyor: "${prompt}"`);
        const result = await fluxService.generateImage(prompt);
        
        res.json({
            success: true,
            imageUrl: result.output || result.image_url,
            prompt: prompt
        });
    } catch (error) {
        console.error('❌ Görsel üretim hatası:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/pricing', require('./routes/pricing.routes'));
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/payment-reports', authMiddleware, paymentReportsRoutes);
app.use('/api/refund', authMiddleware, refundRoutes);

app.use('/api', authMiddleware, routes);
app.use('/api/payments', authMiddleware, paymentRoutes);

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint bulunamadı: ' + req.url });
});

app.use((err, req, res, next) => {
    console.error('❌ Hata:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
});

if (process.env.NODE_ENV !== 'test') {
    try {
        require('./cronJobs');
        console.log('✅ Cron job\'lar başlatıldı!');
    } catch (error) {
        console.warn('⚠️ Cron job\'lar başlatılamadı:', error.message);
    }
}

module.exports = app;
