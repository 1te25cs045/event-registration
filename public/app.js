const state = { user: null, events: [], category: 'All', search: '', dashboard: null, studentRegistrations: [], pendingEventId: null };
const grid = document.getElementById('events-grid');
const backdrop = document.getElementById('modal-backdrop');
const modalContent = document.getElementById('modal-content');
const toast = document.getElementById('toast');
let toastTimer;

function setTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-theme', isDark);
  const button = document.getElementById('theme-toggle');
  button.textContent = isDark ? '☀ Light mode' : '☾ Dark mode';
  button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
  button.setAttribute('aria-pressed', String(isDark));
}

setTheme(localStorage.getItem('college-event-theme') || 'light');

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function notify(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function updateNavigation() {
  const studentAction = document.getElementById('student-nav-action');
  const adminAction = document.getElementById('admin-nav-action');
  studentAction.textContent = state.user?.role === 'student' ? 'Student dashboard' : 'Student login';
  adminAction.textContent = state.user?.role === 'admin' ? 'Admin dashboard' : 'Admin';
  studentAction.toggleAttribute('data-dashboard', state.user?.role === 'student');
  adminAction.toggleAttribute('data-dashboard', state.user?.role === 'admin');
  studentAction.toggleAttribute('data-open', state.user?.role !== 'student');
  adminAction.toggleAttribute('data-open', state.user?.role !== 'admin');
  if (state.user?.role !== 'student') studentAction.dataset.open = 'login';
  if (state.user?.role !== 'admin') adminAction.dataset.open = 'admin-login';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadEvents() {
  try {
    const result = await api('/api/events');
    state.events = result.events;
    renderEvents();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)} Check that the server and database are running.</div>`;
  }
}

function renderEvents() {
  const search = state.search.trim().toLocaleLowerCase();
  const events = state.events.filter(event => {
    const matchesCategory = state.category === 'All' || event.category === state.category;
    const matchesSearch = !search || event.name.toLocaleLowerCase().includes(search) || event.category.toLocaleLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
  if (!events.length) {
    grid.innerHTML = '<div class="empty-state">No events match your search. Try another name or category.</div>';
    return;
  }
  grid.innerHTML = events.map(event => `
    <article class="event-card">
      <div class="event-top"><span class="event-category">${escapeHtml(event.category)}</span><span class="event-count">${Number(event.registration_count)} registered</span></div>
      <h3>${escapeHtml(event.name)}</h3><p>${escapeHtml(event.description)}</p>
      <div class="event-meta"><span>◷ &nbsp;${formatDate(event.date)} · ${escapeHtml(event.time)}</span><span>⌖ &nbsp;${escapeHtml(event.venue)}</span></div>
      <div class="event-footer"><span class="event-date">${escapeHtml(event.category.toUpperCase())} · CAMPUS EVENT</span>
      <button class="event-register" data-register="${event.id}">Register now →</button></div>
    </article>`).join('');
}

function showModal(html) {
  modalContent.innerHTML = html;
  backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  const firstInput = modalContent.querySelector('input, button, select');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  backdrop.hidden = true;
  document.body.style.overflow = '';
  state.pendingEventId = null;
}

function authForm(type) {
  const admin = type === 'admin-login';
  const signup = type === 'signup';
  const pendingEvent = state.events.find(event => String(event.id) === String(state.pendingEventId));
  const title = signup ? (pendingEvent ? 'Register for this event' : 'Create your account') : admin ? 'Admin sign in' : 'Welcome back';
  const intro = signup
    ? pendingEvent
      ? `Create your student account to register for ${pendingEvent.name}.`
      : 'Sign up with your student details to join campus events.'
    : admin
      ? 'Sign in to manage campus events and registrations.'
      : pendingEvent
        ? `Sign in to finish registering for ${pendingEvent.name}.`
        : 'Sign in to discover and register for events.';
  const fields = signup ? `
    <div class="form-grid">
      <div class="form-field"><label for="name">Full name</label><input id="name" name="name" required autocomplete="name"></div>
      <div class="form-field"><label for="usn">USN</label><input id="usn" name="usn" required></div>
      <div class="form-field full"><label for="email">College email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="form-field full"><label for="department">Department</label><input id="department" name="department" required placeholder="e.g. Computer Science"></div>
      <div class="form-field full"><label for="password">Password (at least 8 characters)</label><input id="password" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
    </div>` : `
    <div class="form-field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username"></div>
    <div class="form-field"><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password"></div>`;
  showModal(`<h2 id="modal-title">${title}</h2><p class="modal-intro">${intro}</p>
    <form id="auth-form" data-type="${type}">${fields}<button class="button button-primary" type="submit">${signup ? 'Create account' : 'Sign in'}</button></form>
    ${admin ? '' : `<p class="form-switch">${signup ? 'Already have an account?' : 'New to Northstar?'} <button type="button" data-open="${signup ? 'login' : 'signup'}">${signup ? 'Sign in' : 'Create an account'}</button></p>`}`);
}

function eventForm(event = null) {
  const editing = Boolean(event);
  const value = key => escapeHtml(event?.[key] || '');
  showModal(`<h2 id="modal-title">${editing ? 'Edit event' : 'Add an event'}</h2><p class="modal-intro">Share the details so students can find and join your event.</p>
    <form id="event-form" data-id="${editing ? event.id : ''}">
      <div class="form-grid">
        <div class="form-field full"><label for="name">Event name</label><input id="name" name="name" required maxlength="160" value="${value('name')}"></div>
        <div class="form-field full"><label for="description">Description</label><textarea id="description" name="description" required>${value('description')}</textarea></div>
        <div class="form-field"><label for="date">Date</label><input id="date" name="date" type="date" required value="${value('date')}"></div>
        <div class="form-field"><label for="time">Time</label><input id="time" name="time" type="time" required value="${value('time')}"></div>
        <div class="form-field"><label for="venue">Venue</label><input id="venue" name="venue" required value="${value('venue')}"></div>
        <div class="form-field"><label for="category">Category</label><select id="category" name="category" required>
          ${['Technical', 'Cultural', 'Sports', 'Workshops'].map(category => `<option ${event?.category === category ? 'selected' : ''}>${category}</option>`).join('')}
        </select></div>
      </div>
      <button class="button button-primary" type="submit">${editing ? 'Save changes' : 'Create event'}</button>
    </form>`);
}

function studentDashboard(tab = 'events') {
  const isRegistered = tab === 'registered';
  const list = isRegistered ? state.studentRegistrations : state.events;
  const registeredCategories = new Set(state.studentRegistrations.map(item => item.category)).size;
  const items = list.length ? list.map(item => `<article class="dashboard-item"><div>
    <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category)} · ${formatDate(item.date)} at ${escapeHtml(item.time)} · ${escapeHtml(item.venue)}</p>
    ${isRegistered ? `<p class="registration-code">Registration ID: ${escapeHtml(item.registrationId)}</p>` : ''}
    </div>${isRegistered ? '' : `<button class="event-register" data-register="${item.id}">Register →</button>`}</article>`).join('') :
    `<div class="empty-state">${isRegistered ? 'You have not registered for an event yet.' : 'No upcoming events are available.'}</div>`;
  showModal(`<div class="dashboard-header"><div><span class="eyebrow">STUDENT DASHBOARD</span><h2 id="modal-title">Hi, ${escapeHtml(state.user.name.split(' ')[0])}.</h2><span class="dashboard-user">${escapeHtml(state.user.email)}</span></div><button class="button button-outline" data-logout>Log out</button></div>
    <div class="stats-grid"><div class="stat-box"><strong>${state.events.length}</strong><span>AVAILABLE EVENTS</span></div><div class="stat-box"><strong>${state.studentRegistrations.length}</strong><span>MY REGISTRATIONS</span></div><div class="stat-box"><strong>${registeredCategories}</strong><span>CATEGORIES JOINED</span></div></div>
    <div class="dashboard-tabs"><button class="dash-tab ${!isRegistered ? 'active' : ''}" data-student-tab="events">Available events</button><button class="dash-tab ${isRegistered ? 'active' : ''}" data-student-tab="registered">My registrations (${state.studentRegistrations.length})</button></div>
    <div class="dashboard-list">${items}</div>`);
}

function registrationForm(event) {
  showModal(`<span class="eyebrow">EVENT REGISTRATION</span><h2 id="modal-title">Save your spot.</h2>
    <p class="modal-intro">Review your details and confirm your registration.</p>
    <article class="dashboard-item"><div><span class="event-category">${escapeHtml(event.category)}</span>
      <h3>${escapeHtml(event.name)}</h3>
      <p>${formatDate(event.date)} at ${escapeHtml(event.time)} · ${escapeHtml(event.venue)}</p>
    </div></article>
    <div class="form-field"><label>Student</label><input value="${escapeHtml(state.user.name)} · ${escapeHtml(state.user.email)}" readonly></div>
    <form id="registration-form" data-event-id="${event.id}">
      <label class="registration-confirm"><input type="checkbox" name="confirm" required> I confirm that I want to register for this event.</label>
      <button class="button button-primary" type="submit">Confirm registration</button>
    </form>`);
}

async function completeEventRegistration(eventId) {
  try {
    const result = await api(`/api/events/${eventId}/register`, { method: 'POST' });
    state.pendingEventId = null;
    await loadEvents();
    if (state.user?.role === 'student') await refreshStudent('registered');
    notify(`${result.message} Your ID: ${result.registrationId}`);
  } catch (error) {
    state.pendingEventId = null;
    notify(error.message, true);
    if (state.user?.role === 'student') await refreshStudent('registered');
  }
}

function adminDashboard(tab = 'events', search = '') {
  const { stats, registrations } = state.dashboard;
  const eventItems = state.events.length ? state.events.map(event => `<article class="dashboard-item"><div><h3>${escapeHtml(event.name)}</h3><p>${escapeHtml(event.category)} · ${formatDate(event.date)} at ${escapeHtml(event.time)} · ${escapeHtml(event.venue)}</p></div><div><button class="small-action" data-edit="${event.id}">Edit</button><button class="small-action danger" data-delete="${event.id}">Delete</button></div></article>`).join('') : '<div class="empty-state">No events yet. Add your first campus event.</div>';
  const query = search.trim().toLowerCase();
  const filtered = registrations.filter(row => row.studentName.toLowerCase().includes(query) || row.usn.toLowerCase().includes(query));
  const registrationRows = filtered.length ? filtered.map(row => `<tr><td>${escapeHtml(row.studentName)}</td><td>${escapeHtml(row.usn)}</td><td>${escapeHtml(row.department)}</td><td>${escapeHtml(row.eventName)}</td><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.registrationId.slice(0, 8))}</td></tr>`).join('') : '<tr><td colspan="6">No matching registrations.</td></tr>';
  showModal(`<div class="dashboard-header"><div><span class="eyebrow">ADMIN DASHBOARD</span><h2 id="modal-title">Campus overview</h2></div><button class="button button-outline" data-logout>Log out</button></div>
    <div class="stats-grid"><div class="stat-box"><strong>${stats.events}</strong><span>TOTAL EVENTS</span></div><div class="stat-box"><strong>${stats.registrations}</strong><span>REGISTRATIONS</span></div><div class="stat-box"><strong>${stats.students}</strong><span>STUDENTS</span></div></div>
    <div class="dashboard-tabs"><button class="dash-tab ${tab === 'events' ? 'active' : ''}" data-admin-tab="events">Manage events</button><button class="dash-tab ${tab === 'registrations' ? 'active' : ''}" data-admin-tab="registrations">Registrations</button></div>
    ${tab === 'events' ? `<div class="admin-toolbar"><button class="button button-primary" data-add-event>+ Add event</button></div><div class="dashboard-list">${eventItems}</div>` :
    `<div class="admin-toolbar"><input id="registration-search" placeholder="Search student name or USN…" value="${escapeHtml(search)}"></div><div class="table-wrap"><table class="registration-table"><thead><tr><th>Student</th><th>USN</th><th>Department</th><th>Event</th><th>Date</th><th>Reg. ID</th></tr></thead><tbody>${registrationRows}</tbody></table></div>`}`);
}

async function refreshStudent(tab = 'events') {
  const [events, registrations] = await Promise.all([api('/api/events'), api('/api/student/registrations')]);
  state.events = events.events;
  state.studentRegistrations = registrations.registrations;
  studentDashboard(tab);
}

async function refreshAdmin(tab = 'events', search = '') {
  const [dashboard, events] = await Promise.all([api('/api/admin/dashboard'), api('/api/admin/events')]);
  state.dashboard = dashboard;
  state.events = events.events;
  adminDashboard(tab, search);
}

async function openDashboard() {
  try {
    if (state.user.role === 'admin') await refreshAdmin();
    else await refreshStudent();
  } catch (error) {
    notify(error.message, true);
  }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-open]')) {
    event.preventDefault();
    authForm(target.dataset.open);
  } else if (target.id === 'theme-toggle') {
    const theme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
    setTheme(theme);
    localStorage.setItem('college-event-theme', theme);
  } else if (target.hasAttribute('data-dashboard')) {
    await openDashboard();
  } else if (target.id === 'modal-close' || target === backdrop) {
    closeModal();
  } else if (target.hasAttribute('data-register')) {
    if (state.user?.role !== 'student') {
      if (state.user?.role === 'admin') {
        notify('Student accounts can register for events.', true);
        return;
      }
      state.pendingEventId = target.dataset.register;
      const selectedEvent = state.events.find(item => String(item.id) === String(state.pendingEventId));
      if (!selectedEvent) {
        notify('This event is no longer available. Refresh the page and try again.', true);
        return;
      }
      authForm('signup');
      return;
    }
    const selectedEvent = state.events.find(item => String(item.id) === String(target.dataset.register));
    if (!selectedEvent) {
      notify('This event is no longer available. Refresh the page and try again.', true);
      return;
    }
    state.pendingEventId = selectedEvent.id;
    registrationForm(selectedEvent);
  } else if (target.hasAttribute('data-logout')) {
    try {
      await api('/api/logout', { method: 'POST' });
      state.user = null;
      updateNavigation();
      closeModal();
      notify('You have been logged out.');
    } catch (error) { notify(error.message, true); }
  } else if (target.hasAttribute('data-student-tab')) {
    await refreshStudent(target.dataset.studentTab);
  } else if (target.hasAttribute('data-admin-tab')) {
    await refreshAdmin(target.dataset.adminTab);
  } else if (target.hasAttribute('data-add-event')) {
    eventForm();
  } else if (target.hasAttribute('data-edit')) {
    const selected = state.events.find(item => String(item.id) === target.dataset.edit);
    if (selected) eventForm(selected);
  } else if (target.hasAttribute('data-delete')) {
    const selected = state.events.find(item => String(item.id) === target.dataset.delete);
    if (selected && window.confirm(`Delete "${selected.name}" and its registrations?`)) {
      try {
        await api(`/api/admin/events/${selected.id}`, { method: 'DELETE' });
        notify('Event deleted.');
        await refreshAdmin();
        await loadEvents();
      } catch (error) { notify(error.message, true); }
    }
  } else if (target.matches('.filter')) {
    document.querySelectorAll('.filter').forEach(button => button.classList.remove('active'));
    target.classList.add('active');
    state.category = target.dataset.category;
    renderEvents();
  } else if (target.id === 'menu-toggle') {
    document.getElementById('main-nav').classList.toggle('open');
  } else if (target.closest('#main-nav') && target.matches('a')) {
    document.getElementById('main-nav').classList.remove('open');
  }
});

document.getElementById('event-search').addEventListener('input', event => {
  state.search = event.target.value;
  renderEvents();
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'auth-form') {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const type = form.dataset.type;
    const route = type === 'signup' ? '/api/signup' : type === 'admin-login' ? '/api/admin/login' : '/api/login';
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await api(route, { method: 'POST', body: data });
      state.user = result.user;
      updateNavigation();
      if (state.pendingEventId && type !== 'admin-login') {
        const eventId = state.pendingEventId;
        await completeEventRegistration(eventId);
      } else {
        notify(type === 'signup' ? 'Account created. Welcome to Northstar!' : 'Signed in successfully.');
        await openDashboard();
      }
    } catch (error) {
      notify(error.message, true);
      button.disabled = false;
    }
  } else if (event.target.id === 'registration-form') {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    await completeEventRegistration(form.dataset.eventId);
  } else if (event.target.id === 'event-form') {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.id;
    const data = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api(id ? `/api/admin/events/${id}` : '/api/admin/events', { method: id ? 'PUT' : 'POST', body: data });
      notify(id ? 'Event updated.' : 'Event created.');
      await refreshAdmin();
      await loadEvents();
    } catch (error) {
      notify(error.message, true);
      button.disabled = false;
    }
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'registration-search') {
    const input = event.target;
    const cursor = input.selectionStart;
    adminDashboard('registrations', input.value);
    const updated = document.getElementById('registration-search');
    updated.focus();
    updated.setSelectionRange(cursor, cursor);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !backdrop.hidden) closeModal();
});

backdrop.addEventListener('click', event => {
  if (event.target === backdrop) closeModal();
});

document.querySelectorAll('#main-nav a[href^="#"]').forEach(link => link.addEventListener('click', () => document.getElementById('main-nav').classList.remove('open')));

async function initialize() {
  try {
    const result = await api('/api/me');
    state.user = result.user;
    updateNavigation();
    if (state.user) await openDashboard();
  } catch (error) {
    console.error(error);
  }
  loadEvents();
}

initialize();
