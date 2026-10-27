/* digiovanni.dev — sea life. Loaded on idle by js/main.js.
   One full-screen 2D canvas behind the content. Every animal lives at a
   distance from the viewer: distant ones drift more slowly as you scroll
   (parallax) and fade into the water's color, the way visibility works
   underwater. Everything is drawn from paths; nothing is downloaded.

   The scene follows the page: a turtle and a fish school under the surface;
   a kelp forest on a rock ledge behind the work, ending in a drop-off; then
   the cliff wall carries you down past a manta, jellyfish and a distant whale,
   into the lanternfish and siphonophores of the midnight zone. */
(() => {
  'use strict';
  const ocean = window.ocean;
  const canvas = document.querySelector('.life');
  if (!ocean || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  // Seeded, so the reef grows the same way on every visit.
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const between = (a, b) => a + rand() * (b - a);

  let W = 0, H = 0, dpr = 1, bleed = 0;
  const page = {};

  /* PROJECTION & ATMOSPHERE ------------------------------------------------ */
  // dist 0 sits just behind the content; dist 1 is the edge of visibility.
  const parallax = dist => (reduced.matches ? 1 : 1 - dist * .72);
  const project = (pageY, dist) => H / 2 + (pageY - scrollY - H / 2) * parallax(dist);
  // Tracks whether anything was on screen this frame, so the loop can rest when not.
  let active = false;
  const visible = (y, margin) => { const v = y > -bleed - margin && y < H + bleed + margin; if (v) active = true; return v; };

  const SHADOW = [3, 16, 26];
  // Water color at screen height y, matching the gradient the sea layers paint.
  const seaAt = y => { const k = clamp(y / H, 0, 1); return ocean.top.map((v, i) => v + (ocean.bottom[i] - v) * k); };
  // Distance fades a silhouette toward the surrounding water.
  function tint(dist, y, alpha = 1) {
    const sea = seaAt(y), fog = .1 + dist * .8;
    // A shadow is never lighter than the water around it, even in the abyss.
    const [r, g, b] = SHADOW.map((v, i) => { const dark = Math.min(v, sea[i] * .45); return Math.round(dark + (sea[i] - dark) * fog); });
    return `rgba(${r},${g},${b},${alpha})`;
  }
  // offsetY: how far the canvas is translated, so the gradient still spans the screen.
  function tintGradient(dist, offsetY = 0) {
    const g = ctx.createLinearGradient(0, -offsetY, 0, H - offsetY);
    g.addColorStop(0, tint(dist, 0));
    g.addColorStop(1, tint(dist, H));
    return g;
  }
  // Sunlight catches the top edge of nearby shapes in shallow water.
  const rimAlpha = dist => (1 - smooth(40, 260, ocean.depth)) * (1 - dist) * (ocean.night ? .18 : .42);
  // Bioluminescence only reads once the sunlight has faded.
  const glowLevel = () => smooth(160, 520, ocean.depth);

  /* SILHOUETTES ------------------------------------------------------------ */
  const P = d => new Path2D(d);
  // Green sea turtle in side profile, facing +x: one continuous silhouette of
  // smooth shell, neck, head and rear flipper. The near front flipper is a
  // separate path whose root sits deep inside the shoulder, so it reads as part
  // of the body at every angle of the stroke.
  const TURTLE = {
    body: P('M-105-5C-92-24-80-33-62-42-40-53-18-60 7-62 22-62 34-61 46-58 52-56 56-53 57-49 61-50 66-52 70-52 79-53 88-55 97-54 105-53 111-51 114-46 118-41 118-37 116-34 113-31 111-30 106-27 98-25 90-23 83-22 77-21 72-19 68-16 64-13 58-6 52 6 46 10 38 12 26 17 0 19-28 19-48 18-63 17-75 24-87 32-95 37-102 41-110 42-116 41-120 38-119 33-117 28-116 22-113 18-108 14-102 10-97 7-101 2-105 0-104-3Z'),
    flipper: P('M42-8C50-12 58-14 64-13 70-9 73-4 74 4 75 14 72 28 67 40 61 52 52 62 42 68 36 72 30 73 27 72 25 68 28 61 33 50 36 40 37 28 37 18 38 12 40 4Z'),
    pivot: [50, 2],
  };
  // A jack: deep-bodied, forked tail, built for cruising. Tail pivots at (-36, 0).
  const JACK = { body: P('M46 0C40-11 22-18-2-17-18-15-30-8-38 0-30 8-18 15-2 17 22 18 40 11 46 0Z'),
    tail: P('M-34 0-58-18-51 0-58 18Z'), fin: P('M6-16 22-30 26-15Z') };
  const FISH = P('M11 0C7-5-1-6-7-2L-13-6-11 0-13 6-7 2C-1 6 7 5 11 0Z');
  const MANTA = P('M70-8C62-14 48-16 34-18 14-46-10-90-30-118-26-86-34-48-52-20-60-10-64-4-66 0-64 4-60 10-52 20-34 48-26 86-30 118-10 90 14 46 34 18 48 16 62 14 70 8 82 12 90 10 92 4 86 3 80 2 74 0 80-2 86-3 92-4 90-10 82-12 70-8Z');
  const WHALE = [P('M-280-8C-280-48-240-60-140-60-40-60 60-40 140-20 190-8 230 0 260-10L298-30 285 0 298 30 260 12C220 20 170 30 120 36 20 50-100 50-180 40-240 32-280 20-280-8Z'),
    P('M-120 32C-110 54-116 72-136 84-106 78-90 60-92 34Z')];

  // Draws parts at (x, y): first a sunlit copy nudged upward, then the shadow,
  // which leaves a thin bright rim along the top edge.
  function silhouette(x, y, scale, flip, angle, dist, drawParts) {
    const rim = rimAlpha(dist);
    const fill = tint(dist, y);
    for (const pass of rim > .02 ? ['rim', 'body'] : ['body']) {
      ctx.save();
      ctx.translate(x, pass === 'rim' ? y - 1.6 : y);
      ctx.rotate(angle);
      ctx.scale(flip ? -scale : scale, scale);
      ctx.fillStyle = pass === 'rim' ? `rgba(200,240,248,${rim})` : fill;
      drawParts();
      ctx.restore();
    }
  }
  const pivot = (x, y, angle, path) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.translate(-x, -y); ctx.fill(path); ctx.restore();
  };

  // Soft glow sprites, pre-rendered once per color.
  function sprite([r, g, b]) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(.18, `rgba(${r},${g},${b},.9)`);
    grad.addColorStop(.5, `rgba(${r},${g},${b},.18)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    return c;
  }
  const CYAN = sprite([120, 240, 255]);
  const VIOLET = sprite([190, 150, 255]);
  const glowDot = (img, x, y, size, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  };

  /* THE SCENE ---------------------------------------------------------------
     Built from section positions, so it fits any screen and any copy length. */
  let reef = null, kelp = [], schools = [], jellies = [], lanterns = [], chains = [];

  function measure() {
    const top = id => document.getElementById(id).getBoundingClientRect().top + scrollY;
    const height = id => document.getElementById(id).offsetHeight;
    page.heroBottom = top('top') + height('top');
    page.workTop = top('work'); page.workBottom = page.workTop + height('work');
    page.approachTop = top('approach'); page.approachH = height('approach');
    page.contactTop = top('contact'); page.contactH = height('contact');
    build();
  }

  function build() {
    seed = 11;
    const narrow = W < 700;
    const sx = narrow ? .7 : 1; // keep the cliff toward the edge on phones

    buildReef(narrow);

    // Kelp: tall stalks frame the left of the shelf, short ones fringe the lip,
    // and a hazy forest grows on the distant ridge past the drop-off. Every
    // holdfast sits on the rock surface.
    kelp = [];
    const onShelf = (x0, x1, h0, h1) => {
      const x = reef.shelfX(between(x0, x1));
      return { x: x / W, baseY: reef.topAt(x) + 5, h: between(h0, h1), phase: between(0, TAU), dist: reef.dist - .01 };
    };
    for (let i = 0; i < (narrow ? 5 : 8); i++) kelp.push(onShelf(-.01, .13, .5, 1.05));
    for (let i = 0; i < (narrow ? 2 : 4); i++) kelp.push(onShelf(.5, .6, .2, .4));
    for (let i = 0; i < (narrow ? 5 : 10); i++) {
      kelp.push({ x: between(.62, 1.02), baseY: between(.52, .62) * H, h: between(.6, 1.05), phase: between(0, TAU), dist: .6 });
    }

    const shoal = (n, rx, ry) => Array.from({ length: n }, () => {
      const a = between(0, TAU), r = Math.sqrt(rand());
      return { ox: Math.cos(a) * r * rx, oy: Math.sin(a) * r * ry, size: between(.8, 1.3), phase: between(0, TAU) };
    });
    // One school just under the surface; a second, looser one over the ledge.
    schools = [
      { fish: shoal(narrow ? 18 : 28, 120, 38), dist: .55, y: page.heroBottom - H * .1, period: 55, offset: .05, leftward: false },
      { fish: shoal(narrow ? 10 : 16, 90, 30), dist: .38, y: page.workBottom - H * .42, period: 65, offset: .6, leftward: true },
      // Silvery hatchetfish in the twilight: they catch what little light is left.
      { fish: shoal(narrow ? 12 : 20, 110, 34), dist: .45, y: page.approachTop + page.approachH * .55, period: 80, offset: .3, leftward: false, silver: true },
    ];

    const jellyAt = (fy, x, dist, r, color) => ({ y: page.approachTop + page.approachH * fy, x, dist, r, color, phase: between(0, TAU) });
    jellies = [
      jellyAt(.12, .86, .25, 22, VIOLET), jellyAt(.3, .1, .55, 14, CYAN), jellyAt(.55, .92, .4, 17, VIOLET),
      jellyAt(.72, .06, .2, 26, VIOLET), jellyAt(.95, .8, .6, 12, CYAN), jellyAt(1.2, .2, .35, 18, CYAN),
    ].sort((a, b) => b.dist - a.dist);

    // Kept to the open water above and below the contact card.
    const contactBottom = page.contactTop + page.contactH;
    lanterns = [page.contactTop + H * .1, contactBottom - H * .22, contactBottom - H * .05].map((y, i) => ({
      y, dist: .25 + i * .15, phase: between(0, TAU),
      fish: Array.from({ length: 6 }, () => ({ ox: between(-70, 70), oy: between(-26, 26), phase: between(0, TAU) })),
    }));
    chains = [
      { y: page.contactTop + H * .05, dist: .3, period: 90, offset: .25, beads: 34, spacing: 10 },
      { y: contactBottom - H * .12, dist: .55, period: 120, offset: .7, beads: 26, spacing: 7 },
    ];
  }

  /* THE REEF ---------------------------------------------------------------
     A rock shelf under the work breaks into a drop-off, then becomes the cliff
     wall you descend beside. The outline is roughened by midpoint displacement
     so it reads as stone; outcrops along the face give life somewhere to grow.
     Everything on the rock is placed on an exact surface point and sunk a few
     pixels in, so nothing floats. Built in reef-local pixels (y from the shelf). */

  // Recursively splits each segment, nudging midpoints sideways, for a natural edge.
  function roughen(points, amount, minLen) {
    const out = [points[0]];
    const split = (a, b, depth) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < minLen || depth > 6) { out.push(b); return; }
      const off = between(-1, 1) * len * amount;
      const m = [(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off];
      split(a, m, depth + 1);
      split(m, b, depth + 1);
    };
    for (let i = 1; i < points.length; i++) split(points[i - 1], points[i], 0);
    return out;
  }

  function buildReef(narrow) {
    const sx = narrow ? .62 : 1; // keep the cliff toward the edge on phones
    // [x as fraction of width, y in screen heights]; 'shelf' marks an outcrop tip.
    const control = [
      [-.05, .03], [.08, -.02], [.2, .015], [.32, -.015], [.44, .005], [.56, -.02], [.64, 0],
      [.69, .04], [.7, .13], [.66, .26], [.64, .35],
      [.73, .37, 'shelf'], [.71, .41], [.6, .47],
      [.57, .66], [.55, .85],
      [.64, .88, 'shelf'], [.62, .92], [.51, .99],
      [.47, 1.3], [.44, 1.62],
      [.52, 1.64, 'shelf'], [.5, 1.68], [.41, 1.75],
      [.36, 2.1], [.33, 2.5],
      [.41, 2.52, 'shelf'], [.39, 2.56], [.3, 2.63],
      [.27, 3.1], [.25, 3.7], [.23, 4.4], [.22, 5.4], [-.05, 5.4],
    ];
    const px = ([x, y]) => [x * sx * W, y * H];
    const pts = control.map(px);
    const outline = roughen(pts, .16, 16);
    const lipX = .69 * sx * W;
    const top = outline.filter(([x], i) => i < outline.length / 2 && x <= lipX).sort((a, b) => a[0] - b[0]);
    const topAt = x => {
      for (let i = 1; i < top.length; i++) {
        if (top[i][0] >= x) { const [x0, y0] = top[i - 1], [x1, y1] = top[i]; return y0 + (y1 - y0) * (x - x0) / Math.max(1, x1 - x0); }
      }
      return 0;
    };
    const nearest = (x, y) => outline.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? p : best));

    const rock = new Path2D();
    outline.forEach(([x, y], i) => (i ? rock.lineTo(x, y) : rock.moveTo(x, y)));
    rock.closePath();

    // Cracks and strata give the stone volume: short jagged lines running in from the face.
    const cracks = new Path2D();
    for (let i = 0; i < 26; i++) {
      const [x0, y0] = outline[(between(.12, .85) * outline.length) | 0];
      if (y0 < H * .05 || y0 > H * 4.2) continue;
      let x = x0 - 6, y = y0;
      cracks.moveTo(x, y);
      for (let k = 0, n = 3 + (rand() * 4 | 0); k < n; k++) {
        x -= between(8, 22); y += between(-6, 10);
        cracks.lineTo(x, y);
      }
    }
    for (let i = 0; i < 5; i++) { // strata across the shelf
      const y = between(.06, .3) * H, x0 = between(0, .3) * sx * W;
      cracks.moveTo(x0, y);
      for (let x = x0; x < x0 + between(.1, .3) * sx * W; x += 18) cracks.lineTo(x, y + between(-3, 3));
    }

    // Growth on the rock.
    const strokes = new Path2D(), lumps = new Path2D();
    const k = narrow ? .7 : 1;
    function branch(x, y, angle, len, depth) {
      const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
      strokes.moveTo(x, y);
      strokes.quadraticCurveTo(x + Math.cos(angle + .25) * len * .5, y + Math.sin(angle + .25) * len * .5, x2, y2);
      if (depth > 0) {
        const spread = between(.25, .45);
        branch(x2, y2, angle - spread, len * between(.66, .8), depth - 1);
        branch(x2, y2, angle + spread, len * between(.66, .8), depth - 1);
      }
    }
    const fan = (x, y, angle, size) => branch(x, y, angle, size * k, 4);
    const sponges = (x, y, angle) => { // barrel sponges, flared at the lip, rooted at (x, y)
      for (let n = 0; n < 2 + (rand() * 2 | 0); n++) {
        const h = between(16, 38) * k, w = between(5, 8) * k, off = (n - .5) * 10 * k;
        const ux = Math.cos(angle), uy = Math.sin(angle), vx = -uy, vy = ux;
        const at = (a, b) => [x + vx * (off + a) + ux * b, y + vy * (off + a) + uy * b];
        const q = [at(-w, -4), at(-w * .8, h), at(-w * 1.15, h + 3), at(w * 1.15, h + 3), at(w * .8, h), at(w, -4)];
        q.forEach(([qx, qy], i) => (i ? lumps.lineTo(qx, qy) : lumps.moveTo(qx, qy)));
        lumps.closePath();
      }
    };
    const softCoral = (x, y) => { // a bushy cluster of polyp heads on short stems
      for (let n = 0; n < 7; n++) {
        const a = -Math.PI / 2 + between(-.8, .8), len = between(8, 18) * k;
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        strokes.moveTo(x, y + 3); strokes.lineTo(ex, ey);
        const r = between(3, 6) * k;
        lumps.moveTo(ex + r, ey); lumps.arc(ex, ey, r, 0, TAU);
      }
    };
    const dome = (x, y) => { const r = between(9, 18) * k; lumps.moveTo(x + r, y + 4); lumps.ellipse(x, y + 4, r, r * .75, 0, 0, Math.PI, true); };
    const whip = (x, y, lean) => { // a long sea whip bending in the current
      const len = between(40, 80) * k;
      strokes.moveTo(x, y + 3);
      strokes.quadraticCurveTo(x + lean * len * .2, y - len * .6, x + lean * len * .55, y - len);
    };

    // Shelf top.
    for (let i = 0; i < (narrow ? 6 : 11); i++) {
      const x = between(.15, .62) * sx * W, y = topAt(x);
      const kind = rand();
      if (kind < .25) fan(x, y + 3, -Math.PI / 2 + between(-.25, .25), between(16, 26));
      else if (kind < .5) sponges(x, y + 2, -Math.PI / 2);
      else if (kind < .7) softCoral(x, y);
      else if (kind < .85) dome(x, y);
      else whip(x, y, between(-1, 1));
    }
    // Outcrops on the face: each gets growth on its upper surface.
    control.forEach((c, i) => {
      if (c[2] !== 'shelf') return;
      const [tx, ty] = pts[i], [bx, by] = pts[i - 1];
      for (let n = 0; n < 2; n++) {
        const f = between(.3, .85);
        const [x, y] = nearest(bx + (tx - bx) * f, by + (ty - by) * f);
        if (n === 0) fan(x, y + 3, -Math.PI / 2 + between(.1, .45), between(20, 32));
        else if (rand() < .5) sponges(x, y + 2, -Math.PI / 2 + .15);
        else whip(x, y, 1);
      }
    });
    // Encrusting sponges and small fans stuck to the face itself, pointing outward.
    for (let i = 0; i < 16; i++) {
      const j = 2 + (between(.2, .9) * (outline.length - 4)) | 0;
      const [x, y] = outline[j], [ax, ay] = outline[j - 1], [bx, by] = outline[j + 1];
      if (y < H * .2 || y > H * 3.6) continue;
      let nx = by - ay, ny = -(bx - ax);
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      if (nx < .3) continue; // only surfaces facing the open water
      if (rand() < .5) {
        const r = between(5, 11) * k;
        lumps.moveTo(x - nx * r * .3 + r, y - ny * r * .3);
        lumps.ellipse(x - nx * r * .3, y - ny * r * .3, r, r * .6, Math.atan2(ny, nx) + Math.PI / 2, 0, TAU);
      } else {
        fan(x - nx * 4, y - ny * 4, Math.atan2(ny, nx) * .5 - Math.PI / 4, between(12, 20));
      }
    }

    // Gas vents on the shelf send up thin streams of bubbles.
    const vents = Array.from({ length: narrow ? 2 : 4 }, () => {
      const x = between(.18, .6) * sx * W;
      return { x, y: topAt(x) + 2, phase: between(0, 10), speed: between(26, 40) };
    });

    // Bioluminescent life on the face: it shows once the sunlight is gone.
    const lights = [];
    for (let j = 2; j < outline.length - 2; j += 2) {
      const [x, y] = outline[j], [ax, ay] = outline[j - 1], [bx, by] = outline[j + 1];
      if (y < H * .7 || y > H * 4.8 || rand() > .45) continue;
      let nx = by - ay, ny = -(bx - ax);
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      if (nx < .2) continue;
      lights.push({ x: x - nx * 3, y: y - ny * 3, size: between(5, 12), phase: between(0, TAU), speed: between(.6, 1.6), violet: rand() < .3 });
    }

    // A distant ridge past the drop-off, and pinnacles fading into the twilight.
    const boulders = x => -.04 * Math.abs(Math.sin(x * 11 + .5)) - .014 * Math.sin(x * 31);
    const ridge = [[.5, 1.2]];
    for (let x = .5; x <= 1.06; x += .02) ridge.push([x, .55 + boulders(x * 1.7) * 2.2 - (x - .5) * .25]);
    ridge.push([1.06, 1.2]);
    const pinnacle = roughen([[.8, 3.4], [.83, 1.6], [.86, 1.1], [.88, 1.05], [.9, 1.4], [.95, 2.2], [1.05, 2.6], [1.05, 3.4]].map(([x, y]) => [x * W, y * H]), .14, 16);
    const spire = new Path2D();
    pinnacle.forEach(([x, y], i) => (i ? spire.lineTo(x, y) : spire.moveTo(x, y)));
    spire.closePath();

    const shade = ctx.createLinearGradient(0, 0, W * .72, 0);
    shade.addColorStop(0, 'rgba(0,6,10,.38)');
    shade.addColorStop(1, 'rgba(0,6,10,0)');

    reef = {
      shade,
      y: page.workBottom - H * .1, dist: .3, rock, cracks, strokes, lumps, lights, vents, topAt, depth: 5.4 * H,
      shelfX: f => f * sx * W,
      ridge: ridge.map(([x, y]) => [x * sx + (1 - sx), y]), ridgeDist: .6,
      spire, spireDist: .74,
    };
  }

  /* DRAWING ----------------------------------------------------------------- */
  // Position along a looping crossing of the screen, from -margin to W + margin.
  // Periods scale with width so swimmers keep a steady pace on any screen;
  // offsets are chosen so the first swimmers are already in view on arrival.
  const pace = seconds => seconds * (.45 + W / 2600);
  const crossing = (t, period, offset, margin, leftward) => {
    const u = ((t / period + offset) % 1 + 1) % 1;
    return leftward ? W + margin - u * (W + margin * 2) : -margin + u * (W + margin * 2);
  };

  // Sea turtles "fly": a quick power stroke that drives the flipper down and
  // back along the belly, then a slower recovery forward. The body lifts a
  // little with each stroke.
  function flipperAngle(p) {
    const ease = k => k * k * (3 - 2 * k);
    return p < .4 ? -.45 + 1.5 * ease(p / .4) : 1.05 - 1.5 * ease((p - .4) / .6);
  }

  function drawTurtle(t) {
    const dist = .3, scale = clamp(W / 1150, .5, .95);
    const p = (t / 3.8) % 1;
    const y = project(page.heroBottom - H * .03, dist) + Math.sin(t * .3) * 10 - Math.sin(p * TAU) * 4;
    if (!visible(y, 200)) return;
    const x = crossing(t, pace(75), .2, 220 * scale, true);
    const pitch = .025 * Math.sin(p * TAU + 1) + Math.sin(t * .25) * .03;
    const [px, py] = TURTLE.pivot;
    // The far-side flipper shows just behind the body, a little hazier and a beat behind.
    silhouette(x, y, scale, true, -pitch, dist + .1, () => {
      ctx.translate(-8, -4);
      pivot(px, py, flipperAngle((p + .96) % 1) + .1, TURTLE.flipper);
    });
    silhouette(x, y, scale, true, -pitch, dist, () => {
      ctx.fill(TURTLE.body);
      pivot(px, py, flipperAngle(p), TURTLE.flipper);
    });
  }

  function drawSchool(t, school) {
    const scale = clamp(W / 1200, .7, 1.1) * parallax(school.dist) * 1.3;
    const cy = project(school.y, school.dist) + Math.sin(t * .4 + school.offset * 9) * 30;
    if (!visible(cy, 160)) return;
    const cx = crossing(t, pace(school.period), school.offset, 200, school.leftward);
    const dir = school.leftward ? -1 : 1;
    ctx.fillStyle = school.silver ? `rgba(165,200,225,${.3 * glowLevel()})` : tint(school.dist, cy);
    for (const f of school.fish) {
      const x = cx + (f.ox + Math.sin(t * .9 + f.phase) * 7) * scale;
      const y = cy + (f.oy + Math.cos(t * 1.1 + f.phase) * 4) * scale;
      const s = dpr * f.size * scale;
      ctx.setTransform(s * dir, 0, 0, s * (1 + Math.sin(t * 8 + f.phase) * .06), x * dpr, (y + bleed) * dpr);
      ctx.fill(FISH);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, bleed * dpr);
  }

  // A lone jack patrols just above the ledge, in front of the rock.
  function drawJack(t) {
    const dist = .22, scale = clamp(W / 1300, .5, .95);
    const y = project(reef.y - H * .2, dist) + Math.sin(t * .5) * 14;
    if (!visible(y, 120)) return;
    const x = crossing(t, pace(38), .3, 80, false);
    silhouette(x, y, scale, false, Math.sin(t * .5) * .04, dist, () => {
      ctx.fill(JACK.body);
      ctx.fill(JACK.fin);
      pivot(-36, 0, Math.sin(t * 5) * .22, JACK.tail);
    });
  }

  function drawManta(t) {
    const dist = .42, scale = clamp(W / 1100, .5, 1.1);
    const y = project(page.workBottom - H * .28, dist) + Math.sin(t * .25) * 20;
    if (!visible(y, 200)) return;
    const x = crossing(t, pace(90), .55, 160 * scale, false);
    const flap = 1 - .22 * (.5 + .5 * Math.sin(t * 1.25));
    silhouette(x, y, scale, false, Math.sin(t * .2) * .06, dist, () => {
      ctx.scale(1, flap);
      ctx.fill(MANTA);
      ctx.scale(1, 1 / flap);
      ctx.fillRect(-150, -.8, 86, 1.6); // tail
    });
  }

  function drawWhale(t) {
    const dist = .72, scale = clamp(W / 900, .6, 1.6);
    const y = project(page.approachTop + page.approachH - H * .12, dist) + Math.sin(t * .15) * 16;
    if (!visible(y, 220)) return;
    const x = crossing(t, 120, .4, 320 * scale, true);
    silhouette(x, y, scale, false, Math.sin(t * .18) * .03, dist, () => { for (const path of WHALE) ctx.fill(path); });
  }

  // A rock drawn in reef-local pixels at screen offset y0: a sunlit copy nudged
  // up leaves a bright lip, then the shadow tinted by distance.
  function fillRock(path, y0, dist) {
    ctx.save();
    ctx.translate(0, y0);
    const rim = rimAlpha(dist);
    if (rim > .02) {
      ctx.save(); ctx.translate(0, -2); ctx.fillStyle = `rgba(200,240,248,${rim * .7})`; ctx.fill(path); ctx.restore();
    }
    ctx.fillStyle = tintGradient(dist, y0);
    ctx.fill(path);
    ctx.restore();
  }

  function drawRidge() {
    const y0 = project(reef.y, reef.ridgeDist);
    if (y0 > H + bleed + 40 || y0 + 1.2 * H < -bleed - 40) return;
    active = true;
    const ridge = new Path2D();
    reef.ridge.forEach(([fx, fy], i) => (i ? ridge.lineTo(fx * W, fy * H) : ridge.moveTo(fx * W, fy * H)));
    ridge.closePath();
    fillRock(ridge, y0, reef.ridgeDist);
  }

  function drawSpire() {
    const y0 = project(reef.y, reef.spireDist);
    if (y0 + H > H + bleed + 40 || y0 + 3.4 * H < -bleed - 40) return;
    active = true;
    fillRock(reef.spire, y0, reef.spireDist);
  }

  function drawReef(t) {
    const y0 = project(reef.y, reef.dist);
    if (y0 > H + bleed + 40 || y0 + reef.depth < -bleed - 40) return;
    active = true;
    fillRock(reef.rock, y0, reef.dist);
    ctx.save();
    ctx.translate(0, y0);
    // Volume: the rock darkens away from the open water (a second, translucent
    // fill — cheaper than clipping every frame), and cracks catch shadow.
    ctx.fillStyle = reef.shade;
    ctx.fill(reef.rock);
    ctx.strokeStyle = 'rgba(0,8,14,.35)';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke(reef.cracks);
    // Growth: same stone-and-water palette, with sunlit edges near the surface.
    const rim = rimAlpha(reef.dist);
    if (rim > .02) {
      ctx.save(); ctx.translate(0, -1.5); ctx.fillStyle = `rgba(200,240,248,${rim * .7})`; ctx.fill(reef.lumps); ctx.restore();
    }
    const fill = tintGradient(reef.dist - .04, y0);
    ctx.fillStyle = fill;
    ctx.fill(reef.lumps);
    ctx.strokeStyle = fill;
    ctx.lineCap = 'round';
    ctx.lineWidth = W < 700 ? 1.4 : 1.9;
    ctx.stroke(reef.strokes);
    // Deeper down, a faint edge of light from the open water keeps the cliff's
    // shape readable, and its bioluminescent life starts to twinkle.
    const edge = smooth(120, 500, ocean.depth) * (1 - smooth(2600, 4200, ocean.depth));
    if (edge > .01) {
      ctx.strokeStyle = `rgba(130,190,225,${.16 * edge})`;
      ctx.lineWidth = 1.5;
      ctx.stroke(reef.rock);
    }
    const level = glowLevel();
    if (level > .02) {
      ctx.globalCompositeOperation = 'lighter';
      for (const l of reef.lights) {
        const sy = l.y + y0;
        if (sy < -bleed - 20 || sy > H + bleed + 20) continue;
        const pulse = .55 + .45 * Math.sin(t * l.speed + l.phase);
        glowDot(l.violet ? VIOLET : CYAN, l.x, l.y, l.size * (.8 + .3 * pulse), level * pulse * .75);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // Bubbles rise from the vents, swelling and wobbling as they go. Shallow water only.
  function drawBubbles(t) {
    const fade = 1 - smooth(160, 360, ocean.depth);
    if (fade < .02) return;
    const y0 = project(reef.y, reef.dist);
    if (y0 < -bleed - 40 || y0 - H * 1.2 > H + bleed) return;
    ctx.lineWidth = 1;
    for (const v of reef.vents) {
      for (let i = 0; i < 9; i++) {
        const rise = ((t + v.phase + i * 1.3) * v.speed) % (H * .9);
        const y = y0 + v.y - rise;
        if (y < -bleed - 10 || y > H + bleed + 10) continue;
        active = true;
        const r = 1.6 + rise / (H * .9) * 3.4;
        const x = v.x + Math.sin(t * 2.2 + i * 1.7) * (2 + rise * .012);
        const a = fade * (1 - rise / (H * .9)) * .7;
        ctx.strokeStyle = `rgba(225,248,255,${a})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${a * .6})`;
        ctx.fillRect(x - r * .45, y - r * .5, 1.2, 1.2);
      }
    }
  }

  function drawKelp(t, near) {
    const stalks = new Path2D(), blades = new Path2D();
    let any = false, dist = .17;
    for (const k of kelp) {
      if ((k.dist < .5) !== near) continue;
      dist = k.dist;
      const baseY = project(reef.y + k.baseY, k.dist);
      const h = k.h * H, scale = parallax(k.dist);
      if (baseY - h > H + bleed + 20 || baseY < -bleed - 20) continue;
      any = active = true;
      const N = 18;
      let px = k.x * W, py = baseY;
      stalks.moveTo(px, py);
      for (let i = 1; i <= N; i++) {
        const s = i / N;
        const sway = Math.sin(t * .55 + k.phase + s * 2.4) * 34 * Math.pow(s, 1.6) + Math.sin(t * .23 + k.phase) * 14 * s;
        const x = k.x * W + sway, y = baseY - s * h;
        stalks.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x; py = y;
        if (i > 1 && i < N) {
          // A blade on alternating sides, angled up and out, rippling in the current.
          const side = i % 2 ? 1 : -1;
          const angle = -Math.PI / 2 + side * (.75 + .18 * Math.sin(t * 1.3 + k.phase + i));
          const len = (48 - s * 16) * scale * (W < 700 ? .75 : 1), w = 10 * scale;
          const dx = Math.cos(angle), dy = Math.sin(angle);
          blades.moveTo(x, y);
          blades.quadraticCurveTo(x + dx * len * .5 - dy * w, y + dy * len * .5 + dx * w, x + dx * len, y + dy * len);
          blades.quadraticCurveTo(x + dx * len * .5 + dy * w, y + dy * len * .5 - dx * w, x, y);
        }
      }
    }
    if (!any) return;
    const fill = tintGradient(dist);
    ctx.lineCap = 'round';
    ctx.lineWidth = (near ? 4 : 2.4) * parallax(dist);
    ctx.strokeStyle = fill;
    ctx.fillStyle = fill;
    ctx.stroke(stalks);
    ctx.fill(blades);
  }

  // Chambered nautilus in silhouette, side view: tentacles toward +x, coil
  // toward -x. It swims backwards, shell first, by jetting water. One smooth
  // contraction curve drives everything: the tentacles draw together, the body
  // surges and tilts, then all of it relaxes into a long glide. Speed, spread
  // and tilt follow the same curve, so there is never a jump between strokes.
  const NAUTILUS = {
    shell: P('M22-14C14-25-2-28-14-22-27-16-30 3-22 16-14 27 5 28 17 21 24 16 27 9 27 3 27-5 25-10 22-14Z'),
    hood: P('M20-15C29-13 32-5 30 2 27 6 23 6 19 3 21-4 21-10 20-15Z'),
    eye: P('M24 5a4 6 .2 1 0 .01 0Z'),
  };
  const nautilus = { x: null, lastT: null };
  const contraction = p => (p < .28 ? smooth(0, .28, p) : 1 - smooth(.28, 1, p));
  function drawNautilus(t) {
    const dist = .26, scale = clamp(W / 1150, .6, .95) * parallax(dist);
    // It cruises in the open water just above the cliff top, moving with the
    // reef as the page scrolls.
    const reefY = project(reef.y, reef.dist);
    const y0 = reefY - 60 * scale;
    if (!visible(y0, 100)) return;
    const c = contraction((t / 2.8) % 1);
    const dt = nautilus.lastT === null ? 0 : clamp(t - nautilus.lastT, 0, .1);
    nautilus.lastT = t;
    if (nautilus.x === null) nautilus.x = W * .72;
    nautilus.x -= 15 * scale * (1 + 1.7 * Math.pow(c, 1.4)) * dt;
    if (nautilus.x < -80 * scale || nautilus.x > W + 80 * scale) nautilus.x = W + 80 * scale;
    const spread = 1 - c; // trailing wide in the glide, drawn together on the stroke
    const y = y0 + Math.sin(t * .6) * 7 - c * 2;
    const fill = tint(dist, y);

    ctx.save();
    ctx.translate(nautilus.x, y);
    ctx.rotate(Math.sin(t * .45) * .05 - .07 * c);
    ctx.scale(scale, scale);
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineCap = 'round';
    for (let i = 0; i < 20; i++) {
      const f = i / 19, y1 = 1 + f * 12;
      const len = (17 + 12 * (.5 + .5 * Math.sin(i * 1.7))) * (.66 + .34 * spread);
      const fan = (f - .5) * 10 * spread;
      ctx.lineWidth = 1.2 - f * .5;
      ctx.beginPath();
      ctx.moveTo(24, y1);
      ctx.bezierCurveTo(24 + len * .4, y1 + fan * .3 + Math.sin(t * 2.4 + i) * 1.1,
        24 + len * .75, y1 + fan * .8 + Math.sin(t * 2.7 + i * 1.3) * 1.8,
        24 + len, y1 + fan + Math.sin(t * 2.1 + i) * 2.2);
      ctx.stroke();
    }
    ctx.fill(NAUTILUS.shell);
    ctx.fill(NAUTILUS.hood);
    ctx.fill(NAUTILUS.eye);
    ctx.restore();
  }

  function drawJellies(t) {
    const level = glowLevel();
    if (level < .02) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const j of jellies) {
      const y = project(j.y, j.dist) + Math.sin(t * .22 + j.phase) * 40;
      if (!visible(y, 160)) continue;
      const x = j.x * W + Math.sin(t * .13 + j.phase) * 30;
      const r = j.r * parallax(j.dist) * (W < 700 ? .8 : 1);
      const b = level * (1 - j.dist * .55);
      const pulse = Math.sin(t * 2 + j.phase);
      const rx = r * (1 + .09 * pulse), ry = r * (.82 - .1 * pulse);
      glowDot(j.color, x, y, r * 7, .32 * b);
      // Bell
      ctx.globalAlpha = .42 * b;
      ctx.drawImage(j.color, x - rx * 1.4, y - ry * 1.6, rx * 2.8, ry * 2.6);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(225,215,255,${.55 * b})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0);
      ctx.stroke();
      // Tentacles trail and sway behind the pulse.
      ctx.strokeStyle = `rgba(210,200,255,${.32 * b})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const tx = x - rx * .8 + (i / 5) * rx * 1.6;
        const len = r * (3 + (i % 3) * .7);
        ctx.moveTo(tx, y);
        ctx.bezierCurveTo(
          tx + Math.sin(t * 1.6 + i + j.phase) * r * .5, y + len * .35,
          tx + Math.sin(t * 1.3 + i * 2 + j.phase) * r * .7, y + len * .7,
          tx + Math.sin(t * 1.1 + i + j.phase) * r * .4, y + len);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawMidnight(t) {
    const level = smooth(700, 1400, ocean.depth);
    if (level < .02) return;
    ctx.globalCompositeOperation = 'lighter';
    // Siphonophores: long colonial chains that drift with a slow travelling wave.
    for (const c of chains) {
      const y = project(c.y, c.dist);
      if (!visible(y, 200)) continue;
      const scale = parallax(c.dist);
      const hx = crossing(t, c.period, c.offset, c.beads * c.spacing * scale, true);
      for (let i = 0; i < c.beads; i++) {
        const bx = hx + i * c.spacing * scale;
        const by = y + Math.sin(t * 1.1 - i * .32) * 16 * scale * (i / c.beads) + i * 1.4 * scale;
        glowDot(CYAN, bx, by, (i ? 15 - i * .15 : 26) * scale, level * (1 - i / (c.beads + 8)));
      }
    }
    // Lanternfish: only their light organs show, in loose drifting schools.
    for (const school of lanterns) {
      const y = project(school.y, school.dist);
      if (!visible(y, 120)) continue;
      const scale = parallax(school.dist);
      const cx = crossing(t, 70, school.phase / TAU, 160, false);
      for (const f of school.fish) {
        const fx = cx + (f.ox + Math.sin(t * .7 + f.phase) * 8) * scale;
        const fy = y + (f.oy + Math.cos(t * .9 + f.phase) * 5) * scale;
        const blink = .55 + .45 * Math.sin(t * 2.2 + f.phase);
        for (let d = 0; d < 5; d++) glowDot(CYAN, fx - d * 5 * scale, fy + d * .6 * scale, 10 * scale, level * blink * .85);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw(t) {
    active = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, bleed * dpr);
    ctx.clearRect(0, -bleed, W, H + 2 * bleed);
    if (!reef) return;
    // Far to near.
    drawWhale(t);
    drawSpire();
    drawRidge();
    drawKelp(t, false);
    for (const school of schools) drawSchool(t, school);
    drawManta(t);
    drawMidnight(t);
    drawJellies(t);
    drawTurtle(t);
    drawReef(t);
    drawNautilus(t);
    drawBubbles(t);
    drawJack(t);
    drawKelp(t, true);
  }

  /* LOOP -------------------------------------------------------------------- */
  let time = 20, last = 0, frame = 0, running = false;
  function tick(now) {
    frame = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!ocean.paused) time += dt;
    draw(time);
    if (!canvas.classList.contains('is-ready')) canvas.classList.add('is-ready');
    // Keep animating while something is in view; otherwise rest until the next scroll.
    if (!ocean.paused && active) frame = requestAnimationFrame(tick);
    else { running = false; last = 0; }
  }
  function wake() {
    if (!running && !document.hidden) { running = true; frame = requestAnimationFrame(tick); }
  }
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    W = canvas.clientWidth || innerWidth;
    bleed = parseFloat(getComputedStyle(canvas).getPropertyValue('--scene-bleed')) || 0;
    H = (canvas.clientHeight || innerHeight) - 2 * bleed;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round((H + 2 * bleed) * dpr);
    measure();
    if (!running) draw(time);
  }

  ocean.subscribe(wake);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); running = false; last = 0; }
    else wake();
  });
  new ResizeObserver(resize).observe(canvas);
  new ResizeObserver(() => { measure(); wake(); }).observe(document.querySelector('main'));
  resize();
  wake();
})();
