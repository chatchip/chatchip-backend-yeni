const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { callAIStream, getAvailableModels, isValidVersion, DEFAULT_MODEL, getSessionMessages } = require('../services/aiService');
const { COACH_PROMPTS, COACH_TYPES, COACH_PLAN_MAP } = require('../utils/constants');

router.get('/sessions', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        
        const result = await pool.query(`
            SELECT id, title, is_pinned, created_at, updated_at, 
                   api_session_id, message_count
            FROM chat_sessions
            WHERE user_id = $1
            ORDER BY is_pinned DESC, updated_at DESC
        `, [userId]);
        
        res.json({
            success: true,
            sessions: result.rows
        });
    } catch (error) {
        console.error('Sessions error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/sessions/:id', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const sessionId = req.params.id;
        
        const sessionResult = await pool.query(`
            SELECT id, title, is_pinned, api_session_id, created_at, updated_at
            FROM chat_sessions
            WHERE id = $1 AND user_id = $2
        `, [sessionId, userId]);
        
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sohbet bulunamadı' });
        }
        
        const session = sessionResult.rows[0];
        
        let messages = [];
        if (session.api_session_id) {
            try {
                messages = await getSessionMessages(session.api_session_id);
            } catch (apiError) {
                console.error('API mesaj çekme hatası:', apiError.message);
            }
        }
        
        res.json({
            success: true,
            session: session,
            messages: messages
        });
    } catch (error) {
        console.error('Session detail error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/sessions', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { title } = req.body;
        
        const apiSessionId = `session_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        
        const result = await pool.query(`
            INSERT INTO chat_sessions (user_id, title, api_session_id, message_count)
            VALUES ($1, $2, $3, 0)
            RETURNING id, title, is_pinned, api_session_id, created_at, updated_at
        `, [userId, title || 'Yeni Sohbet', apiSessionId]);
        
        res.json({
            success: true,
            session: result.rows[0]
        });
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/sessions/:id', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const sessionId = req.params.id;
        const { title } = req.body;
        
        if (!title || title.trim().length === 0) {
            return res.status(400).json({ error: 'Başlık gerekli' });
        }
        
        const result = await pool.query(`
            UPDATE chat_sessions
            SET title = $1, updated_at = NOW()
            WHERE id = $2 AND user_id = $3
            RETURNING id, title, is_pinned, updated_at
        `, [title.trim(), sessionId, userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sohbet bulunamadı' });
        }
        
        res.json({
            success: true,
            session: result.rows[0]
        });
    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/sessions/:id/pin', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const sessionId = req.params.id;
        const { is_pinned } = req.body;
        
        const result = await pool.query(`
            UPDATE chat_sessions
            SET is_pinned = $1, updated_at = NOW()
            WHERE id = $2 AND user_id = $3
            RETURNING id, title, is_pinned, updated_at
        `, [is_pinned, sessionId, userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sohbet bulunamadı' });
        }
        
        res.json({
            success: true,
            session: result.rows[0]
        });
    } catch (error) {
        console.error('Pin session error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/sessions/:id', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const sessionId = req.params.id;
        
        const result = await pool.query(`
            DELETE FROM chat_sessions
            WHERE id = $1 AND user_id = $2
            RETURNING id
        `, [sessionId, userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sohbet bulunamadı' });
        }
        
        res.json({
            success: true,
            message: 'Sohbet silindi'
        });
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/models', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        
        const plansResult = await pool.query(`
            SELECT DISTINCT version 
            FROM user_plans 
            WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
        `, [userId]);
        
        const userVersions = plansResult.rows.map(r => r.version);
        const allModels = getAvailableModels();
        const availableModels = allModels.map(model => ({
            ...model,
            isAvailable: userVersions.includes(model.version)
        }));
        const defaultModel = userVersions.length > 0 ? userVersions[0] : DEFAULT_MODEL;
        
        res.json({
            success: true,
            models: availableModels,
            defaultModel: defaultModel,
            hasActivePlan: userVersions.length > 0
        });
    } catch (error) {
        console.error('Models error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/stream', async (req, res) => {
    try {
        const { message, version, coachType, systemPrompt, sessionId } = req.body;
        const userId = req.user?.id || 1;

        if (!message) {
            return res.status(400).json({ error: 'Mesaj gerekli' });
        }

        let selectedVersion = version || DEFAULT_MODEL;
        
        if (selectedVersion !== DEFAULT_MODEL) {
            const accessCheck = await pool.query(`
                SELECT id FROM user_plans 
                WHERE user_id = $1 AND version = $2 AND is_active = true AND expires_at > NOW()
            `, [userId, selectedVersion]);
            
            if (accessCheck.rows.length === 0) {
                const modelLabel = getAvailableModels().find(m => m.version === selectedVersion)?.label || selectedVersion;
                return res.status(403).json({ 
                    error: `⚠️ ${modelLabel} için aktif planınız yok!`,
                    code: 'PLAN_REQUIRED'
                });
            }
        }

        console.log(`💬 Chat stream: Model ${selectedVersion}, Koç: ${coachType || 'standard'}`);

        let selectedCoach = COACH_TYPES.STANDARD;
        
        if (coachType && coachType !== COACH_TYPES.STANDARD) {
            const userPlanResult = await pool.query(`
                SELECT plan_type FROM users WHERE id = $1
            `, [userId]);
            
            const userPlan = userPlanResult.rows[0]?.plan_type || 'free';
            const allowedCoaches = COACH_PLAN_MAP[userPlan] || [COACH_TYPES.STANDARD];
            
            if (allowedCoaches.includes(coachType)) {
                selectedCoach = coachType;
                console.log(`✅ ${coachType} koçu aktif`);
            } else {
                console.log(`⚠️ ${coachType} koçu ${userPlan} planında yok!`);
            }
        }

        let currentSessionId = sessionId;
        let apiSessionId = null;
        
        if (!currentSessionId) {
            apiSessionId = `session_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const sessionResult = await pool.query(`
                INSERT INTO chat_sessions (user_id, title, api_session_id, message_count)
                VALUES ($1, $2, $3, 0)
                RETURNING id
            `, [userId, message.substring(0, 30) + '...', apiSessionId]);
            currentSessionId = sessionResult.rows[0].id;
        } else {
            const sessionResult = await pool.query(`
                SELECT api_session_id FROM chat_sessions WHERE id = $1 AND user_id = $2
            `, [currentSessionId, userId]);
            if (sessionResult.rows.length > 0) {
                apiSessionId = sessionResult.rows[0].api_session_id;
            }
        }

        let systemContent = COACH_PROMPTS[selectedCoach] || COACH_PROMPTS[COACH_TYPES.STANDARD];
        
        if (systemPrompt && systemPrompt.trim()) {
            systemContent = systemPrompt.trim();
        }

        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: message }
        ];

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        let isStreamActive = true;
        
        req.on('close', () => {
            if (isStreamActive) {
                isStreamActive = false;
                console.log('🔄 Client bağlantısı kapandı, AI stream iptal ediliyor...');
                if (!res.writableEnded) {
                    res.end();
                }
            }
        });

        if (req.aborted) {
            console.log('⏹️ İstek iptal edildi (aborted)');
            return res.end();
        }

        let fullResponse = '';

        await callAIStream(selectedVersion, messages, (chunk) => {
            if (!isStreamActive) {
                console.log('⏹️ Stream pasif, chunk atlanıyor');
                return;
            }
            fullResponse += chunk;
            res.write(`data: ${JSON.stringify({ chunk, sessionId: currentSessionId })}\n\n`);
        }, apiSessionId);

        if (isStreamActive) {
            await pool.query(`
                UPDATE chat_sessions 
                SET message_count = message_count + 1,
                    updated_at = NOW() 
                WHERE id = $1
            `, [currentSessionId]);

            res.write(`data: ${JSON.stringify({ done: true, sessionId: currentSessionId })}\n\n`);
            res.end();
        } else {
            console.log('⏹️ Stream iptal edildiği için kayıt yapılmadı');
        }

    } catch (error) {
        console.error('❌ Chat error:', error);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
});

router.get('/history', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { limit = 20 } = req.query;
        
        const result = await pool.query(`
            SELECT id, title, is_pinned, api_session_id, message_count, created_at, updated_at
            FROM chat_sessions
            WHERE user_id = $1
            ORDER BY is_pinned DESC, updated_at DESC
            LIMIT $2
        `, [userId, parseInt(limit)]);
        
        res.json({
            success: true,
            history: result.rows
        });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
