/* Krishna Bhajans: ten Hindi and Braj bhajans played through YouTube's embedded player, with the
 * white-eye bird in the nav as the control.
 *
 * Nothing is downloaded or hosted here. Every track is an embeddable video on its uploader's YouTube
 * channel, played with the official IFrame Player API (youtube-nocookie.com). YouTube's API policies
 * forbid background or audio-only playback and require a visible player of at least 200 × 200 px, so:
 *   - the player is always on screen while it plays: in the panel, or as a 200 × 200 tile when minimised;
 *   - the tile sits in the browser's top layer (a popover), so the site's own dialogs never cover it;
 *   - "Stop & close" is the only way to hide it, and it stops playback first.
 *
 * On load it prepares the saved bhajan and, if the browser allows sound without a tap and the cook
 * hasn't stopped or muted it before, starts it at the saved volume (15% at first). Otherwise a small
 * bubble beside the bird says "Welcome 🌿 Tap the bird to play Krishna bhajans." and the tap starts it.
 *
 * One shared audio controller (window.SatvicAudio) keeps the bhajans and Kitchen Calm from ever playing
 * together, and lets Sprout's voice pause music while listening and lower it while speaking.
 * Settings are kept on this device under satvic-bhajans-v1.
 */
(() => {
  'use strict';
  const KEY = 'satvic-bhajans-v1';
  const TRACKS = [
    { id: 'YutkSde3F3k', title: 'Shri Krishna Govind Hare Murari', performer: 'Ravindra Jain', channel: 'Ravindra Jain', channelUrl: 'https://www.youtube.com/@RavindraJainGroup' },
    { id: '3TnVw0DqlIQ', title: 'Govind Bolo Hari Gopal Bolo', performer: 'Lata Mangeshkar', channel: 'Shemaroo Musical Maestros', channelUrl: 'https://www.youtube.com/@MusicalMaestros' },
    { id: 'e0Rd6KhtEyo', title: 'Mere To Giridhar Gopal', performer: 'Amrita Chaturvedi', channel: 'Amrita Chaturvedi – Topic', channelUrl: 'https://www.youtube.com/channel/UC4BuM7LipfOYDcx38aiWGbw' },
    { id: 'ejsjrscERmc', title: 'Maiya Mori Main Nahi Makhan Khayo', performer: 'M. S. Subbulakshmi', channel: 'Saregama Hindustani Classical', channelUrl: 'https://www.youtube.com/@HindustaniClassical' },
    { id: 'GkWsCjVajyU', title: 'Akhiyan Hari Darshan Ki Pyasi', performer: 'Eshita Bhattacharjya & Babita Chakraborty', channel: 'Culture Circle', channelUrl: 'https://www.youtube.com/@culturecircle' },
    { id: '88tT6pXTjLk', title: 'Baso Mere Nainan Mein Nandlal', performer: 'Arundhati Roychoudhury', channel: 'Bhakti Amrit – FFR', channelUrl: 'https://www.youtube.com/@FFRBhaktiAmrit' },
    { id: 'Rdvzy6LvaF4', title: 'Pag Ghungroo Bandh Meera Naachi Re', performer: 'Alka Yagnik', channel: 'Shemaroo Bhakti', channelUrl: 'https://www.youtube.com/@ShemarooBhakti' },
    { id: 'ig2hIAfG_uI', title: 'Jo Tum Todo Piya Main Nahi Todun', performer: 'Sri Sathya Sai devotional singers', channel: 'Sri Sathya Sai Official', channelUrl: 'https://www.youtube.com/@SriSathyaSaiOfficial' },
    { id: 'epY2hgBTa-Q', title: 'Madhuban Tum Kyon Rehat Hare', performer: 'M. S. Subbulakshmi', channel: 'Saregama Carnatic Classical', channelUrl: 'https://www.youtube.com/@saregamacarnaticclassical' },
    { id: 'sjoDzqsjd6c', title: 'Hari Tum Haro Jan Ki Peer', performer: 'Ram Swaroop Das (live)', channel: 'Ram Sagar creation', channelUrl: 'https://www.youtube.com/@RamSagarcreation' },
  ];
  const find = id => TRACKS.find(t => t.id === id);
  const SILENT = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAAC' + 'A'.repeat(1064) + '=';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const prefs = (() => {
    const d = { track: TRACKS[0].id, volume: 15, muted: false, repeat: 'all', playing: true };
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') Object.assign(d, s); } catch {}
    if (!find(d.track)) d.track = TRACKS[0].id;
    d.volume = Math.max(0, Math.min(100, Math.round(Number(d.volume)))); if (Number.isNaN(d.volume)) d.volume = 15;
    if (!['one', 'all', 'off'].includes(d.repeat)) d.repeat = 'all';
    d.muted = !!d.muted; d.playing = d.playing !== false;
    return d;
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

  /* ------------------------------------------------------------------ DOM */
  const root = document.createElement('section');
  root.className = 'bj-root';
  root.id = 'bj-root';
  root.setAttribute('aria-labelledby', 'bj-title');
  const canPopover = typeof root.showPopover === 'function';
  if (canPopover) root.setAttribute('popover', 'manual');
  const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    prev: '<path d="M18 6v12l-8.5-6zM6 6v12"/>', next: '<path d="M6 6v12l8.5-6zM18 6v12"/>',
    vol: '<path d="M4 9.5h3l4.5-4v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>', muted: '<path d="M4 9.5h3l4.5-4v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    one: '<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/><path d="M11.5 10.5l1-.5v4.5"/>',
    all: '<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/>',
    min: '<path d="M6 12h12"/>', expand: '<path d="M7 14l5-5 5 5"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  root.innerHTML = `
    <div class="bj-card">
      <header class="bj-head">
        <h2 id="bj-title" tabindex="-1">Krishna Bhajans</h2>
        <button type="button" class="bj-icon" data-bj="minimise" aria-label="Minimise player">${svg(I.min)}</button>
        <button type="button" class="bj-stopclose" data-bj="stopclose">Stop &amp; close</button>
      </header>
      <div class="bj-video"><div id="bj-yt"></div><p class="bj-video-msg" hidden></p></div>
      <p class="bj-hint" hidden>If it doesn’t start, tap the video once to begin.</p>
      <div class="bj-now" aria-live="off"><strong class="bj-now-title"></strong><span class="bj-now-by"></span></div>
      <div class="bj-controls" role="group" aria-label="Playback">
        <button type="button" class="bj-icon" data-bj="prev" aria-label="Previous bhajan">${svg(I.prev)}</button>
        <button type="button" class="bj-play" data-bj="toggle" aria-label="Play">${svg(I.play)}</button>
        <button type="button" class="bj-icon" data-bj="next" aria-label="Next bhajan">${svg(I.next)}</button>
        <span class="bj-vol">
          <button type="button" class="bj-icon" data-bj="mute" aria-pressed="false" aria-label="Mute">${svg(I.vol)}</button>
          <label class="sr-only" for="bj-volume">Volume</label><input id="bj-volume" type="range" min="0" max="100" step="5">
        </span>
      </div>
      <div class="bj-repeat" role="group" aria-label="Repeat">
        <button type="button" data-repeat="one" aria-pressed="false">${svg(I.one)}<span>Repeat track</span></button>
        <button type="button" data-repeat="all" aria-pressed="false">${svg(I.all)}<span>Repeat playlist</span></button>
      </div>
      <ol class="bj-list" aria-label="Bhajans"></ol>
      <p class="bj-credit">Played from YouTube in its own player; each video belongs to the channel named under it. <a href="credits.html#bhajans">Sources</a> · <button type="button" data-bj="kc">Kitchen Calm flute</button></p>
    </div>
    <div class="bj-minibar">
      <span class="bj-mini-title"></span>
      <button type="button" class="bj-icon" data-bj="toggle" aria-label="Play">${svg(I.play)}</button>
      <button type="button" class="bj-icon" data-bj="expand" aria-label="Open bhajan player">${svg(I.expand)}</button>
      <button type="button" class="bj-icon" data-bj="stopclose" aria-label="Stop &amp; close">${svg(I.close)}</button>
    </div>
    <p class="sr-only" role="status" aria-live="polite" id="bj-live"></p>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const live = $('#bj-live'), videoMsg = $('.bj-video-msg'), volume = $('#bj-volume');
  const announce = t => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };

  // The bird in the nav (created by Kitchen Calm) becomes the bhajan control.
  let bird = null;
  function claimBird() {
    bird = document.querySelector('.sounds-bird');
    if (!bird) return;
    bird.dataset.owner = 'bhajans';
    bird.setAttribute('aria-controls', 'bj-root');
    bird.addEventListener('click', onBird);
    paintBird();
  }

  /* ------------------------------------------------------------- state */
  let mode = 'closed';          // closed | open | mini
  let status = 'idle';          // idle | loading | playing | paused | blocked | error
  let player = null, ready = false, apiLoading = null, wantPlay = false, autoTry = false, autoTimer = 0;
  let selfPause = false, ducked = false, voicePaused = false, opener = null;
  const unavailable = new Set();

  function setMode(next) {
    mode = next;
    root.classList.toggle('is-open', next === 'open');
    root.classList.toggle('is-mini', next === 'mini');
    document.documentElement.classList.toggle('bj-tile', next === 'mini');
    if (next === 'closed') { if (canPopover && root.matches(':popover-open')) root.hidePopover(); root.hidden = !canPopover; }
    else { root.hidden = false; if (canPopover && !root.matches(':popover-open')) root.showPopover(); }
    paint();
  }
  // Keep the player above the site's own dialogs: re-raise it whenever one opens.
  new MutationObserver(muts => {
    if (mode === 'closed' || !canPopover) return;
    if (muts.some(m => m.target.tagName === 'DIALOG' && m.target.open)) { root.hidePopover(); root.showPopover(); }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });

  function setStatus(s) { status = s; paint(); }
  const isPlaying = () => status === 'playing';
  const audible = () => isPlaying() && !prefs.muted && prefs.volume > 0;

  function paint() {
    const t = find(prefs.track);
    $('.bj-now-title').textContent = t.title;
    $('.bj-now-by').textContent = `${t.performer} · via ${t.channel}`;
    $('.bj-mini-title').textContent = t.title;
    const playLabel = isPlaying() || status === 'loading' ? 'Pause' : 'Play';
    $$('[data-bj="toggle"]').forEach(b => { b.setAttribute('aria-label', `${playLabel}${status === 'loading' ? ' (loading)' : ''}`); b.innerHTML = svg(isPlaying() || status === 'loading' ? I.pause : I.play); });
    const mute = $('[data-bj="mute"]');
    mute.setAttribute('aria-pressed', String(prefs.muted)); mute.setAttribute('aria-label', prefs.muted ? 'Unmute' : 'Mute'); mute.innerHTML = svg(prefs.muted || prefs.volume === 0 ? I.muted : I.vol);
    volume.value = String(prefs.volume);
    volume.setAttribute('aria-valuetext', `${prefs.volume}%${prefs.muted ? ', muted' : ''}`);
    $$('[data-repeat]').forEach(b => b.setAttribute('aria-pressed', String(prefs.repeat === b.dataset.repeat)));
    $('.bj-list').innerHTML = TRACKS.map((x, i) => {
      const sel = x.id === prefs.track, off = unavailable.has(x.id);
      const state = off ? 'Unavailable here' : sel && isPlaying() ? 'Playing' : sel && status === 'loading' ? 'Loading…' : sel ? (status === 'paused' ? 'Paused' : 'Selected') : '';
      return `<li><button type="button" class="bj-track${sel ? ' is-selected' : ''}${off ? ' is-off' : ''}" data-track="${x.id}" aria-current="${sel ? 'true' : 'false'}"${off ? ' aria-disabled="true"' : ''}>
        <span class="bj-num" aria-hidden="true">${sel && isPlaying() ? '<i class="bj-eq"><b></b><b></b><b></b></i>' : String(i + 1).padStart(2, '0')}</span>
        <span class="bj-track-text"><strong>${esc(x.title)}</strong><small>${esc(x.performer)} · <a href="${x.channelUrl}" target="_blank" rel="noopener" tabindex="-1">${esc(x.channel)}</a></small></span>
        ${state ? `<em>${state}</em>` : ''}</button></li>`;
    }).join('');
    root.classList.toggle('is-playing', isPlaying());
    paintBird();
  }
  function paintBird() {
    if (!bird) return;
    bird.classList.toggle('is-playing', audible());   // the bird sings only when sound is really playing
    bird.setAttribute('aria-expanded', String(mode === 'open'));
    bird.setAttribute('aria-label', audible() ? `Krishna bhajan player, playing ${find(prefs.track).title}` : 'Krishna bhajan player');
  }

  /* ------------------------------------------------------ YouTube player */
  function loadAPI() {
    if (window.YT?.Player) return Promise.resolve();
    if (apiLoading) return apiLoading;
    apiLoading = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch {} resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiLoading = null; reject(new Error('api')); };
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('timeout')), 15000);
    });
    return apiLoading;
  }
  // One player, created once; every caller shares the same promise (no duplicate players on a race).
  let playerReady = null;
  function ensurePlayer() {
    if (playerReady) return playerReady;
    playerReady = loadAPI().then(() => new Promise(resolve => {
      player = new YT.Player('bj-yt', {
        host: 'https://www.youtube-nocookie.com',
        width: '100%', height: '100%', videoId: prefs.track,
        playerVars: { playsinline: 1, rel: 0, controls: 1, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => { ready = true; applyVolume(); resolve(player); },
          onStateChange: e => onState(e.data),
          onError: e => onError(e.data),
        },
      });
    })).catch(err => { playerReady = null; throw err; });
    return playerReady;
  }
  function applyVolume() {
    if (!ready || !player.setVolume) return;
    const v = Math.round(prefs.volume * (ducked ? 0.25 : 1));
    try { player.setVolume(v); prefs.muted ? player.mute() : player.unMute(); } catch {}
  }

  function onState(s) {
    const YTS = window.YT?.PlayerState || {};
    if (s === YTS.PLAYING) {
      clearTimeout(autoTimer); autoTry = false; wantPlay = false;
      unavailable.delete(prefs.track);
      SatvicAudio._claim('bhajans');
      prefs.playing = true; save();
      if (status !== 'playing') announce(`Playing ${find(prefs.track).title}, ${find(prefs.track).performer}.`);
      videoMsg.hidden = true; $('.bj-hint').hidden = true;
      setStatus('playing');
    } else if (s === YTS.PAUSED) {
      if (selfPause) { selfPause = false; setStatus('paused'); return; }
      voicePaused = false;                   // the cook paused it in YouTube's own controls
      prefs.playing = false; save(); setStatus('paused');
    } else if (s === YTS.BUFFERING) setStatus('loading');
    else if (s === YTS.ENDED) onEnded();
    else if (s === YTS.CUED && status !== 'loading') setStatus('idle');
  }
  function onEnded() {
    if (prefs.repeat === 'one') { player.seekTo(0, true); player.playVideo(); return; }
    const i = TRACKS.findIndex(t => t.id === prefs.track);
    if (prefs.repeat === 'off' && i === TRACKS.length - 1) { setStatus('idle'); announce('That was the last bhajan.'); return; }
    step(1, { auto: true });
  }
  function onError(code) {
    clearTimeout(autoTimer);
    const t = find(prefs.track);
    unavailable.add(t.id);
    const why = [101, 150].includes(code) ? 'its channel doesn’t allow playback on other sites' : code === 100 ? 'it was removed' : 'YouTube couldn’t play it';
    announce(`${t.title} can’t play here: ${why}.`);
    // Skip ahead once per track; never loop through failures.
    const next = TRACKS.find((x, k) => k > TRACKS.indexOf(t) && !unavailable.has(x.id)) || TRACKS.find(x => !unavailable.has(x.id));
    if (next && (isPlaying() || status === 'loading' || wantPlay)) { select(next.id, { play: true }); return; }
    setStatus('error');
    videoMsg.textContent = `${t.title} can’t play here (${why}). Choose another bhajan.`;
    videoMsg.hidden = false;
  }

  async function play({ auto = false } = {}) {
    wantPlay = true;
    if (mode === 'closed') setMode('mini');
    setStatus('loading');
    try { await ensurePlayer(); }
    catch { wantPlay = false; setStatus('error'); videoMsg.textContent = 'Bhajans stream from YouTube and need an internet connection.'; videoMsg.hidden = false; return; }
    SatvicAudio._claim('bhajans');
    applyVolume();
    const cur = player.getVideoData?.()?.video_id;
    if (cur !== prefs.track) player.loadVideoById(prefs.track); else player.playVideo();
    if (!auto) {
      // Some browsers (iPhone Safari) only start an embedded video from a tap on the video itself.
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => { if (!isPlaying() && status === 'loading') { setStatus('paused'); $('.bj-hint').hidden = false; if (mode === 'mini') setMode('open'); announce('Tap the video once to start the bhajan.'); } }, 10000);
    }
    if (auto) {
      autoTry = true;
      // If the browser holds the sound back, fall back to the bird's invitation (once).
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => { if (autoTry && !isPlaying()) { autoTry = false; wantPlay = false; selfPause = true; try { player.pauseVideo(); } catch {} setStatus('blocked'); setMode("closed"); invite(); } }, 15000);
    }
  }
  function pause({ byUser = true } = {}) {
    wantPlay = false;
    if (!player || !ready) { setStatus('paused'); return; }
    selfPause = true;
    try { player.pauseVideo(); } catch {}
    if (byUser) { prefs.playing = false; save(); voicePaused = false; }
    setStatus('paused');
  }
  // Resume after Sprout's voice. Outside a tap some browsers (iOS) may refuse; then it just stays paused.
  function resumeQuietly() {
    if (!player || !ready) return;
    try { player.playVideo(); } catch {}
    setTimeout(() => { if (status !== 'playing') setStatus('paused'); }, 4000);
  }
  function stopAndClose() {
    wantPlay = false; clearTimeout(autoTimer); autoTry = false; voicePaused = false;
    if (player && ready) { selfPause = true; try { player.stopVideo(); } catch {} }
    prefs.playing = false; save();
    setStatus('idle');
    hideInvite();
    setMode('closed');
    announce('Bhajans stopped.');
    bird?.focus({ preventScroll: true });
  }
  function select(id, { play: andPlay = isPlaying() || status === 'loading' } = {}) {
    if (!find(id)) return;
    prefs.track = id; save();
    videoMsg.hidden = true;
    if (andPlay) play();
    else { if (ready) player.cueVideoById(id); setStatus('idle'); }
  }
  function step(dir, { auto = false } = {}) {
    const n = TRACKS.length;
    let i = TRACKS.findIndex(t => t.id === prefs.track);
    for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!unavailable.has(TRACKS[i].id)) break; }
    select(TRACKS[i].id, { play: auto || isPlaying() || status === 'loading' });
  }

  /* --------------------------------------------------------- panel UI */
  function open(from) {
    opener = from || document.activeElement;
    hideInvite();
    setMode('open');
    if (!player) ensurePlayer().catch(() => {});
    $('#bj-title').focus({ preventScroll: true });
  }
  function minimise() {
    if (!isPlaying() && status !== 'loading' && status !== 'paused') { closeQuietly(); return; }
    setMode('mini');
    root.querySelector('.bj-minibar [data-bj="expand"]').focus({ preventScroll: true });
  }
  function closeQuietly() { setMode('closed'); (opener && document.contains(opener) ? opener : bird)?.focus({ preventScroll: true }); }
  function onBird(e) {
    e.preventDefault();
    if (mode === 'open') { isPlaying() || status === 'loading' ? minimise() : closeQuietly(); return; }
    const startNow = status === 'blocked' || !!document.querySelector('.bj-invite:not([hidden])');
    open(bird);
    if (startNow || (mode !== 'closed' && wantPlay)) play();
  }
  root.addEventListener('click', e => {
    const tr = e.target.closest('[data-track]');
    if (tr && !e.target.closest('a')) { if (tr.getAttribute('aria-disabled') === 'true') { announce('That bhajan can’t play on this site.'); return; } select(tr.dataset.track, { play: true }); return; }
    const rp = e.target.closest('[data-repeat]');
    if (rp) { prefs.repeat = prefs.repeat === rp.dataset.repeat ? 'off' : rp.dataset.repeat; save(); paint(); announce(prefs.repeat === 'one' ? 'Repeating this bhajan.' : prefs.repeat === 'all' ? 'Repeating the playlist.' : 'Repeat off.'); return; }
    const b = e.target.closest('[data-bj]'); if (!b) return;
    const a = b.dataset.bj;
    if (a === 'toggle') { isPlaying() || status === 'loading' ? pause() : play(); }
    else if (a === 'prev') step(-1);
    else if (a === 'next') step(1);
    else if (a === 'mute') { prefs.muted = !prefs.muted; save(); applyVolume(); paint(); }
    else if (a === 'minimise') minimise();
    else if (a === 'expand') open(b);
    else if (a === 'stopclose') stopAndClose();
    else if (a === 'kc') { stopAndClose(); window.KitchenCalm?.open?.(); }
  });
  volume.addEventListener('input', () => { prefs.volume = Number(volume.value); if (prefs.volume > 0 && prefs.muted) prefs.muted = false; save(); applyVolume(); paint(); });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); e.preventDefault();
    mode === 'open' ? minimise() : stopAndClose();
  });

  /* -------------------------------------------- welcome bubble by the bird */
  let inviteEl = null;
  function invite() {
    if (!bird || !bird.offsetParent) return;
    if (!inviteEl) {
      inviteEl = document.createElement('div');
      inviteEl.className = 'bj-invite';
      inviteEl.setAttribute('role', 'status');
      inviteEl.innerHTML = '<p>Welcome 🌿 Tap the bird to play Krishna bhajans.</p><button type="button" aria-label="Dismiss">×</button>';
      inviteEl.querySelector('button').addEventListener('click', () => { hideInvite(); bird.focus({ preventScroll: true }); });
      document.body.appendChild(inviteEl);
      addEventListener('resize', placeInvite);
    }
    inviteEl.hidden = false;
    placeInvite();
  }
  function placeInvite() {
    if (!inviteEl || inviteEl.hidden || !bird) return;
    const r = bird.getBoundingClientRect();
    inviteEl.style.top = `${Math.round(r.bottom + 10)}px`;
    inviteEl.style.right = `${Math.max(10, Math.round(innerWidth - r.right - 8))}px`;
  }
  function hideInvite() { if (inviteEl) inviteEl.hidden = true; }

  /* ------------------------------------------------ shared audio controller */
  // Only one source plays at a time, and Sprout's voice can pause (listening) or lower (speaking) music.
  const SatvicAudio = window.SatvicAudio = {
    mode: null, kcPaused: false,
    _claim(source) {
      const kc = window.KitchenCalm;
      if (source === 'bhajans' && kc && ['playing', 'loading', 'paused'].includes(kc.state?.().status)) kc.stop?.();
    },
    duck(next = null) {
      if (next === this.mode) return;
      this.mode = next;
      const kc = window.KitchenCalm, kcState = kc?.state?.().status;
      // Bhajans
      if (next === 'listen') { if (isPlaying() || status === 'loading') { voicePaused = true; pause({ byUser: false }); } ducked = false; applyVolume(); }
      else if (next === 'speak') { ducked = true; applyVolume(); }
      else { ducked = false; applyVolume(); if (voicePaused) { voicePaused = false; if (status === 'paused') resumeQuietly(); } }
      // Kitchen Calm
      if (!kc) return;
      if (next === 'listen') { if (kcState === 'playing' || kcState === 'loading') { this.kcPaused = true; kc.pause?.({ quiet: true }); } kc.duck?.(false); }
      else if (next === 'speak') kc.duck?.(true);
      else { kc.duck?.(false); if (this.kcPaused) { this.kcPaused = false; if (kc.state().status === 'paused') Promise.resolve(kc.play?.(kc.state().track, { quiet: true })).catch(() => {}); } }
    },
    state: () => ({ mode: SatvicAudio.mode, bhajans: status, ducked, voicePaused, kc: window.KitchenCalm?.state?.().status }),
  };
  // Kitchen Calm started by the cook: the bhajans step aside.
  document.addEventListener('kitchen-calm:play', () => { if (isPlaying() || status === 'loading' || mode !== 'closed') { prefs.playing = false; save(); stopAndCloseSilently(); } });
  // A user stop/pause in Kitchen Calm cancels any pending voice resume there.
  ['kitchen-calm:pause', 'kitchen-calm:stop'].forEach(ev => document.addEventListener(ev, () => { SatvicAudio.kcPaused = false; }));
  function stopAndCloseSilently() {
    wantPlay = false; clearTimeout(autoTimer); autoTry = false; voicePaused = false;
    if (player && ready) { selfPause = true; try { player.stopVideo(); } catch {} }
    setStatus('idle'); setMode('closed');
  }

  /* ------------------------------------------------------------- start */
  function canAutoplay() {
    return new Promise(resolve => {
      try {
        const a = new Audio(); a.volume = 0; a.src = SILENT;
        const p = a.play();
        if (!p) { resolve(false); return; }
        p.then(() => { a.pause(); resolve(true); }).catch(() => resolve(false));
        setTimeout(() => resolve(false), 1500);
      } catch { resolve(false); }
    });
  }
  async function start() {
    const params = new URLSearchParams(location.search);
    if (params.get('bhajans') === '0') { delete window.SatvicAudio; return; }   // QA: Kitchen Calm keeps the bird
    claimBird();
    paint();
    // ?tour=0 (screenshots and QA) skips the autoplay unless &bhajans=1 is added; ?bhajans=0 always skips it.
    if (params.get('tour') === '0' && params.get('bhajans') !== '1') return;
    // Prepare the selected bhajan quietly in the background once the page has settled.
    const prepare = () => loadAPI().catch(() => {});
    ('requestIdleCallback' in window) ? requestIdleCallback(prepare, { timeout: 3000 }) : setTimeout(prepare, 1500);
    if (!prefs.playing || prefs.muted) return;                       // respect a saved stop or mute
    const go = async () => {
      if (document.querySelector('dialog[open]')) return false;      // wait until setup questions and dialogs are closed
      if (await canAutoplay()) play({ auto: true }); else invite();
      return true;
    };
    if (!(await go())) {
      const retry = () => { setTimeout(async () => { if (!(await go())) document.addEventListener('ritual:done', retry, { once: true }); }, 600); };
      document.addEventListener('ritual:done', retry, { once: true });
    }
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });

  window.Bhajans = {
    tracks: TRACKS.map(t => ({ ...t, url: `https://www.youtube.com/watch?v=${t.id}` })),
    open: () => open(), minimise, play: () => play(), pause: () => pause(), stop: stopAndClose, next: () => step(1), prev: () => step(-1), select: id => select(id, { play: true }),
    state: () => ({ mode, status, track: prefs.track, volume: prefs.volume, muted: prefs.muted, repeat: prefs.repeat, playing: prefs.playing, unavailable: [...unavailable], ducked,
      player: ready && player.getVolume ? { volume: player.getVolume(), muted: player.isMuted(), time: player.getCurrentTime(), duration: player.getDuration(), video: player.getVideoData?.()?.video_id } : null }),
    // For automated checks only.
    _test: { seekNearEnd: () => ready && player.seekTo(Math.max(0, player.getDuration() - 2), true), fail: code => onError(code) },
  };
})();
