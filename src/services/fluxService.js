const axios = require('axios');

class FluxService {
    constructor() {
        this.apiKey = process.env.FLUX_API_KEY;
        this.baseUrl = 'https://api.fluxapi.ai/api/v1';
    }

    async generateImage(prompt) {
        try {
            console.log(`🎨 Flux AI çağrılıyor: "${prompt}"`);

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

            let attempts = 0;
            const maxAttempts = 30;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2500));

                console.log(`📊 Durum kontrolü (${attempts + 1}/${maxAttempts})...`);

                const endpoints = [
                    `${this.baseUrl}/flux/kontext/result?taskId=${taskId}`,
                    `${this.baseUrl}/flux/kontext/status/${taskId}`,
                    `${this.baseUrl}/flux/kontext/task/${taskId}/status`
                ];

                let found = false;

                for (const url of endpoints) {
                    try {
                        const response = await axios.get(url, {
                            headers: {
                                'Authorization': `Bearer ${this.apiKey}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        const data = response.data;
                        console.log('📊 Gelen Durum Yanıtı:', JSON.stringify(data, null, 2));

                        const status = data?.data?.status || data?.status || data?.state || data?.data?.state;

                        // 🔥 TÜM OLASI URL ALANLARI
                        const imageUrl = data?.data?.response?.resultImageUrl ||
                                       data?.data?.response?.image_url ||
                                       data?.data?.result?.image_url ||
                                       data?.data?.image_url ||
                                       data?.data?.url ||
                                       data?.data?.response?.url ||
                                       data?.resultImageUrl ||
                                       data?.url;

                        if (imageUrl) {
                            console.log('✅ Görsel hazır ve yakalandı:', imageUrl);
                            return { output: imageUrl };
                        }

                        if (status === 'completed' || status === 'succeeded' || status === 'done' || status === 'success') {
                            throw new Error('İşlem tamamlandı fakat görsel URL adresi bulunamadı: ' + JSON.stringify(data));
                        }

                        if (status === 'failed' || status === 'error') {
                            throw new Error('Görsel oluşturma başarısız oldu');
                        }

                        found = true;
                        break;

                    } catch (error) {
                        if (error.response?.status === 404) {
                            continue;
                        }
                        if (error.message.includes('görsel URL adresi bulunamadı')) throw error;
                    }
                }

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
