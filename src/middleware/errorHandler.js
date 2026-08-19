const errorHandler = (err, req, res, next) => {
    console.error('❌ Hata:', err.message);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Sunucu hatası'
    });
};

module.exports = errorHandler;
