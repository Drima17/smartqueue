const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isAuthenticated, hasRole } = require('../middleware/auth');
const { getQueueData } = require('./receptionist');

// GET /doctor - doctor dashboard
router.get('/', isAuthenticated, hasRole('doctor'), async (req, res) => {
  try {
    const departmentId = req.session.user.department_id;

    const [queue] = await db.query(
      `SELECT qe.entry_id, qe.queue_number, qe.token, qe.status,
              qe.registered_at, qe.called_at,
              p.name AS patient_name, p.age, p.sex, p.complaint,
              d.name AS department_name
       FROM queue_entries qe
       JOIN patients p ON qe.patient_id = p.patient_id
       JOIN departments d ON qe.department_id = d.department_id
       WHERE qe.department_id = ?
         AND qe.status IN ('waiting', 'called')
         AND DATE(qe.registered_at) = CURDATE()
       ORDER BY qe.queue_number ASC`,
      [departmentId]
    );

    // Get today's stats for this doctor (from consultations table)
    const [stats] = await db.query(
      `SELECT
         COUNT(*) AS total_seen,
         AVG(c.duration_minutes) AS avg_duration
       FROM consultations c
       JOIN queue_entries qe ON c.entry_id = qe.entry_id
       WHERE qe.department_id = ?
         AND c.doctor_id = ?
         AND DATE(qe.seen_at) = CURDATE()`,
      [departmentId, req.session.user.user_id]
    );

    // Get average duration for wait time calculation
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

    queue.forEach(entry => {
      if (entry.status === 'waiting') {
        entry.est_wait = Math.round(waitingCount * avgDuration);
        entry.position = waitingCount;
        waitingCount++;
      } else {
        entry.est_wait = 0;
        entry.position = 0;
      }
    });

    res.render('doctor', {
      user: req.session.user,
      queue,
      stats: stats[0],
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Doctor dashboard error:', err);
    return res.status(500).render('error', {
      message: 'Could not load doctor dashboard. Please try again. Error: ' + err.message,
      user: req.session.user || null
    });
  }
});

// POST /doctor/call-next - call the next waiting patient
router.post('/call-next', isAuthenticated, hasRole('doctor'), async (req, res) => {
  const departmentId = req.session.user.department_id;

  try {
    // First mark any currently 'called' patient back or leave them
    // Get the next waiting patient
    const [waiting] = await db.query(
      `SELECT entry_id FROM queue_entries
       WHERE department_id = ?
         AND status = 'waiting'
         AND DATE(registered_at) = CURDATE()
       ORDER BY queue_number ASC
       LIMIT 1`,
      [departmentId]
    );

    if (waiting.length === 0) {
      req.flash('error', 'No more patients waiting in the queue.');
      return res.redirect('/doctor');
    }

    const entryId = waiting[0].entry_id;

    await db.query(
      `UPDATE queue_entries
       SET status = 'called', called_at = NOW()
       WHERE entry_id = ?`,
      [entryId]
    );

    // Broadcast real-time update
    const io = req.app.get('io');
    const updatedQueue = await getQueueData(departmentId);
    io.emit('queue-update', {
      department_id: parseInt(departmentId),
      queue: updatedQueue
    });

    req.flash('success', 'Next patient called successfully.');
    return res.redirect('/doctor');
  } catch (err) {
    console.error('Call next error:', err);
    req.flash('error', 'Could not call next patient.');
    return res.redirect('/doctor');
  }
});

// POST /doctor/mark-seen - mark current patient as seen
router.post('/mark-seen', isAuthenticated, hasRole('doctor'), async (req, res) => {
  const { entry_id, notes } = req.body;
  const departmentId = req.session.user.department_id;
  const doctorId = req.session.user.user_id;

  try {
    // Mark queue entry as seen
    await db.query(
      `UPDATE queue_entries
       SET status = 'seen', seen_at = NOW()
       WHERE entry_id = ? AND department_id = ?`,
      [entry_id, departmentId]
    );

    // Calculate duration
    const [durationRows] = await db.query(
      `SELECT TIMESTAMPDIFF(MINUTE, called_at, seen_at) AS duration
       FROM queue_entries WHERE entry_id = ?`,
      [entry_id]
    );

    const duration = durationRows[0]?.duration || 0;

    // Insert consultation record
    await db.query(
      `INSERT INTO consultations (entry_id, doctor_id, notes, duration_minutes)
       VALUES (?, ?, ?, ?)`,
      [entry_id, doctorId, notes || null, duration]
    );

    // Broadcast real-time update to all clients
    const io = req.app.get('io');
    const updatedQueue = await getQueueData(departmentId);
    io.emit('queue-update', {
      department_id: parseInt(departmentId),
      queue: updatedQueue
    });

    req.flash('success', 'Patient marked as seen. Queue updated.');
    return res.redirect('/doctor');
  } catch (err) {
    console.error('Mark seen error:', err);
    req.flash('error', 'Could not update patient status.');
    return res.redirect('/doctor');
  }
});

module.exports = router;
