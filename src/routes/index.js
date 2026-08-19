const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const chatRoutes = require('./chat.routes');
const teamRoutes = require('./team.routes');
const adminRoutes = require('./admin.routes');
const mlmRoutes = require('./mlm.routes');
const pricingRoutes = require('./pricing.routes');
const planRoutes = require('./plan.routes');
const purchaseRequestRoutes = require('./purchase-requests');

router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/team', teamRoutes);
router.use('/admin', adminRoutes);
router.use('/mlm', mlmRoutes);
router.use('/pricing', pricingRoutes);
router.use('/plan', planRoutes);
router.use('/purchase-requests', purchaseRequestRoutes);

router.get('/', (req, res) => {
    res.json({
        message: 'ChatChip API v2',
        version: '2.0.0',
        routes: ['/auth', '/chat', '/team', '/admin', '/mlm', '/pricing', '/plan', '/purchase-requests']
    });
});

module.exports = router;
