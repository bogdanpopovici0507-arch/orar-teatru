const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { queryAll, queryGet, queryRun, executeMultiple } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize DB schema & defaults on Turso
async function initDatabase() {
  await executeMultiple(`
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
      school_origin TEXT NOT NULL DEFAULT '',
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

  // Default Admin Password ('anaiubi123')
  const existingPass = await queryGet("SELECT value FROM admin_settings WHERE key = 'admin_password'");
  if (!existingPass || existingPass.value === 'teatru123') {
    await queryRun("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password', ?)", ['anaiubi123']);
  }

  // Prepopulate initial groups if empty
  const countGroups = await queryGet('SELECT COUNT(*) as cnt FROM groups_info');
  if (Number(countGroups.cnt) === 0) {
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
      await queryRun(`
        INSERT INTO groups_info (id, name, day, time, class_min, class_max, class_label, max_capacity, notice, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 16, ?, 1)
      `, g);
    }
  }
}

// Password hash helper
function hashPassword(password) {
  return crypto.createHash('sha256').update((password || '') + 'teatru_salt_2026').digest('hex');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Authentication Helpers
async function verifyAdminSession(token) {
  if (!token) return false;
  const session = await queryGet('SELECT token FROM admin_sessions WHERE token = ?', [token]);
  return !!session;
}

async function verifyStudentSession(token) {
  if (!token) return null;
  const session = await queryGet('SELECT student_id FROM student_sessions WHERE token = ?', [token]);
  return session ? session.student_id : null;
}

async function requireAdminAuth(req, res, next) {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) {
    token = token.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (await verifyAdminSession(token)) {
    req.adminToken = token;
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Acces neautorizat. Vă rugăm să vă autentificați în panoul de profesor.'
  });
}

async function requireStudentAuth(req, res, next) {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);

  const studentId = await verifyStudentSession(token);
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
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await queryAll(`
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
    `);

    res.json({ success: true, groups });
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ success: false, error: 'Eroare la obținerea grupelor.' });
  }
});

// 2. Register student
app.post('/api/register', async (req, res) => {
  try {
    let { last_name, first_name, class_grade, school_origin, parent_phone, group_id, password } = req.body;

    last_name = (last_name || '').trim();
    first_name = (first_name || '').trim();
    school_origin = (school_origin || '').trim();
    parent_phone = (parent_phone || '').trim().replace(/[^0-9+]/g, '');
    group_id = parseInt(group_id, 10);
    const grade = parseInt(class_grade, 10);

    if (!last_name || !first_name) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să introduceți numele și prenumele elevului.' });
    }

    if (!school_origin) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să introduceți școala de proveniență (câmp obligatoriu).' });
    }

    if (isNaN(grade) || grade < 0 || grade > 12) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să selectați o clasă validă (0-12).' });
    }

    if (!parent_phone || parent_phone.length < 9) {
      return res.status(400).json({ success: false, error: 'Vă rugăm să introduceți un număr valid de telefon pentru părinte.' });
    }

    const group = await queryGet('SELECT * FROM groups_info WHERE id = ?', [group_id]);
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
    const enrolled = await queryGet('SELECT COUNT(*) as count FROM students WHERE group_id = ?', [group_id]);
    if (Number(enrolled.count) >= group.max_capacity) {
      return res.status(400).json({
        success: false,
        error: `Ne pare rău! Grupa ${group.id} a atins capacitatea maximă de ${group.max_capacity} elevi.`
      });
    }

    // Check duplicate enrollment (same name + phone in the same group)
    const duplicate = await queryGet(`
      SELECT id FROM students 
      WHERE LOWER(last_name) = LOWER(?) 
        AND LOWER(first_name) = LOWER(?) 
        AND parent_phone = ? 
        AND group_id = ?
    `, [last_name, first_name, parent_phone, group_id]);

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: 'Acest elev este deja înscris în această grupă cu același număr de telefon.'
      });
    }

    // Password hash (if provided, else default to last 4 digits of phone)
    let pwdHash = '';
    if (password && password.trim().length >= 4) {
      pwdHash = hashPassword(password.trim());
    } else {
      const defaultDigits = parent_phone.slice(-4);
      pwdHash = hashPassword(defaultDigits);
    }

    // Insert student
    const info = await queryRun(`
      INSERT INTO students (last_name, first_name, class_grade, class_letter, school_origin, parent_phone, group_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [last_name, first_name, grade, '', school_origin, parent_phone, group_id, pwdHash]);

    // Create session token for the student so they are immediately logged in
    const studentToken = crypto.randomBytes(32).toString('hex');
    await queryRun('INSERT INTO student_sessions (token, student_id) VALUES (?, ?)', [studentToken, info.lastInsertRowid]);

    res.json({
      success: true,
      message: 'Înscrierea a fost înregistrată cu succes!',
      studentToken,
      student: {
        id: info.lastInsertRowid,
        last_name,
        first_name,
        class_grade: grade,
        school_origin,
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
app.post('/api/student/login', async (req, res) => {
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
    const student = await queryGet(`
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.school_origin,
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
    `, [phone, pwdHash]);

    if (!student) {
      const exists = await queryGet('SELECT id FROM students WHERE parent_phone = ?', [phone]);
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
    await queryRun('INSERT INTO student_sessions (token, student_id) VALUES (?, ?)', [token, student.id]);

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
app.get('/api/student/me', requireStudentAuth, async (req, res) => {
  try {
    const student = await queryGet(`
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.school_origin,
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
    `, [req.studentId]);

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
app.post('/api/student/change-password', requireStudentAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const row = await queryGet('SELECT password_hash FROM students WHERE id = ?', [req.studentId]);
    if (!row) return res.status(404).json({ success: false, error: 'Elev inexistent.' });

    if (row.password_hash && row.password_hash !== hashPassword(currentPassword)) {
      return res.status(400).json({ success: false, error: 'Parola curentă este incorectă.' });
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Noua parolă trebuie să aibă minim 4 caractere.' });
    }

    await queryRun('UPDATE students SET password_hash = ? WHERE id = ?', [hashPassword(newPassword.trim()), req.studentId]);

    res.json({ success: true, message: 'Parola contului dvs. a fost modificată cu succes!' });
  } catch (err) {
    console.error('Student change password error:', err);
    res.status(500).json({ success: false, error: 'Eroare la schimbarea parolei.' });
  }
});

// Student Logout
app.post('/api/student/logout', async (req, res) => {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);
  if (token) {
    await queryRun('DELETE FROM student_sessions WHERE token = ?', [token]);
  }
  res.json({ success: true });
});

// ----------------- ADMIN AUTHENTICATION API -----------------

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  const row = await queryGet("SELECT value FROM admin_settings WHERE key = 'admin_password'");
  const currentPassword = row ? row.value : 'anaiubi123';

  if (password === currentPassword) {
    const token = crypto.randomBytes(32).toString('hex');
    await queryRun('INSERT INTO admin_sessions (token) VALUES (?)', [token]);

    return res.json({
      success: true,
      token,
      message: 'Autentificare reușită!'
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Parolă incorectă! Introduceți parola de administrator.'
  });
});

// Verify Admin Token (cached login)
app.get('/api/admin/verify', async (req, res) => {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);

  if (token && await verifyAdminSession(token)) {
    return res.json({ success: true, valid: true });
  }
  return res.status(401).json({ success: false, valid: false });
});

// Admin Logout
app.post('/api/admin/logout', async (req, res) => {
  let token = req.headers['authorization'];
  if (token && token.startsWith('Bearer ')) token = token.substring(7);
  if (token) {
    await queryRun('DELETE FROM admin_sessions WHERE token = ?', [token]);
  }
  res.json({ success: true });
});

// Change Admin Password
app.post('/api/admin/change-password', requireAdminAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const row = await queryGet("SELECT value FROM admin_settings WHERE key = 'admin_password'");
  const actualPass = row ? row.value : 'anaiubi123';

  if (currentPassword !== actualPass) {
    return res.status(400).json({ success: false, error: 'Parola curentă este incorectă.' });
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ success: false, error: 'Noua parolă trebuie să aibă minim 4 caractere.' });
  }

  await queryRun("UPDATE admin_settings SET value = ? WHERE key = 'admin_password'", [newPassword.trim()]);
  res.json({ success: true, message: 'Parola de administrator a fost modificată cu succes!' });
});

// ----------------- PROTECTED ADMIN API ENDPOINTS -----------------

// 1. Get students (Alphabetical order by default, filterable)
app.get('/api/students', requireAdminAuth, async (req, res) => {
  try {
    const { groupId, search, sortBy } = req.query;

    let sql = `
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.school_origin,
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
      sql += ' AND (LOWER(s.last_name) LIKE ? OR LOWER(s.first_name) LIKE ? OR s.parent_phone LIKE ? OR LOWER(s.school_origin) LIKE ?)';
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term, term, term);
    }

    if (sortBy === 'group') {
      sql += ' ORDER BY s.group_id ASC, s.last_name COLLATE NOCASE ASC, s.first_name COLLATE NOCASE ASC';
    } else if (sortBy === 'date') {
      sql += ' ORDER BY s.created_at DESC';
    } else if (sortBy === 'grade') {
      sql += ' ORDER BY s.class_grade ASC, s.last_name COLLATE NOCASE ASC';
    } else {
      sql += ' ORDER BY s.last_name COLLATE NOCASE ASC, s.first_name COLLATE NOCASE ASC';
    }

    const students = await queryAll(sql, params);
    res.json({ success: true, students, total: students.length });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, error: 'Eroare la încărcarea listei de elevi.' });
  }
});

// 2. Teacher resets student password (without seeing old password)
app.post('/api/admin/reset-student-password', requireAdminAuth, async (req, res) => {
  try {
    const { student_id, new_password } = req.body;
    const studentId = parseInt(student_id, 10);

    if (!new_password || new_password.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Parola temporară trebuie să aibă minim 4 caractere.' });
    }

    const student = await queryGet('SELECT id, first_name, last_name FROM students WHERE id = ?', [studentId]);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Elevul nu a fost găsit.' });
    }

    await queryRun('UPDATE students SET password_hash = ? WHERE id = ?', [hashPassword(new_password.trim()), studentId]);
    await queryRun('DELETE FROM student_sessions WHERE student_id = ?', [studentId]);

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
app.put('/api/students/:id', requireAdminAuth, async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    let { last_name, first_name, class_grade, school_origin, parent_phone, group_id, student_notice, notes } = req.body;

    last_name = (last_name || '').trim();
    first_name = (first_name || '').trim();
    school_origin = (school_origin || '').trim();
    parent_phone = (parent_phone || '').trim();
    student_notice = (student_notice || '').trim();
    notes = (notes || '').trim();
    const grade = parseInt(class_grade, 10);
    const targetGroupId = parseInt(group_id, 10);

    if (!last_name || !first_name) {
      return res.status(400).json({ success: false, error: 'Numele și prenumele sunt obligatorii.' });
    }

    if (!school_origin) {
      return res.status(400).json({ success: false, error: 'Școala de proveniență este obligatorie.' });
    }

    const group = await queryGet('SELECT * FROM groups_info WHERE id = ?', [targetGroupId]);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Grupa nu a fost găsită.' });
    }

    if (grade < group.class_min || grade > group.class_max) {
      return res.status(400).json({
        success: false,
        error: `Grupa ${group.name} acceptă doar ${group.class_label}. Clasa elevului (${grade}) nu este eligibilă.`
      });
    }

    await queryRun(`
      UPDATE students 
      SET last_name = ?, first_name = ?, class_grade = ?, class_letter = ?, school_origin = ?, parent_phone = ?, group_id = ?, student_notice = ?, notes = ?
      WHERE id = ?
    `, [last_name, first_name, grade, '', school_origin, parent_phone, targetGroupId, student_notice, notes, studentId]);

    res.json({ success: true, message: 'Datele elevului și mențiunile au fost actualizate!' });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ success: false, error: 'Eroare la actualizarea elevului.' });
  }
});

// 4. Update group custom notice
app.put('/api/groups/:id/notice', requireAdminAuth, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { notice } = req.body;

    const group = await queryGet('SELECT id FROM groups_info WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ success: false, error: 'Grupa nu există.' });

    await queryRun('UPDATE groups_info SET notice = ? WHERE id = ?', [notice ? notice.trim() : '', groupId]);
    res.json({ success: true, message: 'Mențiunea pentru grupă a fost actualizată!' });
  } catch (err) {
    console.error('Error updating group notice:', err);
    res.status(500).json({ success: false, error: 'Eroare la actualizarea mențiunii.' });
  }
});

// 5. Toggle group active status
app.put('/api/groups/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    await queryRun('UPDATE groups_info SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, groupId]);
    res.json({ success: true, message: 'Starea grupei a fost actualizată!' });
  } catch (err) {
    console.error('Error updating group status:', err);
    res.status(500).json({ success: false, error: 'Eroare la actualizarea stării grupei.' });
  }
});

// 6. Delete student
app.delete('/api/students/:id', requireAdminAuth, async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const result = await queryRun('DELETE FROM students WHERE id = ?', [studentId]);

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
app.get('/api/export-csv', requireAdminAuth, async (req, res) => {
  try {
    const students = await queryAll(`
      SELECT 
        s.id,
        s.last_name,
        s.first_name,
        s.class_grade,
        s.school_origin,
        s.parent_phone,
        s.student_notice,
        g.name AS group_name,
        g.day,
        g.time,
        s.created_at
      FROM students s
      JOIN groups_info g ON s.group_id = g.id
      ORDER BY s.last_name COLLATE NOCASE ASC, s.first_name COLLATE NOCASE ASC
    `);

    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Nr. Crt.;Nume;Prenume;Clasa;Scoala de Provenienta;Telefon Parinte;Grupa;Zi;Interval Orar;Mentiune Elev;Data Inscrierii\r\n';

    students.forEach((s, idx) => {
      const clasaDisplay = s.class_grade === 0 ? 'Clasa Pregătitoare (0)' : `Clasa a ${s.class_grade}-a`;
      const row = [
        idx + 1,
        `"${(s.last_name || '').replace(/"/g, '""')}"`,
        `"${(s.first_name || '').replace(/"/g, '""')}"`,
        `"${clasaDisplay}"`,
        `"${(s.school_origin || '').replace(/"/g, '""')}"`,
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

// Initialize Turso DB and start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🎭 Server Orar Teatru / Teatru de Revistă pornit!`);
    console.log(`☁️ Conectat permanent la Baza de Date Turso Cloud!`);
    console.log(`🚀 Formular Înscriere & Portal: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}).catch(err => {
  console.error('FATAL: Eroare la inițializarea bazei de date Turso:', err);
  process.exit(1);
});
