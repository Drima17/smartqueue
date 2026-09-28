const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect(`/${req.session.user.role}`);
  }
  res.render('login', {
    error:   req.query.error   || null,
    success: req.query.success || null
  });
});

// POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Please enter both username and password.'));
  }

  try {
    const [rows] = await db.query(
      `SELECT u.*, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE u.username = ? AND u.is_active = 1`,
      [username]
    );

    if (rows.length === 0) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid username or password. Please try again.'));
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid username or password. Please try again.'));
    }

    req.session.user = {
      user_id:         user.user_id,
      name:            user.name,
      username:        user.username,
      role:            user.role,
      department_id:   user.department_id,
      department_name: user.department_name
    };

    return res.redirect(`/${user.role}`);
  } catch (err) {
    console.error('Login error:', err);
    return res.redirect('/login?error=' + encodeURIComponent('A server error occurred. Please try again.'));
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
