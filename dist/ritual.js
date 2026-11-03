/* The kitchen ritual: three questions on a first visit, then a plan built from the answers.
 *
 * Who you cook for, how much time your evenings give you, and what you want to eat this season.
 * Nothing leaves the device; the answers are saved in the app's own state (name, servings, time,
 * appetite, onboarded). "Skip" goes straight to the kitchen with the default plan. Add ?tour=0 to
 * the URL to skip it (useful for screenshots and QA).
 */
(() => {
  'use strict';
  const dialog = document.getElementById('ritual-dialog');
  if (!dialog) return;

  const APPETITES = [
    { id: 'light', label: 'Light and fresh', hint: 'More raw plates and midday meals' },
    { id: 'warm', label: 'Warm and grounding', hint: 'Cooked bowls and early dinners' },
    { id: 'steady', label: 'Simple and steady', hint: 'Familiar one-pot meals, quick to make' },
  ];
  const HOUSEHOLD = [[1, 'Just me'], [2, 'Two of us'], [3, 'Three'], [4, 'Four'], [6, 'Five or more']];
  const TIMES = [[20, '20 minutes'], [30, '30 minutes'], [45, '45 minutes']];
  const answers = { name: '', servings: 2, time: 30, appetite: 'warm' };
  let page = 0;

  function score(r) {
    let s = inSeason(r) ? 3 : 0;
    if (answers.appetite === 'light') s += (r.raw ? 2 : 0) + (r.moment === 'midday' ? 1 : 0);
    if (answers.appetite === 'warm') s += (r.raw ? 0 : 2) + (r.moment === 'sunset' ? 1 : 0);
    if (answers.appetite === 'steady') s += (/khichdi/.test(r.id) ? 3 : 0) + (r.time <= 25 ? 1 : 0);
    return s;
  }
  // Best three by score that fit the time, with at most two raw plates.
  function buildPlan() {
    const pool = recipes.filter(r => r.time <= answers.time && (!state.nutFree || !r.nuts))
      .sort((a, b) => score(b) - score(a) || a.time - b.time);
    // Variety first: one of each kind (soup, khichdi, raw plate, other mains), then fill by score.
    const kind = r => /soup|spinach-corn/.test(r.id) ? 'soup' : /khichdi/.test(r.id) ? 'khichdi' : r.raw ? 'raw' : 'main';
    const plan = [];
    for (const r of pool) if (plan.length < 3 && !plan.some(id => kind(find(id)) === kind(r))) plan.push(r.id);
    for (const r of pool) {
      if (plan.length === 3) break;
      if (plan.includes(r.id) || (r.raw && plan.filter(id => find(id).raw).length >= 2)) continue;
      plan.push(r.id);
    }
    while (plan.length < 3) plan.push(null);
    return plan;
  }

  const chip = (group, value, label, current, hint = '') =>
    `<button type="button" class="ritual-chip" data-group="${group}" data-value="${value}" aria-pressed="${String(value) === String(current)}">${label}${hint ? `<small>${hint}</small>` : ''}</button>`;

  function paint() {
    const s = ritu();
    const steps = ['', 'one', 'two', 'three'];
    const dots = page > 0 && page < 4 ? `<div class="ritual-dots" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= page ? 'on' : ''}"></i>`).join('')}</div>` : '';
    let body = '';
    if (page === 0) body = `
      <span class="eyebrow">${s.name.toUpperCase()} · ${s.en.toUpperCase()}</span>
      <h2 id="ritual-title">Let’s set up<br>your kitchen.</h2>
      <p class="ritual-lede">Three questions, about thirty seconds. Your answers stay on this device.</p>
      <div class="ritual-actions"><button type="button" class="button primary" data-r="next">Begin ${icon('arrow')}</button><button type="button" class="ritual-skip" data-r="skip">Skip, show me the kitchen</button></div>`;
    if (page === 1) body = `
      <span class="eyebrow">QUESTION ${steps[1].toUpperCase()} OF THREE</span>
      <h2 id="ritual-title">Who are you<br>cooking for?</h2>
      <label class="ritual-field"><span>Your first name <em>(optional)</em></span><input id="ritual-name" autocomplete="given-name" maxlength="40" value="${esc(answers.name)}" placeholder="So we can say hello"></label>
      <div class="ritual-chips" role="group" aria-label="Household size">${HOUSEHOLD.map(([v, l]) => chip('servings', v, l, answers.servings)).join('')}</div>`;
    if (page === 2) body = `
      <span class="eyebrow">QUESTION ${steps[2].toUpperCase()} OF THREE</span>
      <h2 id="ritual-title">How much time does<br>an evening give you?</h2>
      <p class="ritual-lede">Active cooking only. Soaking happens the night before and isn’t counted.</p>
      <div class="ritual-chips" role="group" aria-label="Time per meal">${TIMES.map(([v, l]) => chip('time', v, l, answers.time)).join('')}</div>`;
    if (page === 3) body = `
      <span class="eyebrow">QUESTION ${steps[3].toUpperCase()} OF THREE</span>
      <h2 id="ritual-title">What do you want<br>to eat this ${s.en.split(' ').pop()}?</h2>
      <div class="ritual-chips ritual-chips--stack" role="group" aria-label="Appetite">${APPETITES.map(a => chip('appetite', a.id, a.label, answers.appetite, a.hint)).join('')}</div>`;
    if (page === 4) {
      const plan = buildPlan().filter(Boolean).map(find);
      body = `
      <span class="eyebrow">YOUR WEEK · ${s.name.toUpperCase()}</span>
      <h2 id="ritual-title">${answers.name ? `Your kitchen is ready,<br>${esc(answers.name)}.` : 'Your kitchen<br>is ready.'}</h2>
      <p class="ritual-lede">${esc(s.line)}</p>
      <ol class="ritual-plan">${plan.map((r, i) => `<li><img src="assets/${r.image}.jpg" alt=""><span><small>DAY 0${i + 1} · ${MOMENT[r.moment].short}</small><strong>${esc(r.name)}</strong></span></li>`).join('')}</ol>
      <div class="ritual-actions"><button type="button" class="button primary" data-r="finish">Open my week ${icon('arrow')}</button></div>`;
    }
    const nav = page > 0 && page < 4 ? `<div class="ritual-actions"><button type="button" class="ritual-skip" data-r="back">Back</button><button type="button" class="button primary" data-r="next">${page === 3 ? 'Build my week' : 'Next'} ${icon('arrow')}</button></div>` : '';
    dialog.innerHTML = `<button type="button" class="dialog-close" data-r="skip" aria-label="Skip setup">×</button><div class="ritual-body">${dots}${body}${nav}</div>`;
    const focusTarget = dialog.querySelector('#ritual-name') || dialog.querySelector('[data-r="next"],[data-r="finish"]');
    focusTarget?.focus({ preventScroll: true });
  }

  function finish(skipped) {
    if (!skipped) {
      Object.assign(state, { name: answers.name.trim().slice(0, 40), servings: answers.servings, time: answers.time, appetite: answers.appetite, plan: buildPlan(), planDone: [], bought: [], soaked: [] });
    }
    state.onboarded = true;
    dialog.close();
    if (view !== 'plan') go('plan'); else render();
    document.dispatchEvent(new CustomEvent('ritual:done'));
    if (!skipped) toast(state.name ? `Welcome in, ${state.name}.` : 'Your week is ready.');
  }

  function open() {
    Object.assign(answers, { name: state.name || '', servings: state.servings, time: state.time, appetite: state.appetite || 'warm' });
    page = 0; paint();
    if (!dialog.open) openDialog(dialog);
  }

  dialog.addEventListener('click', e => {
    const c = e.target.closest('.ritual-chip');
    if (c) {
      const v = c.dataset.group === 'appetite' ? c.dataset.value : Number(c.dataset.value);
      answers[c.dataset.group] = v;
      dialog.querySelectorAll(`.ritual-chip[data-group="${c.dataset.group}"]`).forEach(b => b.setAttribute('aria-pressed', String(b === c)));
      return;
    }
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const nameInput = dialog.querySelector('#ritual-name');
    if (nameInput) answers.name = nameInput.value;
    if (b.dataset.r === 'next') { page++; paint(); }
    if (b.dataset.r === 'back') { page--; paint(); }
    if (b.dataset.r === 'skip') finish(true);
    if (b.dataset.r === 'finish') finish(false);
  });
  dialog.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ritual-name') { e.preventDefault(); answers.name = e.target.value; page++; paint(); } });
  // Escape or a click outside counts as skipping, so the question never comes back uninvited.
  dialog.addEventListener('close', () => { if (!state.onboarded) { state.onboarded = true; save(); } });

  window.Ritual = { open };
  const skipParam = new URLSearchParams(location.search).get('tour') === '0';
  if (skipParam && !state.onboarded) { state.onboarded = true; save(); }
  if (!state.onboarded) setTimeout(open, 350);
})();
