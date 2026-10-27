/* digiovanni.dev — page behaviour.
   Classic script (no modules) so the page also works when opened from disk.
   Owns the shared `window.ocean` state that js/water.js and js/life.js read
   every frame; they subscribe to be woken when anything visual changes. */
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const EMAIL = 'av@digiovanni.dev';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const ocean = window.ocean = {
    depth: 0,
    top: [0, 0, 0],
    bottom: [0, 0, 0],
    night: root.dataset.theme === 'dark',
    paused: reducedMotion.matches, // still scene for visitors who ask their device for less motion
    pointer: { x: -1e4, y: -1e4, energy: 0 },
    waterReady: false,
    listeners: new Set(),
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  };
  const notify = () => { for (const fn of ocean.listeners) fn(); };

  /* DEPTH ------------------------------------------------------------------
     Scroll position maps to meters through anchors at each section's center:
     the work sits in sunlit water, the approach in the twilight zone, contact
     in the midnight zone, and the page ends on the sea floor. */
  const DEPTHS = [['#work', 90], ['#approach', 650], ['#contact', 2200]];
  const palette = [ // meters, top color, bottom color
    [0, '#1b86b0', '#0a4a6c'],
    [80, '#13739c', '#08405f'],
    [200, '#0b4d72', '#062e4b'],
    [600, '#062e4c', '#031a30'],
    [1000, '#03172b', '#020c1a'],
    [2500, '#010a14', '#01050b'],
    [4000, '#000306', '#000102'],
    [5000, '#000000', '#000000'],
  ].map(([m, a, b]) => [m, hex(a), hex(b)]);
  let anchors = [];

  function hex(value) { const n = parseInt(value.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const pageY = el => el.getBoundingClientRect().top + scrollY;
  const maxScroll = () => Math.max(1, root.scrollHeight - innerHeight);

  let waterline = 0;
  function measure() {
    const mid = el => pageY(el) + el.offsetHeight / 2 - innerHeight / 2;
    anchors = [[0, 0], ...DEPTHS.map(([id, m]) => [mid($(id)), m]), [maxScroll(), 5000]];
    anchors.sort((a, b) => a[0] - b[0]);
    waterline = pageY(heroAbove) + heroAbove.offsetHeight;
    measureNav();
  }

  function depthAt(y) {
    for (let i = 1; i < anchors.length; i++) {
      const [y0, m0] = anchors[i - 1], [y1, m1] = anchors[i];
      if (y <= y1) return m0 + (m1 - m0) * Math.min(1, Math.max(0, (y - y0) / Math.max(1, y1 - y0)));
    }
    return anchors.length ? anchors[anchors.length - 1][1] : 0;
  }

  function colorsAt(m) {
    let i = 1;
    while (i < palette.length - 1 && m > palette[i][0]) i++;
    const [m0, t0, b0] = palette[i - 1], [m1, t1, b1] = palette[i];
    const k = Math.min(1, Math.max(0, (m - m0) / (m1 - m0)));
    // Night dims only the sunlit water; deeper down it is dark either way.
    const dim = ocean.night ? 1 - .5 * (1 - Math.min(1, m / 400)) : 1;
    const mix = (a, b) => a.map((v, j) => (v + (b[j] - v) * k) * dim);
    return [mix(t0, t1), mix(b0, b1)];
  }

  /* ACTIVE NAV ------------------------------------------------------------
     Derived from the scroll position on every update, so even a long fling or
     a jump straight to the bottom leaves the right link highlighted. */
  const navLinks = $$('[data-nav]');
  let navStops = [], lastNav = null;
  function measureNav() { navStops = navLinks.map(link => [pageY(document.getElementById(link.dataset.nav)), link]); }
  function updateNav() {
    const mid = scrollY + innerHeight * .5;
    let current = null;
    for (const [top, link] of navStops) if (top <= mid) current = link;
    if (current === lastNav) return;
    lastNav = current;
    for (const link of navLinks) {
      if (link === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  const css = rgb => `rgb(${rgb.map(Math.round).join(' ')})`;
  const coast = $('.coast');
  const heroAbove = $('.hero__above');
  let surfaceRGB = [44, 141, 182];

  function update() {
    queued = false;
    const m = depthAt(scrollY);
    ocean.depth = m;
    [ocean.top, ocean.bottom] = colorsAt(m);
    // Until WebGL takes over, the CSS gradient is the sea.
    if (!ocean.waterReady) {
      root.style.setProperty('--sea-top', css(ocean.top));
      root.style.setProperty('--sea-bottom', css(ocean.bottom));
    }

    // The surface swells are drawn as water; keep their color matched to the sea
    // right at the waterline (the sea is a vertical gradient that shifts with depth).
    const surfaceY = waterline - scrollY;
    ocean.waterlineY = surfaceY;
    if (surfaceY > -60 && surfaceY < innerHeight + 60) {
      const k = Math.min(1, Math.max(0, surfaceY / innerHeight));
      surfaceRGB = ocean.top.map((v, i) => v + (ocean.bottom[i] - v) * k);
      heroAbove.style.setProperty('--surface-water', css(surfaceRGB));
    }

    // Coastline parallax, only while the surface is in view and motion is welcome.
    if (coast && scrollY < innerHeight * 1.5 && !reducedMotion.matches) coast.style.setProperty('--sy', Math.round(scrollY));

    updateNav();
    notify();
  }

  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => { measure(); queue(); }, { passive: true });
  new ResizeObserver(() => { measure(); queue(); }).observe($('main'));
  measure();
  update();

  /* REVEALS & OFF-SCREEN PAUSING ------------------------------------------- */
  // Content is only hidden for the reveal once this script is running.
  root.classList.add('reveal-on');
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); revealObserver.unobserve(entry.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
  for (const el of $$('.reveal')) revealObserver.observe(el);

  const idleObserver = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.classList.toggle('is-idle', !entry.isIntersecting);
  }, { rootMargin: '15% 0px' });
  for (const el of $$('.hero, .section, .abyss')) idleObserver.observe(el);

  /* SWIPE ROWS (phones/tablets) ------------------------------------------- */
  // Dots under each swipeable row show where you are and jump to a card.
  for (const row of $$('[data-carousel]')) {
    const dots = $(`[data-dots-for="${row.closest('section').id}"]`);
    if (!dots) continue;
    const items = [...row.children];
    const label = row.getAttribute('aria-label') === 'Projects' ? 'project' : 'service';
    dots.hidden = false;
    const buttons = items.map((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Show ${label} ${i + 1} of ${items.length}`);
      b.addEventListener('click', () => row.scrollTo({ left: item.offsetLeft - row.offsetLeft - parseFloat(getComputedStyle(row).paddingLeft), behavior: reducedMotion.matches ? 'auto' : 'smooth' }));
      dots.append(b);
      return b;
    });
    let pending = false;
    const mark = () => {
      pending = false;
      const center = row.scrollLeft + row.clientWidth / 2;
      let active = 0, best = Infinity;
      items.forEach((item, i) => {
        const d = Math.abs(item.offsetLeft - row.offsetLeft + item.offsetWidth / 2 - center);
        if (d < best) { best = d; active = i; }
      });
      if (row.scrollLeft + row.clientWidth >= row.scrollWidth - 2) active = items.length - 1;
      buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === active)));
    };
    row.addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(mark); } }, { passive: true });
    mark();
  }

  /* THEME ------------------------------------------------------------------ */
  const themeToggle = $('#theme-toggle');
  let themeChosen = false;
  try { themeChosen = ['dark', 'light'].includes(localStorage.getItem('portfolio-theme')); } catch {}
  function applyTheme(night) {
    root.dataset.theme = night ? 'dark' : 'light';
    themeToggle.setAttribute('aria-checked', String(night));
    ocean.night = night;
    update();
  }
  themeToggle.addEventListener('click', () => {
    const night = root.dataset.theme !== 'dark';
    themeChosen = true;
    try { localStorage.setItem('portfolio-theme', night ? 'dark' : 'light'); } catch {}
    applyTheme(night);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { if (!themeChosen) applyTheme(e.matches); });
  themeToggle.setAttribute('aria-checked', String(ocean.night));

  /* REDUCED MOTION ---------------------------------------------------------- */
  reducedMotion.addEventListener('change', () => { ocean.paused = reducedMotion.matches; notify(); });

  /* SURFACE WAVES & DOLPHINS ------------------------------------------------
     The waterline is drawn live on a canvas. Six wave trains of different
     lengths travel at different speeds, some left and some right, and each one
     swells and fades in slow groups, the way sets of waves arrive; phases are
     random per visit, so the surface never repeats. The water is painted with
     the sea's actual color sampled just below the waterline (js/water.js), so it
     is seamless; tall crests catch more light and the tallest break into small
     whitecaps; by day, glints sparkle under the sun. Now and then a small pod of
     dolphins leaps out of the water and dives back in. Runs only on screen. */
  (function surfaceWaves() {
    const holder = $('.surface');
    const canvas = $('.surface__canvas');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    // Canvas geometry (CSS px): its top sits 140px above the bottom of the
    // headline's first line, leaving headroom for leaps. Calm water (REST) lies
    // 4px below that line, just above where the sky ends; the water is solid to
    // SOLID and fades into the sea by CLEAR.
    const H = 176, REST = 144, SOLID = 148, CLEAR = 160;
    const r = () => Math.random();
    // [wavelength, height, speed] in px and px/s; negative speeds travel left.
    const trains = [[440, 9, 18], [270, 8, -13], [180, 6.5, 28], [115, 4.5, -21], [72, 2.8, 35], [46, 1.5, -26]]
      .map(([length, height, speed]) => ({ length, height, speed, phase: r() * 6.283, group: .1 + r() * .14, spread: .002 + r() * .004, groupPhase: r() * 6.283 }));
    const glints = Array.from({ length: 36 }, () => ({ x: (r() + r() + r() - 1.5) * 170, depth: 2 + r() * 10, phase: r() * 6.283, speed: 1.5 + r() * 2.5 }));
    let W = 0, dpr = 1, scale = 1, time = r() * 100, last = 0, running = false, onScreen = true;
    let textRight = 0, lighthouseLeft = 0;

    function heightAt(x, t) {
      let h = 0;
      for (const w of trains) {
        const swell = .5 + .5 * Math.sin(t * w.group + x * w.spread + w.groupPhase);
        h += w.height * swell * Math.pow(1 - Math.abs(Math.sin(Math.PI * (x - w.speed * t) / w.length + w.phase)), 1.5);
      }
      return h * scale;
    }
    const surfaceAt = x => REST - heightAt(x, time);

    /* Dolphins ------------------------------------------------------------ */
    // Bottlenose dolphin in profile, facing +x, about 130 units beak to flukes:
    // rounded melon, short beak, curved dorsal fin set just behind the middle.
    const P = d => new Path2D(d);
    const DOLPHIN = {
      body: P('M60 3C58 1 54 1 50 1C48-3 46-7 40-10C32-14 20-15 6-15C-10-15-26-11-40-5C-46-2-50-1-54 0L-54 2C-50 3-46 4-38 6C-26 10-10 13 8 13C24 13 34 10 42 8C47 7 52 6 56 5C58 5 60 4 60 3Z'),
      fin: P('M12-14C8-20 2-25-10-27C-6-22-6-18-6-14Z'),
      flipper: P('M28 8C26 14 22 18 16 20C17 15 20 11 22 8Z'),
      flukes: P('M-52 1-66-7Q-72-7-70-3L-64 1-70 5Q-72 9-66 8Z'),
      mouth: P('M59 3.4 49 4.2'),
    };
    let pods = [], drops = [], nextPod = 3 + r() * 5;

    function launchPod() {
      const size = W < 600 ? .7 : 1.05;
      const dir = r() < .5 ? 1 : -1;
      const span = (150 + r() * 80) * size * 1.5;
      // Leap in open water by the hazy coastline, where a dark dolphin stands
      // out: left of the lighthouse rock, and mostly clear of the headline.
      const hi = lighthouseLeft - span - 10;
      const lo = Math.max(16, Math.min(textRight - 240, hi));
      const start = Math.max(8, lo + r() * Math.max(0, hi - lo));
      const count = 1 + (r() * 3 | 0);
      for (let i = 0; i < count; i++) {
        pods.push({
          x0: dir > 0 ? start + i * 26 * size : start + span - i * 26 * size,
          dir, span: span * (.9 + r() * .2), height: (44 + r() * 30) * size * 1.3, size: size * (.85 + r() * .25),
          duration: 1.5 + r() * .5, t: -i * .32 - .2, splashedOut: false, splashedIn: false,
        });
      }
    }
    function splash(x, power) {
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (r() - .5) * 1.6;
        const v = (60 + r() * 90) * power;
        drops.push({ x, y: surfaceAt(x), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: .5 + r() * .4, r: 1 + r() * 1.6 });
      }
      drops.push({ ring: true, x, life: 0, max: .9, w: 10 * power });
    }
    function stepDolphins(dt) {
      nextPod -= dt;
      if (nextPod <= 0 && !reducedMotion.matches) { launchPod(); nextPod = 8 + r() * 8; }
      for (const d of pods) d.t += dt;
      pods = pods.filter(d => d.t < d.duration + .4);
      for (const p of drops) {
        p.life += dt;
        if (!p.ring) { p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      }
      drops = drops.filter(p => p.life < p.max);
    }
    function drawDolphins(night) {
      const body = night ? '#22394a' : '#3d5b6e', belly = night ? '#5c7686' : '#a9bcc6';
      for (const d of pods) {
        if (d.t < 0) continue;
        // Arc from below the surface, through the air, and back under: u runs
        // a little past 0 and 1 so the dolphin starts and ends submerged.
        const u = -.12 + (d.t / d.duration) * 1.24;
        const x = d.dir > 0 ? d.x0 + d.span * u : d.x0 + d.span * (1 - u);
        const y = REST - d.height * 4 * u * (1 - u);
        const angle = Math.atan2(-d.height * 4 * (1 - 2 * u), d.span) * d.dir;
        if (!d.splashedOut && u > .02) { d.splashedOut = true; splash(x, d.size); }
        if (!d.splashedIn && u > .98) { d.splashedIn = true; splash(x, d.size * 1.2); }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(d.size * d.dir, d.size);
        const g = ctx.createLinearGradient(0, -15, 0, 13);
        g.addColorStop(0, body); g.addColorStop(.55, body); g.addColorStop(1, belly);
        ctx.fillStyle = body;
        ctx.fill(DOLPHIN.fin);
        ctx.fill(DOLPHIN.flukes);
        ctx.fillStyle = g;
        ctx.fill(DOLPHIN.body);
        ctx.fillStyle = body;
        ctx.fill(DOLPHIN.flipper);
        ctx.strokeStyle = 'rgba(20,35,45,.6)';
        ctx.lineWidth = .6;
        ctx.stroke(DOLPHIN.mouth);
        ctx.fillStyle = 'rgba(10,20,26,.8)';
        ctx.beginPath(); ctx.arc(40, -3, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    function drawSplashes(night) {
      for (const p of drops) {
        const fade = 1 - p.life / p.max;
        if (p.ring) {
          ctx.strokeStyle = `rgba(255,255,255,${.7 * fade * (night ? .6 : 1)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(p.x, surfaceAt(p.x) + 1, p.w + p.life * 34, 2 + p.life * 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(255,255,255,${.85 * fade * (night ? .6 : 1)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    /* Rendering ------------------------------------------------------------ */
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth || innerWidth;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      scale = W < 600 ? .75 : 1;
      // Where the headline's first line ends, in canvas coordinates.
      const range = document.createRange();
      range.selectNodeContents(heroAbove.firstChild);
      const left = canvas.getBoundingClientRect().left;
      textRight = range.getBoundingClientRect().right - left;
      lighthouseLeft = $('.lighthouse').getBoundingClientRect().left - left;
      draw();
    }

    // The water's color across the screen: sampled from the rendered sea when
    // the light layer is running, otherwise the plain sea gradient.
    function waterFill() {
      const s = ocean.surfaceSample;
      if (!s) return `rgb(${surfaceRGB.map(Math.round).join(',')})`;
      const g = ctx.createLinearGradient(0, 0, W, 0);
      const stops = 28;
      for (let i = 0; i <= stops; i++) {
        const cx = Math.round((i / stops) * W * s.scale);
        let rr = 0, gg = 0, bb = 0, n = 0;
        for (let k = Math.max(0, cx - 4); k <= Math.min(s.width - 1, cx + 4); k++) {
          rr += s.row[k * 4]; gg += s.row[k * 4 + 1]; bb += s.row[k * 4 + 2]; n++;
        }
        g.addColorStop(i / stops, `rgb(${(rr / n) | 0},${(gg / n) | 0},${(bb / n) | 0})`);
      }
      return g;
    }

    function draw() {
      const night = root.dataset.theme === 'dark';
      const step = 3, ys = [];
      for (let x = 0; x <= W + step; x += step) ys.push(surfaceAt(x));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Dolphins first, so the water covers whatever is still submerged.
      drawDolphins(night);

      // Water, exactly the sea's color, then faded into the sea below.
      ctx.beginPath();
      ctx.moveTo(0, H);
      ys.forEach((y, i) => ctx.lineTo(i * step, y));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = waterFill();
      ctx.fill();
      const fade = ctx.createLinearGradient(0, SOLID, 0, CLEAR);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = fade;
      ctx.fillRect(0, SOLID, W, H - SOLID);
      ctx.globalCompositeOperation = 'source-over';

      // Crest light: brighter where the water stands taller.
      const [cr, cg, cb] = night ? [190, 215, 255] : [255, 255, 255];
      const peak = 28 * scale;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < ys.length - 3; i += 3) {
        const lift = Math.min(1, (REST - ys[i + 1]) / peak);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(night ? .2 : .45) + lift * (night ? .25 : .5)})`;
        ctx.beginPath();
        ctx.moveTo(i * step, ys[i]);
        for (let k = 1; k <= 3; k++) ctx.lineTo((i + k) * step, ys[i + k]);
        ctx.stroke();
      }

      // Whitecaps on the tallest crests.
      for (let i = 2; i < ys.length - 2; i++) {
        const lift = REST - ys[i];
        if (lift < peak * .72 || ys[i] > ys[i - 2] || ys[i] > ys[i + 2]) continue;
        const a = Math.min(.8, (lift - peak * .72) / (peak * .2));
        ctx.fillStyle = `rgba(255,255,255,${a * (night ? .45 : .85)})`;
        ctx.beginPath();
        ctx.ellipse(i * step, ys[i] + 1.5, 7 * scale, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sun glints, by day: brief sparkles on the water below the sun.
      if (!night) {
        const sunX = W * .62;
        for (const g of glints) {
          const x = sunX + g.x;
          const a = Math.pow(Math.max(0, Math.sin(time * g.speed + g.phase)), 10);
          if (a < .05 || x < 0 || x > W) continue;
          ctx.fillStyle = `rgba(255,252,235,${a * .9})`;
          ctx.fillRect(x - 1.5, surfaceAt(x) + g.depth - .5, 3, 1.2);
        }
      }

      drawSplashes(night);
      holder.classList.add('is-live');
    }

    function tick(now) {
      const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60;
      last = now;
      if (!ocean.paused) { time += dt; stepDolphins(dt); }
      draw();
      if (!ocean.paused && onScreen && !document.hidden) requestAnimationFrame(tick);
      else { running = false; last = 0; }
    }
    function wake() {
      if (!running && onScreen && !document.hidden) { running = true; requestAnimationFrame(tick); }
    }
    new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; wake(); }).observe(canvas);
    document.addEventListener('visibilitychange', wake);
    new ResizeObserver(resize).observe(canvas);
    ocean.subscribe(wake);
    resize();
    wake();
  })();

  /* BIOLUMINESCENCE INPUT -------------------------------------------------- */
  const stir = event => {
    ocean.pointer.x = event.clientX;
    ocean.pointer.y = event.clientY;
    ocean.pointer.energy = 1;
    notify();
  };
  addEventListener('pointermove', stir, { passive: true });
  addEventListener('pointerdown', stir, { passive: true });

  /* SHARE: QR code, native share sheet, contact card ----------------------- */
  const shareDialog = $('#share');
  const shareStatus = $('.share__status');
  $('#share-open').addEventListener('click', () => { shareStatus.textContent = ''; shareDialog.showModal(); });
  shareDialog.addEventListener('click', event => { if (event.target === shareDialog) shareDialog.close(); });
  $('#share-link').addEventListener('click', async () => {
    const data = { title: 'Anthony Di Giovanni — Website Developer', url: 'https://digiovanni.dev/' };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      shareStatus.textContent = 'Link copied.';
    } catch (error) {
      if (error?.name !== 'AbortError') shareStatus.textContent = 'Couldn’t share. The address is digiovanni.dev';
    }
  });

  /* CONTACT ---------------------------------------------------------------- */
  const copyButton = $('#copy-email');
  let copyReset = 0;
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(EMAIL); copyButton.textContent = 'Copied!'; }
    catch { copyButton.textContent = EMAIL; }
    clearTimeout(copyReset);
    copyReset = setTimeout(() => { copyButton.textContent = 'Copy email'; }, 2500);
  });

  // Drafts stay on the visitor's device until they send them from their email app.
  const form = $('#contact-form');
  const formMessage = $('#form-message');
  for (const field of form.elements) {
    if (field.willValidate) field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const field of form.elements) {
      if (!field.willValidate) continue;
      if (field.checkValidity()) field.removeAttribute('aria-invalid');
      else field.setAttribute('aria-invalid', 'true');
    }
    if (!form.reportValidity()) return;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const message = form.elements.message.value.trim();
    location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Website inquiry from ${name}`)}`
      + `&body=${encodeURIComponent(`Hi Anthony,\n\n${message}\n\n${name}\n${email}`)}`;
    formMessage.textContent = 'If your email app didn’t open, use the email button above. Nothing has been sent yet.';
  });

  $('#year').textContent = String(new Date().getFullYear());

  /* PROGRESSIVE ENHANCEMENT ------------------------------------------------ */
  // Both visual layers load after the page, on idle; neither loads on
  // data-saver connections. The page is complete without them.
  addEventListener('load', () => {
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 400));
    const add = src => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      document.head.append(script);
    };
    if (!navigator.connection?.saveData) {
      // Sea life first, as soon as the browser has a free moment, so it greets
      // people quickly; the WebGL light (GPU shader work) waits a little longer
      // so it never competes with someone's first taps and scrolls.
      idle(() => add('js/life.js'), { timeout: 900 });
      idle(() => add('js/water.js'), { timeout: 4000 });
    }
    // Offline cache: once visited, the site opens instantly, even with poor signal.
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
})();
