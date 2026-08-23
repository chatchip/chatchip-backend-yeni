const axios = require('axios');

// ============================================================
// 🔥 MODEL KONFİGÜRASYONLARI (TEST - HEPSİ AYNI API)
// ============================================================
const MODEL_CONFIGS = {
    '1.0': {
        id: '1.0',
        label: 'ChatChip 1.0',
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        apiKey: process.env.OPENROUTER_API_KEY,
        url: 'https://openrouter.ai/api/v1/chat/completions'
    },
    '2.0': {
        id: '2.0',
        label: 'ChatChip 2.0',
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        apiKey: process.env.OPENROUTER_API_KEY,
        url: 'https://openrouter.ai/api/v1/chat/completions'
    },
    '2.1': {
        id: '2.1',
        label: 'ChatChip 2.1',
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        apiKey: process.env.OPENROUTER_API_KEY,
        url: 'https://openrouter.ai/api/v1/chat/completions'
    }
};

// Varsayılan model
const DEFAULT_MODEL = '1.0';

// ============================================================
// 🔥 MODEL ÇAĞRI
// ============================================================
async function callAI(version, messages) {
    const config = MODEL_CONFIGS[version];
    
    if (!config) {
        console.error(`❌ Model bulunamadı: ${version}`);
        return "❌ Model bulunamadı. Lütfen geçerli bir versiyon seçin.";
    }

    console.log(`📡 AI çağrısı: ${config.label} (${config.provider})`);

    try {
        if (!config.apiKey || config.apiKey === 'your_openrouter_api_key_here') {
            return "🔑 OpenRouter API key'i eksik! .env dosyasına ekleyin.";
        }

        const response = await axios.post(
            config.url,
            {
                model: config.model,
                messages: messages,
                stream: false,
                temperature: 0.7,
                max_tokens: 4096
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                    'HTTP-Referer': 'https://chatchip-production.up.railway.app',
                    'X-Title': 'ChatChip'
                }
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error(`❌ ${config.label} hatası:`, error.response?.data || error.message);
        return `⚠️ ${config.label} şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.`;
    }
}

// ============================================================
// 📡 STREAM ÇAĞRI
// ============================================================
async function callAIStream(version, messages, onChunk) {
    const config = MODEL_CONFIGS[version];
    
    if (!config) {
        onChunk('❌ Model bulunamadı');
        return;
    }

    console.log(`📡 AI Stream: ${config.label} (${config.provider})`);

    try {
        if (!config.apiKey || config.apiKey === 'your_openrouter_api_key_here') {
            onChunk("🔑 OpenRouter API key'i eksik! .env dosyasına ekleyin.");
            return;
        }

        const response = await axios.post(
            config.url,
            {
                model: config.model,
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4096
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                    'HTTP-Referer': 'https://chatchip-production.up.railway.app',
                    'X-Title': 'ChatChip'
                },
                responseType: 'stream'
            }
        );

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) onChunk(content);
                    } catch (e) {}
                }
            }
        });

        await new Promise((resolve, reject) => {
            response.data.on('end', resolve);
            response.data.on('error', reject);
        });
    } catch (error) {
        console.error(`❌ ${config.label} stream hatası:`, error.message);
        onChunk(`⚠️ ${config.label} şu anda kullanılamıyor.`);
    }
}

// ============================================================
// 📊 MODEL BİLGİLERİNİ GETİR
// ============================================================
function getAvailableModels() {
    return Object.values(MODEL_CONFIGS).map(c => ({
        version: c.id,
        label: c.label
    }));
}

function isValidVersion(version) {
    return MODEL_CONFIGS[version] !== undefined;
}

module.exports = {
    callAI,
    callAIStream,
    getAvailableModels,
    isValidVersion,
    MODEL_CONFIGS,
    DEFAULT_MODEL
};
