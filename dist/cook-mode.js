/* Cooking mode: one step at a time, full screen and dark, readable from across the kitchen.
 *
 * Opens from a recipe ("Start cooking mode"). Uses the app's own helpers (find, scaledStep,
 * scaledIngredients, openDialog, markCooked, esc, icon) so quantities match everywhere else.
 * Arrow keys move between steps, the screen is kept awake where the browser allows it, and a
 * kitchen timer keeps running while you move between steps. Finishing hands over to the normal
 * "I cooked this" flow.
 */
(() => {
  'use strict';
  const dialog = document.getElementById('cook-mode');
  if (!dialog) return;

  let recipe = null, step = 0, wakeLock = null;
  const timer = { total: 0, left: 0, running: false, id: 0, endsAt: 0 };

  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const minutesIn = text => { const m = /(\d+)\s*(?:–\s*\d+\s*)?(?:minutes|min)\b/i.exec(text); return m ? Number(m[1]) : 0; };

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 660;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.32);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {}
    navigator.vibrate?.([200, 120, 200]);
  }

  function tick() {
    timer.left = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
    paintTimer();
    if (timer.left === 0) {
      stopTimer();
      chime();
      dialog.querySelector('.cm-live').textContent = 'Timer done.';
      dialog.querySelector('.cm-timer')?.classList.add('is-done');
    }
  }
  function startTimer(minutes) {
    clearInterval(timer.id);
    if (minutes) { timer.total = minutes * 60; timer.left = timer.total; }
    if (!timer.left) return;
    timer.endsAt = Date.now() + timer.left * 1000;
    timer.running = true;
    timer.id = setInterval(tick, 250);
    paintTimer();
  }
  function stopTimer() { clearInterval(timer.id); timer.running = false; paintTimer(); }
  function resetTimer() { clearInterval(timer.id); Object.assign(timer, { total: 0, left: 0, running: false }); paintTimer(); }

  function paintTimer() {
    const box = dialog.querySelector('.cm-timer');
    if (!box) return;
    box.classList.toggle('is-set', !!timer.total);
    box.classList.remove('is-done');
    box.querySelector('.cm-time').textContent = timer.total ? mmss(timer.left) : '';
    const toggle = box.querySelector('[data-cm="toggle"]');
    toggle.hidden = !timer.total;
    toggle.textContent = timer.running ? 'Pause' : 'Resume';
    box.querySelector('[data-cm="reset"]').hidden = !timer.total;
    const ring = box.querySelector('.cm-ring-fill');
    if (ring) ring.style.strokeDashoffset = String(timer.total ? 100 - (timer.left / timer.total) * 100 : 100);
  }

  function paint() {
    const steps = recipe.steps, last = step === steps.length - 1;
    const suggested = minutesIn(steps[step]);
    dialog.innerHTML = `
      <div class="cm-shell">
        <header class="cm-top">
          <div><span class="cm-kicker">COOKING · ${esc(recipe.name.toUpperCase())}</span><span class="cm-count">Step ${step + 1} of ${steps.length}</span></div>
          <button type="button" class="cm-close" data-cm="close" aria-label="Leave cooking mode">×</button>
        </header>
        <div class="cm-progress" aria-hidden="true">${steps.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'now' : ''}"></i>`).join('')}</div>
        <main class="cm-stage">
          <p class="cm-step" id="cm-step" tabindex="-1">${esc(scaledStep(steps[step]))}</p>
        </main>
        <section class="cm-tools">
          <div class="cm-timer" role="group" aria-label="Kitchen timer">
            <svg class="cm-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="cm-ring-fill" cx="18" cy="18" r="15.9" pathLength="100"/></svg>
            <span class="cm-time" aria-live="off"></span>
            <div class="cm-presets">${[...new Set([suggested, 5, 10, 15].filter(Boolean))].slice(0, 3).map(m => `<button type="button" data-cm="set" data-min="${m}">${m} min</button>`).join('')}</div>
            <button type="button" data-cm="toggle" hidden>Pause</button><button type="button" data-cm="reset" hidden>Clear</button>
          </div>
          <details class="cm-ingredients"><summary>Ingredients for ${people(state.servings)}</summary><ul>${scaledIngredients(recipe).map(i => `<li><span>${esc(i.name)}</span><span>${esc(i.amount)}</span></li>`).join('')}</ul></details>
        </section>
        <footer class="cm-nav">
          <button type="button" class="cm-back" data-cm="back" ${step === 0 ? 'disabled' : ''}>← Back</button>
          ${last ? `<button type="button" class="cm-next cm-finish" data-cm="finish">I cooked this ✓</button>` : `<button type="button" class="cm-next" data-cm="next">Next step →</button>`}
        </footer>
        <p class="cm-live sr-only" aria-live="polite"></p>
      </div>`;
    paintTimer();
    dialog.querySelector('.cm-live').textContent = `Step ${step + 1} of ${steps.length}. ${scaledStep(steps[step])}`;
  }

  function go(delta) {
    const next = step + delta;
    if (next < 0 || next >= recipe.steps.length) return;
    step = next; paint();
    dialog.querySelector('#cm-step').focus({ preventScroll: true });
  }

  async function lockScreen() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
  document.addEventListener('visibilitychange', () => { if (dialog.open && document.visibilityState === 'visible') lockScreen(); });

  function open(id) {
    const r = find(id);
    if (!r) return;
    recipe = r; step = 0; resetTimer();
    const recipeDialog = document.getElementById('recipe-dialog');
    if (recipeDialog.open) recipeDialog.close();
    paint();
    openDialog(dialog);
    document.body.classList.add('is-cooking');
    lockScreen();
    dialog.querySelector('#cm-step').focus({ preventScroll: true });
  }

  dialog.addEventListener('close', () => {
    document.body.classList.remove('is-cooking');
    clearInterval(timer.id); timer.running = false;
    wakeLock?.release?.().catch(() => {}); wakeLock = null;
  });
  dialog.addEventListener('click', e => {
    const b = e.target.closest('[data-cm]');
    if (!b) return;
    const a = b.dataset.cm;
    if (a === 'close') dialog.close();
    else if (a === 'next') go(1);
    else if (a === 'back') go(-1);
    else if (a === 'set') startTimer(Number(b.dataset.min));
    else if (a === 'toggle') timer.running ? stopTimer() : startTimer();
    else if (a === 'reset') resetTimer();
    else if (a === 'finish') { const id = recipe.id; dialog.close(); markCooked(id); }
  });
  dialog.addEventListener('keydown', e => {
    if (e.target.closest('summary, button') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  window.CookMode = { open };
})();
