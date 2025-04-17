// 检查用户是否已登录
exports.isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/auth/login');
};

// 检查用户是否是管理员
exports.isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.status(403).render('error', { 
    message: '权限不足', 
    error: { status: 403, stack: '您需要管理员权限才能访问此页面' }
  });
}; 