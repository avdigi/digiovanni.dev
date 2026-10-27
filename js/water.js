/* digiovanni.dev — WebGL light layer. Loaded on idle by js/main.js.
   Two draws per frame and no dependencies:
   1. a full-screen pass for depth color, light shafts and caustics;
   2. a point pass for marine snow and touch-reactive bioluminescence.
   Reads the shared `window.ocean` state; renders at reduced resolution and
   sleeps whenever nothing is moving. Any failure leaves the CSS sea in place. */
(() => {
  'use strict';
  const ocean = window.ocean;
  const canvas = document.querySelector('.water');
  if (!ocean || !canvas) return;
  // failIfMajorPerformanceCaveat: refuse software-emulated WebGL. A device
  // without a usable GPU keeps the CSS sea instead of stuttering.
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return;
  // Some browsers emulate WebGL on the CPU without reporting a performance
  // caveat. Check the renderer name too: software rendering keeps the CSS sea.
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const PARTICLES = coarse ? 170 : 280;

  const QUAD_VS = `
    attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

  const SEA_FS = `
    precision mediump float;
    varying vec2 vUv;
    uniform vec2 uRes; uniform float uTime, uDepth, uNight, uScroll;
    uniform vec3 uTop, uBot;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    // Iterated-trig caustic network (after Dave Hoskins' "Tileable Water Caustic").
    float caustic(vec2 p, float t){
      vec2 i = p; float c = 1.;
      for (int n = 0; n < 4; n++) {
        float tt = t * (1. - 3.5 / float(n + 1));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1. / length(vec2(p.x / (sin(i.x + tt) / .005), p.y / (cos(i.y + tt) / .005)));
      }
      c = clamp(1.17 - pow(c / 4., 1.4), 0., 1.);
      return pow(c, 8.);
    }
    void main(){
      vec2 uv = vUv; float aspect = uRes.x / uRes.y;
      vec3 col = mix(uBot, uTop, smoothstep(0., 1., uv.y));
      float sun = 1. - smoothstep(15., 230., uDepth);
      float day = 1. - uNight * .7;
      vec2 p = vec2((uv.x - .5) * aspect, uv.y);
      if (sun > .002) {
        // Light shafts, slanting down from the upper right.
        float a = p.x + (1. - uv.y) * .42;
        float shafts = noise(vec2(a * 5. + uTime * .05, uTime * .035)) * noise(vec2(a * 11. - uTime * .08, 3.));
        shafts = smoothstep(.1, .65, shafts) * uv.y;
        col += shafts * sun * day * vec3(.45, .8, .86) * .42;
        // Caustics drift with scroll, as if light were playing on the water around you.
        float c = caustic(p * 5.5 + vec2(0., uScroll * .0024) + 40., uTime * .3 + 23.);
        col += min(c, 1.) * sun * sun * day * smoothstep(.15, 1., uv.y) * vec3(.55, .92, .96) * .16;
      }
      float v = length((uv - .5) * vec2(aspect * .7, 1.));
      // The view closes in as you descend.
      col *= 1. - (.3 + .35 * smoothstep(150., 2500., uDepth)) * smoothstep(.3, 1.1, v);
      col += (hash(gl_FragCoord.xy + fract(uTime)) - .5) / 160.; // dither: no banding in dark gradients
      gl_FragColor = vec4(col, 1.);
    }`;

  const SNOW_VS = `
    attribute vec4 aSeed; // x, y, nearness, phase
    uniform float uTime, uDescent, uDepth, uScale, uEnergy;
    uniform vec2 uRes, uPointer;
    varying float vAlpha, vGlow;
    void main(){
      float z = aSeed.z;
      // Nearer particles rise faster as you descend: parallax in a single pass.
      float y = fract(aSeed.y + uDescent * (.2 + .8 * z) + uTime * .005 * (.3 + z));
      float x = fract(aSeed.x + sin(uTime * .07 + aSeed.w * 6.283) * .015);
      vec2 pos = vec2(x * 2.1 - 1.05, y * 2.2 - 1.1);
      vec2 px = (pos * .5 + .5) * uRes;
      float deep = smoothstep(450., 1300., uDepth);
      float touch = uEnergy * (1. - smoothstep(0., 190. * uScale, distance(px, uPointer)));
      float twinkle = pow(max(0., sin(uTime * (.35 + z * .8) + aSeed.w * 50.)), 40.);
      vGlow = clamp(deep * (touch * 1.4 + twinkle * .9), 0., 1.);
      float snow = smoothstep(100., 500., uDepth);
      vAlpha = (.1 + .42 * z) * mix(.3, 1., snow) * (1. - .75 * smoothstep(4300., 5000., uDepth));
      vAlpha = max(vAlpha, vGlow);
      gl_PointSize = (1.1 + z * 2.6 + vGlow * 4.5) * uScale * 2.;
      gl_Position = vec4(pos, 0., 1.);
    }`;

  const SNOW_FS = `
    precision mediump float;
    varying float vAlpha, vGlow;
    void main(){
      float a = smoothstep(.5, 0., length(gl_PointCoord - .5));
      vec3 col = mix(vec3(.82, .92, .95), vec3(.45, 1., .88), vGlow);
      gl_FragColor = vec4(col * a * vAlpha, 1.);
    }`;

  // Shaders compile in the background where the driver supports it, so the
  // page never freezes while the GPU works.
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  function startProgram(vs, fs) {
    const p = gl.createProgram();
    const shaders = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
      return s;
    });
    gl.linkProgram(p);
    return { p, shaders };
  }
  function finishProgram({ p, shaders }) {
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(shaders.map(s => gl.getShaderInfoLog(s)).join('\n') + gl.getProgramInfoLog(p));
    }
    const u = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  const pending = [startProgram(QUAD_VS, SEA_FS), startProgram(SNOW_VS, SNOW_FS)];
  const compiled = () => !parallel || pending.every(({ p }) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR));
  (function whenCompiled() {
    if (!compiled()) { setTimeout(whenCompiled, 50); return; }
    try { start(finishProgram(pending[0]), finishProgram(pending[1])); }
    catch (error) { console.warn('Water layer unavailable; the CSS sea remains.', error); }
  })();

  function start(sea, snow) {

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one oversized triangle
    const seeds = new Float32Array(PARTICLES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(sea.p, 'aPos');
    const aSeed = gl.getAttribLocation(snow.p, 'aSeed');

    // Soft underwater light needs few pixels: render at about half resolution.
    let scale = Math.min(devicePixelRatio || 1, 2) * (coarse ? .5 : .6);
    let width = 0, height = 0;
    function resize() {
      const cssW = canvas.clientWidth || innerWidth, cssH = canvas.clientHeight || innerHeight;
      scale = Math.min(scale, Math.sqrt(1.1e6 / (cssW * cssH)));
      const w = Math.max(1, Math.round(cssW * scale)), h = Math.max(1, Math.round(cssH * scale));
      if (w === width && h === height) return;
      width = canvas.width = w;
      height = canvas.height = h;
      gl.viewport(0, 0, w, h);
      // The old sample describes the old layout: drop it and take a fresh one
      // on the next frame. The surface waves hold their colors meanwhile.
      ocean.surfaceSample = null;
      sampleTick = 0;
      wake();
    }

    let time = Math.random() * 100, last = 0, frame = 0, running = false, dirty = true;
    let sampleTick = 0, sampleRow = null, fadeStart = 0;
    const FADE_MS = 800;
    const frameTimes = [];

    function draw() {
      const cssH = canvas.clientHeight || innerHeight;
      gl.disable(gl.BLEND);
      gl.useProgram(sea.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(sea.u.uRes, width, height);
      gl.uniform1f(sea.u.uTime, time);
      gl.uniform1f(sea.u.uDepth, ocean.depth);
      gl.uniform1f(sea.u.uNight, ocean.night ? 1 : 0);
      gl.uniform1f(sea.u.uScroll, scrollY);
      gl.uniform3f(sea.u.uTop, ocean.top[0] / 255, ocean.top[1] / 255, ocean.top[2] / 255);
      gl.uniform3f(sea.u.uBot, ocean.bottom[0] / 255, ocean.bottom[1] / 255, ocean.bottom[2] / 255);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(aPos);

      // Share the sea's actual color just below the waterline (light shafts,
      // caustics and all), so the surface waves drawn by js/main.js are painted
      // in exactly the same blue. Read before the particles: every few frames
      // while the layer fades in, then about five times a second (reading back
      // pixels makes the GPU finish its work, so it is kept rare).
      if (ocean.waterlineY !== undefined && sampleTick++ % ((ocean.waterMix || 0) < 1 ? 3 : 12) === 0) {
        const y = ocean.waterlineY + 12;
        if (y > 0 && y < cssH) {
          const row = Math.min(height - 1, Math.max(0, Math.round((cssH - y) * scale)));
          if (!sampleRow || sampleRow.length !== width * 4) sampleRow = new Uint8Array(width * 4);
          gl.readPixels(0, row, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, sampleRow);
          ocean.surfaceSample = { row: sampleRow, width, scale, cssWidth: canvas.clientWidth || innerWidth };
        } else ocean.surfaceSample = null;
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(snow.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
      gl.enableVertexAttribArray(aSeed);
      gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 0, 0);
      gl.uniform2f(snow.u.uRes, width, height);
      gl.uniform1f(snow.u.uTime, time);
      gl.uniform1f(snow.u.uDescent, scrollY / cssH);
      gl.uniform1f(snow.u.uDepth, ocean.depth);
      gl.uniform1f(snow.u.uScale, width / (canvas.clientWidth || innerWidth));
      gl.uniform1f(snow.u.uEnergy, ocean.pointer.energy);
      gl.uniform2f(snow.u.uPointer, ocean.pointer.x * scale, (cssH - ocean.pointer.y) * scale);
      gl.drawArrays(gl.POINTS, 0, PARTICLES);
      gl.disableVertexAttribArray(aSeed);
    }

    function tick(now) {
      frame = 0;
      const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60;
      last = now;
      if (!ocean.paused) time = (time + dt) % 1000;
      ocean.pointer.energy *= Math.exp(-dt * 1.4);
      if (ocean.pointer.energy < .01) ocean.pointer.energy = 0;
      draw();
      dirty = false;

      // One-time quality check: if the first second runs slow, drop resolution.
      if (frameTimes.length < 60 && !ocean.paused) {
        frameTimes.push(dt);
        if (frameTimes.length === 60) {
          const sorted = [...frameTimes].sort((a, b) => a - b);
          if (sorted[30] > 1 / 40 && scale > .3) { scale *= .7; resize(); }
        }
      }

      // Fade in from code rather than CSS, and publish the progress as
      // ocean.waterMix, so the surface waves (js/main.js) blend their color by
      // exactly how much of this layer is showing. No jump when it arrives.
      if (!fadeStart) {
        fadeStart = now;
        ocean.waterReady = true;
        canvas.classList.add('is-ready');
      }
      const mix = Math.min(1, (now - fadeStart) / FADE_MS);
      if (mix !== ocean.waterMix) {
        ocean.waterMix = mix;
        canvas.style.opacity = String(mix);
        // A still scene doesn't animate on its own: nudge the other layers to redraw.
        if (ocean.paused) for (const fn of ocean.listeners) if (fn !== wake) fn();
      }
      if (!ocean.paused || ocean.pointer.energy > 0 || dirty || mix < 1) frame = requestAnimationFrame(tick);
      else { running = false; last = 0; }
    }

    function wake() {
      dirty = true;
      if (!running && !document.hidden) { running = true; frame = requestAnimationFrame(tick); }
    }

    const unsubscribe = ocean.subscribe(wake);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(frame); running = false; last = 0; }
      else wake();
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      running = false;
      unsubscribe();
      ocean.waterReady = false;
      ocean.waterMix = 0;
      ocean.surfaceSample = null;
      canvas.style.opacity = '0';
      canvas.classList.remove('is-ready');
    });
    new ResizeObserver(resize).observe(canvas);
    resize();
    wake();
  }
})();
