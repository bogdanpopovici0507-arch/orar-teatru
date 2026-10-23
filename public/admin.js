/**
 * Orar Teatru / Teatru de Revistă
 * Modul Administrare & Panou Profesor Securizat (cu suport de cache în localStorage)
 */

let adminState = {
  token: localStorage.getItem('teacher_token') || null,
  students: [],
  groups: [],
  currentSubtab: 'catalog',
  searchDebounceTimer: null
};

// Verify token with backend
async function verifyAuthToken(token) {
  try {
    const res = await fetch('/api/admin/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Handle Logout - clears cache
async function handleLogout() {
  const confirmed = confirm('Sigur doriți să vă deconectați? Va fi necesară reintroducerea parolei la următoarea accesare a panoului.');
  if (!confirmed) return;

  if (adminState.token) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminState.token}` }
      });
    } catch (e) {}
  }

  localStorage.removeItem('teacher_token');
  adminState.token = null;

  switchMainTab('register');
  showToast('V-ați deconectat din panoul de profesor. Cache-ul a fost șters.', 'info');
}

// Helper for fetch with admin token
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (adminState.token) {
    options.headers['Authorization'] = `Bearer ${adminState.token}`;
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('teacher_token');
    adminState.token = null;
    showToast('Sesiunea a expirat sau parola a fost schimbată.', 'error');
    openAuthModal();
    throw new Error('Unauthorized');
  }
  return res;
}

// Load groups & students
async function loadAdminData() {
  await Promise.all([loadAdminGroups(), loadAdminStudents()]);
}

// Switch between Catalog Table and Group Notices Management
function switchAdminSubtab(subtab) {
  adminState.currentSubtab = subtab;

  const catalogView = document.getElementById('admin-subtab-catalog');
  const noticesView = document.getElementById('admin-subtab-notices');
  const catalogBtn = document.getElementById('btn-subtab-catalog');
  const noticesBtn = document.getElementById('btn-subtab-notices');

  if (subtab === 'catalog') {
    catalogView.style.display = 'block';
    noticesView.style.display = 'none';
    catalogBtn.style.background = 'var(--slate-100)';
    catalogBtn.style.fontWeight = '700';
    noticesBtn.style.background = '#ffffff';
    noticesBtn.style.fontWeight = 'normal';
    loadAdminStudents();
  } else {
    catalogView.style.display = 'none';
    noticesView.style.display = 'block';
    noticesBtn.style.background = 'var(--slate-100)';
    noticesBtn.style.fontWeight = '700';
    catalogBtn.style.background = '#ffffff';
    catalogBtn.style.fontWeight = 'normal';
    renderAdminGroupsManager();
  }
}

// Fetch groups
async function loadAdminGroups() {
  try {
    const res = await fetch('/api/groups');
    const data = await res.json();
    if (data.success) {
      adminState.groups = data.groups;
      populateGroupSelects();
      updateAdminStats();
      if (adminState.currentSubtab === 'notices') {
        renderAdminGroupsManager();
      }
    }
  } catch (err) {
    console.error('Error fetching admin groups:', err);
  }
}

function populateGroupSelects() {
  const addSelect = document.getElementById('add-group-id');
  const editSelect = document.getElementById('edit-group-id');

  const optionsHtml = adminState.groups.map(g => {
    return `<option value="${g.id}">Grupa ${g.id} &bull; ${escapeHtml(g.day)} (${escapeHtml(g.time)}) - ${escapeHtml(g.class_label)} [${g.enrolled_count}/${g.max_capacity}]</option>`;
  }).join('');

  if (addSelect) addSelect.innerHTML = optionsHtml;
  if (editSelect) editSelect.innerHTML = optionsHtml;
}

// Fetch students for admin
async function loadAdminStudents() {
  const tableBody = document.getElementById('students-table-body');
  const groupFilter = document.getElementById('filter-group-select').value;
  const sortFilter = document.getElementById('sort-select').value;
  const search = document.getElementById('admin-search').value.trim();

  let url = `/api/students?groupId=${encodeURIComponent(groupFilter)}&sortBy=${encodeURIComponent(sortFilter)}`;
  if (search) {
    url += `&search=${encodeURIComponent(search)}`;
  }

  try {
    const res = await authFetch(url);
    const data = await res.json();

    if (data.success) {
      adminState.students = data.students;
      renderStudentsTable();
      updateAdminStats();
    } else {
      tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">${escapeHtml(data.error)}</td></tr>`;
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') {
      tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--danger);">Eroare la încărcarea catalogului.</td></tr>';
    }
  }
}

// Render alphabetical students table
function renderStudentsTable() {
  const tableBody = document.getElementById('students-table-body');
  const students = adminState.students;

  if (!students || students.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 3rem; color: var(--slate-500);">
          <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">🎭</div>
          <strong style="font-size: 1rem; color: var(--slate-700);">Nu există elevi înscriși</strong>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">Niciun elev nu corespunde filtrelor selectate.</p>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  students.forEach((s, index) => {
    const classDisplay = s.class_grade === 0 ? 
      'Pregătitoare (0)' : 
      `Clasa a ${s.class_grade}-a`;

    html += `
      <tr>
        <td style="font-weight: 600; color: var(--slate-500);">${index + 1}</td>
        <td class="student-name-cell">${escapeHtml(s.last_name)}</td>
        <td class="student-name-cell">${escapeHtml(s.first_name)}</td>
        <td>
          <span class="badge badge-class" style="font-weight: 700;">
            ${escapeHtml(classDisplay)}
          </span>
        </td>
        <td>
          <span style="font-size: 0.88rem; font-weight: 600; color: var(--slate-800);">
            ${escapeHtml(s.school_origin || '-')}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <a href="tel:${escapeHtml(s.parent_phone)}" class="phone-link" title="Apelează numărul de telefon">
              📞 ${escapeHtml(s.parent_phone)}
            </a>
            <button onclick="navigator.clipboard.writeText('${escapeHtml(s.parent_phone)}'); showToast('Număr copiat!', 'success');" style="background: none; border: none; cursor: pointer; color: var(--slate-400); font-size: 0.85rem;" title="Copiază numărul">
              📋
            </button>
          </div>
        </td>
        <td>
          <strong style="color: var(--primary);">${escapeHtml(s.group_name)}</strong>
        </td>
        <td>
          <span style="font-size: 0.85rem; color: var(--slate-700);">
            ${escapeHtml(s.group_day)} (${escapeHtml(s.group_time)})
          </span>
        </td>
        <td>
          ${s.student_notice && s.student_notice.trim() !== '' ? 
            `<span style="background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-block; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(s.student_notice)}">📢 ${escapeHtml(s.student_notice)}</span>` : 
            `<span style="color: var(--slate-400); font-size: 0.8rem;">-</span>`
          }
        </td>
        <td class="no-print" style="text-align: center; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal(${s.id})" title="Modifică date / adaugă mențiune sau fișă">
            ✏️
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openResetStudentPwdModal(${s.id}, '${escapeHtml(s.last_name)} ${escapeHtml(s.first_name)}')" title="Resetează parola elevului dacă a uitat-o">
            🔑
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteStudent(${s.id}, '${escapeHtml(s.last_name)} ${escapeHtml(s.first_name)}')" title="Șterge din grupă">
            🗑️
          </button>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

// Search debounce
function handleAdminSearch() {
  clearTimeout(adminState.searchDebounceTimer);
  adminState.searchDebounceTimer = setTimeout(() => {
    loadAdminStudents();
  }, 250);
}

// Update stats
function updateAdminStats() {
  const groups = adminState.groups;
  const totalEnrolled = groups.reduce((acc, g) => acc + (g.enrolled_count || 0), 0);
  const totalCapacity = groups.reduce((acc, g) => acc + (g.max_capacity || 16), 0);
  const spotsLeft = Math.max(0, totalCapacity - totalEnrolled);
  const fullGroups = groups.filter(g => g.enrolled_count >= g.max_capacity).length;

  document.getElementById('stat-total-students').innerText = totalEnrolled;
  document.getElementById('stat-total-capacity').innerText = `${totalEnrolled} / ${totalCapacity}`;
  document.getElementById('stat-spots-left').innerText = spotsLeft;
  document.getElementById('stat-full-groups').innerText = `${fullGroups} din 10`;
}

// ----------------------------------------------------
// Subtab 2: Group Notices & Special Restrictions
// ----------------------------------------------------
function renderAdminGroupsManager() {
  const container = document.getElementById('admin-groups-container');
  if (!container) return;

  let html = '';

  adminState.groups.forEach(g => {
    const spotsLeft = Math.max(0, g.max_capacity - g.enrolled_count);
    const isFull = spotsLeft <= 0;
    const isMorning = g.id === 3 || g.id === 10;

    html += `
      <div class="admin-group-box">
        <div class="admin-group-header">
          <div>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary); text-transform: uppercase;">
              ${escapeHtml(g.day)} &bull; ${escapeHtml(g.time)}
            </span>
            <h3 style="font-size: 1.15rem; color: var(--slate-900); font-weight: 800;">
              ${escapeHtml(g.name)} ${isMorning ? '<span style="font-size: 0.75rem; color: var(--gold-dark); font-weight: 600;">(Dimineață)</span>' : ''}
            </h3>
          </div>
          <div>
            ${isFull ? 
              '<span class="badge badge-full">COMPLET (16/16)</span>' : 
              `<span class="badge badge-eligible">${g.enrolled_count}/${g.max_capacity} elevi (${spotsLeft} libere)</span>`
            }
          </div>
        </div>

        <div style="font-size: 0.84rem; color: var(--slate-600); display: flex; justify-content: space-between; align-items: center;">
          <span>Nivel clasă: <strong>${escapeHtml(g.class_label)}</strong></span>
          <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; cursor: pointer;">
            <input type="checkbox" id="group-active-${g.id}" ${g.is_active === 1 ? 'checked' : ''} onchange="toggleGroupStatus(${g.id}, this.checked)">
            <span>Înscrieri deschise</span>
          </label>
        </div>

        <!-- Editable Notice / Restriction text -->
        <div class="notice-input-group">
          <label style="font-size: 0.82rem; font-weight: 700; color: var(--slate-700); display: block; margin-bottom: 0.3rem;">
            📌 Mențiune / Restricție specială afișată părinților pe această grupă:
          </label>
          <textarea 
            id="group-notice-input-${g.id}" 
            placeholder="Ex: Această grupă este destinată exclusiv elevilor de la Școala Nr. 12... (lăsați gol dacă nu este cazul)"
          >${escapeHtml(g.notice || '')}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="saveGroupNotice(${g.id})">
            💾 Salvează Mențiunea
          </button>
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
}

// Save notice for a specific group
async function saveGroupNotice(groupId) {
  const textarea = document.getElementById(`group-notice-input-${groupId}`);
  if (!textarea) return;

  const notice = textarea.value.trim();

  try {
    const res = await authFetch(`/api/groups/${groupId}/notice`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notice })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Mențiunea pentru Grupa ${groupId} a fost actualizată!`, 'success');
      const target = adminState.groups.find(g => g.id === groupId);
      if (target) target.notice = notice;
      loadGroups();
    } else {
      showToast(data.error || 'Eroare la salvare', 'error');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('Eroare de conexiune la server', 'error');
  }
}

// Toggle Group Active status
async function toggleGroupStatus(groupId, isActive) {
  try {
    const res = await authFetch(`/api/groups/${groupId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive ? 1 : 0 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(isActive ? `Înscrierile pentru Grupa ${groupId} sunt active.` : `Înscrierile pentru Grupa ${groupId} au fost oprite temporar.`, 'info');
      const target = adminState.groups.find(g => g.id === groupId);
      if (target) target.is_active = isActive ? 1 : 0;
      loadGroups();
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('Eroare la actualizarea stării', 'error');
  }
}

// Delete student
async function confirmDeleteStudent(studentId, studentName) {
  const confirmed = confirm(`Sunteți sigur că doriți să ștergeți elevul "${studentName}" din catalog? Locul său va deveni din nou liber.`);
  if (!confirmed) return;

  try {
    const res = await authFetch(`/api/students/${studentId}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      showToast('Elevul a fost eliminat cu succes!', 'success');
      await Promise.all([loadAdminGroups(), loadAdminStudents()]);
      loadGroups();
    } else {
      showToast(data.error || 'Eroare la ștergerea elevului', 'error');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('Nu s-a putut șterge elevul', 'error');
  }
}

// Edit Student Modal
function openEditStudentModal(studentId) {
  const student = adminState.students.find(s => s.id === studentId);
  if (!student) return;

  document.getElementById('edit-student-id').value = student.id;
  document.getElementById('edit-last-name').value = student.last_name;
  document.getElementById('edit-first-name').value = student.first_name;
  document.getElementById('edit-class-grade').value = student.class_grade;
  document.getElementById('edit-school-origin').value = student.school_origin || '';
  document.getElementById('edit-parent-phone').value = student.parent_phone;
  document.getElementById('edit-group-id').value = student.group_id;
  document.getElementById('edit-student-notice').value = student.student_notice || '';
  document.getElementById('edit-notes').value = student.notes || '';

  const modal = document.getElementById('modal-edit-student');
  const body = modal.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
  modal.classList.add('show');
}

function closeEditModal() {
  document.getElementById('modal-edit-student').classList.remove('show');
}

async function handleEditStudentSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-student-id').value;
  const lastName = document.getElementById('edit-last-name').value.trim();
  const firstName = document.getElementById('edit-first-name').value.trim();
  const classGrade = parseInt(document.getElementById('edit-class-grade').value, 10);
  const schoolOrigin = document.getElementById('edit-school-origin').value.trim();
  const parentPhone = document.getElementById('edit-parent-phone').value.trim();
  const groupId = parseInt(document.getElementById('edit-group-id').value, 10);
  const studentNotice = document.getElementById('edit-student-notice').value.trim();
  const notes = document.getElementById('edit-notes').value.trim();

  if (!schoolOrigin) {
    showToast('Școala de proveniență este obligatorie!', 'error');
    return;
  }

  try {
    const res = await authFetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        last_name: lastName,
        first_name: firstName,
        class_grade: classGrade,
        school_origin: schoolOrigin,
        parent_phone: parentPhone,
        group_id: groupId,
        student_notice: studentNotice,
        notes: notes
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Datele și mesajul pentru elev au fost salvate!', 'success');
      closeEditModal();
      await Promise.all([loadAdminGroups(), loadAdminStudents()]);
      loadGroups();
    } else {
      showToast(data.error || 'Eroare la actualizare', 'error');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('Eroare de conexiune la server', 'error');
  }
}

// Reset Student Password Modal (Teacher action)
function openResetStudentPwdModal(studentId, studentName) {
  document.getElementById('reset-student-id').value = studentId;
  document.getElementById('reset-student-name-label').innerText = `Elev: ${studentName}`;
  document.getElementById('reset-new-pwd').value = '1234';
  document.getElementById('modal-reset-student-pwd').classList.add('show');
}

function closeResetStudentPwdModal() {
  document.getElementById('modal-reset-student-pwd').classList.remove('show');
}

async function handleResetStudentPwdSubmit(e) {
  e.preventDefault();
  const studentId = document.getElementById('reset-student-id').value;
  const newPassword = document.getElementById('reset-new-pwd').value.trim();

  try {
    const res = await authFetch('/api/admin/reset-student-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        new_password: newPassword
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Parola elevului a fost resetată la: ${newPassword}`, 'success');
      closeResetStudentPwdModal();
    } else {
      showToast(data.error || 'Eroare la resetarea parolei', 'error');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('Eroare de server', 'error');
  }
}

function openAddStudentModal() {
  document.getElementById('add-student-form').reset();
  const modal = document.getElementById('modal-add-student');
  const body = modal.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
  modal.classList.add('show');
}

function closeAddStudentModal() {
  document.getElementById('modal-add-student').classList.remove('show');
}

async function handleAddStudentSubmit(e) {
  e.preventDefault();
  const lastName = document.getElementById('add-last-name').value.trim();
  const firstName = document.getElementById('add-first-name').value.trim();
  const classGrade = parseInt(document.getElementById('add-class-grade').value, 10);
  const schoolOrigin = document.getElementById('add-school-origin').value.trim();
  const parentPhone = document.getElementById('add-parent-phone').value.trim();
  const groupId = parseInt(document.getElementById('add-group-id').value, 10);

  if (!schoolOrigin) {
    showToast('Școala de proveniență este obligatorie!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        last_name: lastName,
        first_name: firstName,
        class_grade: classGrade,
        school_origin: schoolOrigin,
        parent_phone: parentPhone,
        group_id: groupId,
        password: parentPhone.slice(-4) || '1234'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Elevul a fost adăugat cu succes în catalog!', 'success');
      closeAddStudentModal();
      await Promise.all([loadAdminGroups(), loadAdminStudents()]);
      loadGroups();
    } else {
      showToast(data.error || 'Eroare la adăugare', 'error');
    }
  } catch (err) {
    showToast('Eroare de conexiune la server', 'error');
  }
}

// Change Teacher Admin Password Modal
function openChangePasswordModal() {
  document.getElementById('change-password-form').reset();
  document.getElementById('modal-change-password').classList.add('show');
}

function closeChangePasswordModal() {
  document.getElementById('modal-change-password').classList.remove('show');
}

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const cur = document.getElementById('pwd-current').value;
  const next = document.getElementById('pwd-new').value;
  const conf = document.getElementById('pwd-confirm').value;

  if (next !== conf) {
    showToast('Noua parolă și confirmarea nu coincid!', 'error');
    return;
  }

  try {
    const res = await authFetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cur, newPassword: next })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Parola de profesor a fost modificată cu succes!', 'success');
      closeChangePasswordModal();
    } else {
      showToast(data.error || 'Eroare la schimbarea parolei', 'error');
    }
  } catch (err) {
    if (err.message !== 'Unauthorized') showToast('Eroare de server', 'error');
  }
}

// Export CSV for Excel (Uses cached token)
function exportCSV() {
  if (!adminState.token) return;
  window.location.href = `/api/export-csv?token=${encodeURIComponent(adminState.token)}`;
}
