/**
 * Orar Teatru / Teatru de Revistă
 * Logica principală: Înscrieri, Portal Elev & PWA
 */

let state = {
  groups: [],
  selectedGroupId: null,
  selectedGrade: null,
  currentStudent: null,
  deferredPwaPrompt: null
};

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadGroups();

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }

  // Check if app is already installed or running in standalone mode
  updateInstallButtonVisibility();

  // PWA Install prompt listener
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPwaPrompt = e;
    updateInstallButtonVisibility();
  });

  // Fired when the app is successfully installed
  window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa_installed', 'true');
    state.deferredPwaPrompt = null;
    updateInstallButtonVisibility();
    showToast('Aplicația a fost instalată cu succes!', 'success');
    handleNotificationRequest();
  });

  const printDateEl = document.getElementById('print-date');
  if (printDateEl) {
    const today = new Date();
    printDateEl.innerText = `Generat la: ${today.toLocaleDateString('ro-RO')} ${today.toLocaleTimeString('ro-RO')}`;
  }
});

// Detect if running inside installed PWA standalone window or already installed
function isAppAlreadyInstalled() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone === true || 
                       document.referrer.includes('android-app://');
  const isMarkedInstalled = localStorage.getItem('pwa_installed') === 'true';
  return isStandalone || isMarkedInstalled;
}

function updateInstallButtonVisibility() {
  const installBtn = document.getElementById('pwa-install-btn');
  if (!installBtn) return;
  if (isAppAlreadyInstalled()) {
    installBtn.style.display = 'none';
  } else {
    installBtn.style.display = 'inline-flex';
  }
}

// Trigger PWA Installation via Chrome / Browser prompt or show Guide Modal on unsupported browsers (like Arc / Safari desktop)
async function triggerPWAInstall() {
  if (state.deferredPwaPrompt) {
    state.deferredPwaPrompt.prompt();
    const choice = await state.deferredPwaPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      localStorage.setItem('pwa_installed', 'true');
      updateInstallButtonVisibility();
      showToast('Aplicația a fost instalată cu succes!', 'success');
      handleNotificationRequest();
    }
    state.deferredPwaPrompt = null;
  } else {
    openPwaGuideModal();
  }
}

function openPwaGuideModal() {
  const modal = document.getElementById('modal-pwa-guide');
  if (modal) modal.classList.add('show');
}

function closePwaGuideModal() {
  const modal = document.getElementById('modal-pwa-guide');
  if (modal) modal.classList.remove('show');
}

// Switch Main Tabs (Înscriere vs Cont Elev vs Panou Profesor)
async function switchMainTab(tabId) {
  const tabs = {
    register: { el: document.getElementById('tab-register'), btn: document.getElementById('tab-btn-register') },
    student: { el: document.getElementById('tab-student'), btn: document.getElementById('tab-btn-student') },
    admin: { el: document.getElementById('tab-admin'), btn: document.getElementById('tab-btn-admin') }
  };

  if (tabId === 'admin') {
    // Check teacher authentication in cache
    const cachedToken = localStorage.getItem('teacher_token');
    let isValid = false;
    if (cachedToken) {
      isValid = await verifyAuthToken(cachedToken);
    }

    if (isValid) {
      adminState.token = cachedToken;
      Object.keys(tabs).forEach(k => {
        tabs[k].el.classList.toggle('active', k === 'admin');
        tabs[k].btn.classList.toggle('active', k === 'admin');
      });
      loadAdminData();
    } else {
      openAuthModal();
    }
    return;
  }

  // Handle Register or Student Portal tab switch
  Object.keys(tabs).forEach(k => {
    tabs[k].el.classList.toggle('active', k === tabId);
    tabs[k].btn.classList.toggle('active', k === tabId);
  });

  if (tabId === 'register') {
    loadGroups();
  } else if (tabId === 'student') {
    checkStudentAuth();
  }
}

// ----------------------------------------------------
// PORTAL ELEV: AUTENTIFICARE & DASHBOARD
// ----------------------------------------------------

async function checkStudentAuth() {
  const token = localStorage.getItem('student_token');
  if (!token) {
    showStudentLoginView();
    return;
  }

  try {
    const res = await fetch('/api/student/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success && data.student) {
      state.currentStudent = data.student;
      renderStudentDashboard(data.student);
    } else {
      showStudentLoginView();
    }
  } catch (err) {
    showStudentLoginView();
  }
}

function showStudentLoginView() {
  document.getElementById('student-login-view').style.display = 'block';
  document.getElementById('student-dashboard-view').style.display = 'none';
  localStorage.removeItem('student_token');
  state.currentStudent = null;
}

function renderStudentDashboard(student) {
  document.getElementById('student-login-view').style.display = 'none';
  document.getElementById('student-dashboard-view').style.display = 'block';

  // Populate info
  document.getElementById('student-dash-name').innerText = `${student.first_name} ${student.last_name}`;
  
  const classLabel = student.class_grade === 0 ? 
    `Clasa Pregătitoare ${student.class_letter || ''}`.trim() : 
    `Clasa a ${student.class_grade}-a ${student.class_letter || ''}`.trim();
  document.getElementById('student-dash-class').innerText = `Înscris la: ${classLabel} • Telefon contact: ${student.parent_phone}`;

  document.getElementById('student-dash-group-name').innerText = student.group_name;
  document.getElementById('student-dash-group-level').innerText = `Nivel: ${student.group_class_label}`;
  document.getElementById('student-dash-group-time').innerText = `${student.group_day} • ${student.group_time}`;

  // Group notice
  const groupNoticeBox = document.getElementById('student-dash-group-notice-box');
  const groupNoticeText = document.getElementById('student-dash-group-notice-text');
  if (student.group_notice && student.group_notice.trim() !== '') {
    groupNoticeText.innerText = student.group_notice;
    groupNoticeBox.style.display = 'block';
  } else {
    groupNoticeBox.style.display = 'none';
  }

  // Student-specific notice from teacher (e.g., fise, rol, materiale)
  const individualBox = document.getElementById('student-dash-individual-content');
  if (student.student_notice && student.student_notice.trim() !== '') {
    individualBox.innerHTML = `
      <div style="background: #fffbeb; border: 1.5px solid #f59e0b; border-left: 5px solid #d97706; padding: 1rem 1.25rem; border-radius: 10px;">
        <div style="font-size: 0.75rem; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 0.35rem;">
          📢 Mesaj / Indicație de la profesorul tău:
        </div>
        <div style="font-size: 1rem; color: #78350f; font-weight: 700; line-height: 1.5;">
          ${escapeHtml(student.student_notice)}
        </div>
      </div>
    `;
  } else {
    individualBox.innerHTML = `
      <div style="padding: 1rem; color: var(--slate-500); font-size: 0.9rem; background: var(--slate-50); border-radius: 8px; text-align: center;">
        Nu aveți mențiuni speciale sau fișe suplimentare cerute de profesor în acest moment. Ne vedem la repetiții!
      </div>
    `;
  }

  // Update notification permission card state
  if ('Notification' in window) {
    updateNotificationCardUI(Notification.permission);
  }
}

// Student Login Form Submit
async function handleStudentLoginSubmit(e) {
  e.preventDefault();
  const phone = document.getElementById('student-login-phone').value.trim();
  const password = document.getElementById('student-login-pwd').value.trim();
  const errBox = document.getElementById('student-login-error');
  const btn = document.getElementById('student-login-btn');

  errBox.style.display = 'none';
  btn.disabled = true;
  btn.innerText = 'Se conectează...';

  try {
    const res = await fetch('/api/student/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });

    const data = await res.json();
    if (data.success) {
      localStorage.setItem('student_token', data.token);
      state.currentStudent = data.student;
      renderStudentDashboard(data.student);
      showToast(`Bine ai revenit, ${data.student.first_name}!`, 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      errBox.innerText = data.error || 'Autentificare eșuată.';
      errBox.style.display = 'block';
    }
  } catch (err) {
    errBox.innerText = 'Eroare de conexiune la server.';
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerText = 'Intră în Cont';
  }
}

// Student Logout
function handleStudentLogout() {
  localStorage.removeItem('student_token');
  state.currentStudent = null;
  showStudentLoginView();
  showToast('Te-ai deconectat din contul de elev.', 'info');
}

// Open My Account directly after enrollment
function goToMyStudentAccount() {
  closeSuccessModal();
  switchMainTab('student');
}

// Notification Permission Request & Status Management
async function handleNotificationRequest() {
  if (!('Notification' in window)) {
    showToast('Acest browser nu suportă notificări.', 'error');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('Notificările sunt deja active!', 'info');
    updateNotificationCardUI('granted');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    updateNotificationCardUI(permission);

    if (permission === 'granted') {
      showToast('Notificările au fost activate cu succes!', 'success');
      try {
        new Notification('🎭 Orar Teatru / Teatru de Revistă', {
          body: 'Notificările sunt active! Vei primi noutățile și fișele de la profesor aici.',
          icon: '/icon.svg'
        });
      } catch (err) {}
    } else {
      showToast('Permisiunea pentru notificări a fost respinsă din browser.', 'info');
    }
  } catch (e) {
    console.error('Notification error:', e);
  }
}

function updateNotificationCardUI(permission) {
  const card = document.getElementById('notification-card');
  const title = document.getElementById('notif-title');
  const desc = document.getElementById('notif-desc');
  const btn = document.getElementById('notif-btn');
  const icon = document.getElementById('notif-icon');
  if (!card || !btn) return;

  if (permission === 'granted') {
    card.style.background = '#f0fdf4';
    card.style.borderColor = '#86efac';
    title.innerText = '✅ Notificări Active';
    desc.innerText = 'Vei primi automat alerte pe ecran când profesorul trimite fișe, roluri sau noutăți.';
    btn.innerText = 'Notificări Activate (✓)';
    btn.style.background = '#15803d';
    btn.disabled = true;
    if (icon) icon.innerText = '🔔';
  } else if (permission === 'denied') {
    card.style.background = '#fef2f2';
    card.style.borderColor = '#fca5a5';
    title.innerText = '⚠️ Notificări Blocate în Browser';
    desc.innerText = 'Pentru a primi notificări, permiteți permisiunea din setările browserului (pictograma de lângă adresa web).';
    btn.innerText = 'Blocat în Browser';
    btn.style.background = 'var(--slate-400)';
    btn.disabled = true;
  } else {
    card.style.background = '#f0fdf4';
    card.style.borderColor = '#bbf7d0';
    title.innerText = 'Permisiuni Notificări de la Profesor';
    desc.innerText = 'Activează notificările pentru a primi alerte pe telefon când profesorul adaugă fișe sau roluri.';
    btn.innerText = 'Activează Notificările';
    btn.style.background = '#15803d';
    btn.disabled = false;
  }
}

// Student Change Password Modal
function openStudentChangePasswordModal() {
  document.getElementById('student-change-pwd-form').reset();
  document.getElementById('modal-student-change-pwd').classList.add('show');
}

function closeStudentChangePasswordModal() {
  document.getElementById('modal-student-change-pwd').classList.remove('show');
}

async function handleStudentChangePasswordSubmit(e) {
  e.preventDefault();
  const cur = document.getElementById('student-pwd-cur').value;
  const next = document.getElementById('student-pwd-new').value;
  const conf = document.getElementById('student-pwd-conf').value;
  const token = localStorage.getItem('student_token');

  if (next !== conf) {
    showToast('Noua parolă și confirmarea nu coincid!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/student/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword: cur, newPassword: next })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Parola contului a fost modificată cu succes!', 'success');
      closeStudentChangePasswordModal();
    } else {
      showToast(data.error || 'Eroare la modificarea parolei', 'error');
    }
  } catch (err) {
    showToast('Eroare de conexiune', 'error');
  }
}

// ----------------------------------------------------
// FORMULAR ÎNSCRIERE PUBLIC PĂRINȚI & ELEVI
// ----------------------------------------------------

async function loadGroups() {
  try {
    const res = await fetch('/api/groups');
    const data = await res.json();
    if (data.success) {
      state.groups = data.groups;
      renderGroupsGrid();
    } else {
      showToast('Eroare la încărcarea orarului grupelor', 'error');
    }
  } catch (err) {
    console.error('Fetch groups failed:', err);
    showToast('Nu s-a putut conecta la serverul orarului', 'error');
  }
}

function onClassGradeChange() {
  const gradeSelect = document.getElementById('student-class-grade');
  const val = gradeSelect.value;
  const hintEl = document.getElementById('class-eligibility-hint');

  if (val === '' || val === null) {
    state.selectedGrade = null;
    hintEl.innerText = 'Selectați clasa pentru a evidenția grupele compatibile.';
    hintEl.style.color = 'var(--slate-500)';
  } else {
    state.selectedGrade = parseInt(val, 10);
    const gradeName = getGradeDisplayName(state.selectedGrade);
    
    if (state.selectedGrade <= 6) {
      hintEl.innerHTML = `✅ Pentru <strong>${gradeName}</strong> sunt eligibile grupele pentru clasele 0-6 și grupele de dimineață (0-12).`;
      hintEl.style.color = 'var(--success)';
    } else {
      hintEl.innerHTML = `✅ Pentru <strong>${gradeName}</strong> sunt eligibile grupele pentru clasele 7-12 și grupele de dimineață (0-12).`;
      hintEl.style.color = 'var(--success)';
    }
  }

  if (state.selectedGroupId) {
    const currGroup = state.groups.find(g => g.id === state.selectedGroupId);
    if (currGroup && state.selectedGrade !== null) {
      if (state.selectedGrade < currGroup.class_min || state.selectedGrade > currGroup.class_max) {
        state.selectedGroupId = null;
        document.getElementById('selected-group-id').value = '';
        updateSelectionBadge(null);
      }
    }
  }

  renderGroupsGrid();
}

function renderGroupsGrid() {
  const container = document.getElementById('groups-container');
  if (!container) return;

  if (!state.groups || state.groups.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 2rem; color: var(--slate-500);">Nicio grupă disponibilă.</div>';
    return;
  }

  let html = '';

  state.groups.forEach(group => {
    const spotsLeft = Math.max(0, group.max_capacity - group.enrolled_count);
    const isFull = spotsLeft <= 0;
    const isPaused = group.is_active === 0;
    
    let isGradeEligible = true;
    let eligibilityReason = '';
    
    if (state.selectedGrade !== null) {
      if (state.selectedGrade < group.class_min || state.selectedGrade > group.class_max) {
        isGradeEligible = false;
        eligibilityReason = `Doar pentru ${group.class_label}`;
      }
    }

    const isSelected = state.selectedGroupId === group.id;
    const isDisabled = isFull || !isGradeEligible || isPaused;

    let cardClasses = ['group-card'];
    if (isSelected) cardClasses.push('selected');
    if (isFull) cardClasses.push('full');
    if ((!isGradeEligible && state.selectedGrade !== null) || isPaused) cardClasses.push('disabled');

    const percent = Math.min(100, Math.round((group.enrolled_count / group.max_capacity) * 100));
    let progressColorClass = '';
    if (percent >= 100) progressColorClass = 'danger';
    else if (percent >= 75) progressColorClass = 'warning';

    const isMorning = group.id === 3 || group.id === 10;

    html += `
      <div 
        class="${cardClasses.join(' ')}" 
        data-group-id="${group.id}" 
        onclick="selectGroup(${group.id}, ${isDisabled})"
      >
        <div>
          <div class="group-card-header">
            <div>
              <span class="group-day">${escapeHtml(group.day)}</span>
              <h3 class="group-title">${escapeHtml(group.name)}</h3>
            </div>
            ${isSelected ? '<span class="badge" style="background: var(--primary); color: white; font-weight: 700;">✓ Selectat</span>' : ''}
            ${isFull ? '<span class="badge badge-full">COMPLET</span>' : ''}
            ${isPaused ? '<span class="badge badge-incompatible">ÎNSCRIERI OPRITE</span>' : ''}
          </div>

          <div class="group-time">
            <span>🕒</span>
            <span>${escapeHtml(group.time)}</span>
          </div>

          <div class="group-badges">
            <span class="badge badge-class">
              📚 ${escapeHtml(group.class_label)}
            </span>
            ${isMorning ? '<span class="badge badge-morning">☀️ Program Dimineață (0-12)</span>' : ''}
            
            ${state.selectedGrade !== null ? (
              isGradeEligible ? 
                '<span class="badge badge-eligible">✓ Compatibil cu clasa aleasă</span>' : 
                `<span class="badge badge-incompatible">✕ ${escapeHtml(eligibilityReason)}</span>`
            ) : ''}
          </div>

          <!-- Teacher Custom Special Notice on Group Card -->
          ${group.notice && group.notice.trim() !== '' ? `
            <div class="group-notice-alert">
              <div class="notice-tag">📢 MENȚIUNE IMPORTANTĂ</div>
              <div class="notice-text">
                ${escapeHtml(group.notice)}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Spots & Capacity Progress bar -->
        <div class="capacity-info">
          <div class="capacity-text-row">
            <span>Locuri ocupate:</span>
            <span>
              <strong>${group.enrolled_count} / ${group.max_capacity}</strong>
              (${isFull ? '<span style="color: var(--danger);">0 libere</span>' : `<span style="color: var(--success);">${spotsLeft} libere</span>`})
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${progressColorClass}" style="width: ${percent}%;"></div>
          </div>
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
}

function selectGroup(groupId, isDisabled) {
  if (isDisabled) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    if (group.is_active === 0) {
      showToast('Înscrierile pentru această grupă sunt momentan oprite de către organizator.', 'error');
      return;
    }

    if (group.enrolled_count >= group.max_capacity) {
      showToast(`Grupa ${group.name} a atins numărul maxim de 16 elevi (este completă).`, 'error');
      return;
    }

    if (state.selectedGrade !== null) {
      if (state.selectedGrade < group.class_min || state.selectedGrade > group.class_max) {
        showToast(`Această grupă este destinată exclusiv pentru ${group.class_label}.`, 'error');
        return;
      }
    }
    return;
  }

  const gradeSelect = document.getElementById('student-class-grade');
  if (!gradeSelect.value) {
    showToast('Vă rugăm să alegeți mai întâi clasa elevului la Pasul 1!', 'error');
    gradeSelect.focus();
    return;
  }

  state.selectedGroupId = groupId;
  document.getElementById('selected-group-id').value = groupId;

  const group = state.groups.find(g => g.id === groupId);
  updateSelectionBadge(group);
  renderGroupsGrid();

  const errBox = document.getElementById('form-error-msg');
  if (errBox) errBox.style.display = 'none';
}

function updateSelectionBadge(group) {
  const badge = document.getElementById('selection-summary-badge');
  if (!badge) return;

  if (!group) {
    badge.className = 'badge badge-class';
    badge.innerHTML = 'Nicio grupă selectată încă';
  } else {
    badge.className = 'badge badge-eligible';
    badge.style.fontSize = '0.9rem';
    let summaryHtml = `✓ Ați ales: <strong>${escapeHtml(group.name)} (${escapeHtml(group.day)} ${escapeHtml(group.time)})</strong>`;
    if (group.notice && group.notice.trim() !== '') {
      summaryHtml += `<div style="font-size: 0.82rem; margin-top: 4px; color: #9a3412; font-weight: normal;">📢 Mențiune grupă: <strong>${escapeHtml(group.notice)}</strong></div>`;
    }
    badge.innerHTML = summaryHtml;
  }
}

// Submit enrollment
async function handleEnrollmentSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('enrollment-form');
  const submitBtn = document.getElementById('submit-btn');
  const errBox = document.getElementById('form-error-msg');

  errBox.style.display = 'none';

  const lastName = document.getElementById('student-last-name').value.trim();
  const firstName = document.getElementById('student-first-name').value.trim();
  const classGrade = document.getElementById('student-class-grade').value;
  const classLetter = document.getElementById('student-class-letter').value.trim();
  const parentPhone = document.getElementById('parent-phone').value.trim();
  const password = document.getElementById('student-password').value.trim();
  const groupId = document.getElementById('selected-group-id').value;

  if (!lastName || !firstName) {
    showError(errBox, 'Vă rugăm să completați numele și prenumele elevului.');
    return;
  }

  if (classGrade === '' || isNaN(classGrade)) {
    showError(errBox, 'Vă rugăm să selectați clasa elevului.');
    return;
  }

  if (!parentPhone || parentPhone.length < 9) {
    showError(errBox, 'Vă rugăm să introduceți un număr de telefon valid (ex: 0740 123 456).');
    return;
  }

  if (!password || password.length < 4) {
    showError(errBox, 'Vă rugăm să alegeți o parolă de minim 4 caractere pentru contul elevului.');
    return;
  }

  if (!groupId) {
    showError(errBox, 'Vă rugăm să alegeți una dintre cele 10 grupe disponibile făcând clic pe caseta corespunzătoare!');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳</span> Se procesează înscrierea...';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        last_name: lastName,
        first_name: firstName,
        class_grade: parseInt(classGrade, 10),
        class_letter: classLetter,
        parent_phone: parentPhone,
        password: password,
        group_id: parseInt(groupId, 10)
      })
    });

    const data = await res.json();

    if (data.success) {
      // Remember student token in localStorage so their portal is immediately ready
      if (data.studentToken) {
        localStorage.setItem('student_token', data.studentToken);
      }

      showSuccessModal(data.student);
      form.reset();
      state.selectedGroupId = null;
      state.selectedGrade = null;
      document.getElementById('selected-group-id').value = '';
      updateSelectionBadge(null);
      await loadGroups();
    } else {
      showError(errBox, data.error || 'A apărut o eroare la salvarea înscrierii.');
      showToast(data.error || 'Înscrierea nu a putut fi salvată', 'error');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showError(errBox, 'Nu s-a putut conecta la server. Vă rugăm să verificați conexiunea.');
    showToast('Eroare de conexiune', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>✨</span> Trimite Înscrierea';
  }
}

function showError(box, msg) {
  box.innerText = msg;
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showSuccessModal(student) {
  const modal = document.getElementById('modal-success');
  const body = document.getElementById('success-modal-body');
  
  const clasaLabel = student.class_grade === 0 ? 
    `Clasa Pregătitoare ${student.class_letter || ''}`.trim() : 
    `Clasa a ${student.class_grade}-a ${student.class_letter || ''}`.trim();

  body.innerHTML = `
    <div style="background: var(--slate-50); border: 1.5px solid var(--slate-200); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem;">
      <h4 style="color: var(--primary); font-size: 1.15rem; margin-bottom: 0.75rem;">
        🎭 ${escapeHtml(student.last_name)} ${escapeHtml(student.first_name)}
      </h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.95rem;">
        <div>
          <span style="color: var(--slate-500); font-size: 0.8rem; display:block;">Clasa:</span>
          <strong>${escapeHtml(clasaLabel)}</strong>
        </div>
        <div>
          <span style="color: var(--slate-500); font-size: 0.8rem; display:block;">Telefon Părinte:</span>
          <strong>${escapeHtml(student.parent_phone)}</strong>
        </div>
        <div style="grid-column: 1 / -1; margin-top: 0.25rem; padding-top: 0.75rem; border-top: 1px dashed var(--slate-200);">
          <span style="color: var(--slate-500); font-size: 0.8rem; display:block;">Grupa Repartizată:</span>
          <div style="font-size: 1.05rem; font-weight: 700; color: #065f46;">
            ${escapeHtml(student.group_name)} &bull; ${escapeHtml(student.day)} (${escapeHtml(student.time)})
          </div>
        </div>
        ${student.notice && student.notice.trim() !== '' ? `
          <div style="grid-column: 1 / -1; margin-top: 0.5rem; background: #fff7ed; border-left: 4px solid #ea580c; padding: 0.6rem 0.85rem; border-radius: 6px;">
            <span style="font-size: 0.74rem; font-weight: 800; color: #c2410c; display: block; text-transform: uppercase;">📢 Mențiune importantă grupă:</span>
            <span style="font-size: 0.88rem; color: #9a3412; font-weight: 700;">${escapeHtml(student.notice)}</span>
          </div>
        ` : ''}
      </div>
    </div>
    <p style="font-size: 0.9rem; color: var(--slate-600); line-height: 1.5;">
      Înscrierea a fost confirmată și adăugată în catalog. Puteți accesa oricând tab-ul <strong>„👤 Contul Meu Elev”</strong> folosind numărul de telefon și parola aleasă pentru a vedea orarul și mesajele/fișele primite de la profesor.
    </p>
  `;

  modal.classList.add('show');
}

function closeSuccessModal() {
  const modal = document.getElementById('modal-success');
  modal.classList.remove('show');
}

// Auth Modal for Teacher Panel
function openAuthModal() {
  const modal = document.getElementById('modal-admin-auth');
  const input = document.getElementById('auth-password-input');
  const err = document.getElementById('auth-error-msg');
  if (err) err.style.display = 'none';
  if (input) input.value = '';
  modal.classList.add('show');
  setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeAuthModal() {
  const modal = document.getElementById('modal-admin-auth');
  modal.classList.remove('show');
}

async function handleAuthModalSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('auth-password-input');
  const errBox = document.getElementById('auth-error-msg');
  const btn = document.getElementById('auth-submit-btn');
  const password = input.value;

  errBox.style.display = 'none';
  btn.disabled = true;
  btn.innerText = 'Se verifică...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (data.success) {
      localStorage.setItem('teacher_token', data.token);
      adminState.token = data.token;

      closeAuthModal();
      showToast('Autentificare confirmată! Accesul a fost memorat în cache.', 'success');

      switchMainTab('admin');
    } else {
      errBox.innerText = data.error || 'Parolă incorectă!';
      errBox.style.display = 'block';
    }
  } catch (err) {
    errBox.innerText = 'Eroare de conexiune la server.';
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerText = 'Intră în Panou';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</span>
    <div>${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getGradeDisplayName(grade) {
  if (grade === 0) return 'Clasa Pregătitoare (0)';
  const romans = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return `Clasa a ${romans[grade] || grade}-a (${grade})`;
}
