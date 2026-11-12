(function () {
  const TOKEN_KEY = 'eabha-session';
  const STATUS_LABEL = { done: 'Done', part: 'Partly done', skipped: 'Skipped', swapped: 'Swapped' };
  let ready = false;
  let token = '';
  let role = '';
  let logs = {};
  let editing = '';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function authHeaders() {
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  async function api(path, options) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options && options.headers) },
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.classList.add('modal-open');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  }

  function paint() {
    document.querySelectorAll('.day').forEach(day => {
      const entry = logs[day.dataset.date];
      let strip = day.querySelector('.log-strip');
      if (!entry) {
        if (strip) strip.remove();
        day.classList.remove('is-done');
        day.querySelector('.done-btn').setAttribute('aria-pressed', 'false');
        if (day.querySelector('.log-btn').textContent === 'Logged') day.querySelector('.log-btn').textContent = 'Log';
        return;
      }
      if (!strip) {
        strip = document.createElement('p');
        strip.className = 'log-strip';
        day.querySelector('.badges').after(strip);
      }
      const bits = [STATUS_LABEL[entry.status] || entry.status];
      if (entry.km !== null && entry.km !== undefined) bits.push(entry.km + ' km');
      if (entry.minutes) bits.push(entry.minutes + ' min');
      if (entry.rpe) bits.push('RPE ' + entry.rpe);
      if (entry.felt) bits.push(entry.felt);
      if (entry.pain) bits.push('Pain' + (entry.painWhere ? ' · ' + entry.painWhere : ''));
      strip.textContent = bits.join(' · ');
      strip.classList.toggle('pain', !!entry.pain);
      const done = entry.status === 'done';
      day.classList.toggle('is-done', done);
      const btn = day.querySelector('.done-btn');
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      day.querySelector('.log-btn').textContent = 'Logged';
    });
    if (window.eabhaRefresh) window.eabhaRefresh();
    if (role === 'niall' && !document.getElementById('coach').hidden) renderCoach();
  }

  window.eabhaAfterRender = function () {
    if (ready && token) paint();
  };

  window.eabhaOnDone = function (date) {
    if (!ready) return false;
    if (!token) { openModal('signModal'); return true; }
    if (logs[date]) { openWorkout(date); return true; }
    saveEntry({ date, status: 'done', km: '', minutes: '', rpe: '', felt: '', pain: false, painWhere: '', painNote: '', note: '' });
    return true;
  };

  window.eabhaOnLog = function (date) {
    if (!ready) return false;
    if (!token) { openModal('signModal'); return true; }
    openWorkout(date);
    return true;
  };

  function setPressed(group, value) {
    document.querySelectorAll('[data-group="' + group + '"]').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.value === value ? 'true' : 'false');
    });
  }
  function pressed(group) {
    const btn = document.querySelector('[data-group="' + group + '"][aria-pressed="true"]');
    return btn ? btn.dataset.value : '';
  }

  function openWorkout(date) {
    editing = date;
    const day = document.querySelector('.day[data-date="' + date + '"]');
    const entry = logs[date] || {};
    document.getElementById('workoutTitle').textContent = day ? day.dataset.label : date;
    setPressed('status', entry.status || 'done');
    document.getElementById('logKm').value = entry.km ?? '';
    document.getElementById('logMin').value = entry.minutes ?? '';
    setPressed('rpe', entry.rpe ? String(entry.rpe) : '');
    setPressed('felt', entry.felt || '');
    const pain = !!entry.pain;
    document.getElementById('painToggle').setAttribute('aria-pressed', pain ? 'true' : 'false');
    document.getElementById('painExtra').hidden = !pain;
    setPressed('painWhere', entry.painWhere || '');
    document.getElementById('painNote').value = entry.painNote || '';
    document.getElementById('logNote').value = entry.note || '';
    document.getElementById('workoutError').textContent = '';
    document.getElementById('clearLog').hidden = !logs[date];
    openModal('workoutModal');
  }

  function formEntry() {
    return {
      date: editing,
      status: pressed('status') || 'done',
      km: document.getElementById('logKm').value,
      minutes: document.getElementById('logMin').value,
      rpe: pressed('rpe'),
      felt: pressed('felt'),
      pain: document.getElementById('painToggle').getAttribute('aria-pressed') === 'true',
      painWhere: pressed('painWhere'),
      painNote: document.getElementById('painNote').value,
      note: document.getElementById('logNote').value,
    };
  }

  async function saveEntry(entry) {
    if (saving) return;
    saving = true;
    const err = document.getElementById('workoutError');
    if (err) err.textContent = '';
    try {
      const data = await api('/api/logs', { method: 'PUT', body: JSON.stringify(entry) });
      logs[data.entry.date] = data.entry;
      closeModal('workoutModal');
      paint();
    } catch (e) {
      if (!document.getElementById('workoutModal').classList.contains('open')) openWorkout(entry.date);
      document.getElementById('workoutError').textContent = e.message;
    } finally {
      saving = false;
    }
  }

  let saving = false;

  function renderCoach() {
    const root = document.getElementById('coach');
    const weeks = [...document.querySelectorAll('.week')];
    const pain = [];
    weeks.forEach(week => {
      week.querySelectorAll('.day').forEach(day => {
        const entry = logs[day.dataset.date];
        if (entry && entry.pain) pain.push({ label: day.dataset.label, entry });
      });
    });
    let html = '<div class="coach-wrap"><h2>Coach view</h2>';
    html += '<p class="coach-meta">Planned sessions stay on the schedule. This is what was logged.</p>';
    if (pain.length) {
      html += '<div class="pain-banner"><h2>Pain flagged</h2>';
      pain.forEach(item => {
        const where = item.entry.painWhere ? ' · ' + item.entry.painWhere : '';
        html += '<p><strong>' + esc(item.label) + '</strong>' + esc(where);
        if (item.entry.painNote) html += ' — ' + esc(item.entry.painNote);
        html += '</p>';
      });
      html += '</div>';
    } else {
      html += '<div class="coach-card"><p>No pain flags.</p></div>';
    }
    weeks.forEach(week => {
      const days = [...week.querySelectorAll('.day')];
      let km = 0;
      let kmDays = 0;
      const counts = { done: 0, part: 0, skipped: 0, swapped: 0, none: 0 };
      const trend = [];
      days.forEach(day => {
        const entry = logs[day.dataset.date];
        if (!entry) { counts.none += 1; return; }
        counts[entry.status] = (counts[entry.status] || 0) + 1;
        if (typeof entry.km === 'number') { km += entry.km; kmDays += 1; }
        if (entry.rpe) trend.push('<span>' + esc(day.dataset.label.split(' ')[0]) + ' ' + entry.rpe + '</span>');
      });
      const kmLine = week.querySelector('.km-line').textContent;
      html += '<article class="coach-card">';
      html += '<h3>' + esc(week.querySelector('h2').textContent) + '</h3>';
      html += '<p class="phase">' + esc(week.querySelector('.phase').textContent) + '</p>';
      html += '<p>' + esc(kmLine) + '</p>';
      html += '<p><strong>Logged: ' + (kmDays ? (Math.round(km * 10) / 10) + ' km' : 'no km entered') + '</strong></p>';
      html += '<p class="coach-meta">' + counts.done + ' done · ' + counts.part + ' partly done · ' +
        counts.skipped + ' skipped · ' + counts.swapped + ' swapped · ' + counts.none + ' not logged</p>';
      if (trend.length) html += '<div class="rpe-trend">' + trend.join('') + '</div>';
      days.forEach(day => {
        const entry = logs[day.dataset.date];
        html += '<div class="coach-day"><div class="who">' + esc(day.dataset.label);
        html += ' <span class="coach-meta">' + esc(day.dataset.effort || '') + '</span>';
        if (entry && entry.pain) html += '<span class="tag-pain">Pain</span>';
        html += '</div>';
        if (!entry) {
          html += '<p class="coach-meta">Not logged</p>';
        } else {
          const bits = [STATUS_LABEL[entry.status] || entry.status];
          if (entry.km !== null && entry.km !== undefined) bits.push(entry.km + ' km');
          if (entry.minutes) bits.push(entry.minutes + ' min');
          if (entry.rpe) bits.push('RPE ' + entry.rpe);
          if (entry.felt) bits.push(entry.felt);
          html += '<p>' + esc(bits.join(' · ')) + '</p>';
          if (entry.note) html += '<p>' + esc(entry.note) + '</p>';
        }
        html += '</div>';
      });
      html += '</article>';
    });
    html += '</div>';
    root.innerHTML = html;
  }

  function showCoach() {
    document.getElementById('schedule').hidden = true;
    document.getElementById('guide').hidden = true;
    const coach = document.getElementById('coach');
    coach.hidden = false;
    renderCoach();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function hideCoach() {
    const coach = document.getElementById('coach');
    if (coach) coach.hidden = true;
  }

  function signedInUi() {
    const signBtn = document.getElementById('signBtn');
    signBtn.textContent = token ? 'Lock' : 'Sign in';
    let coachBtn = document.getElementById('coachBtn');
    if (role === 'niall') {
      if (!coachBtn) {
        coachBtn = document.createElement('button');
        coachBtn.id = 'coachBtn';
        coachBtn.type = 'button';
        coachBtn.className = 'guide-btn';
        coachBtn.textContent = 'Coach';
        document.querySelector('.sticky-actions').append(coachBtn);
        coachBtn.addEventListener('click', showCoach);
      }
    } else if (coachBtn) {
      coachBtn.remove();
      hideCoach();
    }
  }

  function install() {
    const coach = document.createElement('section');
    coach.id = 'coach';
    coach.hidden = true;
    document.getElementById('guide').after(coach);

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="signModal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="signTitle">
          <header><h2 id="signTitle">Sign in</h2><p class="sub">Eabha logs workouts. Niall opens the coach view.</p></header>
          <div class="body">
            <div class="sign-choices">
              <button type="button" class="choice" data-group="who" data-value="eabha" aria-pressed="true">Eabha</button>
              <button type="button" class="choice" data-group="who" data-value="niall" aria-pressed="false">Niall</button>
            </div>
            <div class="field">
              <label class="k" for="pinInput">Passcode</label>
              <input id="pinInput" type="password" inputmode="numeric" autocomplete="current-password">
            </div>
            <p class="form-error" id="signError"></p>
          </div>
          <footer>
            <button type="button" class="btn" id="signCancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="signGo">Unlock</button>
          </footer>
        </div>
      </div>
      <div class="modal-overlay" id="workoutModal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="workoutTitle">
          <header><h2 id="workoutTitle">Log</h2><p class="sub">A few seconds is enough. Add more if you want.</p></header>
          <div class="body">
            <div class="choice-row" id="statusRow">
              <button type="button" class="choice" data-group="status" data-value="done" aria-pressed="true">Done</button>
              <button type="button" class="choice" data-group="status" data-value="part" aria-pressed="false">Partly done</button>
              <button type="button" class="choice" data-group="status" data-value="skipped" aria-pressed="false">Skipped</button>
              <button type="button" class="choice" data-group="status" data-value="swapped" aria-pressed="false">Swapped</button>
            </div>
            <div class="field"><label class="k" for="logKm">Km</label><input id="logKm" type="number" inputmode="decimal" min="0" max="40" step="0.1"></div>
            <div class="field"><label class="k" for="logMin">Minutes</label><input id="logMin" type="number" inputmode="numeric" min="0" max="180" step="1"></div>
            <div class="field"><span class="k">Effort (RPE 1 to 10)</span><div class="rpe-row" id="rpeRow"></div></div>
            <div class="field"><span class="k">How she felt</span>
              <div class="choice-row">
                <button type="button" class="choice" data-group="felt" data-value="Fine">Fine</button>
                <button type="button" class="choice" data-group="felt" data-value="OK">OK</button>
                <button type="button" class="choice" data-group="felt" data-value="Tired">Tired</button>
                <button type="button" class="choice" data-group="felt" data-value="Heavy">Heavy</button>
              </div>
            </div>
            <div class="field">
              <button type="button" class="choice pain-on" id="painToggle" aria-pressed="false">Pain or a niggle</button>
              <div id="painExtra" hidden>
                <div class="choice-row" style="margin-top:8px">
                  <button type="button" class="choice" data-group="painWhere" data-value="calf">Calf</button>
                  <button type="button" class="choice" data-group="painWhere" data-value="back">Back</button>
                  <button type="button" class="choice" data-group="painWhere" data-value="other">Other</button>
                </div>
                <input id="painNote" type="text" maxlength="200" placeholder="Where it is, and how it feels" style="margin-top:8px">
              </div>
            </div>
            <div class="field"><label class="k" for="logNote">Note</label><input id="logNote" type="text" maxlength="500" placeholder="Anything else, including what you swapped in"></div>
            <p class="form-error" id="workoutError"></p>
          </div>
          <footer>
            <button type="button" class="btn" id="clearLog" hidden>Clear</button>
            <button type="button" class="btn" id="workoutCancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="workoutSave">Save</button>
          </footer>
        </div>
      </div>`);

    const rpeRow = document.getElementById('rpeRow');
    for (let n = 1; n <= 10; n += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rpe-btn';
      btn.dataset.group = 'rpe';
      btn.dataset.value = String(n);
      btn.textContent = String(n);
      btn.setAttribute('aria-pressed', 'false');
      rpeRow.append(btn);
    }

    const signBtn = document.createElement('button');
    signBtn.id = 'signBtn';
    signBtn.type = 'button';
    signBtn.textContent = 'Sign in';
    document.querySelector('.footer p:last-child').append(signBtn);

    document.body.addEventListener('click', event => {
      const choice = event.target.closest('[data-group]');
      if (!choice || choice.id === 'painToggle') return;
      const group = choice.dataset.group;
      if (group === 'rpe' || group === 'felt' || group === 'painWhere') {
        const on = choice.getAttribute('aria-pressed') === 'true';
        setPressed(group, on ? '' : choice.dataset.value);
        return;
      }
      setPressed(group, choice.dataset.value);
    });

    document.getElementById('painToggle').addEventListener('click', () => {
      const on = document.getElementById('painToggle').getAttribute('aria-pressed') !== 'true';
      document.getElementById('painToggle').setAttribute('aria-pressed', on ? 'true' : 'false');
      document.getElementById('painExtra').hidden = !on;
    });
    document.getElementById('signBtn').addEventListener('click', () => {
      if (token) { lock(); return; }
      document.getElementById('signError').textContent = '';
      openModal('signModal');
      document.getElementById('pinInput').focus();
    });
    document.getElementById('signCancel').addEventListener('click', () => closeModal('signModal'));
    document.getElementById('signGo').addEventListener('click', signIn);
    document.getElementById('pinInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') signIn();
    });
    document.getElementById('workoutCancel').addEventListener('click', () => closeModal('workoutModal'));
    document.getElementById('workoutSave').addEventListener('click', () => saveEntry(formEntry()));
    document.getElementById('clearLog').addEventListener('click', async () => {
      if (!confirm('Clear the log for this day?')) return;
      try {
        await api('/api/logs?date=' + encodeURIComponent(editing), { method: 'DELETE' });
        delete logs[editing];
        closeModal('workoutModal');
        paint();
      } catch (e) {
        document.getElementById('workoutError').textContent = e.message;
      }
    });
    document.getElementById('signModal').addEventListener('click', event => {
      if (event.target.id === 'signModal') closeModal('signModal');
    });
    document.getElementById('workoutModal').addEventListener('click', event => {
      if (event.target.id === 'workoutModal') closeModal('workoutModal');
    });
    document.addEventListener('click', event => {
      if (event.target.closest('#guideBtn, .chip, #todayBtn, #prevWeek, #nextWeek, #openGuide')) hideCoach();
    }, true);
  }

  function restoreLocalTicks() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('eabha-allireland-2026') || '{}'); } catch { saved = {}; }
    const done = saved.done || {};
    document.querySelectorAll('.day').forEach(day => {
      const on = !!done[day.dataset.date];
      day.classList.toggle('is-done', on);
      day.querySelector('.done-btn').setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function lock() {
    token = '';
    role = '';
    logs = {};
    sessionStorage.removeItem(TOKEN_KEY);
    hideCoach();
    document.querySelectorAll('.log-strip').forEach(el => el.remove());
    document.querySelectorAll('.log-btn').forEach(btn => { btn.textContent = 'Log'; });
    restoreLocalTicks();
    signedInUi();
    if (window.eabhaRefresh) window.eabhaRefresh();
  }

  async function signIn() {
    const who = pressed('who') || 'eabha';
    const pin = document.getElementById('pinInput').value;
    document.getElementById('signError').textContent = '';
    try {
      const data = await api('/api/session', { method: 'POST', body: JSON.stringify({ role: who, pin }) });
      token = data.token;
      role = data.role;
      sessionStorage.setItem(TOKEN_KEY, token);
      document.getElementById('pinInput').value = '';
      closeModal('signModal');
      logs = (await api('/api/logs')).logs || {};
      signedInUi();
      paint();
      if (role === 'niall') showCoach();
    } catch (e) {
      document.getElementById('signError').textContent = e.message;
    }
  }

  async function boot() {
    try {
      const saved = sessionStorage.getItem(TOKEN_KEY) || '';
      const res = await fetch('/api/session', { headers: saved ? { Authorization: 'Bearer ' + saved } : {} });
      if (!res.ok) return;
      const data = await res.json();
      if (data.logging !== true) return;
      ready = true;
      install();
      if (data.role) {
        token = saved;
        role = data.role;
        logs = (await api('/api/logs')).logs || {};
        signedInUi();
        paint();
      } else {
        signedInUi();
      }
    } catch {
      ready = false;
    }
  }

  boot();
})();
