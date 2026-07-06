const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'admin-auth.db');
const JWT_SECRET = process.env.JWT_SECRET || 'WritersSupport-secret-2026';
const COOKIE_NAME = 'admin_token';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Delight@2024';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';

app.set('trust proxy', 1);

// REBUILD_TRIGGER: 20260609_v2

// CORS Configuration - allow local development, Netlify, and Render frontends
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);

    if (origin === 'file://' || origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
    if (FRONTEND_URL && origin === FRONTEND_URL) return callback(null, true);
    if (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) return callback(null, true);

    if (origin.includes('.netlify.app')) return callback(null, true);
    if (origin.includes('.onrender.com')) return callback(null, true);
    if (origin.includes('.up.railway.app')) return callback(null, true);
    if (origin.includes('railway.internal')) return callback(null, true);

    if (process.env.NODE_ENV !== 'production') return callback(null, true);

    callback(new Error('CORS not allowed'));
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 2 * 60 * 60 * 1000 // 2 hours
};

// Email Configuration
const EMAIL_USER = process.env.EMAIL_USER || 'writerssupport40@gmail.com';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD; // Gmail app password (set in environment)

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

async function sendAdminNotification(subject, htmlContent) {
  try {
    await transporter.sendMail({
      from: EMAIL_USER,
      to: EMAIL_USER,
      subject: subject,
      html: htmlContent
    });
    console.log(`✅ Admin notification sent to ${EMAIL_USER}`);
    return true;
  } catch (err) {
    console.error(`❌ Admin notification error:`, err.message);
    return false;
  }
}

// Email template builders (professional)
function buildUserTemplate({heading, intro, detailsHtml, ctaText, ctaUrl}) {
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family: 'Inter', Arial, sans-serif;color:#253243;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:30px auto;">
      <tr>
        <td style="padding:20px 0;text-align:center;">
          <img src="https://via.placeholder.com/200x40?text=WritersSupport" alt="Writers Support" style="height:40px;" />
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border-radius:8px;padding:28px;box-shadow:0 6px 24px rgba(15,23,42,0.06);">
          <h1 style="margin:0 0 12px;color:#003366;font-size:20px;">${heading}</h1>
          <p style="margin:0 0 18px;color:#54687a;line-height:1.5;">${intro}</p>

          ${detailsHtml}

          ${ctaText && ctaUrl ? `<p style="text-align:center;margin:24px 0 0;"><a href="${ctaUrl}" style="background:#003366;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;">${ctaText}</a></p>` : ''}

          <p style="margin:24px 0 0;color:#90a0ad;font-size:13px;">We typically respond within 24-48 hours. For urgent matters, reply to this email or contact us at <a href="mailto:${EMAIL_USER}">${EMAIL_USER}</a>.</p>

          <p style="margin:32px 0 0;color:#54687a;line-height:1.8;">
            Best regards,<br/>
            <strong>Writers Support Team</strong><br/>
            <span style="color:#90a0ad;font-size:13px;">Professional Services & Solutions</span>
          </p>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding:18px 0;color:#97a3ad;font-size:12px;">
          © ${new Date().getFullYear()} Writers Support
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

function buildAdminTemplate({heading, intro, detailsHtml, ctaText, ctaUrl}) {
  return `
  <!doctype html>
  <html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#eef3f8;font-family:Arial, sans-serif;color:#122333;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:24px auto;">
      <tr><td style="padding:18px 0;text-align:left;"><img src="https://via.placeholder.com/160x32?text=WritersSupport" alt="Writers Support" style="height:32px;" /></td></tr>
      <tr>
        <td style="background:#fff;border-radius:8px;padding:20px;box-shadow:0 6px 18px rgba(10,30,50,0.06);">
          <h2 style="margin:0 0 12px;color:#003366;font-size:18px;">${heading}</h2>
          <p style="margin:0 0 16px;color:#415563;">${intro}</p>

          ${detailsHtml}

          ${ctaText && ctaUrl ? `<p style="text-align:center;margin:20px 0 0;"><a href="${ctaUrl}" style="background:#003366;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${ctaText}</a></p>` : ''}

          <p style="margin:24px 0 0;color:#54687a;line-height:1.8;font-size:13px;">
            Best regards,<br/>
            <strong>Writers Support Team</strong><br/>
            <span style="color:#90a0ad;">Professional Services & Solutions</span>
          </p>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
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
    status TEXT DEFAULT 'confirmed',
    meeting_link TEXT
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first TEXT NOT NULL,
    last TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    date TEXT NOT NULL
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

  // Build professional user confirmation email
  const emailSubject = 'Service Request Confirmation - Writers Support';
  const userDetailsHtml = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:14px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Request ID:</strong> #${result.lastID}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Name:</strong> ${first} ${last || ''}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email:</strong> ${email}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Service:</strong> ${service}</td></tr>
      ${note ? `<tr><td style="padding:6px 0;"><strong>Message:</strong> ${note}</td></tr>` : ''}
    </table>
  `;
  const emailHtml = buildUserTemplate({
    heading: 'Service Request Received',
    intro: `Hi ${first}, thank you for contacting Writers Support. We have received your request and our team will review it shortly.`,
    detailsHtml: userDetailsHtml,
    ctaText: 'View Request Status',
    ctaUrl: `${FRONTEND_URL}/`
  });

  // ✅ RESPOND IMMEDIATELY TO FRONTEND — do NOT wait for emails
  res.json({ id: result.lastID, success: true });

  // 📧 Send confirmation email ASYNCHRONOUSLY (fire-and-forget)
  console.log(`📧 Queueing user confirmation email to: ${email}`);
  sendEmail(email, emailSubject, emailHtml)
    .then(sent => console.log(`📧 User email result: ${sent ? 'SUCCESS ✓' : 'FAILED ✗'}`))
    .catch(err => console.error(`❌ User email error: ${err.message}`));

  // 📧 Build and send admin notification asynchronously
  const adminSubject = `New Service Request - ${service} from ${first}`;
  const adminDetailsHtml = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:14px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Request ID:</strong> #${result.lastID}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Client Name:</strong> ${first} ${last || ''}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding:6px 0;"><strong>Service:</strong> ${service}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Date:</strong> ${fmtDate(new Date())}</td></tr>
      ${note ? `<tr><td style="padding:6px 0;"><strong>Message:</strong> ${note}</td></tr>` : ''}
    </table>
  `;
  const adminHtml = buildAdminTemplate({
    heading: 'New Service Request',
    intro: 'A new service request was submitted via the website.',
    detailsHtml: adminDetailsHtml,
    ctaText: 'Open Admin Panel',
    ctaUrl: `${FRONTEND_URL}/adminpanel.html`
  });

  console.log(`📧 Queueing admin notification to: ${EMAIL_USER}`);
  sendAdminNotification(adminSubject, adminHtml)
    .then(sent => console.log(`📧 Admin notification result: ${sent ? 'SUCCESS ✓' : 'FAILED ✗'}`))
    .catch(err => console.error(`❌ Admin notification error: ${err.message}`));
});

// PUBLIC API — Website booking submissions (no auth required)
app.post('/api/public/bookings', async (req, res) => {
  console.log('📅 Received public booking submission');
  const { name, service, date, time, email, status = 'confirmed', meetingLink } = req.body;
  console.log('📝 Booking data:', { name, service, date, time, email, meetingLink });
  
  if (!name || !service || !date || !time || !email) {
    console.log('❌ Missing required booking fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = openDb();
  const result = await runSql(db, 'INSERT INTO bookings (name, service, date, time, email, status, meeting_link) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, service, date, time, email, status, meetingLink || null]);
  db.close();
  console.log('✅ Booking saved to database with ID:', result.lastID);

  // Send confirmation email
  // Build professional booking confirmation email
  const emailSubject = 'Consultation Booking Confirmed - Writers Support';
  const bookingDetails = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:12px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Booking ID:</strong> #${result.lastID}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Name:</strong> ${name}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Service:</strong> ${service}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Date:</strong> ${date}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Time:</strong> ${time}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email:</strong> ${email}</td></tr>
    </table>
  `;
  const emailHtml = buildUserTemplate({
    heading: 'Consultation Booking Confirmed',
    intro: `Hi ${name}, your consultation booking is confirmed. See the details below.`,
    detailsHtml: bookingDetails,
    ctaText: meetingLink ? 'Join Consultation' : null,
    ctaUrl: meetingLink || null
  });

  console.log(`📧 Attempting to send booking confirmation email to: ${email}`);
  const emailSent = await sendEmail(email, emailSubject, emailHtml);
  console.log(`📧 Booking email send result: ${emailSent ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  
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
  const { name, service, date, time, email, status = 'confirmed', meetingLink } = req.body;
  
  if (!name || !service || !date || !time || !email) {
    console.log('❌ Missing required booking fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = openDb();
  const result = await runSql(db, 'INSERT INTO bookings (name, service, date, time, email, status, meeting_link) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, service, date, time, email, status, meetingLink || null]);
  db.close();
  console.log('✅ Booking saved to database with ID:', result.lastID);

  // Send confirmation email
  // Build professional booking confirmation email
  const emailSubject = 'Consultation Booking Confirmed - Writers Support';
  const bookingDetails = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:12px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Booking ID:</strong> #${result.lastID}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Name:</strong> ${name}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Service:</strong> ${service}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Date:</strong> ${date}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Time:</strong> ${time}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email:</strong> ${email}</td></tr>
    </table>
  `;
  const emailHtml = buildUserTemplate({
    heading: 'Consultation Booking Confirmed',
    intro: `Hi ${name}, your consultation booking is confirmed. See the details below.`,
    detailsHtml: bookingDetails,
    ctaText: meetingLink ? 'Join Consultation' : null,
    ctaUrl: meetingLink || null
  });

  console.log(`📧 Attempting to send booking confirmation email to: ${email}`);
  const emailSent = await sendEmail(email, emailSubject, emailHtml);
  console.log(`📧 Booking email send result: ${emailSent ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  
  res.json({ id: result.lastID, emailSent });
});

// PUBLIC CONTACT MESSAGE API (no auth required)
app.post('/api/contact', async (req, res) => {
  console.log('💬 Received contact message');
  const { first, last, email, subject, message } = req.body;
  
  if (!first || !email || !subject || !message) {
    console.log('❌ Missing required contact fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = openDb();
  const dateStr = fmtDate(new Date());
  const result = await runSql(db, 'INSERT INTO contacts (first, last, email, subject, message, date) VALUES (?, ?, ?, ?, ?, ?)',
    [first, last || '', email, subject, message, dateStr]);
  db.close();
  console.log('✅ Contact message saved to database with ID:', result.lastID);

  // Send confirmation email
  // Build professional contact confirmation email
  const emailSubject = 'We Received Your Message - Writers Support';
  const userDetails = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:12px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Subject:</strong> ${subject}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Message:</strong></td></tr>
      <tr><td style="padding:6px 0;background:#f5f7fa;padding:10px;border-radius:4px;">${message.replace(/\n/g, '<br>')}</td></tr>
    </table>
  `;
  const emailHtml = buildUserTemplate({
    heading: 'Message Received',
    intro: `Thank you ${first}, we have received your message and will respond shortly.`,
    detailsHtml: userDetails,
    ctaText: 'Reply',
    ctaUrl: `mailto:${EMAIL_USER}`
  });

  // ✅ RESPOND IMMEDIATELY TO FRONTEND — do NOT wait for emails
  res.json({ id: result.lastID, success: true });

  // 📧 Send confirmation email ASYNCHRONOUSLY (fire-and-forget)
  console.log(`📧 Queueing user confirmation email to: ${email}`);
  sendEmail(email, emailSubject, emailHtml)
    .then(sent => console.log(`📧 User email result: ${sent ? 'SUCCESS ✓' : 'FAILED ✗'}`))
    .catch(err => console.error(`❌ User email error: ${err.message}`));

  // 📧 Build and send admin notification asynchronously
  const adminSubject = `New Contact Message from ${first} - ${subject}`;
  const adminDetails = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:12px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Message ID:</strong> #${result.lastID}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Name:</strong> ${first} ${last || ''}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding:6px 0;"><strong>Subject:</strong> ${subject}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Date:</strong> ${dateStr}</td></tr>
      <tr><td style="padding:6px 0;background:#f5f7fa;padding:10px;border-radius:4px;">${message.replace(/\n/g, '<br>')}</td></tr>
    </table>
  `;
  const adminHtml = buildAdminTemplate({
    heading: 'New Contact Message',
    intro: 'A new message was submitted through the contact form.',
    detailsHtml: adminDetails,
    ctaText: 'Open Admin Panel',
    ctaUrl: `${FRONTEND_URL}/adminpanel.html`
  });

  console.log(`📧 Queueing admin notification to: ${EMAIL_USER}`);
  sendAdminNotification(adminSubject, adminHtml)
    .then(sent => console.log(`📧 Admin notification result: ${sent ? 'SUCCESS ✓' : 'FAILED ✗'}`))
    .catch(err => console.error(`❌ Admin notification error: ${err.message}`));
});

// PUBLIC CONSULTATION BOOKING API (no auth required)
app.post('/api/bookings/public', async (req, res) => {
  console.log('📅 Received public consultation booking');
  const { name, service, date, time, email, meetingLink } = req.body;
  
  if (!name || !service || !email) {
    console.log('❌ Missing required booking fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = openDb();
  const dateStr = date || fmtDate(new Date());
  const result = await runSql(db, 'INSERT INTO bookings (name, service, date, time, email, status, meeting_link) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, service, dateStr, time || 'TBD', email, 'pending', meetingLink || null]);
  db.close();
  console.log('✅ Consultation booking saved to database with ID:', result.lastID);

  // Send confirmation email
  // Build professional booking confirmation email
  const emailSubject = 'Consultation Booking Request Received - Writers Support';
  const bookingDetails = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:12px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Name:</strong> ${name}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Service:</strong> ${service}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Preferred Date:</strong> ${dateStr}</td></tr>
      ${time ? `<tr><td style="padding:6px 0;"><strong>Preferred Time:</strong> ${time}</td></tr>` : ''}
    </table>
  `;
  const emailHtml = buildUserTemplate({
    heading: 'Consultation Booking Received',
    intro: 'Thank you for requesting a consultation. Our team will confirm the details shortly.',
    detailsHtml: bookingDetails,
    ctaText: meetingLink ? 'Join Consultation' : 'Contact Support',
    ctaUrl: meetingLink || `mailto:${EMAIL_USER}`
  });

  console.log(`📧 Attempting to send booking confirmation email to: ${email}`);
  const emailSent = await sendEmail(email, emailSubject, emailHtml);
  console.log(`📧 Booking email send result: ${emailSent ? 'SUCCESS ✓' : 'FAILED ✗'}`);

  // Build professional admin notification
  const adminSubject = `New Consultation Booking from ${name}`;
  const adminDetails = `
    <table style="width:100%;background:#ffffff;border-radius:6px;padding:12px;margin-top:12px;">
      <tr><td style="padding:6px 0;"><strong>Booking ID:</strong> #${result.lastID}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Client Name:</strong> ${name}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding:6px 0;"><strong>Service:</strong> ${service}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Preferred Date:</strong> ${dateStr}</td></tr>
      ${time ? `<tr><td style="padding:6px 0;"><strong>Preferred Time:</strong> ${time}</td></tr>` : ''}
      ${meetingLink ? `<tr><td style="padding:6px 0;"><strong>Meeting Link:</strong> <a href="${meetingLink}">${meetingLink}</a></td></tr>` : ''}
    </table>
  `;
  const adminHtml = buildAdminTemplate({
    heading: 'New Consultation Booking',
    intro: 'A new consultation booking was submitted via the website.',
    detailsHtml: adminDetails,
    ctaText: 'Open Admin Panel',
    ctaUrl: `${FRONTEND_URL}/adminpanel.html`
  });

  console.log(`📧 Attempting to send admin notification to: ${EMAIL_USER}`);
  const adminNotificationSent = await sendAdminNotification(adminSubject, adminHtml);
  console.log(`📧 Admin notification result: ${adminNotificationSent ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  
  res.json({ id: result.lastID, emailSent, adminNotificationSent });
});

app.get('/admin-login.html', (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (token && verifyToken(token)) {
    return res.redirect('/adminpanel.html');
  }
  res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/adminpanel.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'adminpanel.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(path.join(__dirname)));

// Start server
ensureDatabase().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Writers Support Server is running`);
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
