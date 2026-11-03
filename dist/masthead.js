/* Masthead logo — the joindime.in technique, adapted for Satvic.
 *
 * Like Dime, scroll position only flips a class: within 25px of the top of the meal-plan page
 * the nav logo is large and centred in a band above the hero (`body.masthead-hero`); past 25px
 * the class comes off and a 0.6s CSS transition carries it back to the top-left of the nav pill.
 * Scrolling back to the top reverses it. No per-scroll animation work.
 *
 * Two Satvic-specific additions:
 *  - An arc instead of a straight line. Satvic's nav links sit in the middle of the pill, so the
 *    horizontal and vertical moves have different timing (see CSS): docking slides left first and
 *    rises late; returning drops first and centres late. It enters the pill at the empty logo slot.
 *  - Two-tone ink. The logo is drawn twice (cream and green) and split at the pill's bottom edge,
 *    so the part over the green pill is cream and the part over the cream page is green. The split
 *    line is updated only while a transition is running.
 *
 * The logo stays one link (the green copy is aria-hidden). Off the home page, while the mobile menu
 * is open, or under reduced motion (no transition, an instant swap), it behaves as before.
 */
(() => {
  'use strict';
  const bar = document.querySelector('.sidebar');
  const brand = bar?.querySelector('.brand');
  if (!brand) return;
  const THRESHOLD = 25;                       // px of scroll, as on Dime
  const DURATION = 600;                       // matches the CSS transition

  // Structure: a.brand (moves left/right) > .brand-move (moves up/down, scales) > two ink copies.
  const move = document.createElement('div');
  move.className = 'brand-move';
  const light = document.createElement('div');
  light.className = 'brand-ink brand-ink--light';
  while (brand.firstChild) light.appendChild(brand.firstChild);
  const dark = light.cloneNode(true);
  dark.className = 'brand-ink brand-ink--dark';
  dark.setAttribute('aria-hidden', 'true');
  move.append(light, dark);
  brand.appendChild(move);

  let geo = null, cutUntil = 0, cutRaf = 0;

  // Resting geometry of the visible logo (leaf to end of wordmark), measured with all motion off.
  function measure() {
    const saved = [brand.style.cssText, move.style.cssText];
    brand.style.transition = move.style.transition = 'none';
    brand.style.translate = move.style.translate = move.style.scale = 'none';
    const p = bar.getBoundingClientRect();
    const parts = [...light.querySelectorAll('.brand-icon, b, small')].map(e => e.getBoundingClientRect());
    const l = light.getBoundingClientRect(), m = move.getBoundingClientRect();
    const left = Math.min(...parts.map(r => r.left)), right = Math.max(...parts.map(r => r.right));
    const top = Math.min(...parts.map(r => r.top)), bottom = Math.max(...parts.map(r => r.bottom));
    geo = { x: left - p.left, y: top - p.top, w: right - left, h: bottom - top, ox: left - m.left, oy: top - m.top, inkH: l.height };
    brand.style.cssText = saved[0]; move.style.cssText = saved[1];
    void brand.offsetWidth;                                  // commit without animating
  }

  // Where the large logo sits: centred in the band, as large as the band and ~60% of the width allow.
  function place() {
    const band = document.querySelector('.masthead-space');
    if (!band) return;
    if (!geo) measure();
    const pillTop = bar.offsetTop, bandTop = band.getBoundingClientRect().top + scrollY;
    const bandH = band.offsetHeight;
    // leave room below the logo so the first scroll pixels don't slide the hero under it
    const s = Math.max(1, Math.min(2.4, (bandH - 44) / geo.h, (innerWidth * 0.62) / geo.w));
    const restX = bar.getBoundingClientRect().left + geo.x, restY = pillTop + geo.y;
    brand.style.setProperty('--hero-x', `${((innerWidth - geo.w * s) / 2 - restX).toFixed(2)}px`);
    brand.style.setProperty('--hero-y', `${(bandTop + (bandH - geo.h * s) / 2 - Math.min(14, bandH * .1) - restY).toFixed(2)}px`);
    brand.style.setProperty('--hero-s', s.toFixed(4));
    move.style.transformOrigin = `${geo.ox}px ${geo.oy}px`;
  }

  // Split line between the cream and green copies, in the logo's own (unscaled) pixels.
  function updateCut() {
    if (!geo || !document.body.classList.contains('has-masthead')) return;   // left the home page mid-transition
    const p = bar.getBoundingClientRect(), r = light.getBoundingClientRect();
    const scale = r.height / geo.inkH || 1;
    brand.style.setProperty('--brand-cut', `${((p.bottom - r.top) / scale).toFixed(2)}px`);
  }
  function trackCut() {
    cutUntil = performance.now() + DURATION + 80;
    if (cutRaf) return;
    const loop = () => { updateCut(); cutRaf = performance.now() < cutUntil ? requestAnimationFrame(loop) : 0; };
    cutRaf = requestAnimationFrame(loop);
  }

  function update(remeasure) {
    const band = document.querySelector('.masthead-space');
    const active = !!band && !bar.classList.contains('open');
    const wasHero = document.body.classList.contains('masthead-hero');
    if (remeasure) geo = null;
    if (active && (remeasure || !geo)) place();
    document.body.classList.toggle('has-masthead', active);
    const hero = active && scrollY <= THRESHOLD;
    document.body.classList.toggle('masthead-hero', hero);
    if (!geo) return;
    if (hero !== wasHero || remeasure) trackCut(); else if (active) updateCut();
  }

  addEventListener('scroll', () => update(false), { passive: true });
  addEventListener('resize', () => update(true));
  document.addEventListener('kitchen:render', () => update(true));
  document.fonts?.ready.then(() => update(true));
  new MutationObserver(() => update(false)).observe(bar, { attributes: true, attributeFilter: ['class'] });  // mobile menu
  // First paint: appear in place, as Dime's does, rather than animating in.
  document.body.classList.add('masthead-instant');
  update(true);
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('masthead-instant')));
})();
