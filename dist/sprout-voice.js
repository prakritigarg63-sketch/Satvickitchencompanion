/* Sprout's voice: talk to Sprout and, if you like, hear the replies.
 *
 * - "Talk to Sprout" (the microphone in the chat) uses the browser's speech recognition. The microphone
 *   is requested only when that button is tapped. Tap once to start, tap again to stop. What was heard
 *   lands in the text box so the cook can check or edit it before tapping Send; nothing is sent on its own.
 * - "Read replies aloud" uses the browser's speech synthesis with the voice and speed chosen in Voice settings.
 * - Replies come from Sprout's own chat logic (sprout.js), so recipes and quantities stay grounded in the
 *   app's recipe data and household preferences. This file only adds a way in (voice) and a way out (speech).
 * - Kitchen Calm music is lowered while Sprout listens or speaks, then restored (KitchenCalm.duck).
 * - Without speech recognition, or with the microphone blocked, typing works exactly as before.
 *
 * Speech recognition in most browsers is an online service run by the browser maker, so this code never
 * claims to work offline. Settings are kept on this device under satvic-sprout-voice-v1.
 */
(() => {
  'use strict';
  const root = document.getElementById('sprout');
  if (!root) return;
  const panel = root.querySelector('#sprout-panel'), form = root.querySelector('.sprout-compose'),
    input = root.querySelector('#sprout-input'), modeLabel = root.querySelector('#sprout-mode');
  if (!panel || !form || !input) return;

  const KEY = 'satvic-sprout-voice-v1';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const synth = ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function') ? window.speechSynthesis : null;
  const LANGS = [
    { id: 'en-IN', label: 'English (India)' },
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'hi-IN', label: 'हिन्दी (Hindi)' },
  ];
  const SILENCE_MS = 7000;   // stop listening after this long without hearing anything new
  const DEVANAGARI = /[ऀ-ॿ]/;

  const prefs = (() => {
    const d = { speak: false, lang: 'en-IN', voice: '', rate: 1 };
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') Object.assign(d, s); } catch {}
    if (!LANGS.some(l => l.id === d.lang)) d.lang = 'en-IN';
    d.rate = Math.min(1.5, Math.max(0.7, Number(d.rate) || 1));
    d.speak = !!d.speak; d.voice = String(d.voice || '');
    return d;
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const isHindi = () => prefs.lang.startsWith('hi');

  /* ---------------------------------------------------------------- UI */
  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const I = {
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };

  const mic = document.createElement('button');
  mic.type = 'button';
  mic.className = 'sv-mic';
  mic.setAttribute('aria-pressed', 'false');
  mic.setAttribute('aria-label', 'Talk to Sprout');
  mic.title = 'Talk to Sprout';
  mic.innerHTML = icon(I.mic);
  form.insertBefore(mic, input);

  const bar = document.createElement('div');
  bar.className = 'sv-wrap';
  bar.innerHTML = `
    <div class="sv-bar" role="group" aria-label="Voice">
      <span class="sv-status" data-state="idle"><i aria-hidden="true"></i><span class="sv-status-text">Idle</span></span>
      <span class="sv-tools">
        <button type="button" class="sv-icon sv-replay" aria-label="Replay last reply" title="Replay last reply" disabled>${icon(I.replay)}</button>
        <button type="button" class="sv-stop" aria-label="Stop speaking" title="Stop speaking" hidden>${icon(I.stop)}<span>Stop</span></button>
        <button type="button" class="sv-read" role="switch" aria-checked="false"><span class="sv-switch" aria-hidden="true"></span><span>Read replies aloud</span></button>
        <button type="button" class="sv-icon sv-gear" aria-label="Voice settings" title="Voice settings" aria-expanded="false" aria-controls="sv-settings">${icon(I.gear)}</button>
      </span>
    </div>
    <div class="sv-settings" id="sv-settings" hidden>
      <label class="sv-field"><span>Language</span><select class="sv-lang">${LANGS.map(l => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
      <label class="sv-field"><span>Voice</span><select class="sv-voice"></select></label>
      <label class="sv-field sv-rate-field"><span>Speed <output class="sv-rate-out"></output></span><input class="sv-rate" type="range" min="0.7" max="1.5" step="0.1"></label>
      <p class="sv-help"></p>
    </div>
    <p class="sv-notice" role="status" aria-live="polite"></p>`;
  panel.insertBefore(bar, form);

  const $ = sel => bar.querySelector(sel);
  const statusEl = $('.sv-status'), statusText = $('.sv-status-text'), replayBtn = $('.sv-replay'), stopBtn = $('.sv-stop'),
    readBtn = $('.sv-read'), gearBtn = $('.sv-gear'), settings = $('#sv-settings'), langSel = $('.sv-lang'),
    voiceSel = $('.sv-voice'), rateIn = $('.sv-rate'), rateOut = $('.sv-rate-out'), help = $('.sv-help'), noticeEl = $('.sv-notice');
  const placeholder = input.placeholder;

  let noticeTimer = 0;
  function notice(text, { sticky = false } = {}) {
    clearTimeout(noticeTimer);
    noticeEl.textContent = text || '';
    noticeEl.hidden = !text;
    if (text && !sticky) noticeTimer = setTimeout(() => { noticeEl.textContent = ''; noticeEl.hidden = true; }, 9000);
  }
  notice('');

  /* ------------------------------------------------------------ state */
  const LABEL = { idle: 'Idle', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' };
  let state = 'idle', unduckTimer = 0;
  // Music steps aside for Sprout's voice: paused while listening, lowered while speaking (window.SatvicAudio in
  // bhajans.js covers the bhajans and Kitchen Calm). Without it, Kitchen Calm is simply lowered.
  const audio = m => { try { if (window.SatvicAudio) window.SatvicAudio.duck(m); else window.KitchenCalm?.duck?.(!!m); } catch {} };
  function setState(next) {
    state = next;
    statusEl.dataset.state = next;
    statusText.textContent = LABEL[next];
    root.classList.toggle('is-listening', next === 'listening');
    root.classList.toggle('is-speaking', next === 'speaking');
    mic.classList.toggle('is-on', next === 'listening');
    mic.setAttribute('aria-pressed', String(next === 'listening'));
    mic.setAttribute('aria-label', next === 'listening' ? 'Stop listening' : 'Talk to Sprout');
    mic.title = next === 'listening' ? 'Stop listening' : 'Talk to Sprout';
    input.placeholder = next === 'listening' ? 'Listening… tap the microphone to stop' : placeholder;
    stopBtn.hidden = next !== 'speaking';
    replayBtn.hidden = next === 'speaking';
    // Kitchen Calm steps back while Sprout listens or talks, and comes back afterwards.
    // Restoring waits a moment, so the music doesn't swell in the gap between listening, thinking and speaking.
    clearTimeout(unduckTimer);
    if (next === 'listening') audio('listen');
    else if (next === 'speaking') audio('speak');
    else unduckTimer = setTimeout(() => audio(null), next === 'thinking' ? 2500 : 300);
  }

  /* -------------------------------------------------------- listening */
  let rec = null, heard = false, failed = false, finalText = '', interimText = '', base = '', silenceTimer = 0;
  const joinText = (a, b) => [a, b].map(s => s.trim()).filter(Boolean).join(' ');
  function armSilence() { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => rec?.stop(), SILENCE_MS); }

  const ERRORS = {
    'not-allowed': 'Microphone access is blocked, so I can’t listen. To talk to Sprout, allow the microphone for this site in your browser’s settings. Typing works as usual.',
    'service-not-allowed': 'Voice input isn’t available in this browser right now. Typing works as usual.',
    'no-speech': 'I didn’t hear anything. Tap the microphone and try again, a little closer.',
    'audio-capture': 'I couldn’t find a microphone. Check that one is connected, or type instead.',
    'network': 'Voice input needs an internet connection in this browser. Type instead, or try again when you’re online.',
    'bad-grammar': 'Voice input stopped unexpectedly. Try again, or type instead.',
  };

  function startListening() {
    if (!Recognition) { notice('Voice input isn’t supported in this browser. You can type your question instead.'); return; }
    if (navigator.onLine === false) { notice(ERRORS.network); return; }
    stopSpeaking();
    heard = false; failed = false; finalText = ''; interimText = ''; base = input.value;
    let r;
    try {
      r = new Recognition();
      r.lang = prefs.lang;
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;
    } catch { notice('Voice input isn’t available in this browser. You can type instead.'); return; }
    rec = r;
    r.onstart = () => { if (rec !== r) return; setState('listening'); notice(''); armSilence(); };
    r.onresult = e => {
      if (rec !== r) return;
      heard = true; armSilence();
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText = joinText(finalText, res[0].transcript);
        else interim = joinText(interim, res[0].transcript);
      }
      interimText = interim;
      input.value = joinText(base, joinText(finalText, interim));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    r.onerror = e => {
      if (rec !== r) return;
      if (e.error === 'aborted') return;
      failed = true;
      if (e.error === 'language-not-supported') {
        const was = LANGS.find(l => l.id === prefs.lang)?.label || prefs.lang;
        prefs.lang = 'en-IN'; save(); langSel.value = prefs.lang; fillVoices(); explain();
        notice(`${was} voice input isn’t supported in this browser, so I’ve switched to English (India). Tap the microphone to try again.`);
        return;
      }
      notice(ERRORS[e.error] || 'Voice input stopped unexpectedly. Try again, or type instead.');
    };
    r.onend = () => {
      if (rec !== r) return;
      clearTimeout(silenceTimer);
      rec = null;
      if (state === 'listening') setState('idle');
      const said = joinText(finalText, interimText);
      if (said) {
        input.value = joinText(base, said);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus({ preventScroll: true });
        try { input.setSelectionRange(input.value.length, input.value.length); } catch {}
        notice('Here’s what I heard. Edit it if you need to, then tap Send.');
      } else if (!failed) notice(ERRORS['no-speech']);
    };
    mic.setAttribute('aria-pressed', 'true');
    mic.classList.add('is-on');
    try { r.start(); }
    catch { rec = null; setState('idle'); notice('Voice input couldn’t start. Try again, or type instead.'); }
  }
  // stop(): finish and keep what was heard. abort(): drop it (used before Sprout speaks or when the chat closes).
  function stopListening(abort = false) {
    const r = rec; if (!r) return;
    clearTimeout(silenceTimer);
    if (abort) { rec = null; try { r.abort(); } catch {} if (state === 'listening') setState('idle'); }
    else { try { r.stop(); } catch { rec = null; setState('idle'); } }
  }
  mic.addEventListener('click', () => {
    primeSpeech();
    if (rec) stopListening(); else startListening();
  });

  /* --------------------------------------------------------- speaking */
  let voices = [], token = 0, watchdog = 0, primed = false, lastText = '';
  const listVoices = () => { try { return synth ? synth.getVoices() : []; } catch { return []; } };
  const voicesFor = lang => voices.filter(v => v.lang?.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2)));
  function pickVoice(lang) {
    const pool = voicesFor(lang);
    if (!pool.length) return null;
    const chosen = pool.find(v => v.voiceURI === prefs.voice);
    if (chosen) return chosen;
    const exact = l => pool.find(v => v.lang.replace('_', '-').toLowerCase() === l.toLowerCase());
    return exact(lang === prefs.lang ? prefs.lang : (lang.startsWith('hi') ? 'hi-IN' : prefs.lang.startsWith('en') ? prefs.lang : 'en-IN'))
      || exact('en-IN') || pool.find(v => v.default) || pool.find(v => v.localService) || pool[0];
  }
  // iOS only lets a page speak after speech has started inside a tap, so a silent utterance unlocks it.
  function primeSpeech() {
    if (!synth || primed || !prefs.speak) return;
    primed = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch {}
  }

  const UNITS = [[/(\d)\s?g\b/g, '$1 grams'], [/(\d)\s?ml\b/g, '$1 millilitres'], [/(\d)\s?kg\b/g, '$1 kilos'],
    [/\b1 tsp\b/g, '1 teaspoon'], [/\btsp\b/g, 'teaspoons'], [/\b1 tbsp\b/g, '1 tablespoon'], [/\btbsp\b/g, 'tablespoons'],
    [/(\d)\s?min\b/g, '$1 minutes'], [/(\d)½/g, '$1 and a half'], [/(\d)¼/g, '$1 and a quarter'], [/(\d)¾/g, '$1 and three quarters'],
    [/½/g, 'half'], [/¼/g, 'a quarter'], [/¾/g, 'three quarters'], [/(\d)\s?×/g, '$1 times'], [/\s?·\s?/g, ', '], [/→/g, ' to ']];
  function speakable(reply) {
    const parts = [];
    for (const b of reply?.blocks || []) {
      if (b.type === 'recipes') parts.push((b.items || []).map(x => (typeof find === 'function' && find(x.id)?.name) || '').filter(Boolean).join(', ') + '.');
      else if (b.type === 'list') { if (b.title) parts.push(b.title); parts.push((b.items || []).join('. ') + '.'); }
      else if (b.type === 'step') parts.push(`${b.label}. ${b.text}`);
      else if (b.text) parts.push(b.text);
    }
    let text = parts.join(' ');
    text = text.replace(/\p{Extended_Pictographic}|️/gu, '');
    for (const [re, to] of UNITS) text = text.replace(re, to);
    return text.replace(/\s+/g, ' ').trim();
  }
  // Short sentences keep Chrome from cutting off long speech, and let Stop act at once.
  const chunks = text => (text.match(/[^.!?।]+[.!?।]+["”’)]*|[^.!?।]+$/g) || [text]).map(s => s.trim()).filter(Boolean)
    .flatMap(s => s.length <= 220 ? [s] : s.split(/(?<=[,;:])\s+/));

  function speak(text, { force = false } = {}) {
    if (!text) return;
    if (!synth) { notice('Spoken replies aren’t supported in this browser.'); return; }
    if (!force && !prefs.speak) return;
    stopListening(true);                     // never listen to our own voice
    synth.cancel();
    const my = ++token;
    voices = listVoices();
    const lang = DEVANAGARI.test(text) ? 'hi-IN' : (prefs.lang.startsWith('en') ? prefs.lang : 'en-IN');
    const voice = pickVoice(lang);
    if (!voice && voices.length && lang.startsWith('hi')) { notice('This device has no Hindi voice, so I can’t read this reply aloud. It’s shown in the chat.'); setState('idle'); return; }
    if (voices.length && !voice) notice('No matching voice on this device, so I’m using the default one.');
    const list = chunks(text);
    list.forEach((piece, i) => {
      const u = new SpeechSynthesisUtterance(piece);
      u.lang = voice?.lang || lang;
      if (voice) try { u.voice = voice; } catch {}
      u.rate = prefs.rate;
      u.onend = () => { if (my === token && i === list.length - 1) finish(); };
      u.onerror = e => {
        if (my !== token) return;
        if (!['interrupted', 'canceled'].includes(e.error)) notice(e.error === 'not-allowed'
          ? 'Your browser blocked speech until you tap the page. Tap Replay to hear it.'
          : 'I couldn’t read that reply aloud. It’s shown in the chat.');
        finish();
      };
      synth.speak(u);
    });
    setState('speaking');
    // Some browsers skip end events; watch the engine so the state never sticks on Speaking.
    clearInterval(watchdog);
    let idleTicks = 0;
    watchdog = setInterval(() => {
      if (my !== token) { clearInterval(watchdog); return; }
      idleTicks = synth.speaking || synth.pending ? 0 : idleTicks + 1;
      if (idleTicks >= 3) finish();
    }, 400);
    function finish() { if (my !== token) return; token++; clearInterval(watchdog); if (state === 'speaking') setState('idle'); }
  }
  function stopSpeaking() {
    token++; clearInterval(watchdog);
    try { synth?.cancel(); } catch {}
    if (state === 'speaking') setState('idle');
  }
  stopBtn.addEventListener('click', () => { stopSpeaking(); replayBtn.focus({ preventScroll: true }); });
  replayBtn.addEventListener('click', () => { primed = true; speak(lastText || lastFromLog(), { force: true }); stopBtn.focus({ preventScroll: true }); });

  function lastFromLog() {
    const m = [...root.querySelectorAll('.sprout-msg.from-sprout')].pop();
    if (!m) return '';
    const c = m.cloneNode(true);
    c.querySelectorAll('.sprout-actions,.sprout-suggestions,button').forEach(n => n.remove());
    c.querySelectorAll('p,li,div').forEach(n => n.append(' '));
    return speakable({ blocks: [{ type: 'text', text: c.textContent }] });
  }
  const refreshReplay = () => { replayBtn.disabled = !synth || !(lastText || root.querySelector('.sprout-msg.from-sprout')); };

  /* --------------------------------------------------------- settings */
  function fillVoices() {
    voices = listVoices();
    const lang = isHindi() ? 'hi-IN' : prefs.lang, pool = voicesFor(lang);
    voiceSel.innerHTML = pool.length
      ? `<option value="">Automatic</option>${pool.map(v => `<option value="${v.voiceURI.replace(/"/g, '&quot;')}">${v.name.replace(/</g, '&lt;')} · ${v.lang}</option>`).join('')}`
      : `<option value="">${!synth ? 'Not supported in this browser' : voices.length ? (isHindi() ? 'No Hindi voice on this device' : 'No English voice on this device') : 'Default voice'}</option>`;
    voiceSel.disabled = !pool.length;
    voiceSel.value = pool.some(v => v.voiceURI === prefs.voice) ? prefs.voice : '';
  }
  function explain() {
    const lines = [];
    if (!Recognition) lines.push('Voice input isn’t supported in this browser, so type your questions. Spoken replies can still work.');
    else lines.push('Voice input uses your browser’s speech service, which usually needs an internet connection.');
    if (!synth) lines.push('This browser can’t read replies aloud.');
    if (isHindi()) {
      const guided = /guided/i.test(modeLabel?.textContent || '');
      lines.push(guided
        ? 'Sprout’s offline guide understands English questions best and answers in English. Hindi answers need AI replies, which aren’t on right now.'
        : 'Sprout answers in Hindi when its AI replies are on. If they’re unavailable, it answers in English.');
      if (synth && voices.length && !voicesFor('hi').length) lines.push('This device has no Hindi voice, so Hindi replies are shown but not read aloud.');
    }
    help.textContent = lines.join(' ');
  }
  function paintPrefs() {
    readBtn.setAttribute('aria-checked', String(prefs.speak));
    langSel.value = prefs.lang;
    rateIn.value = String(prefs.rate);
    rateOut.textContent = `${prefs.rate.toFixed(1)}×`;
    fillVoices(); explain();
    if (!synth) { readBtn.disabled = true; readBtn.title = 'Spoken replies aren’t supported in this browser'; }
    if (!Recognition) { mic.hidden = true; form.classList.add('sv-no-mic'); }
    refreshReplay();
  }
  readBtn.addEventListener('click', () => {
    prefs.speak = !prefs.speak; save(); paintPrefs();
    if (prefs.speak) { primed = true; speak(isHindi() && voicesFor('hi').length ? 'ठीक है, मैं अपने जवाब पढ़कर सुनाऊँगा।' : 'Okay. I’ll read my replies aloud.'); }
    else stopSpeaking();
  });
  gearBtn.addEventListener('click', () => {
    const show = settings.hidden;
    settings.hidden = !show;
    gearBtn.setAttribute('aria-expanded', String(show));
    if (show) { fillVoices(); explain(); }
  });
  langSel.addEventListener('change', () => {
    prefs.lang = langSel.value; prefs.voice = ''; save(); fillVoices(); explain();
    if (rec) { stopListening(true); notice('Language changed. Tap the microphone to start again.'); }
  });
  voiceSel.addEventListener('change', () => {
    prefs.voice = voiceSel.value; save();
    speak(isHindi() ? 'नमस्ते, मैं स्प्राउट हूँ।' : 'Hello, I’m Sprout.', { force: true });
  });
  rateIn.addEventListener('input', () => { prefs.rate = Number(rateIn.value); rateOut.textContent = `${prefs.rate.toFixed(1)}×`; save(); });
  synth?.addEventListener?.('voiceschanged', () => { fillVoices(); explain(); });
  if (modeLabel) new MutationObserver(explain).observe(modeLabel, { childList: true, characterData: true, subtree: true });

  /* ----------------------------------------------- Sprout's own events */
  // A new question (typed, a suggestion or an action) interrupts speech and ends any listening.
  form.addEventListener('submit', () => { primeSpeech(); stopListening(true); stopSpeaking(); notice(''); }, true);
  root.addEventListener('click', e => { if (e.target.closest('.sprout-suggestion,.sprout-action,[data-retry]')) primeSpeech(); }, true);
  document.addEventListener('sprout:asking', () => { stopListening(true); stopSpeaking(); setState('thinking'); });
  document.addEventListener('sprout:reply', e => {
    lastText = speakable(e.detail?.reply);
    refreshReplay();
    if (state === 'thinking') setState('idle');
    if (prefs.speak && lastText) speak(lastText);
  });
  document.addEventListener('sprout:reply-failed', () => { if (state === 'thinking') setState('idle'); });
  // Closing or minimising the chat, hiding Sprout or leaving the page stops everything.
  const stopAll = () => { stopListening(true); stopSpeaking(); if (state === 'thinking') setState('idle'); };
  document.addEventListener('sprout:close', stopAll);
  document.addEventListener('sprout:minimise', stopAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopAll(); });
  window.addEventListener('pagehide', stopAll);
  document.addEventListener('sprout:open', () => setTimeout(refreshReplay));

  paintPrefs();
  setState('idle');

  window.SproutVoice = {
    supported: { recognition: !!Recognition, synthesis: !!synth },
    state: () => ({ state, listening: !!rec, prefs: { ...prefs } }),
    start: startListening, stop: () => stopListening(), stopSpeaking, speak: t => speak(t, { force: true }), speakable,
  };
})();
