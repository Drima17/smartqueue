const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { isAuthenticated, hasRole } = require('../middleware/auth');

// GET /receptionist - main dashboard
router.get('/', isAuthenticated, hasRole('receptionist', 'admin'), async (req, res) => {
  try {
    const [departments] = await db.query(
      'SELECT * FROM departments WHERE is_active = 1 ORDER BY name'
    );

    const [queue] = await db.query(
      `SELECT qe.*, p.name AS patient_name, p.age, p.sex,
              p.complaint, d.name AS department_name
       FROM queue_entries qe
       JOIN patients p ON qe.patient_id = p.patient_id
       JOIN departments d ON qe.department_id = d.department_id
       WHERE qe.status IN ('waiting', 'called')
         AND DATE(qe.registered_at) = CURDATE()
       ORDER BY qe.department_id, qe.queue_number ASC`
    );

    // Calculate estimated wait times
    const [avgRows] = await db.query(
      `SELECT department_id,
              AVG(TIMESTAMPDIFF(MINUTE, called_at, seen_at)) AS avg_duration
       FROM queue_entries
       WHERE status = 'seen'
         AND called_at IS NOT NULL
         AND seen_at IS NOT NULL
         AND DATE(seen_at) = CURDATE()
       GROUP BY department_id`
    );

    const avgMap = {};
    avgRows.forEach(r => {
      avgMap[r.department_id] = r.avg_duration || 10;
    });

    // Count waiting patients per dept ahead of each patient
    const deptPositions = {};
    queue.forEach(entry => {
      if (!deptPositions[entry.department_id]) {
        deptPositions[entry.department_id] = 0;
      }
      if (entry.status === 'waiting') {
        entry.position = deptPositions[entry.department_id];
        const avg = avgMap[entry.department_id] || 10;
        entry.est_wait = Math.round(entry.position * avg);
        deptPositions[entry.department_id]++;
      } else {
        entry.position = 0;
        entry.est_wait = 0;
      }
    });

    res.render('receptionist', {
      user: req.session.user,
      departments,
      queue,
      error: req.flash('error'),
      success: req.flash('success'),
      newToken: req.query.token || null,
      newQnum: req.query.qnum || null,
      registered: req.query.registered || null
    });
  } catch (err) {
    console.error('Receptionist dashboard error:', err);
    req.flash('error', 'Could not load dashboard. Please try again.');
    res.redirect('/login');
  }
});

// POST /receptionist/register - register a new patient
router.post('/register', isAuthenticated, hasRole('receptionist', 'admin'), async (req, res) => {
  const { name, age, sex, phone, complaint, department_id } = req.body;

  if (!name || !age || !sex || !department_id) {
    req.flash('error', 'Name, age, sex and department are required.');
    return res.redirect('/receptionist');
  }

  try {
    // Insert patient record
    const [patientResult] = await db.query(
      'INSERT INTO patients (name, age, sex, phone, complaint) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), parseInt(age), sex, phone || null, complaint || null]
    );
    const patientId = patientResult.insertId;

    // Get next queue number for this department today
    const [numRows] = await db.query(
      `SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_num
       FROM queue_entries
       WHERE department_id = ?
         AND DATE(registered_at) = CURDATE()`,
      [department_id]
    );
    const queueNumber = numRows[0].next_num;

    // Generate unique token for patient self-tracking
    const token = uuidv4();

    // Insert queue entry
    await db.query(
      `INSERT INTO queue_entries
         (patient_id, department_id, queue_number, token, status)
       VALUES (?, ?, ?, ?, 'waiting')`,
      [patientId, department_id, queueNumber, token]
    );

    // Emit real-time update to all connected clients
    const io = req.app.get('io');
    const updatedQueue = await getQueueData(department_id);
    io.emit('queue-update', {
      department_id: parseInt(department_id),
      queue: updatedQueue
    });

    return res.redirect('/receptionist?registered=1&qnum=' + queueNumber + '&token=' + token);
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error', 'Could not register patient. Please try again.');
    return res.redirect('/receptionist');
  }
});

// POST /receptionist/cancel - cancel a queue entry
router.post('/cancel', isAuthenticated, hasRole('receptionist', 'admin'), async (req, res) => {
  const { entry_id, department_id } = req.body;

  try {
    await db.query(
      `UPDATE queue_entries SET status = 'cancelled' WHERE entry_id = ?`,
      [entry_id]
    );

    const io = req.app.get('io');
    const updatedQueue = await getQueueData(department_id);
    io.emit('queue-update', {
      department_id: parseInt(department_id),
      queue: updatedQueue
    });

    req.flash('success', 'Queue entry cancelled.');
    return res.redirect('/receptionist');
  } catch (err) {
    console.error('Cancel error:', err);
    req.flash('error', 'Could not cancel entry. Please try again.');
    return res.redirect('/receptionist');
  }
});

// Helper: fetch live queue data for a department
async function getQueueData(departmentId) {
  const [rows] = await db.query(
    `SELECT qe.entry_id, qe.queue_number, qe.token, qe.status,
            qe.registered_at, qe.called_at,
            p.name AS patient_name, p.age, p.sex, p.complaint,
            d.name AS department_name, d.department_id
     FROM queue_entries qe
     JOIN patients p ON qe.patient_id = p.patient_id
     JOIN departments d ON qe.department_id = d.department_id
     WHERE qe.department_id = ?
       AND qe.status IN ('waiting', 'called')
       AND DATE(qe.registered_at) = CURDATE()
     ORDER BY qe.queue_number ASC`,
    [departmentId]
  );

  const [avgRows] = await db.query(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, called_at, seen_at)) AS avg_duration
     FROM queue_entries
     WHERE department_id = ?
       AND status = 'seen'
       AND called_at IS NOT NULL
       AND seen_at IS NOT NULL
       AND DATE(seen_at) = CURDATE()`,
    [departmentId]
  );

  const avgDuration = avgRows[0].avg_duration || 10;
  let waitingCount = 0;

  rows.forEach(entry => {
    if (entry.status === 'waiting') {
      entry.est_wait = Math.round(waitingCount * avgDuration);
      entry.position = waitingCount;
      waitingCount++;
    } else {
      entry.est_wait = 0;
      entry.position = 0;
    }
  });

  return rows;
}

module.exports = router;
module.exports.getQueueData = getQueueData;
