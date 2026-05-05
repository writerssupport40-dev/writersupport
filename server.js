const fs = require('fs');
const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'admin-auth.db');
const JWT_SECRET = process.env.JWT_SECRET || 'Linkrite-secret-2026';
const COOKIE_NAME = 'admin_token';
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'Linkrite2025';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: false,
  maxAge: 2 * 60 * 60 * 1000 // 2 hours
};

// Email Configuration
const EMAIL_USER = process.env.EMAIL_USER || 'musamubarak350@gmail.com';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'siui usak mwjm gzgw'; // Gmail app password

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD
  }
});

async function sendEmail(to, subject, htmlContent) {
  try {
    await transporter.sendMail({
      from: EMAIL_USER,
      to: to,
      subject: subject,
      html: htmlContent
    });
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Email error for ${to}:`, err.message);
    return false;
  }
}

function fmtDate(d) { return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }

function openDb() {
  return new sqlite3.Database(DB_FILE);
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function ensureDatabase() {
  const db = openDb();
  await runSql(db, `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first TEXT NOT NULL,
    last TEXT NOT NULL,
    email TEXT NOT NULL,
    service TEXT NOT NULL,
    note TEXT,
    status TEXT DEFAULT 'pending',
    date TEXT NOT NULL
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    service TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed'
  )`);

  const existing = await getSql(db, 'SELECT id FROM users WHERE username = ?', [ADMIN_USER]);
  if (!existing) {
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await runSql(db, 'INSERT INTO users (username, password) VALUES (?, ?)', [ADMIN_USER, hashed]);
    console.log('Seeded default admin user.');
  }

  // Seed sample data if empty
  const reqCount = await getSql(db, 'SELECT COUNT(*) as count FROM requests');
  if (reqCount.count === 0) {
    // Removed seeding - start with empty database
  }

  const bookCount = await getSql(db, 'SELECT COUNT(*) as count FROM bookings');
  if (bookCount.count === 0) {
    // Removed seeding - start with empty database
  }

  db.close();
}

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ authenticated: false });
  const data = verifyToken(token);
  if (!data) return res.status(401).json({ authenticated: false });
  req.admin = data;
  next();
}

app.use(express.json());
app.use(cookieParser());

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required.' });
  }

  const db = openDb();
  const user = await getSql(db, 'SELECT * FROM users WHERE username = ?', [username]);
  db.close();

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = createToken({ id: user.id, username: user.username });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ success: true });
});

app.get('/api/admin/verify', authMiddleware, (req, res) => {
  res.json({ authenticated: true, username: req.admin.username });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { sameSite: 'strict', secure: false });
  res.json({ success: true });
});

// REQUESTS API
app.get('/api/requests', authMiddleware, async (req, res) => {
  const db = openDb();
  const requests = await allSql(db, 'SELECT * FROM requests ORDER BY id DESC');
  db.close();
  res.json(requests);
});

app.post('/api/requests', authMiddleware, async (req, res) => {
  const { first, last, email, service, note, status = 'pending' } = req.body;
  if (!first || !email || !service) return res.status(400).json({ error: 'Missing required fields' });

  const db = openDb();
  const result = await runSql(db, 'INSERT INTO requests (first, last, email, service, note, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [first, last, email, service, note, status, fmtDate(new Date())]);
  db.close();
  res.json({ id: result.lastID });
});

// PUBLIC API — Website form submissions (no auth required)
app.post('/api/public/requests', async (req, res) => {
  console.log('📨 Received form submission');
  const { first, last, email, service, note, status = 'pending' } = req.body;
  console.log('📝 Form data:', { first, last, email, service, note });
  
  if (!first || !email || !service) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = openDb();
  const result = await runSql(db, 'INSERT INTO requests (first, last, email, service, note, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [first, last, email, service, note, status, fmtDate(new Date())]);
  db.close();
  console.log('✅ Request saved to database with ID:', result.lastID);

  // Send confirmation email
  const emailSubject = 'Service Request Confirmation - Linkrite';
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
      <h2 style="color: #1a73e8; text-align: center;">Service Request Received ✓</h2>
      <p>Hi ${first},</p>
      <p>Thank you for submitting your service request to Linkrite. We've received your information and will get back to you shortly.</p>
      
      <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #1a73e8; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #333;">Request Details:</h3>
        <p><strong>Name:</strong> ${first} ${last || ''}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Status:</strong> Pending Review</p>
        <p><strong>Request ID:</strong> #${result.lastID}</p>
        ${note ? `<p><strong>Message:</strong> ${note}</p>` : ''}
      </div>

      <div style="background-color: #e8f0fe; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1a73e8;">Consultation Meeting</h3>
        <p>Join us for a consultation meeting:</p>
        <p style="text-align: center;">
          <a href="https://meet.google.com/Linkrite-consultation" style="display: inline-block; background-color: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Join Google Meet</a>
        </p>
        <p style="font-size: 12px; color: #666;">Meeting ID: Linkrite-consultation</p>
      </div>
      
      <p>We typically respond within 24-48 hours. If you have any questions, feel free to reach out to us directly.</p>
      
      <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #ddd; padding-top: 15px;">
        Best regards,<br>
        <strong>Linkrite Team</strong><br>
        <em>Professional Services & Solutions</em>
      </p>
    </div>
  `;
  
  console.log(`📧 Attempting to send email to: ${email}`);
  const emailSent = await sendEmail(email, emailSubject, emailHtml);
  console.log(`📧 Email send result: ${emailSent ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  
  res.json({ id: result.lastID, success: true, emailSent });
});

app.put('/api/requests/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });

  const db = openDb();
  await runSql(db, 'UPDATE requests SET status = ? WHERE id = ?', [status, id]);
  db.close();
  res.json({ success: true });
});

app.delete('/api/requests/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const db = openDb();
  await runSql(db, 'DELETE FROM requests WHERE id = ?', [id]);
  db.close();
  res.json({ success: true });
});

// BOOKINGS API
app.get('/api/bookings', authMiddleware, async (req, res) => {
  const db = openDb();
  const bookings = await allSql(db, 'SELECT * FROM bookings ORDER BY date ASC');
  db.close();
  res.json(bookings);
});

app.post('/api/bookings', authMiddleware, async (req, res) => {
  console.log('📅 Received booking submission');
  const { name, service, date, time, email, status = 'confirmed' } = req.body;
  
  if (!name || !service || !date || !time || !email) {
    console.log('❌ Missing required booking fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = openDb();
  const result = await runSql(db, 'INSERT INTO bookings (name, service, date, time, email, status) VALUES (?, ?, ?, ?, ?, ?)',
    [name, service, date, time, email, status]);
  db.close();
  console.log('✅ Booking saved to database with ID:', result.lastID);

  // Send confirmation email
  const emailSubject = 'Consultation Booking Confirmed - Linkrite';
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
      <h2 style="color: #1a73e8; text-align: center;">Consultation Booking Confirmed ✓</h2>
      <p>Hi ${name},</p>
      <p>Your consultation booking has been confirmed! We're excited to discuss your ${service} needs with you.</p>
      
      <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #1a73e8; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #333;">Consultation Details:</h3>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Booking ID:</strong> #${result.lastID}</p>
        <p><strong>Status:</strong> Confirmed</p>
      </div>

      <div style="background-color: #e8f0fe; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1a73e8;">Join Your Consultation</h3>
        <p>Click the link below to join your consultation meeting:</p>
        <p style="text-align: center;">
          <a href="https://meet.google.com/Linkrite-consultation" style="display: inline-block; background-color: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Join Google Meet</a>
        </p>
        <p style="font-size: 12px; color: #666;">Meeting ID: Linkrite-consultation</p>
      </div>

      <div style="background-color: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <h3 style="margin-top: 0; color: #856404;">📋 Upcoming and Past Consultations</h3>
        <p>You can manage all your consultations from your account. Check back anytime to:</p>
        <ul style="color: #856404;">
          <li>View upcoming consultation dates</li>
          <li>Review past consultation notes</li>
          <li>Reschedule or cancel if needed</li>
        </ul>
      </div>
      
      <p>If you need to reschedule or have any questions, please contact us directly.</p>
      
      <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #ddd; padding-top: 15px;">
        Best regards,<br>
        <strong>Linkrite Team</strong><br>
        <em>Professional Services & Solutions</em>
      </p>
    </div>
  `;
  
  console.log(`📧 Attempting to send booking confirmation email to: ${email}`);
  const emailSent = await sendEmail(email, emailSubject, emailHtml);
  console.log(`📧 Booking email send result: ${emailSent ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  
  res.json({ id: result.lastID, emailSent });
});

app.get('/admin-login.html', (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (token && verifyToken(token)) {
    return res.redirect('/adminpanel.html');
  }
  res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/adminpanel.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'adminpanel.html'));
});

app.use(express.static(path.join(__dirname)));

ensureDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
