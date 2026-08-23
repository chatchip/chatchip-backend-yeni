const axios = require('axios');

class FluxService {
    constructor() {
        this.apiKey = process.env.FLUX_API_KEY;
        this.baseUrl = 'https://fluxapi.ai/api/v1';
    }

    async generateImage(prompt) {
        try {
            console.log(`🎨 Flux AI çağrılıyor: "${prompt}"`);

            const response = await axios.post(`${this.baseUrl}/flux-kontext-api/generate-or-edit-image`, {
                prompt: prompt,
                aspect_ratio: "1:1",  // veya "16:9", "4:3", "3:2"
                num_outputs: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('📥 Flux AI yanıtı:', JSON.stringify(response.data, null, 2));

            // Flux Kontext API yanıt formatı
            const imageUrl = response.data?.image_url || 
                           response.data?.output?.url ||
                           response.data?.url ||
                           response.data?.data?.url ||
                           response.data?.result?.image_url;

            if (imageUrl) {
                return { output: imageUrl };
            }

            throw new Error('Geçersiz Flux API yanıtı: ' + JSON.stringify(response.data));
        } catch (error) {
            console.error('❌ Flux AI hatası:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new FluxService();
