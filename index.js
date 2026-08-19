const app = require('./src/app');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 ChatChip Backend çalışıyor!`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📅 ${new Date().toLocaleString('tr-TR')}`);
});
