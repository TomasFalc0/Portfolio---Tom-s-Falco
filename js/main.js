import { initStage } from './hero.js?v=6';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

gsap.registerPlugin(ScrollTrigger);
if (!fine) document.documentElement.classList.add('no-fine');

/* ---------- SCROLL SUAVE ---------- */
let lenis = null;
let lastY = scrollY, nativeVel = 0;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
addEventListener('scroll', () => { nativeVel = scrollY - lastY; lastY = scrollY; }, { passive: true });
const velocity = () => (lenis ? lenis.velocity : nativeVel);

function scrollToY(y) {
  if (lenis) lenis.scrollTo(y, { duration: 1.5, easing: t => 1 - Math.pow(1 - t, 4) });
  else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
}
// si la sección está fijada (pin), su inicio real es el del espaciador
const topOf = el => {
  const box = el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
  return box.getBoundingClientRect().top + scrollY;
};
const scrollToEl = el => scrollToY(topOf(el));

$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const t = $(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  scrollToEl(t);
}));

/* ---------- CURSOR ---------- */
const cursor = $('.cursor');
const cursorLabel = $('.cursor-label');
function setCursor(text) {
  cursorLabel.textContent = text || '';
  cursor.classList.toggle('is-label', !!text);
}
if (fine) {
  document.documentElement.classList.add('has-cursor');
  const cx = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' });
  addEventListener('pointermove', e => { cx(e.clientX); cy(e.clientY); });
  $$('[data-cursor]').forEach(el => {
    el.addEventListener('pointerenter', () => setCursor(el.dataset.cursor));
    el.addEventListener('pointerleave', () => setCursor(null));
  });
}

/* ---------- ESCENA 3D ---------- */
const room = $('.room');
const roomOpen = $('[data-room-open]');
let roomEl = null;
const heroStick = $('.hero-stick');

function describe(el) {
  const clip = el.closest('.clip');
  return clip
    ? { title: $('h3', clip).textContent, tag: $('.clip-tag', clip).textContent, action: 'Ver completo' }
    : { title: el.dataset.title, tag: $('figcaption span', el)?.textContent || '', action: 'Ver la pieza' };
}

function selectWork(el) {
  const trigger = $('[data-video]', el);
  if (trigger) openPlayer(trigger.dataset.video, $('h3', el).textContent, trigger);
  else scrollToY(el.getBoundingClientRect().top + scrollY - innerHeight * 0.12);
}

let stage = null;
try {
  stage = initStage({
    canvas: $('.stage3d'),
    grabArea: heroStick,
    reduce,
    fine,
    getVelocity: velocity,
    onHover: title => fine && setCursor(title ? `Ver ${title}` : null),
    onSelect: selectWork,
    onActive: (el, i, total) => {
      roomEl = el;
      if (!el) return;
      const info = describe(el);
      $('[data-room-n]').textContent = i + 1;
      $('[data-room-total]').textContent = total;
      $('[data-room-title]').textContent = info.title;
      $('[data-room-tag]').textContent = info.tag;
      roomOpen.textContent = info.action;
      if (!reduce) {
        gsap.fromTo(['[data-room-title]', '[data-room-tag]'],
          { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out', stagger: 0.05, overwrite: true });
      }
    },
  });
} catch (err) {
  console.warn('WebGL no disponible', err);
  $('.stage3d').remove();
}

roomOpen.addEventListener('click', () => roomEl && selectWork(roomEl));

// sala 360 sólo con 3D funcionando y sin pedido de menos movimiento
const roomOn = !!stage && !reduce;
if (roomOn) {
  document.documentElement.classList.add('room-on');
  room.hidden = false;
  gsap.set(room, { autoAlpha: 0 });
}

if (stage) {
  new IntersectionObserver(([e]) => stage.setHeroVisible(e.isIntersecting)).observe($('.hero'));
  new IntersectionObserver(([e]) => stage.setFinaleVisible(e.isIntersecting)).observe($('.contact'));
  ScrollTrigger.create({
    trigger: '.contact', start: 'top bottom', end: 'top top',
    onUpdate: s => stage.setFinale(s.progress),
  });
}

/* El scroll del inicio va marcando todo: el texto se va, la cámara entra y aparecen los datos de la sala */
const heroContent = $('.hero-content');
const heroFrame = $('.frame');
const heroShade = $('.hero-shade');
const roomShade = $('.room-shade');
const heroHint = $('.hero-hint');
let heroProgress = 0;
function onHeroScroll(p) {
  heroProgress = p;
  stage?.setHero(p);
  if (!roomOn) return;
  const out = smooth(p, 0.02, 0.15);
  gsap.set(heroContent, { y: out * -70, opacity: 1 - out, visibility: out > 0.99 ? 'hidden' : 'visible' });
  gsap.set(heroHint, { opacity: 0.75 * (1 - smooth(p, 0.01, 0.06)) });
  gsap.set(heroShade, { opacity: 1 - smooth(p, 0.04, 0.22) });
  const show = smooth(p, 0.27, 0.32) * (1 - smooth(p, 0.93, 0.965));
  gsap.set(roomShade, { opacity: show });
  gsap.set(room, { autoAlpha: show });
  gsap.set(heroFrame, { opacity: 1 - smooth(p, 0.93, 0.98) });
}
if (roomOn) {
  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom bottom',
    onUpdate: s => onHeroScroll(s.progress),
  });
}

/* ---------- FONDO: las luces acompañan el scroll ---------- */
if (!reduce) {
  [['.orb-1', -30], ['.orb-2', -55], ['.orb-3', -80]].forEach(([sel, y]) => {
    gsap.to(sel, { yPercent: y, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 1.2 } });
  });
}

/* ---------- CINTA: avanza sola, acelera y se inclina con el scroll ---------- */
const marquee = $('.marquee-track');
if (marquee && !reduce) {
  const loop = gsap.to(marquee, { xPercent: -50, duration: 36, ease: 'none', repeat: -1 });
  const skew = gsap.quickSetter(marquee, 'skewX', 'deg');
  let dir = 1, sk = 0;
  gsap.ticker.add(() => {
    const v = velocity();
    if (Math.abs(v) > 0.5) dir = v > 0 ? 1 : -1;
    const target = dir * (1 + Math.min(Math.abs(v) * 0.25, 6));
    loop.timeScale(gsap.utils.interpolate(loop.timeScale(), target, 0.08));
    sk += (gsap.utils.clamp(-9, 9, -v * 0.22) - sk) * 0.12;
    skew(sk);
  });
}

/* ---------- TRABAJOS: la línea de tiempo se recorre con el scroll ---------- */
const track = $('.work-track');
const clips = $$('.clip');
let workST = null;
let wideLayout = false;
const mm = gsap.matchMedia();
mm.add('(min-width: 900px)', () => {
  wideLayout = true;
  const dist = () => Math.max(0, track.offsetWidth - innerWidth);
  const tween = gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      trigger: '.work', start: 'top top', end: () => '+=' + dist(),
      pin: true, scrub: reduce ? true : 0.7, invalidateOnRefresh: true,
    },
  });
  workST = tween.scrollTrigger;
  return () => { workST = null; wideLayout = false; gsap.set(track, { clearProps: 'x' }); };
});

/* cada clip gira según lo lejos que está del cabezal; el que pasa por el cabezal se reproduce */
let liveClip = null;
let workVisible = false;
function setLive(clip) {
  if (clip === liveClip) return;
  if (liveClip) { liveClip.classList.remove('is-live'); $('video', liveClip).pause(); }
  liveClip = clip;
  if (clip) {
    clip.classList.add('is-live');
    if (!reduce && !player.open) $('video', clip).play().catch(() => {});
  }
}
function updateClips() {
  if (!workVisible) return;
  const offset = wideLayout ? gsap.getProperty(track, 'x') : -track.scrollLeft;
  const mid = innerWidth / 2;
  let best = null, bestD = Infinity;
  clips.forEach(clip => {
    const c = clip.offsetLeft + clip.offsetWidth / 2 + offset;
    const d = (c - mid) / (innerWidth * 0.5);
    const a = Math.min(Math.abs(d), 1.3);
    if (Math.abs(c - mid) < bestD) { bestD = Math.abs(c - mid); best = clip; }
    if (!reduce) {
      gsap.set(clip, {
        rotationY: gsap.utils.clamp(-30, 30, -d * 26),
        scale: 1 - a * 0.16,
        opacity: 1 - a * 0.5,
        transformPerspective: 1300,
      });
    }
  });
  setLive(best);
}
gsap.ticker.add(updateClips);
new IntersectionObserver(([e]) => {
  workVisible = e.isIntersecting;
  if (!workVisible) setLive(null);
}, { threshold: 0.2 }).observe($('.work-timeline'));

/* videos: duración en la etiqueta y clic para ver completo */
const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
$$('.clip-media').forEach(btn => {
  const v = $('video', btn);
  const dur = $('.clip-dur', btn);
  const setDur = () => { if (isFinite(v.duration)) dur.textContent = fmt(v.duration); };
  v.addEventListener('loadedmetadata', setDur);
  setDur();
  btn.addEventListener('click', () => openPlayer(btn.dataset.video, btn.closest('.clip').querySelector('h3').textContent, btn));
});
// los videos recién piden datos cuando la sección está por aparecer
new IntersectionObserver(([e], obs) => {
  if (!e.isIntersecting) return;
  $$('.clip-media video').forEach(v => { v.preload = 'metadata'; v.load(); });
  obs.disconnect();
}, { rootMargin: '0px 0px 600px 0px' }).observe($('.work'));

/* ---------- REPRODUCTOR: se abre desde donde tocaste ---------- */
const player = $('.player');
const pVideo = $('video', player);
const pInner = $('.player-inner', player);
function openPlayer(src, title, origin) {
  $$('.clip-media video').forEach(v => v.pause());
  stage?.setPaused(true);
  pVideo.src = src;
  $('.player-title', player).textContent = title;
  player.showModal();
  lenis?.stop();
  pVideo.play().catch(() => {});
  if (!reduce) {
    const from = origin?.getBoundingClientRect();
    const to = pInner.getBoundingClientRect();
    const dx = from ? (from.left + from.width / 2) - (to.left + to.width / 2) : 0;
    const dy = from ? (from.top + from.height / 2) - (to.top + to.height / 2) : 0;
    gsap.fromTo(pInner, { x: dx * 0.5, y: dy * 0.5, scale: 0.82, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.7, ease: 'expo.out' });
  }
}
player.addEventListener('close', () => {
  pVideo.pause();
  pVideo.removeAttribute('src');
  pVideo.load();
  lenis?.start();
  stage?.setPaused(false);
  if (liveClip && !reduce) $('video', liveClip).play().catch(() => {});
});
$('.player-close').addEventListener('click', () => player.close());
player.addEventListener('click', e => { if (e.target === player) player.close(); });

/* ---------- PRECIOS: PESOS O DÓLARES ---------- */
// Cada precio trae sus dos valores en el HTML: data-usd y data-ars.
// Quien entra desde Argentina los ve en pesos de entrada. La elección queda guardada.
const servicios = $('#servicios');
const curBtns = $$('[data-cur]', servicios);
const curBox = $('.currency-btns', servicios);
const curThumb = document.createElement('span');
curThumb.className = 'currency-thumb';
curBox.prepend(curThumb);
const dotted = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function moveCurThumb(btn, animate) {
  const props = { x: btn.offsetLeft, width: btn.offsetWidth };
  if (animate && !reduce) gsap.to(curThumb, { ...props, duration: 0.55, ease: 'expo.out' });
  else gsap.set(curThumb, props);
}
function setCurrency(cur, animate = true) {
  const ars = cur === 'ARS';
  curBtns.forEach(b => {
    const on = b.dataset.cur === cur;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on);
    if (on) moveCurThumb(b, animate);
  });
  $$('.service-price .cur', servicios).forEach(el => { el.textContent = ars ? '$' : 'USD'; });
  $$('strong[data-usd]', servicios).forEach(el => {
    const to = +(ars ? el.dataset.ars : el.dataset.usd);
    if (!animate || reduce) { el.textContent = dotted(to); return; }
    const from = { v: Number(el.textContent.replace(/\./g, '')) || 0 };
    el.tween?.kill(); // si tocan rápido los dos botones, gana el último
    el.tween = gsap.to(from, { v: to, duration: 0.7, ease: 'power3.out', onUpdate: () => { el.textContent = dotted(from.v); } });
  });
  $$('span[data-usd]', servicios).forEach(el => {
    el.textContent = ars ? `$ ${dotted(+el.dataset.ars)}` : `USD ${el.dataset.usd}`;
  });
  const note = $('.note-main', servicios);
  note.textContent = ars ? note.dataset.noteArs : note.dataset.noteUsd;
}
function savedCurrency() {
  try { return localStorage.getItem('rame-moneda'); } catch { return null; }
}
curBtns.forEach(b => b.addEventListener('click', () => {
  setCurrency(b.dataset.cur);
  try { localStorage.setItem('rame-moneda', b.dataset.cur); } catch { /* sin guardar */ }
}));
const argTz = /^America\/(Argentina\/|Buenos_Aires|Catamarca|Cordoba|Jujuy|Mendoza|Rosario)/;
const inArgentina = argTz.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '') || (navigator.languages || []).includes('es-AR');
setCurrency(savedCurrency() || (inArgentina ? 'ARS' : 'USD'), false);
const placeCurThumb = () => moveCurThumb($('.is-on', curBox), false);
document.fonts?.ready.then(placeCurThumb);
addEventListener('resize', placeCurThumb);

/* ---------- MOUSE: inclinación 3D, brillo e imán ---------- */
if (fine && !reduce) {
  $$('.service, .piece-img').forEach(el => {
    const max = el.classList.contains('service') ? 4 : 5;
    gsap.set(el, { transformPerspective: 1100 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      ry((x - 0.5) * max * 2);
      rx((0.5 - y) * max * 2);
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
  $$('[data-magnet]').forEach(el => {
    const mx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1,.5)' });
    const my = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1,.5)' });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - r.left - r.width / 2) * 0.28);
      my((e.clientY - r.top - r.height / 2) * 0.28);
    });
    el.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
}

/* ---------- APARICIONES AL BAJAR ---------- */
function wrapWords(el, inner) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  words.forEach((word, i) => {
    const out = document.createElement('span');
    if (inner) {
      out.className = 'w';
      const s = document.createElement('span');
      s.textContent = word;
      out.append(s);
    } else out.textContent = word;
    el.append(out, i < words.length - 1 ? ' ' : '');
  });
}

if (!reduce) {
  // títulos: palabra por palabra
  $$('.reveal-title').forEach(title => {
    [...title.children].forEach(line => wrapWords(line, true));
    gsap.from($$('.w > span', title), {
      yPercent: 115, duration: 1.2, ease: 'expo.out', stagger: 0.05,
      scrollTrigger: { trigger: title, start: 'top 88%' },
    });
  });

  // textos y tarjetas: aparecen sin saltar, sólo con opacidad
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    onEnter: els => gsap.to(els, { opacity: 1, duration: 1, ease: 'power2.out', stagger: 0.09, overwrite: 'auto' }),
  });

  // imágenes: barrido como un corte de edición, con su línea
  $$('.piece-img, .about-photo').forEach(el => {
    const line = document.createElement('span');
    line.className = 'wipe-line';
    line.setAttribute('aria-hidden', 'true');
    el.parentElement.append(line);
    const place = () => gsap.set(line, { height: el.offsetHeight, top: el.offsetTop, left: el.offsetLeft });
    place();
    const state = { p: 0 };
    gsap.set(el, { clipPath: 'inset(0% 100% 0% 0% round 22px)' });
    gsap.set(line, { opacity: 0 });
    gsap.to(state, {
      p: 1, duration: 1.35, ease: 'power3.inOut',
      scrollTrigger: { trigger: el.parentElement, start: 'top 80%', onEnter: () => { place(); gsap.set(line, { opacity: 1 }); } },
      onUpdate: () => {
        el.style.clipPath = `inset(0% ${(1 - state.p) * 100}% 0% 0% round 22px)`;
        gsap.set(line, { x: el.offsetWidth * state.p });
      },
      onComplete: () => { el.style.clipPath = ''; line.remove(); },
    });
    gsap.fromTo($('img', el), { yPercent: -14 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // la frase de "sobre mí" se va encendiendo a medida que la leés
  const lead = $('.about-lead');
  wrapWords(lead, false);
  gsap.fromTo([...lead.children], { opacity: 0.22 }, {
    opacity: 1, stagger: 0.1, ease: 'none',
    scrollTrigger: { trigger: lead, start: 'top 82%', end: 'bottom 52%', scrub: 0.6 },
  });
}

/* proceso: la barra recorre los pasos */
const steps = $$('.steps li');
const lightSteps = p => steps.forEach((li, i) => li.classList.toggle('is-on', p >= i / steps.length + 0.02));
mm.add({ wide: '(min-width: 821px)', narrow: '(max-width: 820px)' }, ctx => {
  const prop = ctx.conditions.wide ? 'scaleX' : 'scaleY';
  gsap.fromTo('.process-head', { [prop]: 0 }, {
    [prop]: 1, ease: 'none',
    scrollTrigger: {
      trigger: '.process-track', start: 'top 78%', end: ctx.conditions.wide ? 'top 30%' : 'bottom 60%',
      scrub: true, onUpdate: s => lightSteps(s.progress),
    },
  });
});

/* ---------- MENÚ: marca la sección en la que estás ---------- */
const navLinks = $$('[data-nav]');
navLinks.forEach(a => {
  const sec = $('#' + a.dataset.nav);
  ScrollTrigger.create({
    trigger: sec, start: 'top 55%', end: 'bottom 55%',
    onToggle: s => a.classList.toggle('is-active', s.isActive),
  });
});

/* ---------- TOPBAR Y WHATSAPP FLOTANTE ---------- */
const topbar = $('.topbar');
const wa = $('.wa-float');
let prevY = 0;
addEventListener('scroll', () => {
  const y = scrollY;
  topbar.classList.toggle('is-scrolled', y > 40);
  topbar.classList.toggle('is-hidden', y > innerHeight * 0.8 && y > prevY + 2 && !player.open);
  if (y < prevY - 2) topbar.classList.remove('is-hidden');
  const contactTop = $('#contacto').getBoundingClientRect().top;
  const inRoom = roomOn && y > innerHeight * 0.3 && y < topOf($('.marquee'));
  wa.classList.toggle('is-hidden', y < innerHeight * 0.6 || contactTop < innerHeight * 0.8 || inRoom);
  prevY = y;
}, { passive: true });
wa.classList.add('is-hidden');

/* ---------- RELOJ ---------- */
const clockEl = $('.clock');
const timeFmt = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const tick = () => { clockEl.textContent = timeFmt.format(new Date()); };
tick(); setInterval(tick, 30000);

/* ---------- ENTRADA ---------- */
const loader = $('.loader');
async function enter() {
  if (reduce) {
    loader.remove();
    document.body.classList.remove('is-loading');
    ScrollTrigger.refresh();
    return;
  }
  const bar = gsap.to('.loader-bar span', { scaleX: 1, duration: 1.2, ease: 'power2.inOut' });
  // espera texturas y fuentes, pero nunca más de ~1,5 s después de la barra
  const assets = Promise.all([stage?.ready, document.fonts?.ready]);
  await bar.then();
  await Promise.race([assets, new Promise(r => setTimeout(r, 1500))]);

  document.body.classList.remove('is-loading');
  lenis?.start();
  ScrollTrigger.refresh();

  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .to(loader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut' })
    .from('.hero-title .line > span', { yPercent: 115, duration: 1.4, stagger: 0.08 }, '-=0.45')
    .to(stage?.intro ?? {}, { v: 1, duration: 2.4, ease: 'power3.out' }, '<-0.2')
    .from('.frame i', { scale: 0.4, opacity: 0, duration: 1.2, stagger: 0.05 }, '<0.2')
    .from(['.hero-status', '.hero-lead', '.hero-ctas', '.topbar', '.hero-hint'], {
      opacity: 0, y: 16, duration: 1, stagger: 0.06, clearProps: 'opacity,transform',
    }, '<0.3')
    .add(() => { loader.remove(); onHeroScroll(heroProgress); });
}
enter();
