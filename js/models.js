// 3D models: hand bender, electric bender, floor, conduit mesh, marks and tape.
// Scene units are inches. Y is up. The bender bends in the XY plane, +X is the hook (front) side.
import * as THREE from 'three';
import { fmtIn } from './data.js';
import { benderRefs, ELECTRIC_BEND_HEIGHT } from './rig.js';

const DEG = Math.PI / 180;

// ---------- procedural textures ----------
function canvasTex(size, draw, { srgb = false, repeat = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Cast iron / sand-cast surface: mottled tone with fine pitting. Grey-scale, used as color, bump and roughness.
function castCanvas(ctx, S, seed = 7, base = 150) {
  const r = rand(seed);
  ctx.fillStyle = `rgb(${base},${base},${base})`; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) { // soft mottling
    const x = r() * S, y = r() * S, rad = 10 + r() * 60, v = base + (r() - 0.5) * 50 | 0;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < S * S / 6; i++) { // grain
    const v = base + (r() - 0.5) * 90 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(r() * S, r() * S, 1 + (r() < 0.1), 1 + (r() < 0.1));
  }
  for (let i = 0; i < 500; i++) { // pits
    ctx.fillStyle = `rgba(40,40,40,${0.25 + r() * 0.4})`;
    ctx.beginPath(); ctx.arc(r() * S, r() * S, 0.6 + r() * 1.6, 0, 7); ctx.fill();
  }
}
const TEX = {};
function tex() {
  if (TEX.cast) return TEX;
  TEX.cast = canvasTex(512, (c, S) => castCanvas(c, S, 11, 150), { repeat: 0.16 });
  TEX.castColor = canvasTex(512, (c, S) => castCanvas(c, S, 11, 205), { srgb: true, repeat: 0.16 });
  TEX.powder = canvasTex(256, (c, S) => castCanvas(c, S, 3, 170), { repeat: 0.25 });
  // knurled diamond pattern for the rubber grip (u around, v along)
  TEX.knurl = canvasTex(256, (c, S) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, S, S);
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 3;
    const n = 8;
    for (let i = -n; i <= 2 * n; i++) {
      c.beginPath(); c.moveTo(i * S / n, 0); c.lineTo(i * S / n + S, S); c.stroke();
      c.beginPath(); c.moveTo(i * S / n, 0); c.lineTo(i * S / n - S, S); c.stroke();
    }
    const g = c.getImageData(0, 0, S, S); // soften
    c.putImageData(g, 0, 0);
  });
  TEX.knurl.repeat.set(10, 6);
  TEX.brushed = canvasTex(256, (c, S) => {
    const r = rand(5);
    c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { const v = 110 + r() * 60 | 0; c.fillStyle = `rgba(${v},${v},${v},0.35)`; c.fillRect(0, r() * S, S, 1); }
  }, { repeat: 1 });
  // Galvanized EMT: u runs along the conduit (1 repeat per foot), v around it. Zinc is bright and
  // slightly blotchy from the hot-dip, with fine lengthwise draw lines from the tube mill.
  const galv = (rough) => (c, S) => {
    const r = rand(rough ? 41 : 43);
    const base = rough ? 120 : 214;
    c.fillStyle = `rgb(${base},${base},${base + (rough ? 0 : 3)})`; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { // soft zinc mottling
      const x = r() * S, y = r() * S, rad = 20 + r() * 90, v = base + (r() - 0.5) * (rough ? 60 : 22) | 0;
      const gr = c.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v + (rough ? 0 : 2)},0.45)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      for (const dx of [-S, 0, S]) { c.fillStyle = gr; c.save(); c.translate(dx, 0); c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore(); }
    }
    for (let i = 0; i < 900; i++) { // lengthwise draw lines (along u)
      const v = base + (r() - 0.5) * (rough ? 70 : 26) | 0;
      c.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.3})`;
      c.fillRect(0, r() * S, S, 0.6 + r() * 0.8);
    }
  };
  TEX.galvColor = canvasTex(512, galv(false), { srgb: true });
  TEX.galvRough = canvasTex(512, galv(true));
  TEX.tread = canvasTex(128, (c, S) => {
    c.fillStyle = '#909090'; c.fillRect(0, 0, S, S);
    c.fillStyle = '#202020';
    for (let i = 0; i < 8; i++) c.fillRect(0, i * S / 8, S, S / 20);
  }, { repeat: 1 });
  return TEX;
}

// ---------- materials (rugged dark grey + brown palette) ----------
const t = tex();
export const MAT = {
  // ductile-iron bender casting: dark grey, cast texture
  iron: new THREE.MeshStandardMaterial({ color: 0x5a5c5e, map: t.castColor, metalness: 0.55, roughness: 0.62, roughnessMap: t.cast, bumpMap: t.cast, bumpScale: 0.6 }),
  // polished groove where the conduit rides
  ironWorn: new THREE.MeshStandardMaterial({ color: 0x8f9194, map: t.brushed, metalness: 0.8, roughness: 0.32 }),
  // rugged brown accents (pedal pad, powder-coated machine frame)
  brown: new THREE.MeshStandardMaterial({ color: 0x4e3626, map: t.castColor, metalness: 0.15, roughness: 0.7, bumpMap: t.powder, bumpScale: 0.35 }),
  brownDark: new THREE.MeshStandardMaterial({ color: 0x33241a, metalness: 0.15, roughness: 0.75, bumpMap: t.powder, bumpScale: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9da2a6, map: t.brushed, metalness: 0.85, roughness: 0.34 }),
  bolt: new THREE.MeshStandardMaterial({ color: 0x6d7074, metalness: 0.9, roughness: 0.4 }),
  // EMT: hot-dip zinc with a thin clear topcoat
  galv: new THREE.MeshPhysicalMaterial({ color: 0xd2d7dc, map: t.galvColor, metalness: 0.92, roughness: 0.75, roughnessMap: t.galvRough, // ×map ≈ 0.3–0.4
    clearcoat: 0.35, clearcoatRoughness: 0.22, envMapIntensity: 1.1 }),
  handlePipe: new THREE.MeshStandardMaterial({ color: 0x8c9196, map: t.brushed, metalness: 0.75, roughness: 0.45 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x2b211b, roughness: 0.82, metalness: 0.0, bumpMap: t.knurl, bumpScale: 1.2 }),
  rubberCap: new THREE.MeshStandardMaterial({ color: 0x241c17, roughness: 0.75, metalness: 0.0 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1b1a19, metalness: 0.2, roughness: 0.7 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb8432c, metalness: 0.2, roughness: 0.55 }),
  stripe: new THREE.MeshBasicMaterial({ color: 0x2a3550, side: THREE.DoubleSide }),
  pencil: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  pencilSel: new THREE.MeshBasicMaterial({ color: 0xe0612c }),
};
// legacy names used elsewhere
MAT.alum = MAT.iron; MAT.alumDark = MAT.ironWorn; MAT.machine = MAT.brown;

// ---------- text helpers ----------
// Every floating label in the 3D view (measurements, mark IDs, "Land here", "Start · panel", item names)
// uses one look: bold, semi-transparent yellow text with a thin dark outline so it reads on the white
// floor and wall alike. (The old color / bg options are accepted but no longer change the look.)
export function makeLabelSprite(text, { size = 1.0 } = {}) {
  const H = 96, pad = 14;                                   // drawn at 96 px tall for crisp edges
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '800 64px "Segoe UI", "Inter", Arial, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.width = w; c.height = H;
  ctx.font = font; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(12, 16, 26, 0.55)';   // outline
  ctx.strokeText(text, pad, H / 2 + 3);
  ctx.fillStyle = 'rgba(255, 214, 48, 0.92)';                       // bold yellow
  ctx.fillText(text, pad, H / 2 + 3);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true, opacity: 0.85, toneMapped: false }));
  sp.scale.set(1.25 * size * w / H, 1.25 * size, 1);   // a touch larger than the old pill labels
  sp.renderOrder = 10;
  return sp;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- shoe ----------
function polar(r, aDeg) { return new THREE.Vector2(r * Math.cos(aDeg * DEG), r * Math.sin(aDeg * DEG)); }

function shoeShape(arcR, a0, a1, neck) {
  const s = new THREE.Shape();
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const p = polar(arcR, a0 + (a1 - a0) * i / n);
    if (i === 0) s.moveTo(p.x, p.y); else s.lineTo(p.x, p.y);
  }
  for (const [rr, a] of neck) { const p = polar(Math.min(rr, arcR * 0.97), a); s.lineTo(p.x, p.y); }
  s.closePath();
  return s;
}
// annular sector (for the raised rim band)
function bandShape(r0, r1, a0, a1) {
  const s = new THREE.Shape(); const n = 72;
  for (let i = 0; i <= n; i++) { const p = polar(r1, a0 + (a1 - a0) * i / n); i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y); }
  for (let i = n; i >= 0; i--) { const p = polar(r0, a0 + (a1 - a0) * i / n); s.lineTo(p.x, p.y); }
  s.closePath(); return s;
}

// Painted markings on the side of the shoe: arrow, star, rim notch and a clean degree scale.
// Painted markings for one face of the shoe. The back face (mirror = true) is seen from behind,
// so every mark is placed at its mirrored spot while the lettering still reads normally.
function shoeDecal(b, r, Ro, mirror = false) {
  const ext = Ro + 1.5;
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const k = S / (2 * ext);
  const X = (x) => ((mirror ? -x : x) + ext) * k, Y = (y) => (ext - y) * k;
  const refs = benderRefs(b);
  const paint = '#ece5d6', accent = '#e0612c';
  ctx.lineCap = 'round';
  // Text centered at shoe point p, running along direction d (shoe space), turned so it never reads upside down.
  const label = (text, p, d) => {
    let ang = Math.atan2(-(d.y), mirror ? -d.x : d.x);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(ang); ctx.fillText(text, 0, 0); ctx.restore();
  };
  // degree scale: major ticks only. When the bend reaches θ, the θ tick sits straight above the point
  // where the conduit leaves the shoe. Numbers run along the radius like a dial, so close ticks
  // (10 / 22½ / 30 on the small shoes) never overlap.
  const ticks = [10, 22.5, 30, 45, 60, 90];
  ctx.strokeStyle = paint; ctx.fillStyle = paint;
  ctx.font = `600 ${Math.round(Math.min(0.48, Ro * 0.07) * k)}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tdeg of ticks) {
    const a = -90 - tdeg;
    const major = tdeg % 45 === 0;
    const p1 = polar(Ro - 0.7, a), p2 = polar(Ro - (major ? 1.45 : 1.15), a);
    ctx.lineWidth = 0.08 * k;
    ctx.beginPath(); ctx.moveTo(X(p1.x), Y(p1.y)); ctx.lineTo(X(p2.x), Y(p2.y)); ctx.stroke();
    const txt = tdeg === 22.5 ? '22½' : String(tdeg);
    const w = ctx.measureText(txt).width / k;
    label(txt, polar(Ro - 1.75 - w / 2, a), polar(1, a));
  }
  const drawRef = (key, color, symbol) => {
    const ref = refs[key]; if (!ref) return;
    // paint only goes on the casting: a mark past the shoe's edge is painted at the edge
    const x = Math.max(-(Ro - 0.8), Math.min(Ro - 0.8, ref.x));
    const yRim = x * x < Ro * Ro ? -Math.sqrt(Ro * Ro - x * x) : -r;
    ctx.fillStyle = color; ctx.strokeStyle = color;
    if (symbol === 'arrow') {
      const top = yRim + 2.5, tip = yRim + 0.72;
      ctx.lineWidth = 0.2 * k;
      ctx.beginPath(); ctx.moveTo(X(x), Y(top)); ctx.lineTo(X(x), Y(tip + 0.55)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(x - 0.42), Y(tip + 0.7)); ctx.lineTo(X(x + 0.42), Y(tip + 0.7)); ctx.lineTo(X(x), Y(tip)); ctx.closePath(); ctx.fill();
    } else if (symbol === 'star') {
      const cy = yRim + 1.25;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? 0.22 : 0.52, a = (90 + i * 36) * DEG;
        ctx.lineTo(X(x + rr * Math.cos(a)), Y(cy + rr * Math.sin(a)));
      }
      ctx.closePath(); ctx.fill();
    } else if (symbol === 'line') {
      ctx.lineWidth = 0.07 * k; ctx.setLineDash([0.25 * k, 0.15 * k]);
      ctx.beginPath(); ctx.moveTo(X(x), Y(yRim + 2.0)); ctx.lineTo(X(x), Y(yRim + 0.5)); ctx.stroke(); ctx.setLineDash([]);
    }
  };
  if (b.type === 'hand') { drawRef('arrow', accent, 'arrow'); drawRef('star', accent, 'star'); }
  else { drawRef('tangent', paint, 'line'); drawRef('notch', '#a9a294', 'line'); drawRef('star', accent, 'star'); }
  // cast size lettering: in the clear upper part of the shoe, away from the degree scale
  ctx.fillStyle = paint; ctx.textAlign = 'center';
  const big = Math.min(0.8, Ro * 0.1), small = Math.min(0.4, Ro * 0.058);
  const mid = polar(Ro * 0.5, 128);
  ctx.font = `700 ${Math.round(big * k)}px Arial`;
  ctx.fillText(`${b.size}" EMT`, X(mid.x), Y(mid.y));
  ctx.font = `600 ${Math.round(small * k)}px Arial`;
  ctx.fillText(`${b.type === 'hand' ? 'TAKE-UP' : 'DEDUCT'} ${fmtIn(b.deduct)}`, X(mid.x), Y(mid.y - big * 0.95));
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(2 * ext, 2 * ext),
    new THREE.MeshStandardMaterial({ map: tx, transparent: true, alphaTest: 0.3, roughness: 0.7, metalness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}

function hexBolt(size, len, mat = MAT.bolt) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(size, size, size * 0.65, 6), mat);
  head.rotation.x = Math.PI / 2; head.position.z = size * 0.32; g.add(head);
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.25, size * 1.25, size * 0.15, 20), mat);
  washer.rotation.x = Math.PI / 2; washer.position.z = 0.04; g.add(washer);
  if (len) {
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.55, len, 12), mat);
    shank.rotation.x = Math.PI / 2; shank.position.z = size * 0.65 + len / 2; g.add(shank);
  }
  return g;
}

// Rib (raised web) on the face of the casting from radius r0 to r1 at angle a.
function rib(r0, r1, aDeg, w, h, mat) {
  const len = r1 - r0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, h), mat);
  const mid = polar((r0 + r1) / 2, aDeg);
  m.position.set(mid.x, mid.y, 0);
  m.rotation.z = aDeg * DEG;
  return m;
}

// Common grooved shoe. Origin = shoe center (center of the bend radius). Hook/tangent at -90°.
// rimOver: how far the side plates reach past the conduit's outside. A hand bender works on the
// floor, so its plates stop right at the bottom of the conduit and never dig into the floor.
function buildShoe(b, od, { a0, a1, neck, ribs = [], rimOver = Math.max(0.45, od * 0.45) }) {
  const r = od / 2;
  const R = b.R;
  const Ro = R + r + rimOver;
  const halfGroove = r + 0.15; // plate bevel (0.1) eats into this, leaving ~0.05" clearance
  const th = Math.max(0.45, od * 0.4);
  const g = new THREE.Group();
  const ex = { depth: th, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 3, curveSegments: 64 };
  const plateGeo = new THREE.ExtrudeGeometry(shoeShape(Ro, a0, a1, neck), ex);
  const zOuter = halfGroove + th + 0.2; // outer face incl. extrude bevel
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(plateGeo, MAT.iron);
    p.position.z = side > 0 ? halfGroove + 0.1 : -halfGroove - th - 0.1; g.add(p);
    // raised rim band around the grooved edge
    const band = new THREE.Mesh(new THREE.ExtrudeGeometry(bandShape(Ro - 0.55, Ro, a0 + 2, a1 - 2), { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 64 }), MAT.iron);
    band.position.z = side > 0 ? zOuter : -zOuter - 0.14; g.add(band);
    // stiffening ribs + hub boss
    for (const [r0, r1, a] of ribs) {
      const rb = rib(r0, r1, a, 0.32, 0.22, MAT.iron);
      rb.position.z = side * (zOuter + 0.1); g.add(rb);
    }
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(Ro * 0.17, Ro * 0.19, 0.3, 36), MAT.iron);
    boss.rotation.x = Math.PI / 2; boss.position.z = side * (zOuter + 0.15); g.add(boss);
    const bolt = hexBolt(Math.max(0.3, od * 0.22), 0);
    bolt.position.z = side * (zOuter + 0.3); if (side < 0) bolt.rotation.y = Math.PI; g.add(bolt);
  }
  // groove core (worn bright where the conduit rides)
  const coreGeo = new THREE.ExtrudeGeometry(shoeShape(R - r, a0, a1, neck), { depth: 2 * halfGroove, bevelEnabled: false, curveSegments: 64 });
  const core = new THREE.Mesh(coreGeo, MAT.ironWorn); core.position.z = -halfGroove; g.add(core);
  // painted markings, both faces
  const d1 = shoeDecal(b, r, Ro); d1.position.z = zOuter + 0.015; d1.userData.decal = true; g.add(d1);
  const d2 = shoeDecal(b, r, Ro, true); d2.rotation.y = Math.PI; d2.position.z = -zOuter - 0.015; d2.userData.decal = true; g.add(d2);
  // physical rim notch (center of 45°) cut into the rim band
  const nx = -R * Math.PI / 8;
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 2 * zOuter + 0.35), MAT.black);
  notch.position.set(nx, -Math.sqrt(Ro * Ro - nx * nx) + 0.22, 0); g.add(notch);
  // hook: a U-shaped cradle under the conduit, cast between the side plates
  const hookStart = b.type === 'hand' ? -0.1 : 0.2;
  const hookLen = b.type === 'hand' ? Math.max(1.4, od * 1.3) : b.hookOffset - 0.2;
  // the hand bender's hook is a thin lip under the conduit (it rests on the floor during a bend)
  const hT = b.type === 'hand' ? 0.1 : Math.max(0.32, od * 0.26);
  const cradle = new THREE.Shape();
  const rin = r + 0.03, rout = r + hT;
  cradle.moveTo(-zOuter, 0.2);
  cradle.lineTo(-zOuter, -rin * 0.2);
  cradle.absarc(0, 0, rout, Math.PI + 0.35, -0.35, false);
  cradle.lineTo(zOuter, -rin * 0.2);
  cradle.lineTo(zOuter, 0.2);
  cradle.lineTo(rin, 0.2);
  cradle.absarc(0, 0, rin, 0.0, Math.PI, true);
  cradle.lineTo(-zOuter, 0.2);
  const hookGeo = new THREE.ExtrudeGeometry(cradle, { depth: hookLen, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 24 });
  hookGeo.rotateY(Math.PI / 2);
  const hook = new THREE.Mesh(hookGeo, MAT.iron);
  hook.position.set(hookStart, -R, 0);
  g.add(hook);
  // side cheeks joining the hook to the plates
  for (const sz of [1, -1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(hookLen, 2 * r + 0.5, th), MAT.iron);
    cheek.position.set(hookStart + hookLen / 2, -R + 0.05, sz * (halfGroove + 0.1 + th / 2));
    g.add(cheek);
    const rv = hexBolt(0.18, 0); rv.position.set(hookStart + hookLen * 0.55, -R + 0.1, sz * zOuter);
    if (sz < 0) rv.rotation.y = Math.PI; g.add(rv);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, Ro, halfGroove, t: th, zW: 2 * zOuter };
}

// High-quality molded rubber grip: lathe profile with a collar, finger ribs and a flared, domed end cap.
function buildGrip(pipeR, len) {
  const pts = [];
  const base = pipeR + 0.13;
  pts.push(new THREE.Vector2(pipeR * 0.98, 0));
  pts.push(new THREE.Vector2(base + 0.2, 0.02));
  pts.push(new THREE.Vector2(base + 0.24, 0.35));   // collar
  pts.push(new THREE.Vector2(base + 0.05, 0.55));
  const ribStart = 0.7, ribEnd = len - 1.6, nRib = 22;
  for (let i = 0; i <= nRib * 6; i++) {
    const y = ribStart + (ribEnd - ribStart) * i / (nRib * 6);
    const swell = 0.06 * Math.sin(Math.PI * (y - ribStart) / (ribEnd - ribStart)); // slight barrel shape
    const ribH = 0.045 * Math.max(0, Math.cos(i / 6 * Math.PI * 2));
    pts.push(new THREE.Vector2(base + swell + ribH, y));
  }
  pts.push(new THREE.Vector2(base + 0.05, len - 1.3));
  pts.push(new THREE.Vector2(base + 0.3, len - 0.8));  // flare
  pts.push(new THREE.Vector2(base + 0.33, len - 0.45));
  for (let i = 0; i <= 8; i++) { // domed end
    const a = i / 8 * Math.PI / 2;
    pts.push(new THREE.Vector2((base + 0.33) * Math.cos(a) + 0.001, len - 0.45 + 0.4 * Math.sin(a)));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.computeVertexNormals();
  const grip = new THREE.Mesh(geo, MAT.rubber);
  grip.castShadow = true;
  return grip;
}

export function buildHandBender(b, od) {
  const root = new THREE.Group();
  const r = od / 2;
  const RoEst = b.R + r;
  // The shoe arc runs from the hook (-68°) round past the heel to 125° so the foot step can sit on
  // top of the heel, where it stays clear of the floor all the way past a 90° bend.
  const PEDAL_A = 128;
  const neck = [[RoEst * 0.8, -30], [RoEst * 0.58, 12], [RoEst * 0.58, 72], [RoEst * 0.62, 112]];
  const ribs = [[RoEst * 0.22, RoEst - 0.55, -197], [RoEst * 0.22, RoEst * 0.66, -55], [RoEst * 0.22, RoEst * 0.48, -90]];
  const { g: shoe, zW, Ro } = buildShoe(b, od, { a0: PEDAL_A - 360 - 4, a1: -68, neck, ribs, rimOver: -0.13 }); // -0.13 = the plate bevel (0.12) plus a hair
  root.add(shoe);
  // handle socket (45° toward the hook): cast boss with a reinforcing collar and set screw
  const hAng = 45, rotZ = (hAng - 90) * DEG;
  const dir = new THREE.Vector3(Math.cos(hAng * DEG), Math.sin(hAng * DEG), 0);
  const sR = b.handleOD / 2 + 0.3;
  const sockLen = Ro * 0.62;
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(sR, sR + 0.12, sockLen, 36), MAT.iron);
  sock.position.copy(dir.clone().multiplyScalar(Ro * 0.18 + sockLen / 2)); sock.rotation.z = rotZ;
  shoe.add(sock);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(sR + 0.02, 0.12, 12, 36), MAT.iron);
  collar.position.copy(dir.clone().multiplyScalar(Ro * 0.18 + sockLen - 0.1));
  collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  shoe.add(collar);
  const screw = hexBolt(0.2, 0);
  screw.position.copy(dir.clone().multiplyScalar(Ro * 0.18 + sockLen * 0.75)).add(new THREE.Vector3(0, 0, sR));
  shoe.add(screw);
  // gussets between socket and plates
  for (const sz of [1, -1]) {
    const gus = new THREE.Mesh(new THREE.BoxGeometry(sockLen * 0.8, 0.28, 0.5), MAT.iron);
    gus.position.copy(dir.clone().multiplyScalar(Ro * 0.18 + sockLen * 0.4)).add(new THREE.Vector3(0, 0, sz * (zW / 2 - 0.2)));
    gus.rotation.z = hAng * DEG;
    shoe.add(gus);
  }
  // handle: rigid conduit pipe with threaded end and a molded rubber grip
  const hR = b.handleOD / 2;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(hR, hR, b.handleLen, 32), MAT.handlePipe);
  handle.position.copy(dir.clone().multiplyScalar(Ro * 0.35 + b.handleLen / 2)); handle.rotation.z = rotZ;
  handle.castShadow = true;
  shoe.add(handle);
  const gripLen = 11;
  const grip = buildGrip(hR, gripLen);
  grip.position.copy(dir.clone().multiplyScalar(Ro * 0.35 + b.handleLen - gripLen + 0.4)); grip.rotation.z = rotZ;
  shoe.add(grip);
  // foot step on top of the heel: a cast tread plate lying along the rim
  const tan = (PEDAL_A + 90) * DEG;
  const tdir = new THREE.Vector3(Math.cos(tan), Math.sin(tan), 0);
  const pedal = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, zW + 1.6), MAT.iron);
  const p3 = (rr, a) => { const p = polar(rr, a); return new THREE.Vector3(p.x, p.y, 0); };
  pedal.position.copy(p3(Ro + 0.2, PEDAL_A)); pedal.rotation.z = tan; shoe.add(pedal);
  for (let i = 0; i < 5; i++) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, zW + 1.2), MAT.brownDark);
    ridge.position.copy(p3(Ro + 0.45, PEDAL_A)).addScaledVector(tdir, -1.1 + i * 0.55);
    ridge.rotation.z = tan; shoe.add(ridge);
  }
  shoe.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, shoe, Ro };
}

export function buildElectricBender(b, od) {
  const root = new THREE.Group();
  const r = od / 2;
  const R = b.R;
  const Ro = R + r + Math.max(0.45, od * 0.45);
  const neck = [[Ro * 0.75, 40], [Ro * 0.75, 100], [Ro * 0.75, 150]];
  const ribs = [-30, -75, -120, -165, 15, 60, 95, 168].map(a => [Ro * 0.24, Ro * 0.6, a]);
  const { g: shoe, zW } = buildShoe(b, od, { a0: -205, a1: 20, neck, ribs });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, zW + 1.2, 6), MAT.steel);
  hub.rotation.x = Math.PI / 2; shoe.add(hub);
  root.add(shoe);

  // stand (static, relative to shoe center)
  const stand = new THREE.Group();
  const y0 = ELECTRIC_BEND_HEIGHT;
  const centerY = y0 + R;
  const zBack = -(zW / 2 + 3.5);
  const rb = (w, h, d, mat, x, y, z, bevel = 0.3) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat);
    m.position.set(x, y, z); stand.add(m); return m;
  };
  // gearbox housing with ribs and bolts
  rb(15, 15, 7.5, MAT.brown, 0, 0, zBack - 3.7);
  for (let i = -2; i <= 2; i++) rb(0.35, 15.2, 7.9, MAT.brownDark, i * 3, 0, zBack - 3.7);
  for (const [x, y] of [[-6.5, 6.5], [6.5, 6.5], [-6.5, -6.5], [6.5, -6.5]]) {
    const bo = hexBolt(0.35, 0); bo.position.set(x, y, zBack + 0.05); stand.add(bo);
  }
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 12, 36), MAT.steel);
  motor.rotation.z = Math.PI / 2; motor.position.set(-13.5, -3, zBack - 3.7); stand.add(motor);
  for (let i = 0; i < 9; i++) { // cooling fins
    const fin = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.12, 6, 36), MAT.steel);
    fin.rotation.y = Math.PI / 2; fin.position.set(-18.5 + i * 1.2, -3, zBack - 3.7); stand.add(fin);
  }
  const motorCap = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 1, 36), MAT.brownDark);
  motorCap.rotation.z = Math.PI / 2; motorCap.position.set(-20, -3, zBack - 3.7); stand.add(motorCap);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 4, 24), MAT.steel);
  shaft.rotation.x = Math.PI / 2; shaft.position.set(0, 0, zBack + 1); stand.add(shaft);
  // cart frame: column, base, axle, wheels
  rb(4.5, centerY - 7, 4.5, MAT.brown, 0, -(centerY - 7) / 2 - 7, zBack - 3.7);
  rb(42, 2.5, 26, MAT.brown, -6, -centerY + 4.25, zBack - 3.7);
  rb(40, 0.4, 24, MAT.brownDark, -6, -centerY + 5.7, zBack - 3.7);
  for (const [x, z] of [[-24, 6], [12, 6], [-24, -13], [12, -13]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 2.2, 32), MAT.black);
    w.rotation.x = Math.PI / 2; w.position.set(x, -centerY + 3, zBack - 3.7 + z); stand.add(w);
    const hubc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 16), MAT.steel);
    hubc.rotation.x = Math.PI / 2; hubc.position.copy(w.position); stand.add(hubc);
  }
  // roller support on the heel side that carries the conduit
  const rollerX = -(R + 9);
  const rollerR = 1.6;
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(rollerR, rollerR, zW + 1.5, 32), MAT.steel);
  roller.rotation.x = Math.PI / 2; roller.position.set(rollerX, -R - r - rollerR, 0); stand.add(roller);
  for (const sz of [1, -1]) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(rollerR + 0.6, rollerR + 0.6, 0.3, 32), MAT.steel);
    flange.rotation.x = Math.PI / 2; flange.position.set(rollerX, -R - r - rollerR, sz * (zW / 2 + 0.6)); stand.add(flange);
  }
  rb(2, 2, -zBack + 3, MAT.brown, rollerX, -R - r - rollerR, zBack / 2 - 1);
  rb(2, 8, 2, MAT.brown, rollerX, -R - r - rollerR + 4, zBack - 1);
  // foot switch
  rb(6, 1.6, 4.5, MAT.brownDark, 20, -centerY + 0.8, 16);
  rb(4.5, 0.5, 3.5, MAT.red, 20, -centerY + 1.8, 16);
  stand.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.add(stand);
  return { root, shoe, Ro };
}

// ---------- field-job wall and what is mounted on it (greys, black and white) ----------
// Light painted wall, near-black powder-coated panel, galvanized boxes, concrete column, dark wireway.
const drywallTex = canvasTex(512, (c, S) => {           // fine orange-peel paint texture
  const r = rand(77);
  c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { const v = 110 + r() * 50 | 0; c.fillStyle = `rgba(${v},${v},${v},0.5)`; c.beginPath(); c.arc(r() * S, r() * S, 0.6 + r() * 1.6, 0, 7); c.fill(); }
}, { repeat: 1 });
drywallTex.repeat.set(8, 8);
export const JOB_MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0xe6e7e9, roughness: 0.93, metalness: 0, bumpMap: drywallTex, bumpScale: 0.25 }),
  base: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.1 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.48, metalness: 0.35, bumpMap: t.powder, bumpScale: 0.25 }),
  panelDoor: new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.42, metalness: 0.35, bumpMap: t.powder, bumpScale: 0.2 }),
  seam: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.8 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8dbe0, roughness: 0.18, metalness: 1 }),
  label: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.7 }),
  boxSteel: new THREE.MeshStandardMaterial({ color: 0x8b9198, map: t.galvColor, roughness: 0.42, metalness: 0.85 }),
  cover: new THREE.MeshStandardMaterial({ color: 0xa7adb3, map: t.galvColor, roughness: 0.35, metalness: 0.88 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xaeb1b5, map: t.castColor, roughness: 0.95, metalness: 0, bumpMap: t.cast, bumpScale: 0.5 }),
  wireway: new THREE.MeshStandardMaterial({ color: 0x4b5058, roughness: 0.5, metalness: 0.4, bumpMap: t.powder, bumpScale: 0.2 }),
  door: new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.55, metalness: 0.25 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.4 }),
  panelInside: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.6, metalness: 0.2 }),
  cartTray: new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.62, metalness: 0.05 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.8, metalness: 0 }),
};

const boxAt = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

// ---- hollow sheet-metal enclosures with real holes where the conduit goes in ----
// Five walls (back + 4 sides) of thickness t, open at the front (+z). `holes` = [{c, n, r}] in the same
// coordinates as min/max: center, outward normal of the face it is punched in, radius.
// `kos` adds the concentric (1/2" + 3/4") knockout rings stamped into the walls, like a real box.
const FACES = [
  // key, outward normal, e_u, e_v (e_u × e_v = inward), which axis the plane sits on and at min/max
  { key: 'back', n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], ax: 2, side: 'min' },
  { key: 'right', n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], ax: 0, side: 'max' },
  { key: 'left', n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], ax: 0, side: 'min' },
  { key: 'top', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], ax: 1, side: 'max' },
  { key: 'bottom', n: [0, -1, 0], u: [0, 0, 1], v: [1, 0, 0], ax: 1, side: 'min' },
];
const KO_RING = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6, metalness: 0.5 });
function hollowBox(min, max, t, mat, holes = [], kos = false) {
  const g = new THREE.Group();
  const mn = new THREE.Vector3(...min), mx = new THREE.Vector3(...max);
  for (const F of FACES) {
    const n = new THREE.Vector3(...F.n), eu = new THREE.Vector3(...F.u), ev = new THREE.Vector3(...F.v);
    const ew = new THREE.Vector3().crossVectors(eu, ev);
    const plane = (F.side === 'min' ? mn : mx).getComponent(F.ax);
    // extent of the face in (u, v); top/bottom stop short of the sides, sides stop short of the back
    const lo = new THREE.Vector3(mn.x, mn.y, mn.z), hi = new THREE.Vector3(mx.x, mx.y, mx.z);
    if (F.key !== 'back') lo.z += t;
    if (F.key === 'top' || F.key === 'bottom') { lo.x += t; hi.x -= t; }
    const u0 = Math.min(lo.dot(eu), hi.dot(eu)), u1 = Math.max(lo.dot(eu), hi.dot(eu));
    const v0 = Math.min(lo.dot(ev), hi.dot(ev)), v1 = Math.max(lo.dot(ev), hi.dot(ev));
    const shape = new THREE.Shape();
    shape.moveTo(u0, v0); shape.lineTo(u1, v0); shape.lineTo(u1, v1); shape.lineTo(u0, v1); shape.lineTo(u0, v0);
    const mine = holes.filter(h => h.n.dot(n) > 0.9 && Math.abs(h.c.getComponent(F.ax) - plane) < 0.05);
    for (const h of mine) {
      const p = new THREE.Path(); p.absarc(h.c.dot(eu), h.c.dot(ev), h.r, 0, Math.PI * 2, true); shape.holes.push(p);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 40 });
    const m = new THREE.Mesh(geo, mat);
    const origin = new THREE.Vector3(); origin.setComponent(F.ax, plane);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(eu, ev, ew).setPosition(origin);
    g.add(m);
    if (!kos) continue;
    // stamped knockouts: three along each side at mid depth, four on the back; skip any that would
    // run into a real hole
    const pts = [];
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, du = u1 - u0, dv = v1 - v0;
    if (F.key === 'back') for (const a of [-1, 1]) for (const b of [-1, 1]) pts.push([uc + a * du * 0.27, vc + b * dv * 0.27]);
    else {
      const along = du >= dv ? 'u' : 'v';
      for (const k of [-0.3, 0, 0.3]) pts.push(along === 'u' ? [uc + k * du, vc] : [uc, vc + k * dv]);
    }
    for (const [u, v] of pts) {
      if (mine.some(h => Math.hypot(h.c.dot(eu) - u, h.c.dot(ev) - v) < h.r + 0.62)) continue;
      for (const w of [-0.004, t + 0.004]) for (const rr of [0.44, 0.555]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rr - 0.018, rr + 0.018, 40), KO_RING);
        ring.matrixAutoUpdate = false;
        ring.matrix.makeBasis(eu, ev, ew).setPosition(origin.clone().addScaledVector(eu, u).addScaledVector(ev, v).addScaledVector(ew, w));
        if (w < 0) ring.matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI));   // outer face looks out
        g.add(ring);
      }
    }
  }
  return g;
}

// The inside of a main-breaker load center, laid out like a real one (proportions taken from a
// product photo, scaled to the tub): black insulating base, two tin-plated hot bus bars with
// alternating breaker stabs, a 2-pole main breaker with the main lugs above it, a neutral bar with
// screw terminals each side joined by the crossover tie bar, a separate ground bar, the main bonding
// jumper (green screw), the grounding electrode conductor and the stamped knockouts and keyholes in the back.
const PI_MAT = {
  base: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.05 }),
  bus: new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.32, metalness: 0.85 }),
  busDark: new THREE.MeshStandardMaterial({ color: 0xa7acb2, roughness: 0.4, metalness: 0.8 }),
  screw: new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.25, metalness: 0.95 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2258d6, roughness: 0.4, metalness: 0.05 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.45, metalness: 0.05 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc26f3c, roughness: 0.35, metalness: 0.9 }),
  green: new THREE.MeshStandardMaterial({ color: 0x2f9a4a, roughness: 0.4, metalness: 0.4 }),
  ring: new THREE.MeshStandardMaterial({ color: 0x8e9399, roughness: 0.5, metalness: 0.6 }),
  hole: new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.9 }),
};
function buildPanelInterior(min, max) {
  const g = new THREE.Group();
  const W = max[0] - min[0], H = max[1] - min[1];
  const cx = (min[0] + max[0]) / 2, top = max[1];
  const X = (f) => cx + f * W, Y = (f) => top - f * H;      // fractions of the tub, from the photo
  const z0 = min[2] + 0.11;                                   // inside face of the back
  const add = (w, h, d, mat, x, y, z) => { const m = boxAt(w, h, d, mat, x, y, z); g.add(m); return m; };
  // stamped knockouts (three concentric sizes) and keyhole hangers in the back
  for (const [fx, fy] of [[-0.278, 0.064], [0.287, 0.064], [-0.27, 0.885], [0, 0.885], [0.287, 0.885]])
    for (const r of [0.55, 0.78, 0.98]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.025, r + 0.025, 48), PI_MAT.ring);
      ring.position.set(X(fx), Y(fy), z0 + 0.002); g.add(ring);
    }
  for (const fy of [0.151, 0.81]) {
    const h1 = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), PI_MAT.hole); h1.position.set(cx, Y(fy), z0 + 0.003); g.add(h1);
    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.42), PI_MAT.hole); h2.position.set(cx, Y(fy) - 0.25, z0 + 0.003); g.add(h2);
  }
  // black insulating base with its top wings
  const bz = 0.35;
  add(0.62 * W, 0.55 * H, bz, PI_MAT.base, cx, Y(0.515), z0 + bz / 2);
  add(0.72 * W, 0.06 * H, bz, PI_MAT.base, cx, Y(0.27), z0 + bz / 2);
  add(0.62 * W, 0.04 * H, bz + 0.2, PI_MAT.base, cx, Y(0.775), z0 + (bz + 0.2) / 2);
  // hot bus bars, the raised center divider and the alternating breaker stabs
  const busW = 0.074 * W, y0 = 0.28, y1 = 0.74;
  const busH = (y1 - y0) * H, busY = Y((y0 + y1) / 2);
  for (const fx of [-0.072, 0.076]) add(busW, busH, 0.12, PI_MAT.bus, X(fx), busY, z0 + bz + 0.06);
  add(0.074 * W, busH, 0.42, PI_MAT.black, X(0.002), busY, z0 + bz + 0.21);
  const nStab = 12;
  for (let i = 0; i < nStab; i++) {
    const fy = y0 + 0.03 + (i + 0.5) * (y1 - y0 - 0.06) / nStab;
    for (const side of [-1, 1]) {
      const busX = side < 0 ? X(-0.072) : X(0.076);
      // stab finger reaching toward the center, alternating bars down the row
      if ((i + (side < 0 ? 0 : 1)) % 2 === 0) add(0.05 * W, 0.012 * H, 0.08, PI_MAT.busDark, busX - side * 0.045 * W, Y(fy), z0 + bz + 0.17);
      add(0.022 * W, 0.016 * H, 0.1, PI_MAT.black, busX + side * 0.045 * W, Y(fy), z0 + bz + 0.08);   // breaker rail clips
    }
  }
  // 2-pole main breaker (blue + black halves, handles tied) and the bus straps down from it
  const mbY = Y(0.224), mbD = 2.0, mbZ = z0 + bz;
  add(0.087 * W, 0.078 * H, mbD, PI_MAT.blue, X(-0.008), mbY, mbZ + mbD / 2);
  add(0.087 * W, 0.078 * H, mbD, PI_MAT.black, X(0.079), mbY, mbZ + mbD / 2);
  add(0.06 * W, 0.022 * H, 0.35, PI_MAT.blue, X(-0.008), mbY + 0.01 * H, mbZ + mbD + 0.17);
  add(0.06 * W, 0.022 * H, 0.35, PI_MAT.black, X(0.079), mbY + 0.01 * H, mbZ + mbD + 0.17);
  add(0.16 * W, 0.006 * H, 0.08, PI_MAT.blue, X(0.035), mbY + 0.01 * H, mbZ + mbD + 0.36);   // handle tie
  for (const fx of [-0.072, 0.076]) add(0.045 * W, 0.05 * H, 0.1, PI_MAT.bus, X(fx), Y(0.27), z0 + bz + 0.12);
  // main lugs on top of the breaker, each with a big hex-socket screw
  const lug = (x, y, z) => {
    add(0.06 * W, 0.034 * H, 0.75, PI_MAT.bus, x, y, z + 0.375);
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 24), PI_MAT.screw);
    sc.rotation.x = Math.PI / 2; sc.position.set(x, y, z + 0.82); g.add(sc);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 6), PI_MAT.hole);
    sock.rotation.x = Math.PI / 2; sock.position.set(x, y, z + 0.9); g.add(sock);
  };
  lug(X(-0.091), Y(0.204), mbZ + 0.9);
  lug(X(0.152), Y(0.204), mbZ + 0.9);
  // neutral bars (with a lug at the top) and the slotted rails beside the bus, tied together at the bottom
  const nY0 = 0.32, nY1 = 0.72, nz = z0 + 0.62;
  const screwGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.08, 12);
  const screws = [];
  for (const fx of [-0.248, 0.252]) {
    add(0.03 * W, (nY1 - nY0) * H, 0.2, PI_MAT.bus, X(fx), Y((nY0 + nY1) / 2), nz);
    for (const sy of [nY0 + 0.02, nY1 - 0.02]) add(0.02 * W, 0.02 * H, 0.55, PI_MAT.black, X(fx), Y(sy), z0 + 0.27);   // standoffs
    for (let fy = nY0 + 0.012; fy < nY1 - 0.005; fy += 0.0155) screws.push([X(fx), Y(fy), nz + 0.13]);
    lug(X(fx), Y(0.295), nz - 0.3);
  }
  for (const fx of [-0.152, 0.157]) add(0.014 * W, (0.745 - 0.31) * H, 0.1, PI_MAT.busDark, X(fx), Y(0.5275), z0 + bz + 0.05);
  // crossover tie bar: down from each neutral bar and across under the bus
  const tieY = Y(0.775), tz = nz - 0.02;
  add(0.5 * W + 0.03 * W, 0.022 * H, 0.12, PI_MAT.bus, cx, tieY, tz);
  for (const fx of [-0.248, 0.252]) {
    add(0.024 * W, (0.775 - nY1) * H, 0.12, PI_MAT.bus, X(fx), Y((0.775 + nY1) / 2), tz);
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 16), PI_MAT.screw);
    sc.rotation.x = Math.PI / 2; sc.position.set(X(fx), tieY, tz + 0.1); g.add(sc);
  }
  // separate grounding conductor terminal bar, bolted to the tub
  const gY0 = 0.505, gY1 = 0.69;
  add(0.022 * W, (gY1 - gY0) * H, 0.18, PI_MAT.bus, X(0.317), Y((gY0 + gY1) / 2), z0 + 0.12);
  for (let fy = gY0 + 0.012; fy < gY1 - 0.005; fy += 0.0155) screws.push([X(0.317), Y(fy), z0 + 0.25]);
  const inst = new THREE.InstancedMesh(screwGeo, PI_MAT.screw, screws.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1);
  screws.forEach(([x, y, z], i) => inst.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, one)));
  g.add(inst);
  // main bonding jumper: green screw through a copper strap into the tub, left neutral bar
  const mbjY = Y(0.355);
  add(0.09 * W, 0.012 * H, 0.04, PI_MAT.copper, X(-0.29), mbjY, z0 + 0.4);
  const gs = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 6), PI_MAT.green);
  gs.rotation.x = Math.PI / 2; gs.position.set(X(-0.33), mbjY, z0 + 0.47); g.add(gs);
  // grounding electrode conductor: bare copper from the left neutral bar down and out the bottom
  const gecPts = [[X(-0.248), Y(0.69), nz + 0.1], [X(-0.262), Y(0.69), nz + 0.05], [X(-0.276), Y(0.72), z0 + 0.5],
    [X(-0.282), Y(0.85), z0 + 0.55], [X(-0.286), Y(0.98), z0 + 0.7], [X(-0.286), Y(1.0), z0 + 0.9]].map(a => new THREE.Vector3(...a));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gecPts), 48, 0.085, 10), PI_MAT.copper));
  return g;
}

// ---- concentric knockouts around the panel ----
// Each one is a set of nested slugs held by tiny ties: knock out the center for the smallest size,
// then each ring after it for the next size up. Diameters are the standard knockout sizes.
export const KO_TRADE = { 0.875: '1/2"', 1.109: '3/4"', 1.375: '1"', 1.734: '1-1/4"', 1.984: '1-1/2"', 2.469: '2"' };
const PKO_SETS = { a: [0.875, 1.109], b: [1.109, 1.375], c: [1.375, 1.734, 1.984], d: [1.734, 1.984, 2.469] };
// Where they go: five across the top and bottom, five down each side, centered 2" out from the wall.
// Any that would run into a hole already punched (the job's connector, the GEC) are left out.
export function panelKnockoutLayout(min, max, avoid = []) {
  const W = max[0] - min[0], H = max[1] - min[1], cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, zc = min[2] + 2.0;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), out = [];
  const put = (id, c, n, set) => {
    const sizes = PKO_SETS[set], R = sizes[sizes.length - 1] / 2;
    if (avoid.some(h => h.n.dot(n) > 0.9 && h.c.distanceTo(c) < h.r + R + 0.3)) return;
    out.push({ id, c, n, sizes });
  };
  ['a', 'c', 'd', 'c', 'a'].forEach((set, i) => {
    const x = cx + [-0.36, -0.18, 0, 0.18, 0.36][i] * W;
    put('T' + i, V3(x, max[1], zc), V3(0, 1, 0), set); put('B' + i, V3(x, min[1], zc), V3(0, -1, 0), set);
  });
  ['b', 'd', 'c', 'd', 'b'].forEach((set, i) => {
    const y = cy + [-0.4, -0.2, 0, 0.2, 0.4][i] * H;
    put('L' + i, V3(min[0], y, zc), V3(-1, 0, 0), set); put('R' + i, V3(max[0], y, zc), V3(1, 0, 0), set);
  });
  return out;
}
// The slugs of one knockout still in the wall (those from `punched` outward), in the face's plane.
// Returns a group with userData { ko, slugs: [mesh | null per size], hit } (hit: invisible pick target).
export function buildPanelKO(ko, punched, t, mat) {
  const g = new THREE.Group();
  const F = FACES.find(f => new THREE.Vector3(...f.n).dot(ko.n) > 0.9);
  const eu = new THREE.Vector3(...F.u), ev = new THREE.Vector3(...F.v), ew = new THREE.Vector3().crossVectors(eu, ev);
  const basis = new THREE.Matrix4().makeBasis(eu, ev, ew).setPosition(ko.c);
  const slugs = ko.sizes.map((d, k) => {
    if (k < punched) return null;
    const rIn = k === 0 ? 0 : ko.sizes[k - 1] / 2 + 0.014, rOut = d / 2 - 0.014;
    const sh = new THREE.Shape(); sh.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    if (rIn > 0) { const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); sh.holes.push(h); }
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 48 }), mat);
    m.matrixAutoUpdate = false; m.matrix.copy(basis);
    m.userData.pko = ko.id; m.userData.ring = k;
    g.add(m);
    return m;
  });
  const R = ko.sizes[ko.sizes.length - 1] / 2;
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 1.2, 32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ko.n); hit.position.copy(ko.c);
  hit.userData.pko = ko.id; g.add(hit);
  g.userData = { ko, slugs, hit };
  return g;
}

// Load center / panelboard: an empty powder-coated tub with a trim frame and a door hinged on the left
// (door.userData.pivot: rotate it about Y to open). Opens outward, away from the wall.
export function buildJobPanel(min, max, opts = {}) {
  const g = new THREE.Group();
  const W = max[0] - min[0], H = max[1] - min[1], D = max[2] - min[2];
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
  // the grounding electrode conductor leaves through a small knockout in the bottom (left)
  const gecHole = { c: new THREE.Vector3(cx - 0.286 * W, min[1], min[2] + 0.11 + 0.9), n: new THREE.Vector3(0, -1, 0), r: 0.25 };
  const kos = panelKnockoutLayout(min, max, [...(opts.holes || []), gecHole]);
  const koHoles = kos.map(k => ({ c: k.c, n: k.n, r: k.sizes[k.sizes.length - 1] / 2 }));
  const tub = hollowBox(min, [max[0], max[1], max[2] - 0.12], 0.075, JOB_MAT.panel, [...(opts.holes || []), gecHole, ...koHoles]);
  g.userData.kos = kos.map(k => { const kg = buildPanelKO(k, (opts.punched || {})[k.id] || 0, 0.075, JOB_MAT.panel); g.add(kg); return kg; });
  g.add(tub);
  // pale interior back so the empty tub reads when the door is open
  g.add(boxAt(W - 0.3, H - 0.3, 0.02, JOB_MAT.panelInside, cx, cy, min[2] + 0.09));
  g.add(buildPanelInterior(min, max));
  // trim: a flat frame with an opening for the door
  const fw = 0.8, ow = W - 2 * fw, oh = H - 2 * fw;
  const frame = new THREE.Shape();
  frame.moveTo(-W / 2, -H / 2); frame.lineTo(W / 2, -H / 2); frame.lineTo(W / 2, H / 2); frame.lineTo(-W / 2, H / 2); frame.lineTo(-W / 2, -H / 2);
  const hole = new THREE.Path(); hole.moveTo(-ow / 2, -oh / 2); hole.lineTo(-ow / 2, oh / 2); hole.lineTo(ow / 2, oh / 2); hole.lineTo(ow / 2, -oh / 2); hole.lineTo(-ow / 2, -oh / 2);
  frame.holes.push(hole);
  const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.12, bevelEnabled: false }), JOB_MAT.panelDoor);
  trim.position.set(cx, cy, max[2] - 0.12); g.add(trim);
  // door, hinged at the left edge of the opening
  const dw = ow - 0.08, dh = oh - 0.08;
  const pivot = new THREE.Group(); pivot.position.set(cx - ow / 2 + 0.04, cy, max[2] - 0.06); g.add(pivot);
  const door = new THREE.Group(); pivot.add(door);
  door.add(boxAt(dw, dh, 0.1, JOB_MAT.panelDoor, dw / 2, 0, 0));
  for (const [w, h, x, y] of [[dw - 0.6, 0.05, dw / 2, dh / 2 - 0.3], [dw - 0.6, 0.05, dw / 2, -dh / 2 + 0.3], [0.05, dh - 0.6, 0.3, 0], [0.05, dh - 0.6, dw - 0.3, 0]])
    door.add(boxAt(w, h, 0.03, JOB_MAT.seam, x, y, 0.06));
  door.add(boxAt(Math.min(5, dw * 0.45), Math.min(6.5, dh * 0.3), 0.03, JOB_MAT.label, dw / 2, dh * 0.22, 0.065)); // directory card
  const latch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 24), JOB_MAT.chrome);
  latch.rotation.x = Math.PI / 2; latch.position.set(dw - 1.1, 0, 0.2); door.add(latch);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, dh * 0.9, 16), JOB_MAT.chrome);
  hinge.position.set(-0.02, 0, 0.06); pivot.add(hinge);
  door.traverse(o => { o.userData.act = 'door'; });
  g.userData.doorPivot = pivot;
  void D;
  return g;
}

// 4" square steel box (or the 4-11/16" / 6×6 size for the bigger conduit), modeled like the real thing:
// open front, five walls with stamped concentric knockouts, the hole the conduit uses punched out,
// two cover ears in opposite corners (top-right, bottom-left) tapped for the 8-32 cover screws.
// Returns { group, cover, screws, earPts } with the cover and screws as their own objects so they can
// be taken off. min/max are the box outside, the front is at max z.
export function buildJobBox(min, max, opts = {}) {
  const g = new THREE.Group();
  const W = max[0] - min[0], H = max[1] - min[1];
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, zf = max[2];
  const t = 0.0625;
  g.add(hollowBox(min, max, t, JOB_MAT.boxSteel, opts.holes || [], true));
  // cover ears: small tabs bent in at the front of two opposite corners
  const ear = 0.62, earPts = [];
  for (const [sx, sy] of [[1, 1], [-1, -1]]) {
    const ex = cx + sx * (W / 2 - t - ear / 2), ey = cy + sy * (H / 2 - t - ear / 2);
    g.add(boxAt(ear, ear, t, JOB_MAT.boxSteel, ex, ey, zf - 0.12));
    const tap = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), JOB_MAT.seam);
    tap.position.set(ex + sx * 0.04, ey + sy * 0.04, zf - 0.12 + t / 2 + 0.002); g.add(tap);
    earPts.push(new THREE.Vector3(ex + sx * 0.04, ey + sy * 0.04, zf));
  }
  // clamp hole and a couple of small mounting holes in the back
  for (const [dx, dy, r] of [[0, 0, 0.11], [-W * 0.12, W * 0.12, 0.09], [W * 0.12, -W * 0.12, 0.09]]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(r, 20), JOB_MAT.seam);
    h.position.set(cx + dx, cy + dy, min[2] + t + 0.003); g.add(h);
  }
  const cover = buildBoxCover(W, H);
  cover.position.set(cx, cy, zf);
  const screws = earPts.map(p => { const s = buildCoverScrew(); s.position.set(p.x, p.y, zf + COVER_T); return s; });
  if (!opts.coverOff) { g.add(cover); for (const s of screws) g.add(s); }
  cover.traverse(o => { o.userData.act = 'cover'; });
  for (const s of screws) s.traverse(o => { o.userData.act = 'cover'; });
  return { group: g, cover, screws, earPts };
}
export const COVER_T = 0.0625;
// Flat blank cover, a touch larger than the box, with a raised center and two screw holes in opposite
// corners. Local frame: back face on z = 0, +z out.
export function buildBoxCover(W, H) {
  const g = new THREE.Group();
  g.add(boxAt(W + 0.12, H + 0.12, COVER_T, JOB_MAT.cover, 0, 0, COVER_T / 2));
  g.add(boxAt(W - 1.3, H - 1.3, 0.05, JOB_MAT.cover, 0, 0, COVER_T + 0.025));
  return g;
}
// 8-32 round-head slotted cover screw. Local frame: underside of the head on z = 0, shank along −z.
export function buildCoverScrew() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), JOB_MAT.chrome);
  head.rotation.x = Math.PI / 2; head.scale.set(1, 0.6, 1); g.add(head);
  const slot = boxAt(0.28, 0.035, 0.05, JOB_MAT.seam, 0, 0, 0.075); g.add(slot);
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.75, 12), JOB_MAT.chrome);
  shank.rotation.x = Math.PI / 2; shank.position.z = -0.375; g.add(shank);
  return g;
}

// Rolling service cart: two trays with lips, four posts, a push handle and 4" casters. Origin on the
// floor at the cart's center; the top tray's surface is at userData.topY.
export function buildCart() {
  const g = new THREE.Group();
  const L = 30, Wd = 17, topY = 33, lowY = 11, lip = 1.4;
  const tray = (y) => {
    const t = new THREE.Group();
    t.add(boxAt(L, 0.5, Wd, JOB_MAT.cartTray, 0, y - 0.25, 0));
    for (const [w, d, x, z] of [[L, 0.4, 0, Wd / 2 - 0.2], [L, 0.4, 0, -Wd / 2 + 0.2], [0.4, Wd, L / 2 - 0.2, 0], [0.4, Wd, -L / 2 + 0.2, 0]])
      t.add(boxAt(w, lip, d, JOB_MAT.cartTray, x, y + lip / 2 - 0.05, z));
    return t;
  };
  g.add(tray(topY), tray(lowY));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, topY - 4.5, 16), JOB_MAT.chrome);
    post.position.set(sx * (L / 2 - 1.2), 4.5 + (topY - 4.5) / 2 - 0.5, sz * (Wd / 2 - 1.2)); g.add(post);
    const fork = boxAt(1.4, 1.6, 1.0, JOB_MAT.frame, sx * (L / 2 - 1.2), 3.9, sz * (Wd / 2 - 1.2)); g.add(fork);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.1, 24), JOB_MAT.wheel);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(sx * (L / 2 - 1.2), 2, sz * (Wd / 2 - 1.2)); g.add(wheel);
  }
  // push handle at one end
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, Wd - 1, 16), JOB_MAT.cartTray);
  bar.rotation.x = Math.PI / 2; bar.position.set(-L / 2 - 2.6, topY + 5, 0); g.add(bar);
  for (const sz of [-1, 1]) {
    const arm = boxAt(3.2, 0.7, 0.7, JOB_MAT.cartTray, -L / 2 - 1.2, topY + 2.6, sz * (Wd / 2 - 1.5));
    arm.rotation.z = -0.9; g.add(arm);
  }
  g.userData.topY = topY; g.userData.L = L; g.userData.W = Wd;
  return g;
}

// Steel set-screw EMT connector set in a knockout, to real dimensions (CONNECTOR row `c`).
// Local frame: origin on the outside face of the box at the knockout center, +Z out of the box.
// Outside: the body (length B, OD C) with its set-screw boss(es); the bore takes the conduit OD down
// to the internal stop at z = c.stop, then narrows to the throat (EMT ID). Inside the box: the
// male thread (A − B long) and the locknut, drawn behind the 1/16" box wall.
const CONN_MAT = new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.32, metalness: 0.9, side: THREE.DoubleSide });
const NUT_MAT = new THREE.MeshStandardMaterial({ color: 0x9da3aa, roughness: 0.4, metalness: 0.85 });
export function buildConnector(c, od, id) {
  const g = new THREE.Group();
  const Ro = c.C / 2, ri = od / 2 + 0.006, rt = id / 2, ch = Math.min(0.06, (c.B - c.stop) * 0.1);
  // body profile in (radius, height), revolved about Y and then turned so Y → +Z
  const body = new THREE.LatheGeometry([
    new THREE.Vector2(rt, 0), new THREE.Vector2(Ro - 0.04, 0), new THREE.Vector2(Ro, 0.04),
    new THREE.Vector2(Ro, c.B - ch), new THREE.Vector2(Ro - ch, c.B), new THREE.Vector2(ri + 0.03, c.B),
    new THREE.Vector2(ri, c.B - 0.03), new THREE.Vector2(ri, c.stop), new THREE.Vector2(rt, c.stop), new THREE.Vector2(rt, 0),
  ], 56);
  const tl = c.A - c.B, sheet = 0.0625;
  const thread = new THREE.LatheGeometry([
    new THREE.Vector2(rt, 0), new THREE.Vector2(c.thread / 2, 0), new THREE.Vector2(c.thread / 2, -tl + 0.04),
    new THREE.Vector2(c.thread / 2 - 0.04, -tl), new THREE.Vector2(rt, -tl), new THREE.Vector2(rt, 0),
  ], 48);
  const lathe = new THREE.Group();
  lathe.add(new THREE.Mesh(body, CONN_MAT), new THREE.Mesh(thread, CONN_MAT));
  // thread crests: thin rings every 1/14" (NPSM pitch) so it reads as threaded
  for (let y = -0.1; y > -tl + 0.06; y -= 1 / 14) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(c.thread / 2, 0.012, 4, 40), NUT_MAT);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; lathe.add(ring);
  }
  // locknut, tight behind the box wall: hex, across flats = nut
  const nutT = 0.19;
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(c.nut / Math.sqrt(3), c.nut / Math.sqrt(3), nutT, 6), NUT_MAT);
  nut.position.y = -sheet - nutT / 2; lathe.add(nut);
  lathe.rotation.x = Math.PI / 2;                       // lathe Y → +Z (out of the box)
  g.add(lathe);
  // set-screw boss(es) on top of the body, each with a combo-head screw
  const n = c.screws, span = c.B - c.stop;
  for (let i = 0; i < n; i++) {
    const z = c.stop + span * (n === 1 ? 0.55 : 0.32 + 0.4 * i);
    const boss = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.36), CONN_MAT);
    boss.position.set(0, Ro + 0.07, z); g.add(boss);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 6), NUT_MAT);
    head.position.set(0, Ro + 0.24, z); g.add(head);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.04), JOB_MAT.seam);
    slot.position.set(0, Ro + 0.305, z); g.add(slot);
  }
  return g;
}
// The rim of a punched knockout, sitting on the face (+Z out). The hole itself is cut in the wall.
const KO_EDGE = new THREE.MeshStandardMaterial({ color: 0xd0d4d9, roughness: 0.25, metalness: 0.95 });
export function buildKnockout(ko) {
  const g = new THREE.Group();
  const edge = new THREE.Mesh(new THREE.RingGeometry(ko / 2, ko / 2 + 0.05, 48), KO_EDGE); edge.position.z = 0.006; g.add(edge);
  return g;
}

// Plain obstruction blocks with a little character: concrete column, wireway with a cover seam, door in a frame.
export function buildJobBlock(min, max, look) {
  const g = new THREE.Group();
  const W = max[0] - min[0], H = max[1] - min[1], D = max[2] - min[2];
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, z0 = min[2];
  if (look === 'door') {
    g.add(boxAt(W, H, D, JOB_MAT.door, cx, cy, z0 + D / 2));
    for (const [w, h, x, y] of [[1.4, H + 1.4, min[0] - 0.7, cy + 0.7], [1.4, H + 1.4, max[0] + 0.7, cy + 0.7], [W + 2.8, 1.4, cx, max[1] + 0.7]])
      g.add(boxAt(w, h, D + 0.5, JOB_MAT.frame, x, y, z0 + (D + 0.5) / 2));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), JOB_MAT.chrome);
    knob.position.set(max[0] - 3, min[1] + 36, z0 + D + 0.9); g.add(knob);
  } else if (look === 'wireway') {
    g.add(boxAt(W, H, D, JOB_MAT.wireway, cx, cy, z0 + D / 2));
    for (const x of [min[0] + 0.6, max[0] - 0.6]) g.add(boxAt(0.08, H, 0.05, JOB_MAT.seam, x, cy, z0 + D + 0.01));
    for (let y = min[1] + 24; y < max[1]; y += 24) g.add(boxAt(W - 1.2, 0.08, 0.05, JOB_MAT.seam, cx, y, z0 + D + 0.01));
  } else if (look === 'concrete') {
    // tile the cast texture about every 2 ft so a tall column doesn't stretch it into streaks
    const mat = JOB_MAT.concrete.clone();
    for (const k of ['map', 'bumpMap']) { mat[k] = JOB_MAT.concrete[k].clone(); mat[k].repeat.set(Math.max(W, D) / 24, H / 24); mat[k].needsUpdate = true; }
    g.add(boxAt(W, H, D, mat, cx, cy, z0 + D / 2));
  } else {
    g.add(boxAt(W, H, D, JOB_MAT.wireway, cx, cy, z0 + D / 2));
  }
  return g;
}

// ---------- carpenter pencil (mouse cursor while marking) ----------
// Flat rectangular body, sharpened to a chisel point. Origin = the chisel edge; the pencil runs up
// local +Y and the wide flat faces are across local X, so the edge draws a line along X.
// Slightly transparent so the mark preview under it stays visible.
export function buildPencil() {
  const g = new THREE.Group();
  const len = 7, w = 0.5, t = 0.28, cone = 0.9;
  const ghost = (color, opacity = 0.78) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, transparent: true, opacity, depthWrite: false });
  // painted body
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, len - cone, t), ghost(0xb3261e));
  body.position.y = cone + (len - cone) / 2; g.add(body);
  // printed band near the end
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.25, t + 0.01), ghost(0x1a1a1a, 0.55));
  band.position.y = len - 0.9; g.add(band);
  // sharpened wood: tapers in thickness only, keeping the full width (chisel point)
  const wood = new THREE.BufferGeometry();
  const hw = w / 2, ht = t / 2, lt = 0.035, lw = w * 0.42;
  const V = [
    [-hw, cone, -ht], [hw, cone, -ht], [hw, cone, ht], [-hw, cone, ht],   // top (meets body)
    [-lw, 0.12, -lt], [lw, 0.12, -lt], [lw, 0.12, lt], [-lw, 0.12, lt],  // bottom (meets lead)
  ];
  const F = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const [a, b, c, d] of F) for (const i of [a, b, c, a, c, d]) pos.push(...V[i]);
  wood.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wood.computeVertexNormals();
  const woodMesh = new THREE.Mesh(wood, ghost(0xd9b98a)); woodMesh.material.side = THREE.DoubleSide; g.add(woodMesh);
  // flat graphite lead, ending in the chisel edge at the origin
  const lead = new THREE.Mesh(new THREE.BoxGeometry(lw * 2, 0.12, lt * 2), ghost(0x222226, 0.9));
  lead.position.y = 0.06; g.add(lead);
  g.traverse(o => { if (o.isMesh) { o.renderOrder = 5; o.raycast = () => {}; } });
  g.visible = false;
  return g;
}

// ---------- warehouse: open floor inside four plain walls ----------
// 100 ft × 100 ft, 30 ft walls. Inches.
export const WAREHOUSE = { half: 600, height: 360 };

// Four flat, medium-dark grey walls far out from the work area, open to the sky. They face
// inward only, so from outside the building they disappear instead of blocking the view.
export function buildWalls() {
  const g = new THREE.Group();
  const { half, height } = WAREHOUSE;
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.96, metalness: 0, envMapIntensity: 0.6 });
  const geo = new THREE.PlaneGeometry(half * 2, height);
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(geo, mat);
    const a = i * Math.PI / 2;
    w.position.set(-Math.sin(a) * half, height / 2, -Math.cos(a) * half);
    w.rotation.y = a;
    g.add(w);
  }
  return g;
}

// ---------- floor ----------
export function buildFloor() {
  const g = new THREE.Group();
  // clean white shop floor with faint mottling so shadows and the conduit read clearly
  const colorTex = canvasTex(1024, (ctx, S) => {
    const r = rand(21);
    ctx.fillStyle = '#f4f3f1'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      const x = r() * S, y = r() * S, rad = 30 + r() * 140, v = 228 + r() * 20 | 0;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v - 3},0.25)`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 25000; i++) {
      const v = 215 + r() * 35 | 0;
      ctx.fillStyle = `rgba(${v},${v},${v - 2},0.35)`;
      ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
    }
    ctx.strokeStyle = 'rgba(190,186,180,0.6)'; ctx.lineWidth = 2; // control joints
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(S, 1); ctx.moveTo(1, 0); ctx.lineTo(1, S); ctx.stroke();
  }, { srgb: true, repeat: 6 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WAREHOUSE.half * 2, WAREHOUSE.half * 2),
    new THREE.MeshStandardMaterial({ map: colorTex, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.88, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  g.add(floor);
  const grid = new THREE.GridHelper(WAREHOUSE.half * 2, WAREHOUSE.half * 2 / 12, 0xcfcac3, 0xdedad4);
  grid.position.y = 0.03; grid.material.transparent = true; grid.material.opacity = 0.45;
  g.add(grid);
  return g;
}

// ---------- conduit mesh (exact rings along the computed frames) ----------
export function conduitGeometry(samples, matrix, r, radial = 40) {
  const n = samples.length;
  const pos = new Float32Array(n * (radial + 1) * 3);
  const nor = new Float32Array(n * (radial + 1) * 3);
  const uv = new Float32Array(n * (radial + 1) * 2);
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), v = new THREE.Vector3();
  let k = 0, kk = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    P.copy(s.P).applyMatrix4(matrix); N.copy(s.N).applyMatrix3(nm).normalize(); B.copy(s.B).applyMatrix3(nm).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      v.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos[k] = P.x + v.x * r; pos[k + 1] = P.y + v.y * r; pos[k + 2] = P.z + v.z * r;
      nor[k] = v.x; nor[k + 1] = v.y; nor[k + 2] = v.z; k += 3;
      uv[kk++] = s.s / 12; uv[kk++] = j / radial;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b2 = a + radial + 1;
    idx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Printed manufacturer stripe along the N side (roll reference).
export function stripeGeometry(samples, matrix, r) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3);
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const half = 0.06 / r;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    P.copy(s.P).applyMatrix4(matrix); N.copy(s.N).applyMatrix3(nm).normalize(); B.copy(s.B).applyMatrix3(nm).normalize();
    for (let side = 0; side < 2; side++) {
      const a = side ? half : -half;
      const x = P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r * 1.012;
      const y = P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r * 1.012;
      const z = P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r * 1.012;
      pos.set([x, y, z], (i * 2 + side) * 3);
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// End caps (dark rings showing the cut/reamed end)
export function endCap(r) {
  const g = new THREE.RingGeometry(r * 0.89, r, 28);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }));
}

// ---------- tape measure ----------
export function buildTape(lengthIn = 120) {
  const pxPerIn = 32;
  const W = Math.min(8192, lengthIn * pxPerIn), H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c81f'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
  for (let i = 0; i <= lengthIn * 8; i++) {
    const x = i * pxPerIn / 8;
    const len = i % 8 === 0 ? 26 : i % 4 === 0 ? 18 : i % 2 === 0 ? 12 : 7;
    ctx.lineWidth = i % 8 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, len); ctx.stroke();
    if (i % 8 === 0 && i > 0) {
      const inch = i / 8;
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = inch % 12 === 0 ? '#c00' : '#111';
      ctx.textAlign = 'center';
      ctx.fillText(String(inch), x, 50);
      ctx.fillStyle = '#111';
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(lengthIn, 1.0);
  geo.translate(lengthIn / 2, 0, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.97 }));
  m.renderOrder = 5;
  return m;
}
