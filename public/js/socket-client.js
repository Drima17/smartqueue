/* ═══════════════════════════════════════════════════════════
   SMARTQUEUE — CLIENT-SIDE REAL-TIME SOCKET HANDLER
   Handles live queue updates pushed from the server
   ═══════════════════════════════════════════════════════════ */

(function () {
  // Only run if socket.io is available (it is loaded via CDN in views)
  if (typeof io === 'undefined') return;

  const socket = io();

  /* ── Page detection ─────────────────────────────────────── */
  const page = document.body.dataset.page;
  const deptId = document.body.dataset.deptId;
  const trackToken = document.body.dataset.token;

  /* ── Join appropriate room ───────────────────────────────── */
  if (page === 'receptionist' && deptId) {
    socket.emit('join-department', parseInt(deptId));
  }
  if (page === 'doctor' && deptId) {
    socket.emit('join-department', parseInt(deptId));
  }
  if (page === 'track' && trackToken) {
    socket.emit('join-tracking', trackToken);
    // Also join the department room for full queue updates
    const deptIdTrack = document.body.dataset.deptId;
    if (deptIdTrack) socket.emit('join-department', parseInt(deptIdTrack));
  }
  if (page === 'display') {
    // Display page listens to ALL departments - join all available
    document.querySelectorAll('[data-dept-id]').forEach(el => {
      socket.emit('join-department', parseInt(el.dataset.deptId));
    });
  }

  /* ── Connection status indicator ─────────────────────────── */
  const liveEl = document.getElementById('sq-live-indicator');

  socket.on('connect', () => {
    if (liveEl) {
      liveEl.innerHTML = '<span class="sq-live-dot"></span> LIVE';
      liveEl.className = 'sq-live-badge';
    }
  });

  socket.on('disconnect', () => {
    if (liveEl) {
      liveEl.innerHTML = '⚠ Reconnecting...';
      liveEl.style.color = 'var(--sq-amber)';
      liveEl.style.background = 'var(--sq-amber-lt)';
    }
  });

  /* ── Handle queue-update event ───────────────────────────── */
  socket.on('queue-update', function (data) {
    // data = { department_id: INT, queue: Array }

    if (page === 'display') {
      updateDisplayPage(data);
    }

    if (page === 'track') {
      updateTrackPage(data);
    }

    if (page === 'receptionist' || page === 'doctor') {
      updateDashboardQueue(data);
    }
  });

  /* ══════════════════════════════════════════════════════════
     DISPLAY PAGE — Airport board style update
  ══════════════════════════════════════════════════════════ */
  function updateDisplayPage(data) {
    const tbody = document.getElementById(`display-tbody-${data.department_id}`);
    if (!tbody) return;

    const queue = data.queue.slice(0, 20); // max 20 rows

    tbody.innerHTML = '';

    if (queue.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted" style="padding:2rem;">
            No patients currently in queue
          </td>
        </tr>`;
      return;
    }

    queue.forEach((entry, index) => {
      const isCalledClass = entry.status === 'called' ? 'display-called' : '';
      const statusBadge = entry.status === 'called'
        ? '<span class="sq-badge sq-badge-called">▶ NOW CALLING</span>'
        : `<span class="sq-badge sq-badge-waiting">Waiting</span>`;
      const estWait = entry.status === 'called'
        ? '— Proceed now'
        : (entry.est_wait > 0 ? `~${entry.est_wait} min` : '< 1 min');

      const row = document.createElement('tr');
      row.className = `sq-fade-in ${isCalledClass}`;
      row.style.animationDelay = `${index * 0.04}s`;
      row.innerHTML = `
        <td class="display-queue-num">${String(entry.queue_number).padStart(3, '0')}</td>
        <td>${maskName(entry.patient_name)}</td>
        <td>${entry.department_name}</td>
        <td>${statusBadge}</td>
        <td class="font-mono" style="color:var(--sq-muted)">${estWait}</td>
      `;
      tbody.appendChild(row);
    });
  }

  /* ══════════════════════════════════════════════════════════
     PATIENT TRACKING PAGE — Update position and wait time
  ══════════════════════════════════════════════════════════ */
  function updateTrackPage(data) {
    const myToken = trackToken;
    const queue = data.queue;

    // Find this patient in the updated queue
    const myEntry = queue.find(e => e.token === myToken);
    if (!myEntry) return;

    // Update the hero panel
    const heroEl = document.getElementById('track-hero');
    const statusEl = document.getElementById('track-status');
    const positionEl = document.getElementById('track-position');
    const waitEl = document.getElementById('track-est-wait');
    const aheadEl = document.getElementById('track-ahead');

    if (myEntry.status === 'called') {
      if (heroEl) heroEl.className = 'sq-track-hero status-called';
      if (statusEl) statusEl.textContent = '▶ YOU ARE BEING CALLED — Please proceed to the consultation room';
    } else if (myEntry.status === 'seen') {
      if (heroEl) heroEl.className = 'sq-track-hero status-seen';
      if (statusEl) statusEl.textContent = '✓ Consultation complete. Thank you for your visit.';
    } else {
      if (heroEl) heroEl.className = 'sq-track-hero';
      if (statusEl) statusEl.textContent = 'Please wait — you will be called when it is your turn.';
    }

    if (positionEl) positionEl.textContent = myEntry.position != null ? myEntry.position : '—';
    if (waitEl) waitEl.textContent = myEntry.est_wait != null ? `~${myEntry.est_wait} min` : '—';
    if (aheadEl) aheadEl.textContent = myEntry.position || 0;

    // Update the full queue list rows
    const tbody = document.getElementById('track-queue-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    queue.forEach((entry, index) => {
      const isSelf = entry.token === myToken;
      const rowClass = isSelf
        ? 'row-self'
        : (entry.status === 'called' ? 'row-called' : 'row-waiting');
      const selfTag = isSelf
        ? '<span class="sq-badge" style="background:#FFF3CD;color:#856404;margin-left:0.5rem;">YOU</span>'
        : '';
      const estWait = entry.status === 'called'
        ? '— Now calling'
        : (entry.est_wait > 0 ? `~${entry.est_wait} min` : '< 1 min');

      const row = document.createElement('tr');
      row.className = rowClass;
      row.innerHTML = `
        <td class="queue-number">${String(entry.queue_number).padStart(3, '0')}${selfTag}</td>
        <td>${maskName(entry.patient_name)}</td>
        <td>${entry.department_name}</td>
        <td>${getBadge(entry.status)}</td>
        <td class="font-mono text-muted">${estWait}</td>
      `;
      tbody.appendChild(row);
    });
  }

  /* ══════════════════════════════════════════════════════════
     RECEPTIONIST / DOCTOR DASHBOARD — Update queue table
  ══════════════════════════════════════════════════════════ */
  function updateDashboardQueue(data) {
    const tbody = document.getElementById('queue-tbody');
    if (!tbody) return;

    const queue = data.queue;

    if (queue.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted" style="padding:2rem;">
            No patients in queue
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = '';
    queue.forEach(entry => {
      const estWait = entry.status === 'called'
        ? '— In consultation'
        : (entry.est_wait > 0 ? `~${entry.est_wait} min` : '< 1 min');

      tbody.innerHTML += buildDashboardRow(entry, estWait, page);
    });
  }

  /* ── Helper: build a dashboard table row ─────────────────── */
  function buildDashboardRow(entry, estWait, pageType) {
    const rowClass = entry.status === 'called' ? 'row-called' : 'row-waiting';

    const actionCell = pageType === 'doctor'
      ? (entry.status === 'called'
          ? `<form method="POST" action="/doctor/mark-seen" style="display:inline">
               <input type="hidden" name="entry_id" value="${entry.entry_id}">
               <button class="sq-btn sq-btn-success sq-btn-sm" type="submit">✓ Mark Seen</button>
             </form>`
          : '<span class="text-muted" style="font-size:0.8rem">Waiting</span>')
      : `<form method="POST" action="/receptionist/cancel" style="display:inline"
             onsubmit="return confirm('Cancel this queue entry?')">
           <input type="hidden" name="entry_id" value="${entry.entry_id}">
           <input type="hidden" name="department_id" value="${entry.department_id}">
           <button class="sq-btn sq-btn-danger sq-btn-sm" type="submit">Cancel</button>
         </form>`;

    return `
      <tr class="${rowClass}">
        <td class="queue-number">${String(entry.queue_number).padStart(3, '0')}</td>
        <td>${entry.patient_name}</td>
        <td>${entry.department_name}</td>
        <td>${entry.complaint || '<span class="text-muted">—</span>'}</td>
        <td>${getBadge(entry.status)}</td>
        <td class="font-mono text-muted">${estWait}</td>
        <td>${actionCell}</td>
      </tr>`;
  }

  /* ── Helper: mask patient name for privacy on display ────── */
  function maskName(name) {
    if (!name) return '—';
    const parts = name.trim().split(' ');
    return parts.map((part, i) => {
      if (i === 0) return part; // show first name in full
      return part.charAt(0) + '*'.repeat(Math.max(0, part.length - 1));
    }).join(' ');
  }

  /* ── Helper: status badge HTML ───────────────────────────── */
  function getBadge(status) {
    const badges = {
      waiting:   '<span class="sq-badge sq-badge-waiting">Waiting</span>',
      called:    '<span class="sq-badge sq-badge-called">▶ Called</span>',
      seen:      '<span class="sq-badge sq-badge-seen">✓ Seen</span>',
      cancelled: '<span class="sq-badge sq-badge-cancelled">Cancelled</span>'
    };
    return badges[status] || status;
  }

  /* ── Live clock for display page ─────────────────────────── */
  const clockEl = document.getElementById('sq-clock');
  const dateEl  = document.getElementById('sq-date');

  if (clockEl) {
    function updateClock() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-NG', {
          weekday: 'long', year: 'numeric',
          month: 'long', day: 'numeric'
        });
      }
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

})();
