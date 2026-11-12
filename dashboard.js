import { renderDashboard, phaseDetail } from './lib/dashboard-view.js';

const TOKEN_KEY = 'eabha-session';

function savedToken() {
  const local = localStorage.getItem(TOKEN_KEY);
  if (local) return local;
  const older = sessionStorage.getItem(TOKEN_KEY);
  if (!older) return '';
  localStorage.setItem(TOKEN_KEY, older);
  sessionStorage.removeItem(TOKEN_KEY);
  return older;
}
function storeToken(value) {
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

let story = { strategy: [], phases: [], days: [], formula: '' };
let plan = [];
let logs = {};

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function render() {
  const root = document.getElementById('dash');
  root.innerHTML = renderDashboard({ story, plan, logs, today: todayIso() });
  const detail = document.getElementById('phaseDetail');
  root.querySelectorAll('[data-phase]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.phase);
      const open = btn.getAttribute('aria-pressed') === 'true';
      root.querySelectorAll('[data-phase]').forEach(other => other.setAttribute('aria-pressed', 'false'));
      if (open) {
        detail.hidden = true;
        detail.innerHTML = '';
        return;
      }
      btn.setAttribute('aria-pressed', 'true');
      detail.hidden = false;
      detail.innerHTML = phaseDetail(story.phases.find(phase => phase.id === id));
    });
  });
  document.getElementById('signed').hidden = false;
  document.getElementById('gate').hidden = true;
  const signOut = document.getElementById('signOut');
  signOut.hidden = false;
  signOut.onclick = () => {
    storeToken('');
    signInForm('');
  };
}

function showGate(html) {
  document.getElementById('gate').innerHTML = html;
  document.getElementById('gate').hidden = false;
  document.getElementById('signed').hidden = true;
  document.getElementById('dash').innerHTML = '';
  const signOut = document.getElementById('signOut');
  if (signOut) signOut.hidden = true;
}

let who = 'eabha';

function signInForm(message) {
  showGate(
    '<form class="card" id="signForm">' +
    '<p>Sign in to see your training. Eabha and Niall use the same page.</p>' +
    '<div class="choices">' +
    '<button type="button" data-who="eabha" aria-pressed="true">Eabha</button>' +
    '<button type="button" data-who="niall" aria-pressed="false">Niall</button>' +
    '</div>' +
    '<label class="k" for="pin">Passcode</label>' +
    '<input id="pin" type="password" inputmode="numeric" autocomplete="current-password">' +
    (message ? '<p class="error">' + esc(message) + '</p>' : '') +
    '<div class="gate-actions"><button class="primary" type="submit">Unlock</button></div>' +
    '</form>'
  );
  document.querySelectorAll('[data-who]').forEach(btn => {
    btn.addEventListener('click', () => {
      who = btn.dataset.who;
      document.querySelectorAll('[data-who]').forEach(other => {
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      });
    });
  });
  document.getElementById('signForm').addEventListener('submit', async event => {
    event.preventDefault();
    const pin = document.getElementById('pin').value;
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: who, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not sign in.');
      storeToken(data.token);
      document.getElementById('pin').value = '';
      await loadLogs(data.token);
    } catch (error) {
      signInForm(error.message);
    }
  });
}

async function loadLogs(token) {
  const headers = { Authorization: 'Bearer ' + token };
  const [logRes, planRes] = await Promise.all([
    fetch('/api/logs', { headers }),
    fetch('/api/schedule', { headers }),
  ]);
  if (logRes.status === 401 || planRes.status === 401) {
    storeToken('');
    signInForm('Sign in again.');
    return;
  }
  const logsBody = await logRes.json().catch(() => ({}));
  const planBody = await planRes.json().catch(() => ({}));
  if (!logRes.ok) throw new Error(logsBody.error || 'Could not load logs.');
  if (!planRes.ok) throw new Error(planBody.error || 'Could not load the plan.');
  plan = planBody.plan || [];
  story = {
    strategy: planBody.strategy || [],
    phases: planBody.phases || [],
    days: planBody.days || [],
    formula: planBody.formula || '',
  };
  logs = logsBody.logs || {};
  render();
}

async function boot() {
  const saved = savedToken();
  let res;
  try {
    res = await fetch('/api/session', { headers: saved ? { Authorization: 'Bearer ' + saved } : {} });
  } catch {
    showGate('<p class="card">This copy has no sign-in. Open <a href="https://running-schedule-puce.vercel.app">the training site</a>.</p>');
    return;
  }
  if (res.status === 404) {
    showGate('<p class="card">This copy has no sign-in. Open <a href="https://running-schedule-puce.vercel.app">the training site</a>.</p>');
    return;
  }
  if (!res.ok) {
    showGate('<p class="card">Could not check the sign-in. Try again.</p>');
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (data.logging !== true) {
    showGate('<p class="card">This copy has no sign-in. Open <a href="https://running-schedule-puce.vercel.app">the training site</a>.</p>');
    return;
  }
  if (!data.role) {
    signInForm('');
    return;
  }
  try {
    await loadLogs(saved);
  } catch (error) {
    signInForm(error.message);
  }
}

boot();
