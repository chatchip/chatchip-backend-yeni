const express = require('express');
const router = express.Router();
const { User } = require('../models');

router.get('/tree', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        console.log('🌳 Tree isteği - Kullanıcı ID:', userId);
        
        const tree = await User.getTree(userId);
        
        if (tree.length === 0) {
            return res.status(404).json({ error: 'Kök kullanıcı bulunamadı' });
        }
        
        res.json({
            success: true,
            root: tree[0],
            nodes: tree,
            total: tree.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const left = await User.getLegStats(userId, 'left');
        const right = await User.getLegStats(userId, 'right');
        
        const user = await User.findById(userId);
        const multipliers = {
            'Starter': 0.09, 'Pioneer': 0.11, 'Star': 0.12,
            'Leader': 0.13, 'Emerald': 0.15, 'Diamond': 0.16,
            'Blue Diamond': 0.18, 'Green Diamond': 0.20, 'Red Diamond': 0.22
        };
        const multiplier = multipliers[user?.career_level] || 0.09;
        
        res.json({
            success: true,
            left: { count: left.count, cv: left.total, pv: 0 },
            right: { count: right.count, cv: right.total, pv: 0 },
            career: {
                level: user?.career_level || 'Starter',
                multiplier: multiplier * 100 + '%'
            },
            potentialEarnings: Math.min(left.total, right.total) * multiplier
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
