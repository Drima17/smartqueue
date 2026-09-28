const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /track/:token - patient self-tracking page
router.get('/track/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // Get this patient's queue entry
    const [rows] = await db.query(
      `SELECT qe.entry_id, qe.queue_number, qe.token, qe.status,
              qe.registered_at, qe.called_at, qe.seen_at,
              qe.department_id,
              p.name AS patient_name, p.age, p.sex, p.complaint,
              d.name AS department_name
       FROM queue_entries qe
       JOIN patients p ON qe.patient_id = p.patient_id
       JOIN departments d ON qe.department_id = d.department_id
       WHERE qe.token = ?`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).render('error', {
        message: 'Queue entry not found. Please check your tracking link.',
        user: null
      });
    }

    const entry = rows[0];

    // Get all waiting patients in same department today (for position calc)
    const [queueRows] = await db.query(
      `SELECT qe.entry_id, qe.queue_number, qe.token, qe.status,
              p.name AS patient_name, d.name AS department_name,
              d.department_id
       FROM queue_entries qe
       JOIN patients p ON qe.patient_id = p.patient_id
       JOIN departments d ON qe.department_id = d.department_id
       WHERE qe.department_id = ?
         AND qe.status IN ('waiting', 'called')
         AND DATE(qe.registered_at) = CURDATE()
       ORDER BY qe.queue_number ASC`,
      [entry.department_id]
    );

    // Get average consultation duration for wait time estimate
    const [avgRows] = await db.query(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, called_at, seen_at)) AS avg_duration
       FROM queue_entries
       WHERE department_id = ?
         AND status = 'seen'
         AND called_at IS NOT NULL
         AND seen_at IS NOT NULL
         AND DATE(seen_at) = CURDATE()`,
      [entry.department_id]
    );

    const avgDuration = avgRows[0].avg_duration || 10;

    // Calculate position and wait time for every patient in queue
    let waitingCount = 0;
    let myPosition = 0;
    let myEstWait = 0;

    const fullQueue = queueRows.map(row => {
      let position = 0;
      let estWait = 0;

      if (row.status === 'waiting') {
        position = waitingCount;
        estWait = Math.round(waitingCount * avgDuration);
        waitingCount++;
      }

      if (row.token === token) {
        myPosition = position;
        myEstWait = estWait;
      }

      return { ...row, position, est_wait: estWait };
    });

    const patientsAhead = entry.status === 'waiting' ? myPosition : 0;

    res.render('track', {
      entry,
      fullQueue,
      myPosition,
      myEstWait,
      patientsAhead,
      avgDuration: Math.round(avgDuration),
      token,
      user: null
    });
  } catch (err) {
    console.error('Patient tracking error:', err);
    return res.status(500).render('error', {
      message: 'A server error occurred. Please try again.',
      user: null
    });
  }
});

// GET /display - public waiting room display (no login needed)
router.get('/display', async (req, res) => {
  try {
    const [departments] = await db.query(
      'SELECT * FROM departments WHERE is_active = 1 ORDER BY name'
    );

    // Get all active queue entries across all departments
    const [queue] = await db.query(
      `SELECT qe.entry_id, qe.queue_number, qe.token, qe.status,
              qe.registered_at, qe.called_at,
              p.name AS patient_name,
              d.name AS department_name, d.department_id
       FROM queue_entries qe
       JOIN patients p ON qe.patient_id = p.patient_id
       JOIN departments d ON qe.department_id = d.department_id
       WHERE qe.status IN ('waiting', 'called')
         AND DATE(qe.registered_at) = CURDATE()
       ORDER BY qe.department_id, qe.queue_number ASC`
    );

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
    avgRows.forEach(r => { avgMap[r.department_id] = r.avg_duration || 10; });

    const deptPositions = {};
    queue.forEach(entry => {
      if (!deptPositions[entry.department_id]) {
        deptPositions[entry.department_id] = 0;
      }
      if (entry.status === 'waiting') {
        const avg = avgMap[entry.department_id] || 10;
        entry.est_wait = Math.round(deptPositions[entry.department_id] * avg);
        deptPositions[entry.department_id]++;
      } else {
        entry.est_wait = 0;
      }
    });

    res.render('display', {
      departments,
      queue,
      user: null
    });
  } catch (err) {
    console.error('Display error:', err);
    res.status(500).send('Display error. Please refresh.');
  }
});

module.exports = router;
