const axios = require('axios');

class FluxService {
    constructor() {
        this.apiKey = process.env.FLUX_API_KEY;
        this.baseUrl = 'https://fluxapi.ai/api/v1';
    }

    async generateImage(prompt) {
        try {
            console.log(`🎨 Flux AI çağrılıyor: "${prompt}"`);

            const response = await axios.post(`${this.baseUrl}/generate`, {
                prompt: prompt,
                width: 1024,
                height: 768
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const imageUrl = response.data?.image_url || 
                           response.data?.output || 
                           response.data?.url;

            if (imageUrl) {
                return { output: imageUrl };
            }

            throw new Error('Geçersiz Flux API yanıtı');
        } catch (error) {
            console.error('❌ Flux AI hatası:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new FluxService();
