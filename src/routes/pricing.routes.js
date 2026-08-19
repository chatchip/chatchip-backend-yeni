const express = require('express');
const router = express.Router();

const PLANS = [
    { 
        id: 1,
        name: 'Lite Plan', 
        type: 'normal',
        monthly: { price: 15, cv: 12.0, duration: '1 ay' }, 
        quarterly: { price: 45, cv: 36.0, duration: '3 ay' }, 
        yearly: { price: 180, cv: 144.0, duration: '12 ay' },
        features: [
            '💬 ChatChip 1.0', 
            '📩 Yüksek Mesajlaşma', 
            '🖼️ Sınırlı Görsel',
            '🧠 Coach.AI Modülü'
        ]
    },
    { 
        id: 2,
        name: 'Plus Plan', 
        type: 'normal',
        monthly: { price: 25, cv: 20.0, duration: '1 ay' }, 
        quarterly: { price: 75, cv: 60.0, duration: '3 ay' }, 
        yearly: { price: 300, cv: 240.0, duration: '12 ay' },
        features: [
            '💬 ChatChip 2.0', 
            '♾️ Sınırsız Mesajlaşma', 
            '🖼️ Yüksek Sınırlı Görsel', 
            '🎯 Ek Özelliklere Erişim',
            '🧠 Coach.AI Modülü'
        ]
    },
    { 
        id: 3,
        name: 'Pro Plan', 
        type: 'normal',
        monthly: { price: 35, cv: 28.0, duration: '1 ay' }, 
        quarterly: { price: 105, cv: 84.0, duration: '3 ay' }, 
        yearly: { price: 420, cv: 336.0, duration: '12 ay' },
        features: [
            '💬 ChatChip 2.1', 
            '♾️ Sınırsız Mesajlaşma', 
            '🖼️ Maksimum Görsel', 
            '🚀 Tüm Ek Özelliklere Erişim',
            '🧠 Coach.AI Modülü'
        ]
    }
];

router.get('/', (req, res) => {
    res.json({ success: true, plans: PLANS });
});

module.exports = router;
