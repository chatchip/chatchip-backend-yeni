const axios = require('axios');

class FluxService {
    constructor() {
        this.apiKey = process.env.FLUX_API_KEY;
        this.baseUrl = 'https://api.fluxapi.ai/api/v1';
    }

    async generateImage(prompt) {
        try {
            console.log(`🎨 Flux AI çağrılıyor: "${prompt}"`);

            // 1. Görsel oluşturma isteği gönder
            const createResponse = await axios.post(`${this.baseUrl}/flux/kontext/generate`, {
                prompt: prompt,
                aspectRatio: "1:1",
                model: "flux-kontext-pro"
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('📥 İlk yanıt:', JSON.stringify(createResponse.data, null, 2));

            const taskId = createResponse.data?.data?.taskId;
            if (!taskId) {
                throw new Error('taskId alınamadı');
            }

            console.log(`⏳ Görev ID: ${taskId}, görsel hazırlanıyor...`);

            // 2. Polling - DOĞRU ENDPOINT
            let attempts = 0;
            const maxAttempts = 30;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2500));

                console.log(`📊 Durum kontrolü (${attempts + 1}/${maxAttempts})...`);

                // 🔥 DOĞRU ENDPOINT
                const url = `${this.baseUrl}/flux/kontext/record-info?taskId=${taskId}`;
                console.log(`📡 Sorgulanıyor: ${url}`);

                const response = await axios.get(url, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = response.data;
                console.log('📊 Yanıt:', JSON.stringify(data, null, 2));

                // Dokümantasyona göre status kontrolü
                const status = data?.data?.status; // 0: GENERATING, 1: SUCCESS, 2: FAILED, 3: GENERATE_FAILED

                if (status === 1) { // SUCCESS
                    const imageUrl = data?.data?.resultImageUrl || 
                                   data?.data?.response?.resultImageUrl ||
                                   data?.data?.image_url ||
                                   data?.data?.url;

                    if (imageUrl) {
                        console.log('✅ Görsel hazır!');
                        return { output: imageUrl };
                    }

                    throw new Error('SUCCESS ama imageUrl bulunamadı: ' + JSON.stringify(data));
                }

                if (status === 2 || status === 3) {
                    throw new Error('Görsel oluşturma başarısız oldu');
                }

                // status === 0 ise devam et (GENERATING)
                console.log(`⏳ Hala işleniyor (status: ${status})...`);

                attempts++;
            }

            throw new Error('Zaman aşımı: Görsel 75 saniye içinde oluşturulamadı');

        } catch (error) {
            console.error('❌ Flux AI hatası:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new FluxService();
