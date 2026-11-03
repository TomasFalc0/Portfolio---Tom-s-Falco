// Escena 3D: anillo con los trabajos que se ve desde afuera y, al bajar, la cámara
// lo atraviesa y quedás adentro de una sala 360°. El panel de enfrente reproduce su video.
// Al final de la página el anillo vuelve, detrás del contacto.
// Las imágenes salen de los elementos con [data-ring] del HTML: si agregás un
// proyecto con data-ring, aparece solo en el anillo.
import * as THREE from 'three';

const vertex = /* glsl */`
  uniform float uVel;
  varying vec2 vUv;
  varying float vDepth;
  void main(){
    vUv = uv;
    vec3 p = position;
    // el panel se "flamea" con la velocidad del scroll
    p.z += sin(uv.y * 3.14159) * uVel * 0.28;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */`
  uniform sampler2D uMap;
  uniform sampler2D uVideo;
  uniform float uVideoMix;
  uniform vec2 uCover;
  uniform vec2 uSize;
  uniform float uVel;
  uniform float uHover;
  uniform float uAlpha;
  uniform float uInside;
  uniform float uFocus;
  uniform float uReflect;
  varying vec2 vUv;
  varying float vDepth;

  vec3 sampleSplit(sampler2D map, vec2 uv, float s){
    return vec3(texture2D(map, uv + vec2(s, 0.0)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(s, 0.0)).b);
  }

  void main(){
    // esquinas redondeadas
    vec2 q = (vUv - 0.5) * uSize;
    vec2 d = abs(q) - uSize * 0.5 + 0.045;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.045;
    float corner = 1.0 - smoothstep(-0.006, 0.006, sd);
    if (corner < 0.01) discard;

    bool back = !gl_FrontFacing;
    vec2 uv = vUv;
    if (back) uv.x = 1.0 - uv.x;
    uv = (uv - 0.5) * uCover * (1.0 - uHover * 0.05) + 0.5;

    // separación RGB según velocidad, como un glitch de lente
    float s = clamp(uVel, -1.0, 1.0) * 0.018;
    vec3 c = sampleSplit(uMap, uv, s);
    if (uVideoMix > 0.001) c = mix(c, sampleSplit(uVideo, uv, s), uVideoMix);

    // grade: sombras hacia violeta
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, c * vec3(0.95, 0.84, 1.14), (1.0 - l) * 0.5);
    c *= 0.86 + uHover * 0.2;

    // de afuera el dorso va oscuro; adentro se ve todo y resalta el de enfrente
    if (back) c *= mix(0.3, 1.0, uInside);
    c *= mix(1.0, 0.32 + 0.68 * uFocus, uInside);

    // lejos se funde con el fondo y de muy cerca se abre para que la cámara pase
    float fog = smoothstep(7.5, 12.0, vDepth);
    float near = smoothstep(0.35, 1.25, vDepth);
    float alpha = uAlpha * (1.0 - fog * 0.75) * near * corner;

    // reflejo en el piso: se apaga a medida que se aleja del borde de abajo
    if (uReflect > 0.5) {
      alpha *= (1.0 - smoothstep(0.0, 0.5, vUv.y)) * 0.26;
      c *= 0.85;
    }
    gl_FragColor = vec4(c, alpha);
    #include <colorspace_fragment>
  }
`;

const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function softDot(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initStage({ canvas, grabArea, reduce, fine, getVelocity, onHover, onSelect, onActive }) {
  const els = [...document.querySelectorAll('[data-ring]')];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, fine ? 1.75 : 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const stage = new THREE.Group();   // posición/tilt general
  const ring = new THREE.Group();    // gira
  stage.add(ring);
  scene.add(stage);

  // ---------- paneles: verticales 9:16 y horizontales 16:9 sobre el mismo cilindro ----------
  const GAP = 0.2;
  const sizes = els.map(el => (el.classList.contains('clip') && !el.classList.contains('clip-wide')
    ? { w: 1.07, h: 1.9 } : { w: 2.1, h: 1.18 }));
  const R = (sizes.reduce((sum, s) => sum + s.w + GAP, 0)) / TAU;
  const FLOOR = -1.02;

  const mirror = new THREE.Group();  // reflejo en el piso
  mirror.scale.y = -1;
  mirror.position.y = FLOOR * 2;
  ring.add(mirror);

  const loader = new THREE.TextureLoader();
  let arc = 0;
  const items = [];

  const loads = els.map((el, i) => new Promise(resolve => {
    const { w, h } = sizes[i];
    const theta = (arc + w / 2) / R;
    arc += w + GAP;

    const geo = new THREE.PlaneGeometry(w, h, 40, 1);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const a = pos.getX(k) / R;
      pos.setX(k, Math.sin(a) * R);
      pos.setZ(k, Math.cos(a) * R - R);
    }
    geo.computeVertexNormals();

    const shared = {
      uMap: { value: null },
      uVideo: { value: null },
      uVideoMix: { value: 0 },
      uCover: { value: new THREE.Vector2(1, 1) },
      uSize: { value: new THREE.Vector2(w, h) },
      uVel: { value: 0 },
      uHover: { value: 0 },
      uAlpha: { value: 0 },
      uInside: { value: 0 },
      uFocus: { value: 0 },
    };
    const makeMat = reflect => new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: { ...shared, uReflect: { value: reflect } },
    });
    const place = mesh => {
      mesh.position.set(Math.sin(theta) * R, 0, Math.cos(theta) * R);
      mesh.rotation.y = theta;
      return mesh;
    };
    const mesh = place(new THREE.Mesh(geo, makeMat(0)));
    ring.add(mesh);
    mirror.add(place(new THREE.Mesh(geo, makeMat(1))));

    const trigger = el.querySelector('[data-video]');
    const item = { el, mesh, u: shared, theta, hover: 0, focus: 0, src: trigger?.dataset.video || null, video: null, wanted: false };
    mesh.userData.item = item;
    items.push(item);

    loader.load(el.dataset.ring, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const ia = tex.image.width / tex.image.height;
      const pa = w / h;
      shared.uCover.value.set(ia > pa ? pa / ia : 1, ia > pa ? 1 : ia / pa);
      shared.uMap.value = tex;
      resolve();
    }, undefined, resolve);
  }));
  const meshes = () => items.map(it => it.mesh);

  // ---------- piso: luz, regla de la línea de tiempo y cabezal ----------
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(R * 2.4, 48),
    new THREE.MeshBasicMaterial({ map: softDot('rgba(139,92,246,.5)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = FLOOR - 0.01;
  stage.add(glow);

  const rulerR = R + 0.16;
  const tickPts = [];
  const TICKS = 240;
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * TAU;
    const major = i % 10 === 0;
    const s = major ? 0.12 : 0.05;
    const r0 = rulerR, r1 = rulerR + s;
    tickPts.push(Math.sin(a) * r0, FLOOR, Math.cos(a) * r0, Math.sin(a) * r1, FLOOR, Math.cos(a) * r1);
  }
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
  const rulerMat = new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.55, depthWrite: false });
  ring.add(new THREE.LineSegments(tickGeo, rulerMat));

  const headGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, FLOOR, -rulerR - 0.2), new THREE.Vector3(0, FLOOR, -rulerR + 0.14),
  ]);
  const headMat = new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, depthWrite: false });
  stage.add(new THREE.LineSegments(headGeo, headMat));

  // ---------- polvo en el aire, como en una sala oscura ----------
  const DUST = fine ? 260 : 120;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * TAU, r = 0.4 + Math.random() * 4;
    dustPos.set([Math.sin(a) * r, -1 + Math.random() * 3, Math.cos(a) * r], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.035, map: softDot('rgba(196,181,253,1)'), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  stage.add(dust);

  // ---------- layout ----------
  let w = 1, h = 1, wide = true;
  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    wide = w / h > 1.1;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- interacción ----------
  const mouse = new THREE.Vector2(0, 0);       // -1..1 suavizado
  const target = new THREE.Vector2(0, 0);
  const ndc = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  let hovered = null;
  let drag = null;           // arrastre manual
  let spin = 0;              // velocidad extra del arrastre
  let dragYaw = 0;           // adentro de la sala, vuelve solo a su lugar

  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    target.set(e.clientX / w * 2 - 1, -(e.clientY / h * 2 - 1));
    const overGrab = grabArea.contains(e.target);
    if (overGrab) ndc.copy(target); else ndc.set(9, 9);
    if (drag) {
      const dx = e.clientX - drag.x;
      drag.moved += Math.abs(dx);
      spin = dx * 0.004;
      if (enter < 0.5) auto += spin; else dragYaw += spin;
      drag.x = e.clientX;
    }
  }, { passive: true });
  grabArea.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.target.closest('a,button')) return;
    drag = { x: e.clientX, moved: 0 };
    grabArea.classList.add('is-grabbing');
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const wasClick = drag.moved < 6;
    drag = null;
    grabArea.classList.remove('is-grabbing');
    if (wasClick && hovered) onSelect?.(hovered.el);
  });

  // ---------- estado ----------
  const intro = { v: reduce ? 1 : 0 };
  let heroP = 0, finaleP = 0;
  let heroOn = false, finaleOn = false;
  let running = false, paused = false;
  let vel = 0, auto = 0, enter = 0;
  let activeItem = null;
  const look = new THREE.Vector3();
  const clock = new THREE.Clock();

  // ---------- video del panel de enfrente ----------
  function startVideo(it) {
    if (!it.src) return;
    it.wanted = true;
    if (!it.video) {
      const v = document.createElement('video');
      v.src = it.src; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      it.video = v;
      const tex = new THREE.VideoTexture(v);
      tex.colorSpace = THREE.SRGBColorSpace;
      it.u.uVideo.value = tex;
    }
    it.video.play().catch(() => {});
  }
  function stopVideo(it) {
    it.wanted = false;
    it.video?.pause();
  }
  function setActive(it) {
    if (it === activeItem) return;
    if (activeItem) stopVideo(activeItem);
    activeItem = it;
    if (it && !paused) startVideo(it);
    onActive?.(it ? it.el : null, it ? items.indexOf(it) : -1, items.length);
  }

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // velocidad del scroll suavizada
    const rawVel = THREE.MathUtils.clamp((getVelocity?.() || 0) / 40, -1.5, 1.5);
    vel += (rawVel - vel) * 0.08;
    spin *= 0.94;
    mouse.lerp(target, 0.05);

    const finale = finaleOn && !heroOn;
    const p = finale ? 0 : heroP;

    // fases del scroll en el inicio: afuera, atravesar, sala, salir
    enter = smooth(p, 0.05, 0.3);
    const roomP = THREE.MathUtils.clamp((p - 0.3) / 0.62, 0, 1);
    const exit = smooth(p, 0.93, 0.995);

    // recorrido por los paneles: frena un poco en cada uno
    const fi = roomP * (items.length - 1);
    const i0 = Math.min(Math.floor(fi), Math.max(items.length - 2, 0));
    const ef = smooth(fi - i0, 0.18, 0.82);
    const a0 = items[i0]?.theta ?? 0;
    const a1 = items[i0 + 1]?.theta ?? a0;
    const roomYaw = Math.PI - lerp(a0, a1, ef);

    if (!drag) {
      auto += (reduce ? 0 : dt * 0.09) * (1 - enter) + vel * 0.02 * (1 - enter) + (enter < 0.5 ? spin : 0);
      dragYaw *= 0.95;
    }
    ring.rotation.y = auto + wrap(roomYaw - auto) * enter + dragYaw * enter;
    dust.rotation.y = t * 0.012;
    dust.position.y = Math.sin(t * 0.15) * 0.08;

    // cámara y escenario
    const iv = intro.v;
    const fovOut = wide ? 32 : 44;
    const fovIn = wide ? 50 : 70;
    camera.fov = lerp(fovOut, fovIn, enter);
    camera.updateProjectionMatrix();
    const camOut = wide ? 9 : 10.5;
    const visW = 2 * camOut * Math.tan(THREE.MathUtils.degToRad(fovOut / 2)) * camera.aspect;

    let sx, sy, rx, rz, sc, alpha;
    if (finale) {
      const f = smooth(finaleP, 0, 0.7);
      sx = wide ? visW * 0.31 : 0;
      sy = wide ? 0.1 : 2.15;
      rx = 0.2 + mouse.y * 0.08;
      rz = -0.08 + mouse.x * 0.04;
      sc = (wide ? 0.84 : 0.66) * (0.86 + f * 0.14);
      alpha = f * 0.9;
      camera.position.set(mouse.x * 0.5, mouse.y * 0.3, camOut);
      look.set(sx * 0.6, sy * 0.6, 0);
    } else {
      const ox = wide ? visW * 0.27 : 0;
      const oy = wide ? 0.1 : 2.3;
      sx = lerp(ox, 0, enter);
      sy = lerp(oy + Math.sin(t * 0.6) * 0.04, 0, enter);
      rx = lerp(0.2 + mouse.y * 0.08, 0, enter);
      rz = lerp(-0.1 + mouse.x * 0.04, 0, enter);
      sc = lerp((wide ? 0.92 : 0.72) * (0.72 + iv * 0.28), 1, enter);
      alpha = iv * (1 - exit);
      camera.position.set(
        mouse.x * 0.5 * (1 - enter),
        mouse.y * 0.3 * (1 - enter),
        lerp(camOut, wide ? 0.25 : 0.95, enter) + (1 - iv) * 2,
      );
      look.set(lerp(sx * 0.6, mouse.x * 0.9, enter), lerp(sy * 0.6, mouse.y * 0.32, enter), lerp(0, -6, enter));
    }
    stage.position.set(sx, sy, 0);
    stage.rotation.set(rx, 0, rz);
    stage.scale.setScalar(sc);
    camera.lookAt(look);

    // panel de enfrente (adentro de la sala)
    const inRoom = !finale && enter > 0.86 && exit < 0.6;
    let front = null;
    if (inRoom) {
      let best = Infinity;
      items.forEach(it => {
        const d = Math.abs(wrap(it.theta + ring.rotation.y - Math.PI));
        if (d < best) { best = d; front = it; }
      });
    }
    setActive(front);

    // hover / selección
    let hit = null;
    if (fine && ndc.x < 2 && !finale && !paused && !drag) {
      if (inRoom) {
        ray.setFromCamera(ndc, camera);
        if (front && ray.intersectObject(front.mesh, false).length) hit = front;
      } else if (enter < 0.12) {
        ray.setFromCamera(ndc, camera);
        const res = ray.intersectObjects(meshes(), false);
        if (res.length && isFacing(res[0])) hit = res[0].object.userData.item;
      }
    }
    if (hit !== hovered) {
      hovered = hit;
      onHover?.(hovered ? hovered.el.dataset.title : null);
      grabArea.classList.toggle('is-pointing', !!hovered);
    }

    items.forEach((it, i) => {
      const u = it.u;
      it.hover += ((it === hovered ? 1 : 0) - it.hover) * 0.1;
      it.focus += ((it === front ? 1 : 0) - it.focus) * 0.08;
      const ready = it.wanted && it.video && it.video.readyState >= 2;
      u.uVideoMix.value += ((ready ? 1 : 0) - u.uVideoMix.value) * 0.08;
      u.uHover.value = it.hover;
      u.uFocus.value = it.focus;
      u.uInside.value = finale ? 0 : enter;
      u.uVel.value = vel + spin * 6;
      // aparición escalonada
      const a = THREE.MathUtils.clamp(iv * 1.6 - i * 0.06, 0, 1);
      u.uAlpha.value = a * alpha;
    });
    glow.material.opacity = alpha;
    rulerMat.opacity = 0.55 * alpha;
    headMat.opacity = alpha;
    dustMat.opacity = 0.5 * alpha;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function isFacing(hit) {
    // sólo cuentan los paneles que miran a la cámara
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    return n.dot(ray.ray.direction) < 0;
  }

  function sync() {
    const on = heroOn || finaleOn;
    canvas.style.visibility = on ? 'visible' : 'hidden';
    if (on && !running) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
    if (!on) { running = false; setActive(null); }
  }

  return {
    ready: Promise.all(loads),
    intro,
    count: els.length,
    setHero(p) { heroP = p; },
    setFinale(p) { finaleP = p; },
    setHeroVisible(v) { heroOn = v; sync(); },
    setFinaleVisible(v) { finaleOn = v; sync(); },
    setPaused(v) {
      paused = v;
      if (!activeItem) return;
      if (v) stopVideo(activeItem); else startVideo(activeItem);
    },
  };
}
