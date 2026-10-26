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
  const VCARD = 'assets/anthony-di-giovanni.vcf';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const ocean = window.ocean = {
    depth: 0,
    top: [0, 0, 0],
    bottom: [0, 0, 0],
    night: root.dataset.theme === 'dark',
    paused: root.classList.contains('paused') || reducedMotion.matches,
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

  let contactTop = Infinity;
  function measure() {
    const mid = el => pageY(el) + el.offsetHeight / 2 - innerHeight / 2;
    anchors = [[0, 0], ...DEPTHS.map(([id, m]) => [mid($(id)), m]), [maxScroll(), 5000]];
    anchors.sort((a, b) => a[0] - b[0]);
    contactTop = pageY($('#contact'));
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
  const readouts = $$('[data-depth-m]');
  const coast = $('.coast');
  const gauge = $('.gauge');
  const dock = $('.dock');
  const dockCta = $('.dock__cta');
  let lastMeters = -1, dockSaves = false;

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

    // Coastline parallax, only while the surface is in view and motion is welcome.
    if (coast && scrollY < innerHeight * 1.5 && !reducedMotion.matches) coast.style.setProperty('--sy', Math.round(scrollY));

    const shown = m < 200 ? Math.round(m) : Math.round(m / 5) * 5;
    if (shown !== lastMeters) {
      lastMeters = shown;
      const text = `${shown.toLocaleString('en-US')} m`;
      for (const el of readouts) el.textContent = text;
    }
    gauge.style.setProperty('--dive', Math.min(1, scrollY / maxScroll()).toFixed(4));

    dock.classList.toggle('is-on', scrollY > innerHeight * .55);
    // Once someone reaches the contact section, the most useful action is keeping your details.
    const saves = scrollY + innerHeight * .6 >= contactTop;
    if (saves !== dockSaves) {
      dockSaves = saves;
      dockCta.textContent = saves ? 'Save my contact' : 'Let’s talk';
      dockCta.href = saves ? VCARD : '#contact';
      dockCta.toggleAttribute('download', saves);
    }
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

  /* PAUSE (WCAG 2.2.2: moving content can be stopped) ---------------------- */
  const pauseButton = $('#pause');
  function applyPause(paused, remember) {
    root.classList.toggle('paused', paused);
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.title = paused ? 'Resume motion' : 'Pause motion';
    ocean.paused = paused || reducedMotion.matches;
    if (remember) try { localStorage.setItem('ocean-paused', String(paused)); } catch {}
    notify();
  }
  pauseButton.addEventListener('click', () => applyPause(!root.classList.contains('paused'), true));
  reducedMotion.addEventListener('change', () => applyPause(root.classList.contains('paused'), false));
  applyPause(root.classList.contains('paused'), false);

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
