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

                // 🔥 DOĞRU: successFlag kontrol et!
                const successFlag = data?.data?.successFlag;

                if (successFlag === 1) { // 1 = BAŞARILI
                    // 🔥 DOĞRU: resultImageUrl'i yakala!
                    const imageUrl = data?.data?.response?.resultImageUrl ||
                                   data?.data?.resultImageUrl ||
                                   data?.data?.response?.image_url ||
                                   data?.data?.image_url;

                    if (imageUrl) {
                        console.log('✅ Görsel hazır!');
                        return { output: imageUrl };
                    }

                    throw new Error('SUCCESS ama imageUrl bulunamadı');
                }

                if (successFlag === 2 || successFlag === 3) {
                    throw new Error('Görsel oluşturma başarısız oldu');
                }

                // successFlag === 0 veya undefined ise devam et
                console.log(`⏳ Hala işleniyor (successFlag: ${successFlag})...`);

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
