const adminAuth = (req, res, next) => {
    console.log('🔍 Admin yetki kontrolü:', req.user?.name, 'is_admin:', req.user?.is_admin);
    
    if (!req.user?.is_admin) {
        console.log('❌ Admin değil, erişim engellendi!');
        return res.status(403).json({ 
            error: 'Bu işlem için admin yetkisi gerekli!',
            redirect: '/public/index.html'
        });
    }
    
    console.log('✅ Admin yetkisi onaylandı!');
    next();
};

module.exports = adminAuth;
