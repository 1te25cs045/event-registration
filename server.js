const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('./db');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'college-event.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(401).json({ error: `Please log in as a ${role} to continue.` });
    }
    next();
  };
}

function validateEvent(body) {
  const { name, description, date, time, venue, category } = body;
  const categories = ['Technical', 'Cultural', 'Sports', 'Workshops'];
  if (![name, description, date, time, venue, category].every(value => typeof value === 'string' && value.trim())) {
    return 'Complete all event fields.';
  }
  if (!categories.includes(category)) return 'Choose a valid event category.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return 'Enter a valid event date and time.';
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59) {
    return 'Enter a valid event date and time.';
  }
  return null;
}

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/signup', async (req, res, next) => {
  const { name, usn, email, department, password } = req.body;
  if (![name, usn, email, department, password].every(value => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'Complete all signup fields.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO students (name, usn, email, department, password_hash) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), usn.trim().toUpperCase(), email.trim().toLowerCase(), department.trim(), passwordHash]
    );
    req.session.user = { id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role: 'student' };
    res.status(201).json({ user: req.session.user });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That email or USN is already registered.' });
    next(error);
  }
});

app.post('/api/login', async (req, res, next) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash FROM students WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    req.session.user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: 'student' };
    res.json({ user: req.session.user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ error: 'Enter your admin email and password.' });
  }
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash FROM admins WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Incorrect admin email or password.' });
    }
    req.session.user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: 'admin' };
    res.json({ user: req.session.user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('college-event.sid');
    res.json({ message: 'Logged out.' });
  });
});

app.get('/api/events', async (req, res, next) => {
  try {
    const [events] = await pool.execute(
      `SELECT e.id, e.name, e.description, e.event_date AS date,
       substr(e.event_time, 1, 5) AS time, e.venue, e.category,
       (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS registration_count
       FROM events e WHERE e.event_date >= date('now', 'localtime') ORDER BY e.event_date, e.event_time`
    );
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

app.post('/api/events/:id/register', requireRole('student'), async (req, res, next) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId < 1) return res.status(400).json({ error: 'Invalid event.' });
  try {
    const [events] = await pool.execute("SELECT id FROM events WHERE id = ? AND event_date >= date('now', 'localtime')", [eventId]);
    if (!events.length) return res.status(404).json({ error: 'This event is no longer available.' });
    const registrationId = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO registrations (registration_id, student_id, event_id) VALUES (?, ?, ?)',
      [registrationId, req.session.user.id, eventId]
    );
    res.status(201).json({ registrationId, message: 'You are registered for this event.' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'You are already registered for this event.' });
    next(error);
  }
});

app.get('/api/student/registrations', requireRole('student'), async (req, res, next) => {
  try {
    const [registrations] = await pool.execute(
      `SELECT r.registration_id AS registrationId, e.id AS eventId, e.name, e.description,
       e.event_date AS date, substr(e.event_time, 1, 5) AS time,
       e.venue, e.category
       FROM registrations r JOIN events e ON e.id = r.event_id
       WHERE r.student_id = ? ORDER BY e.event_date, e.event_time`,
      [req.session.user.id]
    );
    res.json({ registrations });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', requireRole('admin'), async (req, res, next) => {
  try {
    const [[{ events }]] = await pool.execute('SELECT COUNT(*) AS events FROM events');
    const [[{ registrations }]] = await pool.execute('SELECT COUNT(*) AS registrations FROM registrations');
    const [[{ students }]] = await pool.execute('SELECT COUNT(*) AS students FROM students');
    const [rows] = await pool.execute(
      `SELECT r.registration_id AS registrationId, s.name AS studentName, s.usn, s.email, s.department,
       e.name AS eventName, e.category, e.event_date AS date
       FROM registrations r JOIN students s ON s.id = r.student_id
       JOIN events e ON e.id = r.event_id ORDER BY r.created_at DESC`
    );
    res.json({ stats: { events, registrations, students }, registrations: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/events', requireRole('admin'), async (req, res, next) => {
  try {
    const [events] = await pool.execute(
      `SELECT id, name, description, event_date AS date,
       substr(event_time, 1, 5) AS time, venue, category
       FROM events ORDER BY event_date DESC, event_time`
    );
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/events', requireRole('admin'), async (req, res, next) => {
  const invalid = validateEvent(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const { name, description, date, time, venue, category } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO events (name, description, event_date, event_time, venue, category) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), description.trim(), date, time, venue.trim(), category]
    );
    res.status(201).json({ id: result.insertId, message: 'Event created.' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/events/:id', requireRole('admin'), async (req, res, next) => {
  const invalid = validateEvent(req.body);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid event.' });
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const { name, description, date, time, venue, category } = req.body;
    const [result] = await pool.execute(
      'UPDATE events SET name = ?, description = ?, event_date = ?, event_time = ?, venue = ?, category = ? WHERE id = ?',
      [name.trim(), description.trim(), date, time, venue.trim(), category, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event updated.' });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/events/:id', requireRole('admin'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid event.' });
  try {
    const [result] = await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted.' });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Something went wrong. Check the server configuration and try again.' });
});

async function ensureAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'College Administrator' } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('Admin account not seeded: set ADMIN_EMAIL and ADMIN_PASSWORD in .env.');
    return;
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const [existing] = await pool.execute('SELECT id FROM admins WHERE email = ?', [email]);
  if (existing.length) return;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.execute('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)', [ADMIN_NAME, email, passwordHash]);
  console.log(`Created admin account for ${email}.`);
}

async function start() {
  try {
    if (!process.env.SESSION_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      throw new Error('Set SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD in .env before starting the server.');
    }
    await pool.query('SELECT 1');
    await ensureAdmin();
    app.listen(port, () => console.log(`College Event Registration System running at http://localhost:${port}`));
  } catch (error) {
    console.error('Unable to start the application.', error);
    process.exitCode = 1;
  }
}

start();
