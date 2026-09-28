const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { isAuthenticated, hasRole } = require('../middleware/auth');

// GET /admin - admin dashboard
router.get('/', isAuthenticated, hasRole('admin'), async (req, res) => {
  try {
    const [totalPatients] = await db.query(
      `SELECT COUNT(*) AS count FROM queue_entries
       WHERE DATE(registered_at) = CURDATE()`
    );
    const [totalSeen] = await db.query(
      `SELECT COUNT(*) AS count FROM queue_entries
       WHERE status = 'seen' AND DATE(seen_at) = CURDATE()`
    );
    const [totalWaiting] = await db.query(
      `SELECT COUNT(*) AS count FROM queue_entries
       WHERE status = 'waiting' AND DATE(registered_at) = CURDATE()`
    );
    const [avgWait] = await db.query(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, called_at, seen_at)) AS avg
       FROM queue_entries
       WHERE status = 'seen'
         AND called_at IS NOT NULL
         AND seen_at IS NOT NULL
         AND DATE(seen_at) = CURDATE()`
    );
    const [deptStats] = await db.query(
      `SELECT d.name AS department_name,
              COUNT(qe.entry_id) AS total,
              SUM(CASE WHEN qe.status = 'seen' THEN 1 ELSE 0 END) AS seen,
              SUM(CASE WHEN qe.status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
              AVG(CASE WHEN qe.status = 'seen'
                THEN TIMESTAMPDIFF(MINUTE, qe.called_at, qe.seen_at)
                ELSE NULL END) AS avg_duration
       FROM departments d
       LEFT JOIN queue_entries qe
         ON d.department_id = qe.department_id
         AND DATE(qe.registered_at) = CURDATE()
       WHERE d.is_active = 1
       GROUP BY d.department_id, d.name
       ORDER BY d.name`
    );
    const [departments] = await db.query(
      'SELECT * FROM departments ORDER BY name'
    );
    const [users] = await db.query(
      `SELECT u.*, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       ORDER BY u.role, u.name`
    );

    res.render('admin', {
      user: req.session.user,
      stats: {
        total: totalPatients[0].count,
        seen: totalSeen[0].count,
        waiting: totalWaiting[0].count,
        avgWait: Math.round(avgWait[0].avg || 0)
      },
      deptStats,
      departments,
      users,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    req.flash('error', 'Could not load admin dashboard.');
    res.redirect('/login');
  }
});

// POST /admin/departments/create
router.post('/departments/create', isAuthenticated, hasRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    req.flash('error', 'Department name is required.');
    return res.redirect('/admin');
  }
  try {
    await db.query(
      'INSERT INTO departments (name) VALUES (?)',
      [name.trim()]
    );
    req.flash('success', `Department "${name.trim()}" created successfully.`);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      req.flash('error', 'A department with that name already exists.');
    } else {
      req.flash('error', 'Could not create department.');
    }
  }
  return res.redirect('/admin');
});

// POST /admin/departments/toggle - activate or deactivate a department
router.post('/departments/toggle', isAuthenticated, hasRole('admin'), async (req, res) => {
  const { department_id, is_active } = req.body;
  try {
    const newStatus = is_active === '1' ? 0 : 1;
    await db.query(
      'UPDATE departments SET is_active = ? WHERE department_id = ?',
      [newStatus, department_id]
    );
    req.flash('success', 'Department status updated.');
  } catch (err) {
    req.flash('error', 'Could not update department.');
  }
  return res.redirect('/admin');
});

// POST /admin/users/create
router.post('/users/create', isAuthenticated, hasRole('admin'), async (req, res) => {
  const { name, username, password, role, department_id } = req.body;

  if (!name || !username || !password || !role) {
    req.flash('error', 'Name, username, password and role are required.');
    return res.redirect('/admin');
  }
  if (role === 'doctor' && !department_id) {
    req.flash('error', 'A department must be assigned to a doctor.');
    return res.redirect('/admin');
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO users (name, username, password_hash, role, department_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        username.trim(),
        hash,
        role,
        role === 'doctor' ? department_id : null
      ]
    );
    req.flash('success', `User "${name.trim()}" created successfully.`);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      req.flash('error', 'That username is already taken.');
    } else {
      req.flash('error', 'Could not create user.');
    }
  }
  return res.redirect('/admin');
});

// POST /admin/users/toggle - activate or deactivate a user
router.post('/users/toggle', isAuthenticated, hasRole('admin'), async (req, res) => {
  const { user_id, is_active } = req.body;
  try {
    const newStatus = is_active === '1' ? 0 : 1;
    await db.query(
      'UPDATE users SET is_active = ? WHERE user_id = ?',
      [newStatus, user_id]
    );
    req.flash('success', 'User status updated.');
  } catch (err) {
    req.flash('error', 'Could not update user status.');
  }
  return res.redirect('/admin');
});

module.exports = router;
