import * as THREE from 'three';
import { createGT3Scene } from './scene.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Car convention: X = width (left/right), Z = length (+ front / - rear), Y = height.
const SECTIONS = [
  { id: 'hero', pos: [9.2, 1.5, -0.8], look: [0, 0.72, 0.1] },
  { id: 'engine', pos: [2.6, 1.3, -4.2], look: [0, 0.85, -1.6] },
  { id: 'performance', pos: [4.76, 1.5, 5.21], look: [0, 0.65, 1.3] },
  { id: 'brakes', pos: [-2.4, 0.62, 2.4], look: [-0.91, 0.4, 1.14] },
  { id: 'wheels', pos: [-3.46, 1.22, 3.14], look: [-0.5, 0.5, 0.9] },
  { id: 'wing', pos: [0.6, 2.15, -4.6], look: [0.1, 1.2, -1.4] },
  { id: 'aero', pos: [0.05, 4.6, 0.0], look: [0, 0, 0] },
  { id: 'lightweight', pos: [4.07, 1.52, -1.24], look: [0.3, 0.8, -0.2] },
  { id: 'colors', pos: [3.4, 1.1, 1.0], look: [0.1, 0.7, 0.3] },
  { id: 'specs', pos: [5.8, 1.5, -1.2], look: [0.1, 0.78, -0.2] },
  { id: 'final', pos: [9.2, 1.5, -0.8], look: [0, 0.72, 0.1] },
];

const canvas = document.getElementById('webgl');
const gt3 = createGT3Scene(canvas);

const positionCurve = new THREE.CatmullRomCurve3(SECTIONS.map((s) => new THREE.Vector3(...s.pos)), false, 'catmullrom', 0.5);
const lookCurve = new THREE.CatmullRomCurve3(SECTIONS.map((s) => new THREE.Vector3(...s.look)), false, 'catmullrom', 0.5);

let boundaries = SECTIONS.map((_, i) => i / (SECTIONS.length - 1));

function recomputeBoundaries() {
  const els = SECTIONS.map((s) => document.getElementById(s.id));
  const total = document.getElementById('scroll-container').offsetHeight;
  if (!total) return;
  boundaries = els.map((el, i) => {
    if (i === 0) return 0;
    if (i === els.length - 1) return 1;
    const mid = el.offsetTop + el.offsetHeight / 2;
    return THREE.MathUtils.clamp(mid / total, 0, 1);
  });
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) boundaries[i] = boundaries[i - 1] + 0.0001;
  }
}

function curveParamFor(p) {
  const n = boundaries.length;
  let i = 0;
  while (i < n - 2 && p > boundaries[i + 1]) i++;
  const t0 = boundaries[i];
  const t1 = boundaries[i + 1];
  const u = t1 > t0 ? (p - t0) / (t1 - t0) : 0;
  return (i + THREE.MathUtils.clamp(u, 0, 1)) / (n - 1);
}

const lookTarget = new THREE.Vector3();
function applyProgress(p) {
  const u = curveParamFor(THREE.MathUtils.clamp(p, 0, 1));
  positionCurve.getPoint(u, gt3.camera.position);
  lookCurve.getPoint(u, lookTarget);
  gt3.camera.lookAt(lookTarget);
}
applyProgress(0);

// --- Preloader ---
const fillEl = document.getElementById('preload-fill');
const pctEl = document.getElementById('preload-pct');
const preloaderEl = document.getElementById('preloader');
document.documentElement.classList.add('is-loading');

gt3
  .load('assets/car.glb', (ratio) => {
    const pct = Math.round(ratio * 100);
    fillEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';
  })
  .then(() => {
    fillEl.style.width = '100%';
    pctEl.textContent = '100%';
    setTimeout(() => {
      preloaderEl.classList.add('is-hidden');
      document.documentElement.classList.remove('is-loading');
      startExperience();
    }, 350);
  })
  .catch((err) => {
    console.error('Model failed to load', err);
    pctEl.textContent = 'Erreur de chargement';
  });

let lenis = null;

function startExperience() {
  recomputeBoundaries();

  lenis = new Lenis({
    duration: REDUCED ? 0 : 1.1,
    smoothWheel: !REDUCED,
    syncTouch: false,
  });
  window.__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  ScrollTrigger.create({
    trigger: '#scroll-container',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => applyProgress(self.progress),
  });

  ScrollTrigger.create({
    trigger: '#wing',
    start: 'top bottom',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => gt3.setWingFlap(self.progress),
  });

  const carbonItems = Array.from(document.querySelectorAll('#carbon-list li'));
  ScrollTrigger.create({
    trigger: '#lightweight',
    start: 'top 75%',
    end: 'bottom 35%',
    scrub: true,
    onUpdate: (self) => {
      gt3.setCarbonReveal(self.progress);
      const activeCount = Math.floor(self.progress * carbonItems.length + 0.0001);
      carbonItems.forEach((li, i) => li.classList.toggle('active', i < activeCount));
    },
  });

  setupPinLabels('brake-pins', 'brakes');
  setupPinLabels('wing-pins', 'wing');
  setupMaskReveal();
  setupCounters();
  setupSpecsTable();
  setupSwatches();
  setupAutoplay();
  setupSectionDots();
  setupIdleRotation();
  setupScrollWheelSpin();

  ScrollTrigger.refresh();

  window.addEventListener(
    'resize',
    debounce(() => {
      recomputeBoundaries();
      ScrollTrigger.refresh();
    }, 250)
  );
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function setupPinLabels(containerId, sectionId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const pins = Array.from(container.querySelectorAll('.pin-label'));

  ScrollTrigger.create({
    trigger: `#${sectionId}`,
    start: 'top 60%',
    end: 'bottom 40%',
    onEnter: () => container.classList.add('visible'),
    onEnterBack: () => container.classList.add('visible'),
    onLeave: () => container.classList.remove('visible'),
    onLeaveBack: () => container.classList.remove('visible'),
  });

  function update() {
    requestAnimationFrame(update);
    if (!container.classList.contains('visible')) return;
    pins.forEach((pin) => {
      const name = pin.dataset.anchor;
      const world = gt3.worldPointOf(name);
      if (!world) return;
      const { x, y } = gt3.projectToScreen(world);
      const offset = pin.dataset.offset === 'down' ? 46 : pin.dataset.offset === 'up' ? -46 : 0;
      pin.style.transform = `translate3d(${x}px, ${y + offset}px, 0)`;
    });
  }
  requestAnimationFrame(update);
}

function setupMaskReveal() {
  const targets = document.querySelectorAll('.mask-lines');
  targets.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => el.classList.add('in-view'),
    });
  });
}

function setupCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const to = parseFloat(el.dataset.to);
        const decimals = parseInt(el.dataset.decimals || '0', 10);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: to,
          duration: REDUCED ? 0 : 1.6,
          ease: 'power2.out',
          onUpdate: () => (el.textContent = obj.v.toFixed(decimals)),
        });
        io.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  counters.forEach((el) => io.observe(el));
}

function setupSpecsTable() {
  const rows = document.querySelectorAll('#specs-table tbody tr');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const allRows = Array.from(rows);
        allRows.forEach((row, i) => {
          gsap.to(row, { opacity: 1, x: 0, duration: 0.5, delay: REDUCED ? 0 : i * 0.08, ease: 'power2.out' });
        });
        io.disconnect();
      });
    },
    { threshold: 0.2 }
  );
  if (rows.length) io.observe(document.getElementById('specs-table'));
}

function setupSwatches() {
  const paintCurrent = document.getElementById('paint-current');
  document.querySelectorAll('#paint-swatches .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#paint-swatches .swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      gt3.setPaintColor(btn.dataset.color);
      paintCurrent.textContent = btn.dataset.name;
      if (!REDUCED) {
        gsap.to(gt3.carRoot.rotation, { y: gt3.spinCarHalfTurn(), duration: 1.1, ease: 'power2.inOut' });
      }
    });
  });
  document.querySelectorAll('#rim-swatches .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#rim-swatches .swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      gt3.setRimColor(btn.dataset.color);
    });
  });
  const firstPaint = document.querySelector('#paint-swatches .swatch');
  if (firstPaint) firstPaint.classList.add('active');
  const firstRim = document.querySelector('#rim-swatches .swatch');
  if (firstRim) firstRim.classList.add('active');
}

function setupAutoplay() {
  const btn = document.getElementById('autoplay-btn');
  if (REDUCED) {
    btn.style.display = 'none';
    return;
  }
  let playing = false;
  let rafId = null;

  function step() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const current = window.scrollY;
    if (current >= max - 2) {
      stop();
      return;
    }
    lenis.scrollTo(current + max * 0.00045, { immediate: true });
    rafId = requestAnimationFrame(step);
  }
  function start() {
    playing = true;
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    rafId = requestAnimationFrame(step);
  }
  function stop() {
    playing = false;
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    if (rafId) cancelAnimationFrame(rafId);
  }
  btn.addEventListener('click', () => (playing ? stop() : start()));
  ['wheel', 'touchstart'].forEach((evt) => window.addEventListener(evt, () => playing && stop(), { passive: true }));
}

function setupSectionDots() {
  const nav = document.getElementById('section-dots');
  SECTIONS.forEach((s) => {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.setAttribute('aria-label', s.id);
    dot.addEventListener('click', () => {
      const el = document.getElementById(s.id);
      lenis.scrollTo(el, { duration: REDUCED ? 0 : 1.2 });
    });
    nav.appendChild(dot);
  });
  const dots = Array.from(nav.children);
  ScrollTrigger.create({
    trigger: '#scroll-container',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      const idx = Math.round(curveParamFor(self.progress) * (SECTIONS.length - 1));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    },
  });
}

function setupIdleRotation() {
  if (REDUCED) return;
  let t = 0;
  function tick() {
    requestAnimationFrame(tick);
    const activeId = document.documentElement.dataset.activeSection;
    if (activeId === 'hero' || activeId === 'final') {
      t += 0.0035;
      gt3.carRoot.rotation.y += Math.sin(t) * 0.00015;
    }
  }
  requestAnimationFrame(tick);

  ScrollTrigger.create({
    trigger: '#scroll-container',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      const idx = Math.round(curveParamFor(self.progress) * (SECTIONS.length - 1));
      document.documentElement.dataset.activeSection = SECTIONS[idx].id;
    },
  });
}

function setupScrollWheelSpin() {
  let lastY = window.scrollY;
  gsap.ticker.add(() => {
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    if (delta !== 0) gt3.spinWheels(delta * 0.01);
  });
}
