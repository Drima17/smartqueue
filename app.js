const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ── Make io accessible inside all route handlers ─────────────────────
app.set('io', io);

// ── View engine ───────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static files ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session ───────────────────────────────────────────────────────────
app.use(session({
  secret: 'smartqueue_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// ── Flash messages ────────────────────────────────────────────────────
app.use(flash());

// ── Make flash messages available in all views ────────────────────────
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth');
const receptionistRoutes = require('./routes/receptionist');
const doctorRoutes       = require('./routes/doctor');
const adminRoutes        = require('./routes/admin');
const patientRoutes      = require('./routes/patient');

app.use('/', authRoutes);
app.use('/receptionist', receptionistRoutes);
app.use('/doctor', doctorRoutes);
app.use('/admin', adminRoutes);
app.use('/', patientRoutes);

// ── Root redirect ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect(`/${req.session.user.role}`);
  }
  return res.redirect('/login');
});

// ── 404 handler ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found.',
    user: req.session.user || null
  });
});

// ── Socket.io real-time connection handler ────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Client tells us which department they want updates for
  socket.on('join-department', (departmentId) => {
    socket.join(`dept-${departmentId}`);
    console.log(`Socket ${socket.id} joined dept-${departmentId}`);
  });

  // Client joins a patient tracking room using their token
  socket.on('join-tracking', (token) => {
    socket.join(`track-${token}`);
    console.log(`Socket ${socket.id} joined track-${token}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ── Start server ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ SmartQueue server running at http://localhost:${PORT}`);
  console.log(`   Waiting room display: http://localhost:${PORT}/display`);
  console.log(`   Login page:           http://localhost:${PORT}/login\n`);
});
