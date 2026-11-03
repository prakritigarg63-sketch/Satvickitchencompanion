/* Kitchen Calm — a calming sound player for Satvic Kitchen Companion, introduced by Sprout.
 *
 * Audio is off until the cook asks for it. Every track is a real, licensed recording bundled in
 * assets/sounds/ (sources and licences on credits.html). Playback runs through the Web Audio API
 * so volume and fades also work on iPhone, where <audio>.volume is read-only.
 *
 * Public API (used by Sprout's chat): window.KitchenCalm
 *   open() close() minimise() play(id?) → Promise<{ok, reason?, track}> pause() stop() next() prev()
 *   setVolume(0–1) changeVolume(±) setMuted(bool) setRepeat(bool) retry() cue('chime'|'bell')
 *   duck(bool) — lower the music while Sprout listens or speaks (not saved)
 *   prime()  — call synchronously inside a click/keypress so the browser allows sound
 *   state()  tracks
 */
(() => {
  'use strict';
  const KEY = 'satvic-sounds-v1';
  // Just the calming flute for now. More tracks can be added here; previous/next appear automatically.
  const TRACKS = [
    { id: 'flute-stillness', name: 'Flute & Stillness', desc: 'Soft bansuri flute over a quiet river and birds.', src: 'assets/sounds/flute-stillness.m4a', level: 0.63 },
  ];
  const CUES = { chime: 'assets/sounds/chime.m4a', bell: 'assets/sounds/bell.m4a' };
  const FADE_IN = 1.4, FADE_OUT = 0.6;
  const compact = matchMedia('(max-width: 700px)');
  const find = id => TRACKS.find(t => t.id === id);
  const playable = () => TRACKS.filter(t => t.src);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    note: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    play: '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    prev: '<path d="M7 5v14M19 6 10 12l9 6V6Z" fill="currentColor"/>',
    next: '<path d="M17 5v14M5 6l9 6-9 6V6Z" fill="currentColor"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    muted: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m17 9 5 6m0-6-5 6"/>',
    repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    min: '<path d="M5 12h14"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', up: '<path d="m6 15 6-6 6 6"/>',
  };

  /* ---------- saved settings (separate from the app's and Sprout's keys) ---------- */
  const defaults = { track: 'flute-stillness', volume: 0.6, muted: false, repeat: true, cues: false, cueVolume: 0.6, invite: 'new' };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const prefs = { ...defaults, ...saved };
  if (!find(prefs.track)?.src) prefs.track = defaults.track;
  prefs.volume = Math.min(1, Math.max(0, Number(prefs.volume) || 0));
  prefs.cueVolume = Math.min(1, Math.max(0, Number(prefs.cueVolume) || 0));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

  /* ---------- audio engine ---------- */
  let ctx = null, master = null;
  const nodes = {};                       // id → { el, gain }
  let current = null;                     // id of the loaded background track (playing or paused)
  let status = 'idle';                    // idle | loading | playing | paused | blocked | error
  let token = 0;                          // invalidates stale play() calls when the cook switches quickly

  function prime() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.connect(ctx.destination);
        applyVolume(true);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { ctx = null; }
  }
  const usingGraph = () => ctx && master;
  // Sprout's voice lowers the music while it listens or speaks. Not saved: prefs.volume and the slider
  // never change, so the previous volume comes back exactly.
  let duckLevel = 1;
  function duck(on) { const next = on ? 0.2 : 1; if (next === duckLevel) return; duckLevel = next; applyVolume(false, on ? 0.25 : 0.6); }
  function applyVolume(instant, tau = 0.08) {
    const v = (prefs.muted ? 0 : prefs.volume) * duckLevel;
    if (usingGraph()) master.gain.setTargetAtTime(v, ctx.currentTime, instant ? 0.001 : tau);
    else Object.entries(nodes).forEach(([id, n]) => { n.el.volume = Math.min(1, v * (find(id).level ?? 1) * (n.fade ?? 1)); });
  }
  function node(id) {
    if (nodes[id]) return nodes[id];
    const t = find(id), el = new Audio();
    el.preload = 'auto';
    el.src = t.src;
    el.loop = prefs.repeat;
    const n = { el, fade: 0 };
    if (usingGraph()) {
      try { const s = ctx.createMediaElementSource(el); n.gain = ctx.createGain(); n.gain.gain.value = 0; s.connect(n.gain).connect(master); }
      catch { n.gain = null; }
    }
    if (!n.gain) el.volume = 0;
    el.addEventListener('playing', () => { if (current === id && status !== 'paused') setStatus('playing'); });
    el.addEventListener('waiting', () => { if (current === id && status === 'playing') setStatus('loading'); });
    el.addEventListener('error', () => { if (current === id) setStatus('error'); });
    el.addEventListener('ended', () => {
      if (current !== id || prefs.repeat) return;
      if (playable().length > 1) step(1, true); else { stop(); }
    });
    return (nodes[id] = n);
  }
  function fade(id, to, secs) {
    const n = nodes[id]; if (!n) return Promise.resolve();
    const target = to * (find(id).level ?? 1);
    if (n.gain) {
      const g = n.gain.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(target, now + secs);
      return new Promise(r => setTimeout(r, secs * 1000));
    }
    // fallback without Web Audio: step the element volume
    const from = n.fade ?? 0, t0 = performance.now();
    return new Promise(r => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
        n.fade = from + (to - from) * k; applyVolume(true);
        k < 1 ? requestAnimationFrame(tick) : r();
      };
      tick();
    });
  }
  async function halt(id, { reset = false } = {}) {
    const n = nodes[id]; if (!n || n.el.paused) { if (n && reset) n.el.currentTime = 0; return; }
    const ticket = n.ticket = (n.ticket || 0) + 1;
    await fade(id, 0, FADE_OUT);
    // A newer play() of this same track cancels the fade-out: never pause the track that is playing now.
    if (n.ticket !== ticket || (current === id && isActive())) return;
    n.el.pause();
    if (reset) n.el.currentTime = 0;
  }
  // Only one background track at a time: anything else that is still sounding is faded and paused.
  function haltOthers(keep) { Object.keys(nodes).forEach(id => { if (id !== keep) halt(id, { reset: true }); }); }

  function waitUntilPlaying(el) {
    if (!el.paused && el.readyState >= 3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (fn, v) => { el.removeEventListener('playing', ok); el.removeEventListener('error', bad); clearTimeout(timer); fn(v); };
      const ok = () => done(resolve), bad = () => done(reject, new Error('load'));
      const timer = setTimeout(() => done(reject, new Error('timeout')), 12000);
      el.addEventListener('playing', ok); el.addEventListener('error', bad);
    });
  }

  async function play(id = prefs.track, { quiet = false } = {}) {
    const t = find(id);
    if (!t) return { ok: false, reason: 'unknown' };
    if (!t.src) return { ok: false, reason: 'unavailable', track: t };
    prime();
    const my = ++token;
    if (current && current !== id) halt(current, { reset: true });
    haltOthers(id);
    current = id; prefs.track = id; save();
    setStatus('loading');
    const n = node(id);
    n.ticket = (n.ticket || 0) + 1;          // cancels any fade-out still running on this track
    n.el.loop = prefs.repeat;
    try {
      if (ctx && ctx.state !== 'running') await ctx.resume();
      await n.el.play();
      if (ctx && ctx.state !== 'running') throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
      await waitUntilPlaying(n.el);
    } catch (e) {
      if (my !== token) return { ok: false, reason: 'superseded', track: t };
      n.el.pause();
      setStatus(e.name === 'NotAllowedError' ? 'blocked' : 'error');
      return { ok: false, reason: status, track: t };
    }
    if (my !== token) return { ok: false, reason: 'superseded', track: t };
    fade(id, 1, FADE_IN);
    setStatus('playing');
    if (!quiet) emit('play', t);
    return { ok: true, track: t };
  }
  async function pause({ quiet = false } = {}) {
    if (!current || !['playing', 'loading'].includes(status)) return false;
    token++;
    setStatus('paused');
    await halt(current);
    if (!quiet) emit('pause', find(current));
    return true;
  }
  async function stop() {
    token++;
    const id = current;
    current = null;
    setStatus('idle');
    if (mode === 'mini') mode = 'closed';
    render();
    if (id) await halt(id, { reset: true });
    haltOthers(null);
    emit('stop');
  }
  const isActive = () => ['playing', 'loading'].includes(status);
  async function step(dir, auto = false) {
    const list = playable(), i = list.findIndex(t => t.id === (current || prefs.track));
    if (list.length < 2) return { ok: false, reason: 'only-one', track: list[0] };
    const nextT = list[(i + dir + list.length) % list.length];
    if (isActive() || auto) return play(nextT.id);
    if (current) await halt(current, { reset: true });
    current = null; prefs.track = nextT.id; save(); setStatus('idle');
    return { ok: true, track: nextT, selectedOnly: true };
  }
  function setVolume(v) { prefs.volume = Math.min(1, Math.max(0, v)); if (prefs.volume > 0) prefs.muted = false; save(); applyVolume(); render(); return prefs.volume; }
  function setMuted(m) { prefs.muted = !!m; save(); applyVolume(); render(); }
  function setRepeat(r) { prefs.repeat = !!r; Object.values(nodes).forEach(n => { n.el.loop = prefs.repeat; }); save(); render(); }
  async function retry() {
    const id = current || prefs.track;
    if (nodes[id]) { nodes[id].el.load(); }
    return play(id);
  }
  function cue(name) {
    if (!prefs.cues || !CUES[name]) return;
    prime();
    const el = new Audio(CUES[name]);
    if (usingGraph() && ctx.state === 'running') {
      try { const s = ctx.createMediaElementSource(el), g = ctx.createGain(); g.gain.value = prefs.cueVolume; s.connect(g).connect(ctx.destination); }
      catch { el.volume = prefs.cueVolume; }
    } else el.volume = prefs.cueVolume;
    el.play().catch(() => {});
  }

  /* ---------- Sprout reactions ---------- */
  const sprout = () => window.Sprout;
  function emit(kind, t) {
    document.dispatchEvent(new CustomEvent(`kitchen-calm:${kind}`, { detail: { track: t?.id } }));
    const S = sprout(); if (!S) return;
    const line = kind === 'play' ? 'A little calm for your kitchen. 🌿' : kind === 'pause' ? 'Paused. Ready whenever you are.' : null;
    if (kind === 'play') S.react?.('happy', 2600);
    if (!line) return;
    // An open invitation card already speaks for Sprout; in a recipe Sprout is behind the card.
    if ([...document.querySelectorAll('.kc-invite[data-state=status]')].some(b => b.offsetParent)) return;   // a card on screen
    const spoke = !inDialog() && !(compact.matches && mode === 'open') && !S.isChatOpen?.()
      && S.say?.(`<p>${line}</p>`, { autoHide: 4500, label: 'Sprout', avoidControls: true });
    if (!spoke) flash(line);
  }

  /* ---------- UI ---------- */
  let mode = 'closed';                    // closed | open | mini
  let opener = null;
  const root = document.createElement('div');
  root.id = 'kitchen-calm';
  root.innerHTML = `
    <section class="kc-panel" id="kc-panel" role="dialog" aria-modal="false" aria-labelledby="kc-title" hidden>
      <header class="kc-head">
        <div><h2 id="kc-title">Kitchen Calm</h2><p>Gentle sounds while you cook</p></div>
        <button type="button" class="kc-icon" data-kc="minimise" aria-label="Minimise player">${svg(I.min)}</button>
        <button type="button" class="kc-icon" data-kc="close" aria-label="Close player">${svg(I.close)}</button>
      </header>
      <div class="kc-now">
        <div class="kc-now-text"><span class="kc-eq" aria-hidden="true"><i></i><i></i><i></i></span><div><strong id="kc-now-name"></strong><span id="kc-status"></span></div></div>
        <div class="kc-transport">
          <button type="button" class="kc-icon" data-kc="prev" aria-label="Previous track">${svg(I.prev)}</button>
          <button type="button" class="kc-play" data-kc="toggle"></button>
          <button type="button" class="kc-icon" data-kc="next" aria-label="Next track">${svg(I.next)}</button>
          <button type="button" class="kc-icon" data-kc="stop" aria-label="Stop sounds">${svg(I.stop)}</button>
        </div>
        <div class="kc-alert" id="kc-alert" hidden></div>
      </div>
      <div class="kc-row">
        <button type="button" class="kc-icon" data-kc="mute" aria-pressed="false"></button>
        <label class="sr-only" for="kc-volume">Background volume</label>
        <input id="kc-volume" type="range" min="0" max="100" step="5">
        <button type="button" class="kc-chip" data-kc="repeat" aria-pressed="false">${svg(I.repeat)}<span>Repeat</span></button>
      </div>
      <ul class="kc-list" aria-label="Tracks"></ul>
      <div class="kc-cues">
        <div class="kc-cues-head">
          <span id="kc-cues-label"><strong>Interaction sounds</strong><small>A soft chime when Sprout greets you, a bell when a meal is cooked.</small></span>
          <button type="button" class="kc-switch" role="switch" data-kc="cues" aria-labelledby="kc-cues-label" aria-checked="false"><span></span></button>
        </div>
        <label class="sr-only" for="kc-cue-volume">Interaction sound volume</label>
        <input id="kc-cue-volume" type="range" min="0" max="100" step="5">
      </div>
      <a class="kc-credits" href="credits.html#sounds">Sound sources &amp; licences</a>
    </section>
    <div class="kc-mini" role="region" aria-label="Kitchen Calm player" hidden>
      <button type="button" class="kc-mini-play" data-kc="toggle"></button>
      <button type="button" class="kc-mini-name" data-kc="open" aria-label="Open Kitchen Calm player"><strong></strong><small></small></button>
      <button type="button" class="kc-icon" data-kc="stop" aria-label="Stop sounds">${svg(I.close)}</button>
    </div>
    <div class="sr-only" role="status" aria-live="polite" id="kc-live"></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const panel = $('#kc-panel'), mini = $('.kc-mini'), live = $('#kc-live');

  // Sounds button in the nav pill, always available.
  // A little white-eye at the top right of the nav: it hovers while idle and sings (notes drift
  // from its beak) while the flute plays.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sounds-button sounds-bird';
  btn.setAttribute('aria-label', 'Kitchen Calm sounds');
  btn.setAttribute('aria-controls', 'kc-panel');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="bird-fly" aria-hidden="true"><img src="assets/bird/white-eye.png" alt="" width="46" height="33" draggable="false"></span><span class="bird-notes" aria-hidden="true"><i>♪</i><i>♫</i><i>♪</i></span>`;
  // When the Krishna bhajan player (bhajans.js) claims the bird, it manages the bird's label and singing.
  const ownsBird = () => btn.dataset.owner !== 'bhajans';
  const tools = document.querySelector('.header-tools');
  tools?.insertBefore(btn, document.getElementById('mobile-menu'));      // last on desktop; just before the menu on phones

  // Sprout's line shown in the player itself when a floating bubble would cover the page's controls.
  let flashText = '', flashTimer;
  function flash(text) { flashText = text; clearTimeout(flashTimer); render(); flashTimer = setTimeout(() => { flashText = ''; render(); }, 4500); }
  const statusText = () => flashText || ({ idle: current ? 'Ready' : 'Ready when you are', loading: 'Loading…', playing: 'Playing', paused: 'Paused', blocked: 'Your browser needs a tap to play sound', error: 'Couldn’t load this sound' }[status]);
  let lastAnnounced = '';
  function setStatus(s) {
    status = s; render();
    const t = find(current || prefs.track);
    const msg = s === 'playing' ? `Playing ${t.name}` : s === 'paused' ? `Paused ${t.name}` : s === 'error' ? `Couldn’t load ${t.name}. Retry is available.` : s === 'blocked' ? 'Tap to play is needed to start sound.' : '';
    if (msg && msg !== lastAnnounced) { lastAnnounced = msg; live.textContent = msg; }
  }

  function render() {
    const t = find(current || prefs.track), active = isActive();
    const focusTrack = document.activeElement?.dataset?.track;
    root.classList.toggle('is-playing', status === 'playing');
    if (ownsBird()) {
      btn.classList.toggle('is-playing', status === 'playing');
      btn.setAttribute('aria-label', status === 'playing' ? `Kitchen Calm sounds, playing ${t.name}` : 'Kitchen Calm sounds');
      btn.setAttribute('aria-expanded', String(mode === 'open'));
    }
    $('#kc-now-name').textContent = t.name;
    $('#kc-status').textContent = statusText();
    for (const b of root.querySelectorAll('[data-kc="toggle"]')) {
      b.innerHTML = svg(active ? I.pause : I.play);
      b.setAttribute('aria-label', `${active ? 'Pause' : 'Play'} ${t.name}`);
    }
    const alert = $('#kc-alert');
    alert.hidden = !['blocked', 'error'].includes(status);
    alert.innerHTML = status === 'blocked' ? `<span>Sound needs one tap to start.</span><button type="button" class="button primary" data-kc="tap">Tap to play</button>`
      : status === 'error' ? `<span>Couldn’t load ${esc(t.name)}.</span><button type="button" class="button outline" data-kc="retry">Retry</button>` : '';
    const mute = $('[data-kc="mute"]');
    mute.innerHTML = svg(prefs.muted || prefs.volume === 0 ? I.muted : I.vol);
    mute.setAttribute('aria-pressed', String(prefs.muted));
    mute.setAttribute('aria-label', prefs.muted ? 'Unmute background sound' : 'Mute background sound');
    const vol = $('#kc-volume');
    vol.value = Math.round(prefs.volume * 100);
    vol.setAttribute('aria-valuetext', `${Math.round(prefs.volume * 100)}%${prefs.muted ? ', muted' : ''}`);
    $('[data-kc="repeat"]').setAttribute('aria-pressed', String(prefs.repeat));
    $('[data-kc="repeat"]').setAttribute('aria-label', 'Repeat current track');
    const cues = $('[data-kc="cues"]');
    cues.setAttribute('aria-checked', String(prefs.cues));
    const cv = $('#kc-cue-volume');
    cv.value = Math.round(prefs.cueVolume * 100); cv.disabled = !prefs.cues;
    cv.setAttribute('aria-valuetext', `${Math.round(prefs.cueVolume * 100)}%`);
    const many = playable().length > 1;
    root.querySelectorAll('[data-kc="prev"],[data-kc="next"]').forEach(b => { b.hidden = !many; });
    $('.kc-list').innerHTML = TRACKS.map(x => {
      const sel = x.id === t.id, playing = sel && status === 'playing';
      const state = !x.src ? x.note : playing ? 'Playing' : sel && status === 'paused' ? 'Paused' : sel ? 'Selected' : '';
      return `<li><button type="button" class="kc-track${sel ? ' is-selected' : ''}${playing ? ' is-playing' : ''}" data-track="${x.id}" aria-pressed="${sel}"${x.src ? '' : ' disabled aria-disabled="true"'}>
        <span class="kc-track-text"><strong>${esc(x.name)}</strong><small>${esc(x.desc)}</small></span>
        ${state ? `<span class="kc-badge">${esc(state)}</span>` : ''}</button></li>`;
    }).join('');
    // panel / compact player visibility
    panel.hidden = mode !== 'open';
    const showMini = mode === 'mini' || (mode === 'closed' && !!current);
    mini.hidden = !showMini;
    mini.querySelector('strong').textContent = t.name;
    mini.querySelector('small').textContent = statusText();
    document.body.classList.toggle('kc-mini-shown', showMini);
    if (focusTrack) root.querySelector(`[data-track="${focusTrack}"]`)?.focus({ preventScroll: true });
    updateInvites();
  }

  // When a modal dialog (the recipe) is open, the player lives inside it so it stays usable.
  const inDialog = () => !!document.querySelector('dialog[open]');
  function rehome() {
    const host = document.querySelector('dialog[open]') || document.body;
    if (root.parentElement !== host) {
      const focused = root.contains(document.activeElement) ? document.activeElement : null;
      host.appendChild(root);
      focused?.focus({ preventScroll: true });
    }
  }
  new MutationObserver(rehome).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

  function open(from) {
    opener = from || document.activeElement;
    mode = 'open'; rehome(); render();
    if (compact.matches && document.querySelector('.sprout.is-chatting')) sprout()?.minimise?.();
    (root.querySelector('.kc-track.is-selected') || $('[data-kc="toggle"]')).focus({ preventScroll: true });
  }
  function close() {
    mode = 'closed'; render();
    (opener && document.contains(opener) && opener.offsetParent ? opener : btn).focus({ preventScroll: true });
  }
  function minimise() {
    mode = 'mini'; render();
    mini.querySelector('.kc-mini-name').focus({ preventScroll: true });
  }

  root.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el) return;
    prime();                               // every control here is a direct user action
    const a = el.dataset.kc;
    if (el.dataset.track) { play(el.dataset.track); return; }
    if (a === 'toggle') { isActive() ? pause() : play(current || prefs.track); return; }
    if (a === 'tap' || a === 'retry') { a === 'retry' ? retry() : play(current || prefs.track); return; }
    if (a === 'prev') return step(-1);
    if (a === 'next') return step(1);
    if (a === 'stop') return stop();
    if (a === 'mute') return setMuted(!prefs.muted);
    if (a === 'repeat') return setRepeat(!prefs.repeat);
    if (a === 'cues') { prefs.cues = !prefs.cues; save(); render(); if (prefs.cues) cue('chime'); return; }
    if (a === 'open') return open();
    if (a === 'close') return close();
    if (a === 'minimise') return minimise();
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'kc-volume') setVolume(e.target.value / 100);
    if (e.target.id === 'kc-cue-volume') { prefs.cueVolume = e.target.value / 100; save(); render(); }
  });
  root.addEventListener('change', e => { if (e.target.id === 'kc-cue-volume') cue('chime'); });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden && panel.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); }
  });
  btn.addEventListener('click', () => { if (!ownsBird()) return; prime(); mode === 'open' ? close() : open(btn); });
  // On phones the player and Sprout's chat share the bottom of the screen: opening one tucks the other away.
  document.addEventListener('sprout:open', () => { if (compact.matches && mode === 'open') { mode = current ? 'mini' : 'closed'; render(); } });

  /* ---------- Sprout's invitation ---------- */
  const sproutHidden = () => { try { return !!JSON.parse(localStorage.getItem('satvic-sprout-v1'))?.hidden; } catch { return false; } };
  const inviteText = 'Shall I play something calming while you cook? 🌿';
  const choices = `<div class="sprout-bubble-actions kc-invite-actions">
      <button type="button" class="button primary" data-invite="play">Yes, play</button>
      <button type="button" class="button outline" data-invite="choose">Choose a sound</button>
      <button type="button" class="button outline" data-invite="later">Not now</button></div>`;
  const miniSprout = `<span class="kc-invite-sprout" aria-hidden="true"><span class="sprout-art"><span class="sprout-body">
      <img class="sprout-layer-arm" src="assets/sprout/arm.png" alt=""><img class="sprout-layer-body" src="assets/sprout/body.png" alt="">
      <img class="sprout-layer-leaves" src="assets/sprout/leaves.png" alt=""><span class="sprout-eyes"><img class="sprout-layer-eye-left" src="assets/sprout/eye-left.png" alt=""><img class="sprout-layer-eye-right" src="assets/sprout/eye-right.png" alt=""></span></span></span></span>`;

  function respond(choice, from) {
    prime();
    prefs.invite = choice === 'later' ? 'dismissed' : 'accepted'; save();
    if (choice === 'play') return play(prefs.track);
    if (choice === 'choose') return open(from);
  }

  // Cooking session: the recipe card is a modal over Sprout, so the invitation sits inline in the
  // card (pushing content down, never covering steps) with a small Sprout waving.
  function inviteInRecipe() {
    const content = document.querySelector('#recipe-dialog[open] .recipe-detail-content');
    if (!content || content.querySelector('.kc-invite')) return;
    const box = document.createElement('div');
    box.className = 'kc-invite';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Sprout offers calming sounds');
    const anchor = content.querySelector('.detail-tags') || content.querySelector('h2');
    anchor.after(box);
    box.dataset.state = prefs.invite === 'new' ? 'ask' : 'status';
    renderInvite(box);
    if (box.dataset.state === 'ask') {
      prefs.invite = 'shown'; save();
      requestAnimationFrame(() => box.classList.add('is-waving'));
      setTimeout(() => box.classList.remove('is-waving'), 1800);
      cue('chime');
    }
  }
  function renderInvite(box) {
    const t = find(current || prefs.track);
    if (box.dataset.state === 'ask') {
      box.innerHTML = `${miniSprout}<div class="kc-invite-body"><p>${inviteText}</p>${choices}</div><button type="button" class="kc-invite-close" data-invite="later" aria-label="Dismiss Sprout’s offer">×</button>`;
      return;
    }
    // After the invitation: a quiet status line in the recipe with Sprout's reaction.
    const msg = status === 'playing' ? 'A little calm for your kitchen. 🌿' : status === 'paused' ? 'Paused. Ready whenever you are.'
      : status === 'loading' ? `Starting ${t.name}…` : status === 'blocked' ? 'Your browser needs one tap to play sound.' : status === 'error' ? `Couldn’t load ${t.name}.` : null;
    if (!msg) { if (box.classList.contains('kc-invite--plan')) planInvite = null; box.remove(); return; }
    box.classList.toggle('is-happy', status === 'playing');
    box.innerHTML = `${miniSprout}<div class="kc-invite-body"><p>${esc(msg)}</p><div class="sprout-bubble-actions kc-invite-actions">
      ${status === 'blocked' ? '<button type="button" class="button primary" data-kc="tap">Tap to play</button>' : ''}
      ${status === 'error' ? '<button type="button" class="button outline" data-kc="retry">Retry</button>' : ''}
      ${['playing', 'loading', 'paused'].includes(status) ? `<button type="button" class="button outline" data-kc="toggle">${status === 'paused' ? 'Play' : 'Pause'}</button>` : ''}
      <button type="button" class="button outline" data-kc="open">Open player</button></div></div>`;
  }
  function updateInvites() {
    document.querySelectorAll('.kc-invite').forEach(box => {
      if (box.dataset.state !== 'status') return;
      const focused = box.contains(document.activeElement) ? document.activeElement.dataset.kc : null;
      renderInvite(box);
      if (focused) (box.querySelector(`[data-kc="${focused}"]`) || box.querySelector('button'))?.focus({ preventScroll: true });
    });
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-invite], .kc-invite [data-kc]'); if (!el) return;
    const box = el.closest('.kc-invite');
    if (el.dataset.invite) {
      respond(el.dataset.invite, el);
      if (!box) { sprout()?.dismiss?.(); return; }
      if (box.classList.contains('kc-invite--plan')) planInvite = el.dataset.invite === 'later' ? null : 'status';
      if (el.dataset.invite === 'later') { box.remove(); return; }
      box.dataset.state = 'status'; renderInvite(box);
      box.querySelector('button')?.focus({ preventScroll: true });
      return;
    }
    prime();
    const a = el.dataset.kc;
    if (a === 'toggle') isActive() ? pause() : play(current || prefs.track);
    if (a === 'tap') play(current || prefs.track);
    if (a === 'retry') retry();
    if (a === 'open') open(el);
  });
  document.addEventListener('kitchen:recipe-open', () => {
    if (sproutHidden()) return;
    if (prefs.invite === 'new' || current) inviteInRecipe();
  });
  // Planning: the same speech-bubble card, placed in the page right under the meal plan so it pushes
  // content down instead of floating over buttons. Sprout in the corner waves at the same moment.
  let planInvite = null;                    // 'ask' | 'status' while the card belongs on the plan page
  function inviteOnPlan() {
    const grid = document.querySelector('#meal-plan .day-grid');
    const existing = document.querySelector('#meal-plan .kc-invite');
    if (existing) return existing;
    if (!grid || !planInvite) return null;
    const box = document.createElement('div');
    box.className = 'kc-invite kc-invite--plan';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Sprout offers calming sounds');
    box.dataset.state = planInvite;
    grid.after(box);
    renderInvite(box);
    return box;
  }
  document.addEventListener('kitchen:plan-change', () => {
    if (prefs.invite !== 'new' || sproutHidden()) return;
    prefs.invite = 'shown'; save();
    planInvite = 'ask';
    setTimeout(() => {
      const box = inviteOnPlan(); if (!box) return;
      requestAnimationFrame(() => box.classList.add('is-waving'));
      setTimeout(() => box.classList.remove('is-waving'), 1800);
      sprout()?.wave?.();
      cue('chime');
    }, 60);
  });
  // The app re-renders the plan view on every change; put the card back while it belongs there.
  document.addEventListener('kitchen:render', () => { if (planInvite) setTimeout(inviteOnPlan, 0); });

  // A gentle bell when a meal is cooked (only if interaction sounds are on).
  document.addEventListener('kitchen:cooked', () => cue('bell'));

  compact.addEventListener?.('change', render);
  render();

  window.KitchenCalm = {
    tracks: TRACKS.map(({ id, name, desc, src }) => ({ id, name, desc, available: !!src })),
    state: () => ({ track: prefs.track, current, status, volume: prefs.volume, muted: prefs.muted, repeat: prefs.repeat, cues: prefs.cues, cueVolume: prefs.cueVolume, mode, invite: prefs.invite, ducked: duckLevel < 1, level: (prefs.muted ? 0 : prefs.volume) * duckLevel }),
    open, close, minimise, play, pause, stop, retry, cue, prime, setVolume, setMuted, setRepeat, duck,
    next: () => step(1), prev: () => step(-1),
    changeVolume: d => setVolume(Math.round((prefs.volume + d) * 20) / 20),
  };
})();
