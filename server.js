const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = path.join(__dirname, 'orar_teatru.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and initialize schema
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS groups_info (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    day TEXT NOT NULL,
    time TEXT NOT NULL,
    class_min INTEGER NOT NULL,
    class_max INTEGER NOT NULL,
    class_label TEXT NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 16,
    notice TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    last_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    class_grade INTEGER NOT NULL,
    class_letter TEXT DEFAULT '',
    parent_phone TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    password_hash TEXT DEFAULT '',
    student_notice TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES groups_info(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS student_sessions (
    token TEXT PRIMARY KEY,
    student_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  );
`);

// Add new columns to students if missing in existing table
try { db.exec('ALTER TABLE students ADD COLUMN password_hash TEXT DEFAULT "";'); } catch (e) {}
try { db.exec('ALTER TABLE students ADD COLUMN student_notice TEXT DEFAULT "";'); } catch (e) {}

// Password hash helper
function hashPassword(password) {
  return crypto.createHash('sha256').update((password || '') + 'teatru_salt_2026').digest('hex');
}

// Default Admin Password ('anaiubi123')
const existingPass = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
if (!existingPass || existingPass.value === 'teatru123') {
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password', ?)").run('anaiubi123');
}

// Prepopulate initial groups if empty
const countGroups = db.prepare('SELECT COUNT(*) as cnt FROM groups_info').get();
if (countGroups.cnt === 0) {
  const insertGroup = db.prepare(`
    INSERT INTO groups_info (id, name, day, time, class_min, class_max, class_label, max_capacity, notice, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 16, ?, 1)
  `);

  const initialGroups = [
    [1, 'Grupa 1', 'Luni', '14:00 - 15:40', 0, 6, 'Clasele 0-6', ''],
    [2, 'Grupa 2', 'Luni', '16:20 - 18:00', 7, 12, 'Clasele 7-12', ''],
    [3, 'Grupa 3', 'Marți', '09:50 - 11:30', 0, 12, 'Clasele 0-12 (Dimineață)', ''],
    [4, 'Grupa 4', 'Marți', '13:00 - 14:40', 0, 6, 'Clasele 0-6', ''],
    [5, 'Grupa 5', 'Marți', '14:50 - 16:30', 7, 12, 'Clasele 7-12', ''],
    [6, 'Grupa 6', 'Miercuri', '13:30 - 15:10', 0, 6, 'Clasele 0-6', ''],
    [7, 'Grupa 7', 'Miercuri', '16:20 - 18:00', 0, 6, 'Clasele 0-6', ''],
    [8, 'Grupa 8', 'Joi', '14:00 - 15:40', 0, 6, 'Clasele 0-6', ''],
    [9, 'Grupa 9', 'Joi', '15:50 - 17:30', 7, 12, 'Clasele 7-12', ''],
    [10, 'Grupa 10', 'Vineri', '09:50 - 11:30', 0, 12, 'Clasele 0-12 (Dimineață)', '']
  ];

  for (const g of initialGroups) {
    insertGroup.run(...g);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Helpers
function verifyAdminSession(token) {
  if (!token) return false;
  const session = db.prepare('SELECT token FROM admin_sessions WHERE token = ?').get(token);
  return !!session;
}

function verifyStudentSession(token) {
  if (!token) return null;
  const session = db.prepare('SELECT student_id FROM student_sessions WHERE token = ?').get(token);
  return session ? session.student_id : null;
}

function requireAdminAuth(req, res, next) {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) {
    token = token.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (verifyAdminSession(token)) {
    req.adminToken = token;
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Acces neautorizat. Vă rugăm să vă autentificați în panoul de profesor.'
  });
}

function requireStudentAuth(req, res, next) {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);

  const studentId = verifyStudentSession(token);
  if (studentId) {
    req.studentId = studentId;
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Sesiune elev expirată. Vă rugăm să vă conectați din nou.'
  });
}

// ----------------- PUBLIC API ENDPOINTS -----------------

// 1. Get all groups with current enrollment count & notices
app.get('/api/groups', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT 
        g.id,
        g.name,
        g.day,
        g.time,
        g.class_min,
        g.class_max,
        g.class_label,
        g.max_capacity,
        g.notice,
        g.is_active,
        COUNT(s.id) AS enrolled_count
      FROM groups_info g
      LEFT JOIN students s ON s.group_id = g.id
      GROUP BY g.id
      ORDER BY g.id ASC
    `).all();

    res.json({ success: true, groups });
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ success: false, error: 'Eroare la obținerea grupelor.' });
  }
});

// 2. Register student (with optional/recommended password for student login)
app.post('/api/register', (req, res) => {
  try {
    let { last_name, first_name, class_grade, class_letter, parent_phone, group_id, password } = req.body;

    last_name = (last_name || '').trim();
    first_name = (first_name || '').trim();
    class_letter = (class_letter || '').trim().toUpperCase();
    parent_phone = (parent_phone || '').trim().replace(/[^0-9+]/g, '');
    group_id = parseInt(group_id, 10);
    const grade = parseInt(class_grade, 10);

    if (!last_name || !first_name) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să introduceți numele și prenumele elevului.' });
    }

    if (isNaN(grade) || grade < 0 || grade > 12) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să selectați o clasă validă (0-12).' });
    }

    if (!parent_phone || parent_phone.length < 9) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să introduceți un număr valid de telefon pentru părinte.' });
    }

    const group = db.prepare('SELECT * FROM groups_info WHERE id = ?').get(group_id);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Grupa selectată nu a fost găsită.' });
    }

    if (group.is_active === 0) {
      return res.status(400).json({
        success: false,
        error: `Înscrierile pentru ${group.name} sunt momentan oprite de către organizator.`
      });
    }

    // Check class grade eligibility
    if (grade < group.class_min || grade > group.class_max) {
      return res.status(400).json({
        success: false,
        error: `Această grupă acceptă doar ${group.class_label}. Clasa elevului (${grade}) nu este eligibilă.`
      });
    }

    // Check current enrollment count
    const enrolled = db.prepare('SELECT COUNT(*) as count FROM students WHERE group_id = ?').get(group_id);
    if (enrolled.count >= group.max_capacity) {
      return res.status(400).json({
        success: false,
        error: `Ne pare rău! Grupa ${group.id} a atins capacitatea maximă de ${group.max_capacity} elevi.`
      });
    }

    // Check duplicate enrollment (same name + phone in the same group)
    const duplicate = db.prepare(`
      SELECT id FROM students 
      WHERE LOWER(last_name) = LOWER(?) 
        AND LOWER(first_name) = LOWER(?) 
        AND parent_phone = ? 
        AND group_id = ?
    `).get(last_name, first_name, parent_phone, group_id);

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: 'Acest elev este deja înscris în această grupă cu același număr de telefon.'
      });
    }

    // Password hash (if provided, else default to last 4 digits of phone or empty)
    let pwdHash = '';
    if (password && password.trim().length >= 4) {
      pwdHash = hashPassword(password.trim());
    } else {
      // Default to last 4 digits of parent phone for convenience
      const defaultDigits = parent_phone.slice(-4);
      pwdHash = hashPassword(defaultDigits);
    }

    // Insert student
    const insert = db.prepare(`
      INSERT INTO students (last_name, first_name, class_grade, class_letter, parent_phone, group_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(last_name, first_name, grade, class_letter, parent_phone, group_id, pwdHash);

    // Create session token for the student so they are immediately logged in
    const studentToken = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO student_sessions (token, student_id) VALUES (?, ?)').run(studentToken, info.lastInsertRowid);

    res.json({
      success: true,
      message: 'Înscrierea a fost înregistrată cu succes!',
      studentToken,
      student: {
        id: info.lastInsertRowid,
        last_name,
        first_name,
        class_grade: grade,
        class_letter,
        parent_phone,
        group_id,
        group_name: group.name,
        day: group.day,
        time: group.time,
        notice: group.notice
      }
    });
  } catch (err) {
    console.error('Error registering student:', err);
    res.status(500).json({ success: false, error: 'Eroare la salvarea înscrierii. Vă rugăm încercați din nou.' });
  }
});

// ----------------- STUDENT PORTAL API -----------------

// Student Login (Phone + Password)
app.post('/api/student/login', (req, res) => {
  try {
    let { phone, password } = req.body;
    phone = (phone || '').trim().replace(/[^0-9+]/g, '');

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Introduceți numărul de telefon.' });
    }

    if (!password) {
      return res.status(400).json({ success: false, error: 'Introduceți parola.' });
    }

    const pwdHash = hashPassword(password.trim());

    // Search student by phone and password
    let student = db.prepare(`
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.class_letter,
        s.parent_phone,
        s.student_notice,
        s.group_id,
        g.name AS group_name,
        g.day AS group_day,
        g.time AS group_time,
        g.class_label AS group_class_label,
        g.notice AS group_notice
      FROM students s
      JOIN groups_info g ON s.group_id = g.id
      WHERE s.parent_phone = ? AND s.password_hash = ?
    `).get(phone, pwdHash);

    if (!student) {
      // Check if student exists with that phone
      const exists = db.prepare('SELECT id FROM students WHERE parent_phone = ?').get(phone);
      if (exists) {
        return res.status(401).json({
          success: false,
          error: 'Parolă incorectă! Dacă ați uitat parola, profesorul o poate reseta pentru dvs.'
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'Nu s-a găsit niciun elev înscris cu acest număr de telefon.'
        });
      }
    }

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO student_sessions (token, student_id) VALUES (?, ?)').run(token, student.id);

    res.json({
      success: true,
      token,
      student
    });
  } catch (err) {
    console.error('Student login error:', err);
    res.status(500).json({ success: false, error: 'Eroare la autentificare.' });
  }
});

// Student Me Profile (Check live group schedule & notices)
app.get('/api/student/me', requireStudentAuth, (req, res) => {
  try {
    const student = db.prepare(`
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.class_letter,
        s.parent_phone,
        s.student_notice,
        s.group_id,
        g.name AS group_name,
        g.day AS group_day,
        g.time AS group_time,
        g.class_label AS group_class_label,
        g.notice AS group_notice
      FROM students s
      JOIN groups_info g ON s.group_id = g.id
      WHERE s.id = ?
    `).get(req.studentId);

    if (!student) {
      return res.status(404).json({ success: false, error: 'Contul elevului nu a fost găsit.' });
    }

    res.json({ success: true, student });
  } catch (err) {
    console.error('Error fetching student me:', err);
    res.status(500).json({ success: false, error: 'Eroare de server.' });
  }
});

// Student Change Password
app.post('/api/student/change-password', requireStudentAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const row = db.prepare('SELECT password_hash FROM students WHERE id = ?').get(req.studentId);
    if (!row) return res.status(404).json({ success: false, error: 'Elev inexistent.' });

    if (row.password_hash && row.password_hash !== hashPassword(currentPassword)) {
      return res.status(400).json({ success: false, error: 'Parola curentă este incorectă.' });
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Noua parolă trebuie să aibă minim 4 caractere.' });
    }

    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword.trim()), req.studentId);

    res.json({ success: true, message: 'Parola contului dvs. a fost modificată cu succes!' });
  } catch (err) {
    console.error('Student change password error:', err);
    res.status(500).json({ success: false, error: 'Eroare la schimbarea parolei.' });
  }
});

// Student Logout
app.post('/api/student/logout', (req, res) => {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);
  if (token) {
    db.prepare('DELETE FROM student_sessions WHERE token = ?').run(token);
  }
  res.json({ success: true });
});

// ----------------- ADMIN AUTHENTICATION API -----------------

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const row = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
  const currentPassword = row ? row.value : 'anaiubi123';

  if (password === currentPassword) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (token) VALUES (?)').run(token);
    res.json({ success: true, token, message: 'Autentificare reușită!' });
  } else {
    res.status(401).json({ success: false, error: 'Parola introdusă este incorectă!' });
  }
});

app.get('/api/admin/verify', (req, res) => {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);

  if (verifyAdminSession(token)) {
    res.json({ success: true, valid: true });
  } else {
    res.status(401).json({ success: false, valid: false });
  }
});

app.post('/api/admin/logout', (req, res) => {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);
  if (token) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  }
  res.json({ success: true, message: 'Deconectat cu succes.' });
});

app.post('/api/admin/change-password', requireAdminAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const row = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
  const savedPassword = row ? row.value : 'anaiubi123';

  if (currentPassword !== savedPassword) {
    return res.status(400).json({ success: false, error: 'Parola curentă este incorectă.' });
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ success: false, error: 'Noua parolă trebuie să aibă minim 4 caractere.' });
  }

  db.prepare("UPDATE admin_settings SET value = ? WHERE key = 'admin_password'").run(newPassword.trim());
  res.json({ success: true, message: 'Parola de administrator a fost modificată cu succes!' });
});

// ----------------- PROTECTED ADMIN API ENDPOINTS -----------------

// 1. Get students (Alphabetical order by default, filterable)
app.get('/api/students', requireAdminAuth, (req, res) => {
  try {
    const { groupId, search, sortBy } = req.query;

    let sql = `
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.class_letter,
        s.parent_phone,
        s.student_notice,
        s.notes,
        s.created_at,
        s.group_id,
        g.name AS group_name,
        g.day AS group_day,
        g.time AS group_time,
        g.class_label AS group_class_label
      FROM students s
      JOIN groups_info g ON s.group_id = g.id
      WHERE 1=1
    `;
    const params = [];

    if (groupId && groupId !== 'all') {
      sql += ' AND s.group_id = ?';
      params.push(parseInt(groupId, 10));
    }

    if (search && search.trim()) {
      sql += ' AND (LOWER(s.last_name) LIKE ? OR LOWER(s.first_name) LIKE ? OR s.parent_phone LIKE ?)';
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term, term);
    }

    if (sortBy === 'group') {
      sql += ' ORDER BY s.group_id ASC, s.last_name COLLATE NOCASE ASC, s.first_name COLLATE NOCASE ASC';
    } else if (sortBy === 'date') {
      sql += ' ORDER BY s.created_at DESC';
    } else if (sortBy === 'grade') {
      sql += ' ORDER BY s.class_grade ASC, s.last_name COLLATE NOCASE ASC';
    } else {
      // Default: Alphabetical by last name, then first name
      sql += ' ORDER BY s.last_name COLLATE NOCASE ASC, s.first_name COLLATE NOCASE ASC';
    }

    const students = db.prepare(sql).all(...params);

    res.json({ success: true, students, total: students.length });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, error: 'Eroare la încărcarea listei de elevi.' });
  }
});

// 2. Teacher resets student password (without seeing old password)
app.post('/api/admin/reset-student-password', requireAdminAuth, (req, res) => {
  try {
    const { student_id, new_password } = req.body;
    const studentId = parseInt(student_id, 10);

    if (!new_password || new_password.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Parola temporară trebuie să aibă minim 4 caractere.' });
    }

    const student = db.prepare('SELECT id, first_name, last_name FROM students WHERE id = ?').get(studentId);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Elevul nu a fost găsit.' });
    }

    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hashPassword(new_password.trim()), studentId);

    // Invalidate existing sessions for this student so they log in with new password
    db.prepare('DELETE FROM student_sessions WHERE student_id = ?').run(studentId);

    res.json({
      success: true,
      message: `Parola elevului ${student.last_name} ${student.first_name} a fost resetată!`
    });
  } catch (err) {
    console.error('Error resetting student password:', err);
    res.status(500).json({ success: false, error: 'Eroare la resetarea parolei elevului.' });
  }
});

// 3. Update student details + student_notice
app.put('/api/students/:id', requireAdminAuth, (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    let { last_name, first_name, class_grade, class_letter, parent_phone, group_id, student_notice, notes } = req.body;

    last_name = (last_name || '').trim();
    first_name = (first_name || '').trim();
    class_letter = (class_letter || '').trim().toUpperCase();
    parent_phone = (parent_phone || '').trim();
    student_notice = (student_notice || '').trim();
    notes = (notes || '').trim();
    const grade = parseInt(class_grade, 10);
    const targetGroupId = parseInt(group_id, 10);

    if (!last_name || !first_name) {
      return res.status(400).json({ success: false, error: 'Numele și prenumele sunt obligatorii.' });
    }

    const group = db.prepare('SELECT * FROM groups_info WHERE id = ?').get(targetGroupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Grupa nu a fost găsită.' });
    }

    if (grade < group.class_min || grade > group.class_max) {
      return res.status(400).json({
        success: false,
        error: `Grupa ${group.name} acceptă doar ${group.class_label}. Clasa elevului (${grade}) nu este eligibilă.`
      });
    }

    db.prepare(`
      UPDATE students 
      SET last_name = ?, first_name = ?, class_grade = ?, class_letter = ?, parent_phone = ?, group_id = ?, student_notice = ?, notes = ?
      WHERE id = ?
    `).run(last_name, first_name, grade, class_letter, parent_phone, targetGroupId, student_notice, notes, studentId);

    res.json({ success: true, message: 'Datele elevului și mențiunile au fost actualizate!' });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ success: false, error: 'Eroare la actualizarea elevului.' });
  }
});

// 4. Update group custom notice
app.put('/api/groups/:id/notice', requireAdminAuth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { notice } = req.body;

    const group = db.prepare('SELECT id FROM groups_info WHERE id = ?').get(groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Grupa nu există.' });

    db.prepare('UPDATE groups_info SET notice = ? WHERE id = ?').run(notice ? notice.trim() : '', groupId);

    res.json({ success: true, message: 'Mențiunea pentru grupă a fost actualizată!' });
  } catch (err) {
    console.error('Error updating group notice:', err);
    res.status(500).json({ success: false, error: 'Eroare la actualizarea mențiunii.' });
  }
});

// 5. Toggle group active status
app.put('/api/groups/:id/status', requireAdminAuth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    db.prepare('UPDATE groups_info SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, groupId);
    res.json({ success: true, message: 'Starea grupei a fost actualizată!' });
  } catch (err) {
    console.error('Error updating group status:', err);
    res.status(500).json({ success: false, error: 'Eroare la actualizarea stării grupei.' });
  }
});

// 6. Delete student
app.delete('/api/students/:id', requireAdminAuth, (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const result = db.prepare('DELETE FROM students WHERE id = ?').run(studentId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Înscrierea nu a fost găsită.' });
    }

    res.json({ success: true, message: 'Elevul a fost eliminat din grupă.' });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ success: false, error: 'Eroare la ștergerea înscrierii.' });
  }
});

// 7. Export CSV
app.get('/api/export-csv', requireAdminAuth, (req, res) => {
  try {
    const students = db.prepare(`
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.class_letter,
        s.parent_phone,
        s.student_notice,
        g.name AS group_name,
        g.day,
        g.time,
        s.created_at
      FROM students s
      JOIN groups_info g ON s.group_id = g.id
      ORDER BY s.last_name COLLATE NOCASE ASC, s.first_name COLLATE NOCASE ASC
    `).all();

    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Nr. Crt.;Nume;Prenume;Clasa;Telefon Parinte;Grupa;Zi;Interval Orar;Mentiune Elev;Data Inscrierii\r\n';

    students.forEach((s, idx) => {
      const clasaDisplay = s.class_grade === 0 ? `Clasa Pregătitoare ${s.class_letter}`.trim() : `Clasa a ${s.class_grade}-a ${s.class_letter}`.trim();
      const row = [
        idx + 1,
        `"${(s.last_name || '').replace(/"/g, '""')}"`,
        `"${(s.first_name || '').replace(/"/g, '""')}"`,
        `"${clasaDisplay}"`,
        `"${(s.parent_phone || '')}"`,
        `"${s.group_name}"`,
        `"${s.day}"`,
        `"${s.time}"`,
        `"${(s.student_notice || '').replace(/"/g, '""')}"`,
        `"${s.created_at}"`
      ];
      csv += row.join(';') + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="catalog_orar_teatru.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error generating CSV:', err);
    res.status(500).send('Eroare la generarea fișierului CSV.');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎭 Server Orar Teatru / Teatru de Revistă pornit!`);
  console.log(`🚀 Formular Înscriere & Portal: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
