const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const authMiddleware = require('./middleware/auth');
const routes = require('./routes');
const paymentRoutes = require('./routes/payments.routes');
const { router: uploadRoutes } = require('./routes/upload.routes');
const paymentReportsRoutes = require('./routes/payment-reports.routes');
const refundRoutes = require('./routes/refund.routes');

const app = express();

app.use(cors({ origin: '*' }));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'ChatChip API çalışıyor! 🚀' });
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
