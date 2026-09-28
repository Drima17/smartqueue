// Checks if the user is logged in at all
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to access this page.');
  return res.redirect('/login');
}

// Checks if the logged-in user has a specific role
function hasRole(...roles) {
  return function (req, res, next) {
    if (req.session && req.session.user && roles.includes(req.session.user.role)) {
      return next();
    }
    return res.status(403).render('error', {
      message: 'Access Denied. You do not have permission to view this page.',
      user: req.session.user || null
    });
  };
}

module.exports = { isAuthenticated, hasRole };
