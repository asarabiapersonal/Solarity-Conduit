import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SIZES, EMT, BENDERS, CONNECTOR, koZ, fmtIn, fmtDeg } from './data.js';
import { Conduit, DEG } from './geometry.js';
import { benderRefs, defaultRef, arrowSFor, benderPose, restPose, analyze, backOfBendS, ELECTRIC_BEND_HEIGHT } from './rig.js';
import { createContactShadow, NO_CONTACT_SHADOW } from './contactShadow.js';
import { buildJobPanel, buildJobBox, buildJobBlock, buildConnector, buildKnockout, buildCart, buildBoxCover, buildCoverScrew, COVER_T, KO_TRADE, JOB_MAT } from './models.js';
import { buildHandBender, buildElectricBender, buildFloor, buildWalls, buildPencil, WAREHOUSE, conduitGeometry, stripeGeometry, endCap, buildTape, makeLabelSprite, MAT } from './models.js';
import { LESSONS } from './lessons.js';
import { ROUTES, fitRoute, placeInPanel, gradePlacement, seatOf } from './routes.js';
const EXERCISES = [...LESSONS, ...ROUTES];
import { parseInches, renderBenderInfo, renderMath, renderFill, renderSupport, renderSources } from './info.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const REST_Z = 30; // the conduit rests on the floor in front of the bender

// ------------------------------------------------------------------ state
const state = {
  size: '3/4', bender: BENDERS['3/4'], L: 120, conduit: null,
  lesson: LESSONS[0], params: null,
  stage: 'mark',
  inBender: false, existing: null,
  placement: { markId: null, ref: 'arrow', front: 'A', phiDeg: 0, nudge: 0 },
  handle: 0, perm: 0, spring: true,
  bendSeq: 0, markSeq: 0,
  pulling: 0, busy: false,
  // field jobs: pencil marks on the job wall, and where the wall tape is hooked ('panel' | 'box')
  wallMarks: [], wallMarksFor: '', wallTapeFrom: 'panel', wallTapeAxis: 'h', wallMarkHi: null, wallSeq: 0,
  // connectors set in the panel ('start') and box ('end') knockouts, for this job and size
  conn: { start: false, end: false },
  // the box cover (on the box, or off on the cart) and the panel door, for this job and size
  job: { coverOff: false, doorOpen: false, kos: {} }, cartW: null,
  pose: null,
  // where things sit on the shop floor (inches, radians). The pipe can be dragged anywhere;
  // the bender ("station") comes to the pipe when it is inserted.
  pipeW: { x: 0, z: REST_Z, yaw: 0 },
  stationW: { x: 0, z: 0, yaw: 0 },
};
const placeM = (w) => new THREE.Matrix4().makeRotationY(w.yaw).setPosition(w.x, w.y || 0, w.z);
const toW = (v, w) => v.clone().applyMatrix4(placeM(w));

// ------------------------------------------------------------------ three setup
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// No directional shadow maps: floor shadows are soft contact (ambient-occlusion style) shadows instead.
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.localClippingEnabled = true; // the wall tape is clipped at the pencil
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85; // broad image-based fill for diffuse, shop-like lighting
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3000);
camera.layers.enable(NO_CONTACT_SHADOW); // the view sees everything; the contact-shadow camera only sees layer 0
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
// Mouse: left = orbit, middle = pan, right = pan, wheel = zoom.
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
// Touch: one finger = orbit, two fingers = drag to pan + pinch to zoom.
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.screenSpacePanning = true; // pan follows the screen, like most 3D viewers
controls.panSpeed = 1.0;
controls.zoomToCursor = true;
// Stop the browser's middle-click autoscroll and long-press menu from fighting the camera.
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// Neutral, even warehouse lighting: an overhead key, a cool sky fill and a faint cool rim. None of
// them cast shadows; the floor gets soft contact shadows instead.
scene.add(new THREE.HemisphereLight(0xf4f7ff, 0xd3d8e0, 0.8));
const sun = new THREE.DirectionalLight(0xfbfcff, 1.75);
sun.position.set(70, 170, 120);
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xd6e0f0, 0.45); fill.position.set(-110, 70, -60); scene.add(fill);
const rim = new THREE.DirectionalLight(0xcfdcff, 0.35); rim.position.set(-40, 50, 160); scene.add(rim);
// warehouse: floor and four distant walls (neither casts a contact shadow)
const floorObj = buildFloor(), wallsObj = buildWalls();
for (const o of [floorObj, wallsObj]) { o.traverse(x => x.layers.set(NO_CONTACT_SHADOW)); scene.add(o); }
const contact = createContactShadow(renderer, scene);

const conduitMat = MAT.galv;
const conduitMesh = new THREE.Mesh(new THREE.BufferGeometry(), conduitMat);
conduitMesh.castShadow = true;
const stripeMesh = new THREE.Mesh(new THREE.BufferGeometry(), MAT.stripe);
scene.add(conduitMesh, stripeMesh);
const capA = endCap(1), capB = endCap(1);
scene.add(capA, capB);
const labelA = makeLabelSprite('A', { bg: 'rgba(20,30,52,.92)', color: '#dce3ee', size: 1.3 });
const labelB = makeLabelSprite('B', { bg: 'rgba(47,111,230,.94)', color: '#fff', size: 1.3 });
scene.add(labelA, labelB);
const markGroup = new THREE.Group(); scene.add(markGroup);

// ---- marking cursor: a translucent carpenter pencil + a preview of the mark it will make ----
const pencil = buildPencil();
const markPreview = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8, depthTest: true }));
markPreview.visible = false; markPreview.renderOrder = 4;
let previewLabel = null, previewText = '';
for (const o of [pencil, markPreview]) { o.traverse(x => x.layers.set(NO_CONTACT_SHADOW)); scene.add(o); }
const canMark = () => state.stage === 'mark' && !state.inBender && !state.busy && $('#chkClick').checked;

// Put the pencil tip on the conduit at the hit point and show where the mark would land.
function showPencil(hit) {
  if (!hit) {
    pencil.visible = markPreview.visible = wallTape.visible = false;
    if (previewLabel) previewLabel.visible = false;
    return;
  }
  const c = state.conduit, r = c.r;
  const snap = markSnap(exactS(hit.point)), s = snap.s;
  const f = c.frameAt(state.lay, s);
  const P = f.P.clone().applyMatrix4(state.matrix);
  const T = f.T.clone().transformDirection(state.matrix);
  // the preview ring: exactly where the mark will be drawn
  markPreview.scale.setScalar(r * 1.012); markPreview.scale.z = 1;
  markPreview.position.copy(P);
  markPreview.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T);
  markPreview.visible = true;
  // pencil: tip on the surface where the ring passes under the cursor. It is held from above like
  // a hand would, tipped back along the conduit away from the camera so the tip and the line stay
  // in view, with the chisel edge lying along the mark line.
  const radial = hit.point.clone().sub(P); radial.addScaledVector(T, -radial.dot(T));
  const n = radial.lengthSq() > 1e-8 ? radial.normalize() : new THREE.Vector3(0, 1, 0);
  const tip = P.clone().addScaledVector(n, r * 1.012);
  const toCam = camera.position.clone().sub(tip).normalize();
  const away = toCam.dot(T) > 0 ? -1 : 1;
  const axis = new THREE.Vector3(0, 1, 0).addScaledVector(n, 0.45).addScaledVector(T, away * 0.5)
    .addScaledVector(toCam, -0.25).normalize();
  const edge = new THREE.Vector3().crossVectors(T, axis).normalize();    // along the mark line
  const zAxis = new THREE.Vector3().crossVectors(edge, axis).normalize();
  pencil.matrixAutoUpdate = true;
  pencil.position.copy(tip);
  pencil.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, axis, zAxis));
  pencil.visible = true;
  // live reading, like reading the tape at the pencil
  const text = snap.d >= 0 ? `${fmtIn(snap.d)} from ${snap.from}` : `${fmtIn(-snap.d)} behind ${snap.from}`;
  setPreviewLabel(text, P.clone().add(new THREE.Vector3(0, r + 2.2, 0)), 0.8); // above the mark labels (r + 1.1)
  wallTape.visible = false;
}

// The live reading shown beside the pencil.
function setPreviewLabel(text, pos, size) {
  const key = text + '|' + size;
  if (key !== previewText) {
    if (previewLabel) { scene.remove(previewLabel); previewLabel.material.map.dispose(); previewLabel.material.dispose(); }
    previewLabel = makeLabelSprite(text, { size, bg: 'rgba(14,21,38,0.86)', color: '#9fc2ff' });
    previewLabel.layers.set(NO_CONTACT_SHADOW);
    scene.add(previewLabel); previewText = key;
  }
  previewLabel.position.copy(pos);
  previewLabel.visible = true;
}

// ---- marking the job wall: a tape hooked on the panel or the box connector, and the pencil ----
const wallTape = buildTape(240);
const tapeClip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
wallTape.material.clippingPlanes = [tapeClip];   // the tape is only pulled out as far as the pencil
wallTape.visible = false; wallTape.layers.set(NO_CONTACT_SHADOW); scene.add(wallTape);
const wallMarkGroup = new THREE.Group(); wallMarkGroup.layers.set(NO_CONTACT_SHADOW); scene.add(wallMarkGroup);
const WALL_MARK = new THREE.MeshBasicMaterial({ color: 0x1b1b1f });

const WALL_MARK_HI = new THREE.MeshBasicMaterial({ color: 0x2f6fe6 });

// Where the tape is hooked on the wall, and along which direction it is read.
//   origin: 'panel' | 'box' | 'floor'   axis: 'h' (along the wall) | 'v' (plumb, heights)
// The floor only makes sense for a plumb tape, so a level tape falls back to the panel.
function wallDatum() {
  const sc = state.params.scene, axis = state.wallTapeAxis;
  let origin = state.wallTapeFrom;
  if (origin === 'floor' && axis === 'h') origin = 'panel';
  const P = origin === 'box' ? sc.end.p : origin === 'floor' ? new THREE.Vector3(sc.start.p.x, 0, 0) : sc.start.p;
  return { axis, name: origin, x0: P.x, y0: origin === 'floor' ? 0 : P.y };
}
// A point on the wall (wall coordinates) → the mark a click there would make, read off the tape (1/16").
function wallSnap(pw) {
  const D = wallDatum(), r16 = (v) => Math.round(v * 16) / 16;
  if (D.axis === 'h') {
    const dx = r16(pw.x - D.x0);
    return { axis: 'h', name: D.name, x: D.x0 + dx, y: r16(pw.y), d: Math.abs(dx), side: dx >= 0 ? 'right' : 'left' };
  }
  const dy = r16(pw.y - D.y0);
  return { axis: 'v', name: D.name, x: r16(pw.x), y: D.y0 + dy, d: Math.abs(dy), side: dy >= 0 ? 'above' : 'below' };
}
const wallReading = (m) => m.axis === 'd' ? `${fmtIn(m.d)} ⊥ out from wall`
  : m.axis === 'h'
  ? `${fmtIn(m.d)} ${m.side === 'right' ? '→' : '←'} ${m.side} of ${m.name}`
  : m.name === 'floor' ? `${fmtIn(m.d)} ↑ above floor` : `${fmtIn(m.d)} ${m.side === 'above' ? '↑' : '↓'} ${m.side} ${m.name}`;

function showWallPencil(worldPt) {
  showPencil(null);
  const pw = worldPt.clone().sub(JOB_ORIGIN);
  if (state.wallTapeAxis === 'd') {
    // depth: the tape is hooked on the wall face and runs straight out (90° to the wall) to the point
    const m = { axis: 'd', name: 'wall', x: Math.round(pw.x * 16) / 16, y: Math.round(pw.y * 16) / 16, z: pw.z, d: Math.round(pw.z * 16) / 16, side: 'out' };
    wallTape.position.copy(JOB_ORIGIN).add(new THREE.Vector3(pw.x, pw.y - 0.5, 0));
    wallTape.rotation.set(0, -Math.PI / 2, 0);
    tapeClip.normal.set(0, 0, -1); tapeClip.constant = worldPt.z;
    wallTape.visible = true;
    setPreviewLabel(wallReading(m), worldPt.clone().add(new THREE.Vector3(0, 4, 2)), 3.0);
    return m;
  }
  const m = wallSnap(pw), D = wallDatum();
  const tip = JOB_ORIGIN.clone().add(new THREE.Vector3(m.x, m.y, 0.05));
  let edge, axis;
  if (m.axis === 'h') {
    // level tape: the pencil draws a plumb tick across it; the tape runs from the hook toward the pencil
    const dir = m.side === 'right' ? 1 : -1;
    edge = new THREE.Vector3(0, 1, 0); axis = new THREE.Vector3(0.35 * dir, 0, 0.94).normalize();
    wallTape.position.copy(JOB_ORIGIN).add(new THREE.Vector3(D.x0, m.y + (dir > 0 ? -0.5 : 0.5), 0.35));
    wallTape.rotation.set(0, 0, dir > 0 ? 0 : Math.PI);
    tapeClip.normal.set(-dir, 0, 0); tapeClip.constant = dir * tip.x;
  } else {
    // plumb tape: the pencil draws a level tick; the tape hangs from the hook up or down to the pencil
    const dir = m.side === 'above' ? 1 : -1;
    edge = new THREE.Vector3(1, 0, 0); axis = new THREE.Vector3(0, 0.35 * dir, 0.94).normalize();
    wallTape.position.copy(JOB_ORIGIN).add(new THREE.Vector3(m.x + (dir > 0 ? 0.5 : -0.5), D.y0, 0.35));
    wallTape.rotation.set(0, 0, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    tapeClip.normal.set(0, -dir, 0); tapeClip.constant = dir * tip.y;
  }
  pencil.position.copy(tip);
  pencil.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge, axis, new THREE.Vector3().crossVectors(edge, axis).normalize()));
  pencil.visible = true;
  wallTape.visible = true;
  setPreviewLabel(wallReading(m), tip.clone().add(new THREE.Vector3(m.axis === 'v' ? 9 : 0, m.axis === 'v' ? 0 : 4.5, 1)), 3.0);
  return m;
}
function addWallMark(m) {
  state.wallSeq = (state.wallSeq || 0) + 1;
  state.wallMarks.push({ ...m, id: 'W' + state.wallSeq });
  drawWallMarks(); renderWallTools();
  toast(`Wall mark W${state.wallSeq}: ${wallReading(m)}`);
}
function drawWallMarks() {
  wallMarkGroup.clear();
  if (!state.lesson.route) return;
  wallMarkGroup.position.copy(JOB_ORIGIN);
  for (const w of state.wallMarks) {
    // w.hidden: its label is switched off in the Procedure tab; the pencil mark itself stays on the wall
    const mat = w.id === state.wallMarkHi ? WALL_MARK_HI : WALL_MARK;
    if (w.axis === 'd') {   // a depth reading: a dot where it was taken
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat); dot.position.set(w.x, w.y, w.z + 0.05);
      const hi = w.id === state.wallMarkHi;
      const lab = makeLabelSprite(`${w.id} · ${wallReading(w)}`, hi ? { size: 2.4, bg: 'rgba(47,111,230,.95)', color: '#fff' } : { size: 2.4 });
      lab.position.set(w.x, w.y + 3.4, w.z + 1); wallMarkGroup.add(dot); if (!w.hidden) wallMarkGroup.add(lab);
      continue;
    }
    // the long stroke is the one the pencil drew across the tape; the short one shows where the tape was
    const [lx, ly] = w.axis === 'v' ? [1.8, 0.08] : [0.08, 1.8];
    const [sx, sy] = w.axis === 'v' ? [0.08, 0.7] : [0.7, 0.08];
    const a = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, 0.02), mat); a.position.set(w.x, w.y, 0.03);
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.02), mat); b.position.set(w.x, w.y, 0.03);
    const hi = w.id === state.wallMarkHi;
    const lab = makeLabelSprite(`${w.id} · ${wallReading(w)}`, hi ? { size: 2.4, bg: 'rgba(47,111,230,.95)', color: '#fff' } : { size: 2.4 });
    lab.position.set(w.x + (w.axis === 'v' ? 9 : 0), w.y + (w.axis === 'v' ? 0 : 3.4), 0.5);
    wallMarkGroup.add(a, b); if (!w.hidden) wallMarkGroup.add(lab);
  }
  wallMarkGroup.traverse(o => o.layers.set(NO_CONTACT_SHADOW));
}

// Left panel (01 Mark): tape origin / direction toggles and the list of wall marks.
// Procedure tab: a checkbox per wall mark's label. Unticked hides the yellow reading only; the pencil
// mark stays on the wall (marks are erased from the 01 Mark list).
function renderWallMarkToggles() {
  const box = $('#wallMarkToggles'); if (!box) return;
  if (!state.wallMarks.length) { box.innerHTML = '<p class="small muted">No wall marks yet.</p>'; return; }
  const all = state.wallMarks.every(w => !w.hidden);
  box.innerHTML = `<label class="chk wm-all"><input type="checkbox" data-all ${all ? 'checked' : ''}> All labels</label>`
    + `<div class="wm-list">${state.wallMarks.map(w => `<label class="chk"><input type="checkbox" data-id="${w.id}" ${w.hidden ? '' : 'checked'}> <b>${w.id}</b>&nbsp; ${wallReading(w)}</label>`).join('')}</div>`;
  box.querySelectorAll('input[data-id]').forEach(cb => cb.onchange = () => {
    const w = state.wallMarks.find(x => x.id === cb.dataset.id); if (w) w.hidden = !cb.checked;
    drawWallMarks(); renderWallMarkToggles();
  });
  box.querySelector('input[data-all]').onchange = (e) => {
    for (const w of state.wallMarks) w.hidden = !e.target.checked;
    drawWallMarks(); renderWallMarkToggles();
  };
}

function renderWallTools() {
  const box = $('#wallTools'); if (!box) return;
  box.hidden = !state.lesson.route;
  if (box.hidden) return;
  const D = wallDatum();
  $$('#wtOrigin button').forEach(bt => {
    bt.classList.toggle('on', bt.dataset.v === D.name);
    bt.disabled = state.wallTapeAxis === 'd' || (bt.dataset.v === 'floor' && state.wallTapeAxis === 'h');
    bt.title = bt.disabled ? 'Switch to a vertical tape to measure up from the floor' : '';
  });
  $$('#wtAxis button').forEach(bt => bt.classList.toggle('on', bt.dataset.v === state.wallTapeAxis));
  const list = $('#wallMarkList');
  list.innerHTML = state.wallMarks.length
    ? state.wallMarks.map(w => `<li data-id="${w.id}" class="${w.id === state.wallMarkHi ? 'sel' : ''}"><span><b>${w.id}</b> &nbsp; ${wallReading(w)}</span><button title="Erase this wall mark">✕</button></li>`).join('')
    : '<li class="empty">No wall marks yet</li>';
  list.querySelectorAll('li[data-id]').forEach(li => {
    const id = li.dataset.id;
    li.onmouseenter = () => { state.wallMarkHi = id; drawWallMarks(); li.classList.add('sel'); };
    li.onmouseleave = () => { state.wallMarkHi = null; drawWallMarks(); li.classList.remove('sel'); };
    li.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      state.wallMarks = state.wallMarks.filter(w => w.id !== id); state.wallMarkHi = null;
      drawWallMarks(); renderWallTools();
    };
  });
  $('#btnClearWall').disabled = !state.wallMarks.length;
  renderWallMarkToggles();
}
const dimGroup = new THREE.Group(); scene.add(dimGroup);
const obstacleGroup = new THREE.Group(); scene.add(obstacleGroup);
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.85, transparent: true, opacity: 0.8 });
let tape = null;
let benderObj = null;
const refMarker = new THREE.Group(); scene.add(refMarker);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(viewport);
$('#navHint').textContent = matchMedia('(pointer: coarse)').matches
  ? 'Drag conduit: move · 1 finger: orbit · 2 fingers: pan/zoom'
  : 'Drag conduit: move · Q/E: rotate · Left: orbit · Middle/right: pan · Wheel: zoom'; // layout changes (e.g. phone rotation)

// ------------------------------------------------------------------ setup / reset
function setSize(size) {
  state.size = size;
  state.bender = BENDERS[size];
  if (benderObj) scene.remove(benderObj.root);
  benderObj = state.bender.type === 'hand' ? buildHandBender(state.bender, EMT[size].od) : buildElectricBender(state.bender, EMT[size].od);
  scene.add(benderObj.root);
  benderObj.contact = contactPoints(benderObj);
  const r = EMT[size].od / 2;
  for (const c of [capA, capB]) { c.geometry.dispose(); c.geometry = new THREE.RingGeometry(r * (EMT[size].id / EMT[size].od), r, 28); }
  renderBenderInfo($('#tabBender'), size);
  renderMath($('#tabMath'), size);
  renderFill($('#tabFill'), size);
  renderSupport($('#tabSupport'), size);
  fillRefSelect();
  newConduit();
}

function newConduit() {
  if (state.inBender) state.inBender = false;
  state.conduit = new Conduit(state.L, EMT[state.size].od);
  state.existing = null; state.handle = 0; state.perm = 0; state.bendSeq = 0; state.markSeq = 0;
  state.wallFit = null; jobInstalled.clear();
  state.params = state.lesson.params(state.size, state.bender, EMT[state.size].od);
  state.placement = { markId: null, ref: defaultRef(state.bender), front: 'A', phiDeg: 0, nudge: 0 };
  state.pipeW = { x: 0, z: REST_Z, yaw: 0 }; state.stationW = { x: 0, z: 0, yaw: 0 }; state.benderFree = false;
  if (tape) { scene.remove(tape); tape.geometry.dispose(); }
  tape = buildTape(state.L); scene.add(tape);
  $('#checkOut').innerHTML = '';
  updateJobScene();
  syncPlacementUI();
  refreshAll();
  setView(state.inBender ? 'bender' : 'overview');
}

// ------------------------------------------------------------------ geometry update
function placementWithMark() {
  const m = state.conduit.marks.find(x => x.id === state.placement.markId);
  return m ? { ...state.placement, markS: m.s } : null;
}

function loadedTheta() { return Math.max(state.handle, state.perm); }

// ------------------------------------------------------------------ ghost bender (placing preview)
// Clicking 02 Place takes the mark and "align to" selected at that moment and shows a see-through
// bender on the conduit exactly where it would stand if the stick were inserted that way.
let ghost = null, ghostShoe = null, ghostFor = null;
const ghostMats = new Map();
function ghostMat(m) {
  if (Array.isArray(m)) return m.map(ghostMat);
  if (!ghostMats.has(m)) {
    const g = m.clone(); g.transparent = true; g.opacity = 0.26 * (m.opacity ?? 1); g.depthWrite = false;
    if (g.emissive) { g.emissive = new THREE.Color(0x3f86ff); g.emissiveIntensity = 0.25; }
    ghostMats.set(m, g);
  }
  return ghostMats.get(m);
}
function buildGhost() {
  if (ghost) scene.remove(ghost);
  benderObj.shoe.userData.isShoe = true;
  ghost = benderObj.root.clone(true); ghost.visible = true; ghostShoe = null; ghostFor = benderObj;
  ghost.traverse(o => {
    if (o.userData.isShoe) ghostShoe = o;
    if (o.isMesh || o.isSprite) { o.material = ghostMat(o.material); o.raycast = () => {}; o.renderOrder = 4; }
    o.layers.set(NO_CONTACT_SHADOW);
  });
  scene.add(ghost);
}
// Opening 02 Place picks up the mark shown in the Mark box if none is chosen yet.
function snapGhost() {
  if (state.inBender) return;
  const markId = state.placement.markId || $('#plMark').value;
  if (!markId) { toast('Add a mark first: the bender preview stands on the selected mark.', true); return; }
  state.placement.markId = markId;
  state.placement.ref = $('#plRef').value || state.placement.ref;
}
// While placing (02 Place, stick not inserted) the bender is shown see-through, live with every
// setting in the Place panel: mark, align to, hook end, roll and shoe offset. The conduit is shown
// as it would sit in the shoe; the solid bender steps aside until the stick is inserted or you leave.
const ghostOn = () => state.stage === 'place' && !state.inBender && !state.wallFit && !!placementWithMark();
function updateGhost(matrix, lay) {
  const c = state.conduit, b = state.bender;
  let pose = null, pl = null, ex = null;
  if (ghostOn()) {
    pl = placementWithMark(); ex = findExisting(pl);
    pose = benderPose(c, b, pl, ex ? ex.theta : 0, ex);
    if (pose.error && !ex) pose = null;
  }
  state.ghostPose = pose;
  if (!pose) { if (ghost) ghost.visible = false; benderObj.root.visible = true; return { matrix, lay }; }
  if (!ghost || ghostFor !== benderObj) buildGhost();
  const st = stationFor(pl, ex, pose, matrix, lay), W = placeM(st);
  const local = b.type === 'electric' ? new THREE.Vector3(0, ELECTRIC_BEND_HEIGHT + b.R, 0) : pose.shoe.center.clone();
  ghost.position.copy(local.applyMatrix4(W)); ghost.rotation.set(0, st.yaw, 0);
  if (ghostShoe) ghostShoe.rotation.z = pose.shoe.angle;
  const lift = floorPenetration(ghost, ghostShoe || ghost);
  ghost.position.y += lift;
  ghost.visible = true;
  benderObj.root.visible = false;
  // the conduit exactly as Insert would put it in this bender
  const m = pose.matrix.clone().premultiply(W);
  if (lift > 1e-4) m.premultiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
  return { matrix: m, lay: pose.lay };
}

// ------------------------------------------------------------------ floor contact
// The bender's solid parts, sampled once: points on the rotating shoe (in shoe space) and on the
// fixed frame (in root space). Painted decals are left out since they are only paint.
function contactPoints(obj) {
  const shoePts = [], framePts = [];
  obj.root.position.set(0, 0, 0); obj.root.rotation.set(0, 0, 0); obj.shoe.rotation.set(0, 0, 0);
  obj.root.updateMatrixWorld(true);
  const toShoe = obj.shoe.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  obj.root.traverse(o => {
    if (!o.isMesh || o.userData.decal) return;
    let onShoe = false; for (let p = o; p; p = p.parent) if (p === obj.shoe) { onShoe = true; break; }
    const M = onShoe ? o.matrixWorld.clone().premultiply(toShoe) : o.matrixWorld;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 300));
    for (let i = 0; i < pos.count; i += step) (onShoe ? shoePts : framePts).push(v.fromBufferAttribute(pos, i).applyMatrix4(M).clone());
  });
  return { shoePts, framePts };
}
// How far the bender would sink below the floor in its current pose (0 if it is clear).
function floorPenetration(root = benderObj.root, shoe = benderObj.shoe) {
  const { shoePts, framePts } = benderObj.contact;
  root.updateMatrixWorld(true);
  const S = shoe.matrixWorld.elements, F = root.matrixWorld.elements;
  let minY = Infinity;
  for (const p of shoePts) minY = Math.min(minY, S[1] * p.x + S[5] * p.y + S[9] * p.z + S[13]);
  for (const p of framePts) minY = Math.min(minY, F[1] * p.x + F[5] * p.y + F[9] * p.z + F[13]);
  return Math.max(0, -minY);
}

// Where the idle bender waits: on the floor alongside the conduit, a hand's width off its near side.
function besideConduit(local, lay) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity;
  for (const p of state.conduit.sample(lay, 2)) {
    const q = p.P.clone().applyMatrix4(local);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z);
  }
  const gap = state.bender.type === 'hand' ? (benderObj.Ro || state.bender.R) + 4 : 30;
  const w = { ...state.pipeW, y: 0 };
  const P = toW(new THREE.Vector3((x0 + x1) / 2, 0, z0 - gap), w);
  return { x: P.x, z: P.z, yaw: state.pipeW.yaw, y: 0 };
}

function updateScene() {
  const c = state.conduit, b = state.bender, r = c.r;
  let matrix, lay;
  if (state.inBender) {
    const pl = placementWithMark();
    const pose = benderPose(c, b, pl, loadedTheta(), state.existing);
    state.pose = pose;
    const W = placeM(state.stationW);
    matrix = pose.matrix.clone().premultiply(W); lay = pose.lay;
    const local = b.type === 'electric' ? new THREE.Vector3(0, ELECTRIC_BEND_HEIGHT + b.R, 0) : pose.shoe.center.clone();
    benderObj.root.position.copy(local.applyMatrix4(W));
    benderObj.root.rotation.set(0, state.stationW.yaw, 0);
    benderObj.shoe.rotation.z = pose.shoe.angle;
    // The floor holds the bender up: if any part would go below it, the bender and the conduit
    // in it ride up until that part rests on the floor.
    const lift = floorPenetration();
    state.floorLift = lift;
    if (lift > 1e-4) {
      benderObj.root.position.y += lift;
      matrix.premultiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
    }
  } else {
    state.pose = null;
    const rp = restPose(c, !!state.lesson.obstacle);
    state.restLocal = rp.matrix;
    matrix = rp.matrix.clone().premultiply(placeM(state.pipeW));
    lay = rp.lay;
    // Not bending: a hand bender lies flat on the floor (an electric one stands on its wheels),
    // beside the conduit until you move it, then wherever you left it.
    if (!state.benderFree) state.stationW = besideConduit(rp.matrix, lay);
    const sw = state.stationW, root = benderObj.root;
    root.rotation.order = 'YXZ'; // yaw about the floor's up axis, after laying it down
    benderObj.shoe.rotation.z = 0;
    if (b.type === 'hand') { root.position.set(sw.x, 0, sw.z); root.rotation.set(-Math.PI / 2, sw.yaw, 0); }
    else { root.position.copy(toW(new THREE.Vector3(0, ELECTRIC_BEND_HEIGHT + b.R, 0), { ...sw, y: 0 })); root.rotation.set(0, sw.yaw, 0); }
    root.position.y += floorPenetration() + (sw.y || 0);
    state.floorLift = 0;
  }
  ({ matrix, lay } = updateGhost(matrix, lay));
  state.matrix = matrix; state.lay = lay;
  // keep the soft shadow area centered on whatever is being worked on
  const fw = state.inBender ? state.stationW : state.pipeW;
  sun.position.set(fw.x + 70, 170, fw.z + 120); sun.target.position.set(fw.x, 0, fw.z); sun.target.updateMatrixWorld();
  const samples = c.sample(lay, 0.4);
  state.samples = samples.map(s => ({ s: s.s, W: s.P.clone().applyMatrix4(matrix) }));
  // the soft floor shadow covers the conduit and the bender, wherever they are on the floor
  {
    let x0 = benderObj.root.position.x, x1 = x0, z0 = benderObj.root.position.z, z1 = z0;
    for (const p of state.samples) { x0 = Math.min(x0, p.W.x); x1 = Math.max(x1, p.W.x); z0 = Math.min(z0, p.W.z); z1 = Math.max(z1, p.W.z); }
    contact.follow((x0 + x1) / 2, (z0 + z1) / 2);
  }
  conduitMesh.geometry.dispose();
  conduitMesh.geometry = conduitGeometry(samples, matrix, r);
  stripeMesh.geometry.dispose();
  stripeMesh.geometry = stripeGeometry(samples, matrix, r);
  // end caps + labels
  const rot = new THREE.Matrix3().setFromMatrix4(matrix);
  const ends = [[capA, labelA, 0, -1], [capB, labelB, c.L, 1]];
  for (const [cap, lab, s, sign] of ends) {
    const f = c.frameAt(lay, s);
    const P = f.P.clone().applyMatrix4(matrix), T = f.T.clone().applyMatrix3(rot).normalize();
    cap.position.copy(P);
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T);
    lab.position.copy(P).addScaledVector(T, sign * 2.5).add(new THREE.Vector3(0, r + 2.2, 0));
  }
  // marks
  markGroup.clear();
  for (const m of c.marks) {
    const f = c.frameAt(lay, m.s);
    const P = f.P.clone().applyMatrix4(matrix), T = f.T.clone().applyMatrix3(rot).normalize();
    const sel = m.id === state.placement.markId;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, sel ? 0.07 : 0.05, 6, 40), sel ? MAT.pencilSel : MAT.pencil);
    ring.position.copy(P); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T);
    markGroup.add(ring);
    const lab = makeLabelSprite(m.label, sel ? { size: 0.95, bg: 'rgba(47,111,230,.95)', color: '#fff' } : { size: 0.85 });
    lab.position.copy(P).add(new THREE.Vector3(0, r + 1.1, 0));
    markGroup.add(lab);
  }
  updateTape();
  updateDims();
  updateObstacle();
  updateRefMarker();
  const onWall = !!state.wallFit;
  for (const o of [conduitMesh, stripeMesh, capA, capB, labelA, labelB, markGroup]) o.visible = !onWall;
  if (onWall && tape) tape.visible = false;
  updateRollRing();
}

// Show the lesson's obstruction on the floor, measured from End A along the first leg.
function updateObstacle() {
  obstacleGroup.clear();
  const ob = state.lesson.obstacle && state.lesson.obstacle(state.params);
  if (!ob || state.inBender) return;
  obstacleGroup.matrixAutoUpdate = false;
  obstacleGroup.matrix.copy(placeM({ ...state.pipeW, y: 0 }));
  const xA = state.conduit.frameAt(state.lay, 0).P.clone().applyMatrix4(state.restLocal).x;
  const z = 0, depth = 10;
  let mesh, label;
  if (ob.type === 'pipe') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(ob.H / 2, ob.H / 2, 30, 32), new THREE.MeshStandardMaterial({ color: 0x2b5d8b, metalness: 0.4, roughness: 0.5 }));
    mesh.rotation.x = Math.PI / 2; mesh.position.set(xA + ob.at, ob.H / 2, z);
    label = `Pipe ${fmtIn(ob.H)} OD @ ${fmtIn(ob.at)}`;
  } else if (ob.type === 'box') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(ob.W, ob.H, depth * 2), obstacleMat);
    mesh.position.set(xA + ob.at + ob.W / 2, ob.H / 2, z);
    label = `${fmtIn(ob.H)} × ${fmtIn(ob.W)} @ ${fmtIn(ob.at)}`;
  } else {
    const len = state.conduit.L - ob.at + 6;
    mesh = new THREE.Mesh(new THREE.BoxGeometry(len, ob.H, depth * 2), obstacleMat);
    mesh.position.set(xA + ob.at + len / 2, ob.H / 2, z);
    label = `${fmtIn(ob.H)} step @ ${fmtIn(ob.at)}`;
  }
  mesh.receiveShadow = true; mesh.castShadow = true;
  obstacleGroup.add(mesh);
  const sp = makeLabelSprite(label, { size: 1.0 });
  sp.position.set(xA + ob.at, ob.H + 7, z - depth); obstacleGroup.add(sp);
}

// ------------------------------------------------------------------ field jobs: the job wall
// The job's wall stands behind the work area. Wall coordinates (x along the wall, y up, z out from
// the face) map to world by a plain shift, so the wall faces the bench.
const JOB_ORIGIN = new THREE.Vector3(-40, 0, -110);
const jobGroup = new THREE.Group(); scene.add(jobGroup);
const jobInstalled = new THREE.Group(); scene.add(jobInstalled);
// Things on the job wall cast soft shadows onto it (layer WALL_CASTER); the wall itself does not.
const WALL_CASTER = 2;
camera.layers.enable(WALL_CASTER);
const wallContact = createContactShadow(renderer, scene, { size: 210, res: 1024, height: 10, darkness: 1.7, opacity: 0.7, spread: 2.0, layer: WALL_CASTER });
wallContact.group.rotation.x = Math.PI / 2;   // its "up" now points out of the wall
wallContact.group.visible = false;
const castOnWall = (obj) => obj.traverse(o => { o.layers.set(NO_CONTACT_SHADOW); o.layers.enable(WALL_CASTER); });
const JOBMAT = {
  wall: JOB_MAT.wall,
  start: new THREE.MeshBasicMaterial({ color: 0x22c27a, transparent: true, opacity: 0.95 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x8c939b, metalness: 0.45, roughness: 0.45 }),
  box: new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 0.6, roughness: 0.38 }),
  conn: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.8, roughness: 0.3 }),
  target: new THREE.MeshBasicMaterial({ color: 0x3f86ff, transparent: true, opacity: 0.9 }),
};

function updateJobScene(keepInstalled = false) {
  jobGroup.clear(); if (!keepInstalled) jobInstalled.clear(); jobWall = null;
  jobClickables.length = 0; jobParts.box = null; jobParts.panel = null;
  panelKOs.clear(); pkoTargets.length = 0; koHover = null;
  if (!state.lesson.route) { wallContact.group.visible = false; cart.visible = false; drawWallMarks(); renderWallTools(); renderWallFitTools(); return; }
  const sc = state.params.scene, r = state.conduit.r;
  jobGroup.position.copy(JOB_ORIGIN);
  // wall wide enough for everything on it
  let x0 = Math.min(sc.start.p.x, sc.end.p.x), x1 = Math.max(sc.start.p.x, sc.end.p.x);
  for (const it of sc.items) { const a = it.min ?? it.a, b = it.max ?? it.b; x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]); }
  x0 -= 26; x1 += 26; sc.cx = (x0 + x1) / 2;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 120, 2), JOBMAT.wall);
  wall.position.set(sc.cx, 60, -1); jobGroup.add(wall);
  jobWall = wall;
  const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 4, 0.5), JOB_MAT.base); // dark rubber base
  base.position.set(sc.cx, 2, 0.25); jobGroup.add(base);
  // the soft wall shadow covers the wall, its "floor" is the wall face (shifted down a touch: light from above)
  wallContact.group.position.copy(JOB_ORIGIN).add(new THREE.Vector3(sc.cx, 60 - 0.7, 0.04));
  wallContact.group.visible = true;
  // pencil marks belong to this job and size; a new stick keeps them
  const key = state.lesson.id + '|' + state.size;
  if (state.wallMarksFor !== key) { state.wallMarks = []; state.wallMarksFor = key; state.wallSeq = 0; state.conn = { start: false, end: false }; state.job = { coverOff: false, doorOpen: false, kos: {} }; state.cartW = null; }
  const CN = CONNECTOR[state.size];
  sc.start.conn = state.conn.start ? CN : null;
  sc.end.conn = state.conn.end ? CN : null;
  // the holes actually punched in the panel and box walls for the conduit
  const holes = [
    { c: sc.start.p, n: sc.start.d.clone().normalize(), r: CN.ko / 2 },
    { c: sc.end.p, n: sc.end.d.clone().normalize().negate(), r: CN.ko / 2 },
  ];
  const add = (mesh, label, at) => {
    jobGroup.add(mesh);
    if (label) { const sp = makeLabelSprite(label, { size: 3.2 }); sp.position.copy(at); jobGroup.add(sp); }
  };
  for (const it of sc.items) {
    if (it.kind === 'pipe') {
      const a = new THREE.Vector3(...it.a), b = new THREE.Vector3(...it.b), len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(it.rad, it.rad, len, 32),
        new THREE.MeshStandardMaterial({ color: it.color, metalness: 0.45, roughness: 0.35 }));
      castOnWall(m);
      m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const top = a.y > b.y ? a : b;
      add(m, it.label, a.y === b.y ? a.clone().lerp(b, 0.3).add(new THREE.Vector3(0, 4, 4)) : new THREE.Vector3(a.x, 104, 4));
      void top;
    } else {
      const mn = new THREE.Vector3(...it.min), mx = new THREE.Vector3(...it.max);
      let m;
      if (it.kind === 'panel') {
        m = buildJobPanel(it.min, it.max, { holes, punched: state.job.kos });
        m.userData.doorPivot.rotation.y = state.job.doorOpen ? -DOOR_OPEN : 0;
        jobParts.panel = m;
      } else if (it.kind === 'box') {
        const bx = buildJobBox(it.min, it.max, { holes, coverOff: state.job.coverOff });
        m = bx.group; jobParts.box = { ...bx, W: mx.x - mn.x, H: mx.y - mn.y };
      } else m = buildJobBlock(it.min, it.max, it.look);
      castOnWall(m);
      if (it.kind === 'panel') for (const kg of m.userData.kos) {
        panelKOs.set(kg.userData.ko.id, kg);
        kg.userData.hit.layers.set(NO_CONTACT_SHADOW);        // pick target only, no shadow
        pkoTargets.push(kg.userData.hit, ...kg.userData.slugs.filter(Boolean));
      }
      const at = it.kind === 'block' ? new THREE.Vector3((mn.x + mx.x) / 2, Math.min(mx.y, 112) - 6, mx.z + 3)
        : new THREE.Vector3((mn.x + mx.x) / 2, mx.y + (it.kind === 'box' ? 7.5 : 3.5), mx.z + 1);
      add(m, it.label, at);
    }
  }
  // knockouts in the panel and the box, ~1" off the wall; a connector in each one the student set.
  // The green ring marks the start, the blue ring where the conduit must land (at the connector mouth
  // once a connector is in).
  koTargets.length = 0;
  for (const which of ['start', 'end']) {
    const ep = sc[which];
    const out = which === 'start' ? ep.d.clone().normalize() : ep.d.clone().normalize().negate();
    const frame = new THREE.Group();
    // local +Z out of the box face; local +Y out of the wall so the set screw faces the room
    const zW = new THREE.Vector3(0, 0, 1), yL = Math.abs(out.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : zW.clone().addScaledVector(out, -zW.dot(out)).normalize();
    frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(yL, out), yL, out));
    frame.position.copy(ep.p);
    frame.add(buildKnockout(CN.ko));
    if (ep.conn) frame.add(buildConnector(CN, state.conduit.r * 2, EMT[state.size].id));
    const lip = ep.conn ? CN.B : 0.02, rr = (ep.conn ? CN.C : CN.ko) / 2 + 0.22;
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.13, 10, 48), which === 'start' ? JOBMAT.start : JOBMAT.target);
    ringM.position.z = lip; frame.add(ringM);
    castOnWall(frame);
    // a generous, invisible click target over the knockout (and the connector)
    const len = (ep.conn ? CN.B : 0) + 0.6;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.3, rr + 0.3, len, 24),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.rotation.x = Math.PI / 2; hit.position.z = len / 2 - 0.3;
    hit.userData.ko = which; hit.layers.set(NO_CONTACT_SHADOW);
    frame.add(hit); koTargets.push(hit);
    jobGroup.add(frame);
  }
  // tags beside each end, out of the conduit's way
  // the start tag sits below a side connector (on the panel), the target tag above it (clear of pipes below)
  const tag = (p, d, text, up) => {
    const sp = makeLabelSprite(text, { size: 2.6 });
    const side = Math.abs(d.y) > 0.5 ? new THREE.Vector3(-(r + 10), 0, 3) : new THREE.Vector3(0, up ? r + 3.2 : -r - 4, 3);
    sp.position.copy(p).add(side); jobGroup.add(sp);
  };
  tag(sc.start.p, sc.start.d, 'Start · panel', false);
  tag(sc.end.p, sc.end.d, 'Land here', true);
  jobGroup.traverse(o => { if (!o.layers.isEnabled(WALL_CASTER)) o.layers.set(NO_CONTACT_SHADOW); });
  jobGroup.traverse(o => { if (o.isMesh && o.userData.act) jobClickables.push(o); });
  // the work cart stands on the floor in front of the wall, left of the panel, until it is dragged
  if (!state.cartW) {
    const px = Math.min(...sc.items.filter(i => i.kind === 'panel').map(i => i.min[0]), sc.start.p.x);
    state.cartW = { x: JOB_ORIGIN.x + px - 26, z: JOB_ORIGIN.z + 34 };
  }
  cart.visible = true; cart.position.set(state.cartW.x, 0, state.cartW.z);
  drawCart();
  drawWallMarks(); renderWallTools(); renderWallFitTools();
}
// Rebuild the wall after a change to what is on it, keeping the conduit held or installed there.
function rebuildJob() { updateJobScene(true); if (state.wallFit) showWallFit(); }
let jobWall = null;
const koTargets = [];
const jobClickables = [];                   // meshes with userData.act ('door' | 'cover' | 'cartCover')
const jobParts = { box: null, panel: null };
const DOOR_OPEN = 1.95;                     // panel door swing, radians (about 112°)

// ------------------------------------------------------------------ work cart beside the job wall
const cart = buildCart(); cart.visible = false; scene.add(cart);
const cartItems = new THREE.Group(); cart.add(cartItems);
let jobAnim = false;
// Where things lie on the top tray (cart coordinates): the cover flat, the screws beside it.
function cartSlot(kind, i = 0) {
  const y = cart.userData.topY;
  if (kind === 'cover') return { p: new THREE.Vector3(-5, y, 0), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.3)) };
  return { p: new THREE.Vector3(5 + i * 1.2, y + 0.155, 1.5 - i * 0.6), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0.4 + i)) };
}
function drawCart() {
  cartItems.clear();
  if (!state.job.coverOff || !jobParts.box) return;
  const cv = buildBoxCover(jobParts.box.W, jobParts.box.H), sl = cartSlot('cover');
  cv.position.copy(sl.p); cv.quaternion.copy(sl.q); cartItems.add(cv);
  for (let i = 0; i < 2; i++) { const sw = buildCoverScrew(), s2 = cartSlot('screw', i); sw.position.copy(s2.p); sw.quaternion.copy(s2.q); cartItems.add(sw); }
  cartItems.traverse(o => { if (o.isMesh) o.userData.act = 'cartCover'; });
}
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
// Fly an object (already in world space) to a world pose along a low arc.
function flyTo(obj, P1, Q1, ms, lift = 6) {
  const P0 = obj.position.clone(), Q0 = obj.quaternion.clone();
  return animate(k => {
    const e = ease(k);
    obj.position.lerpVectors(P0, P1, e); obj.position.y += Math.sin(Math.PI * e) * lift;
    obj.quaternion.slerpQuaternions(Q0, Q1, e);
  }, ms);
}
const cartWorld = (sl) => ({ p: cart.localToWorld(sl.p.clone()), q: cart.getWorldQuaternion(new THREE.Quaternion()).multiply(sl.q) });

// Take the cover off: back both screws out, set them on the cart, then lift the cover off onto the cart.
async function removeCover() {
  const bx = jobParts.box;
  if (!bx || state.job.coverOff || jobAnim) return;
  jobAnim = true;
  try {
    const z0 = bx.screws.map(sw => sw.position.z);
    await animate(k => bx.screws.forEach((sw, i) => { sw.position.z = z0[i] + 0.5 * k; sw.rotation.z = k * Math.PI * 8; }), 900);
    cart.updateMatrixWorld(true);
    await Promise.all(bx.screws.map((sw, i) => { scene.attach(sw); const w = cartWorld(cartSlot('screw', i)); return flyTo(sw, w.p, w.q, 800 + i * 150, 8); }));
    const c0 = bx.cover.position.z;
    await animate(k => { bx.cover.position.z = c0 + 1.5 * ease(k); }, 380);
    scene.attach(bx.cover);
    const w = cartWorld(cartSlot('cover'));
    await flyTo(bx.cover, w.p, w.q, 950, 10);
    for (const o of [...bx.screws, bx.cover]) scene.remove(o);
    state.job.coverOff = true;
    rebuildJob();
    toast('Cover off: both screws and the cover are on the cart. Click the cover on the cart to put it back.');
  } finally { jobAnim = false; }
}
// Put it back: the cover from the cart onto the box, then the screws, driven home.
async function replaceCover() {
  const bx = jobParts.box;
  if (!bx || !state.job.coverOff || jobAnim) return;
  jobAnim = true;
  try {
    cartItems.clear();
    cart.updateMatrixWorld(true);
    const parts = [bx.cover, ...bx.screws];
    const home = parts.map(o => ({ p: o.position.clone(), q: o.quaternion.clone() }));   // in box (wall) coords
    const toWorld = (h) => ({ p: jobGroup.localToWorld(h.p.clone()), q: jobGroup.getWorldQuaternion(new THREE.Quaternion()).multiply(h.q) });
    const startAt = [cartWorld(cartSlot('cover')), cartWorld(cartSlot('screw', 0)), cartWorld(cartSlot('screw', 1))];
    parts.forEach((o, i) => { scene.add(o); o.position.copy(startAt[i].p); o.quaternion.copy(startAt[i].q); });
    const cw = toWorld(home[0]);
    await flyTo(bx.cover, cw.p.clone().add(new THREE.Vector3(0, 0, 1.5)), cw.q, 900, 10);
    await animate(k => { bx.cover.position.z = cw.p.z + 1.5 * (1 - ease(k)); }, 320);
    await Promise.all(bx.screws.map((sw, i) => { const w2 = toWorld(home[i + 1]); return flyTo(sw, w2.p.clone().add(new THREE.Vector3(0, 0, 0.5)), w2.q, 700 + i * 150, 6); }));
    const zs = bx.screws.map(sw => sw.position.z);
    await animate(k => bx.screws.forEach((sw, i) => { sw.position.z = zs[i] - 0.5 * k; sw.rotation.z = -(1 - k) * Math.PI * 8; }), 800);
    for (const o of parts) scene.remove(o);
    state.job.coverOff = false;
    rebuildJob();
    toast('Cover back on.');
  } finally { jobAnim = false; }
}
async function toggleDoor() {
  const pv = jobParts.panel && jobParts.panel.userData.doorPivot;
  if (!pv || jobAnim) return;
  jobAnim = true;
  const a0 = pv.rotation.y, a1 = state.job.doorOpen ? 0 : -DOOR_OPEN;
  state.job.doorOpen = !state.job.doorOpen;
  try { await animate(k => { pv.rotation.y = a0 + (a1 - a0) * ease(k); }, 750); } finally { jobAnim = false; }
}
// ------------------------------------------------------------------ right-click menu
// A right click (without dragging, which still pans) opens a menu at the pointer. Over a knockout,
// connector, cover, door or the cart it offers what you can do with that; anywhere else it has the
// tool (pencil or camera), views, panels and the exercise.
let ctxHit = () => null;
function setTool(pencil) {
  $('#chkClick').checked = pencil; $('#chkClick').dispatchEvent(new Event('change'));
  if (!pencil) showPencil(null);
  toast(pencil ? 'Pencil: click the conduit or the job wall to mark it. Drag still orbits.' : 'Camera: left drag orbits, right drag pans. Nothing gets marked.');
}
function wireContextMenu(fold) {
  const menu = $('#ctxMenu'), cv = renderer.domElement;
  const hide = () => { menu.hidden = true; };
  let rDown = null;
  viewport.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerdown', e => {
    if (!menu.hidden && !menu.contains(e.target)) hide();
    if (e.button === 2 && e.target === cv) rDown = { x: e.clientX, y: e.clientY };
  }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.addEventListener('pointerup', e => {
    if (e.button !== 2 || !rDown) return;
    const d = rDown; rDown = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;    // it was a pan
    open(e);
  });
  function open(e) {
    const jh = ctxHit(e);
    let title = '', items = [];
    if (jh && jh.kind === 'pko') {
      const id = jh.hit.object.userData.pko, ko = panelKOs.get(id).userData.ko, n = state.job.kos[id] || 0;
      title = `Knockout · ${ko.sizes.map(d => KO_TRADE[d]).join(' / ')}`;
      items = [
        { label: n < ko.sizes.length ? `Knock out ${KO_TRADE[ko.sizes[n]]}` : 'Fully knocked out', disabled: n >= ko.sizes.length, fn: () => knockOut(id) },
        { label: `Knock out all the way (${KO_TRADE[ko.sizes[ko.sizes.length - 1]]})`, disabled: n >= ko.sizes.length, fn: () => knockOut(id, true) },
        { label: 'Close it back up', disabled: !n, fn: () => resetKO(id) },
      ];
    } else if (jh && jh.kind === 'ko') {
      const w = jh.hit.object.userData.ko;
      title = w === 'start' ? 'Panel knockout' : 'Box knockout';
      items = [{ label: state.conn[w] ? 'Connector…  (remove)' : 'Connector…  (set one)', fn: () => openKoMenu(w, e.clientX, e.clientY) }];
    } else if (jh && jh.kind === 'act') {
      const act = jh.hit.object.userData.act;
      if (act === 'door') { title = 'Panel'; items = [{ label: state.job.doorOpen ? 'Close the door' : 'Open the door', fn: toggleDoor }]; }
      else { title = 'Box'; items = [{ label: 'Take the cover off', fn: removeCover }]; }
    } else if (jh && jh.kind === 'cart') {
      title = 'Work cart';
      items = [
        { label: 'Put the cover back on the box', disabled: !state.job.coverOff, fn: replaceCover },
        { label: 'Move the cart back beside the panel', fn: () => { state.cartW = null; rebuildJob(); } },
      ];
    } else {
      const pencil = $('#chkClick').checked, fl = $('#app').classList;
      title = 'Workshop';
      items = [
        { head: 'Tool' },
        { label: 'Pencil (mark on click)', on: pencil, fn: () => setTool(true) },
        { label: 'Camera (orbit and pan)', on: !pencil, fn: () => setTool(false) },
        { head: 'View' },
        ...['bender', 'side', 'top', 'overview', 'conduit'].map(v => ({ label: v[0].toUpperCase() + v.slice(1), fn: () => setView(v) })),
        ...(state.lesson.route ? [{ label: 'Job wall', fn: () => setView('job') }] : []),
        { head: 'Panels' },
        { label: fl.contains('fold-l') ? 'Show the left panel' : 'Hide the left panel', fn: () => fold('l') },
        { label: fl.contains('fold-r') ? 'Show the right panel' : 'Hide the right panel', fn: () => fold('r') },
        { head: 'Exercise' },
        { label: 'Undo bend', fn: () => $('#btnUndo').click() },
        { label: 'New stick', fn: () => $('#btnNew').click() },
        { label: 'Reset exercise', fn: () => $('#btnReset').click() },
      ];
    }
    menu.innerHTML = `<div class="ctx-h">${title}</div>` + items.map((it, i) => it.head ? `<div class="ctx-sub">${it.head}</div>`
      : `<button data-i="${i}"${it.disabled ? ' disabled' : ''}><span class="ck">${it.on ? '●' : ''}</span>${it.label}</button>`).join('');
    menu.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { hide(); items[+b.dataset.i].fn(); });
    const vr = viewport.getBoundingClientRect();
    menu.hidden = false;
    menu.style.left = Math.min(vr.width - menu.offsetWidth - 6, Math.max(6, e.clientX - vr.left + 2)) + 'px';
    menu.style.top = Math.min(vr.height - menu.offsetHeight - 6, Math.max(6, e.clientY - vr.top + 2)) + 'px';
  }
}

// ------------------------------------------------------------------ concentric knockouts in the panel
// Hover lights up the next slug; a click knocks it out (it drops into the can and is gone); a double
// click closes the knockout back up, as long as no conduit runs through it.
const panelKOs = new Map(), pkoTargets = [];
const KO_HI = new THREE.MeshStandardMaterial({ color: 0x3f86ff, emissive: 0x3f86ff, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3 });
let koHover = null, pkoPending = null;
function setKOHover(id) {
  if (koHover === id) return;
  const paint = (kid, mat) => { const kg = panelKOs.get(kid); if (kg) kg.userData.slugs.forEach(m => { if (m) m.material = mat; }); };
  if (koHover) paint(koHover, JOB_MAT.panel);
  koHover = id;
  if (id) { const kg = panelKOs.get(id), m = kg && kg.userData.slugs[state.job.kos[id] || 0]; if (m) m.material = KO_HI; }
}
const koSize = (ko, n) => KO_TRADE[ko.sizes[n - 1]] || `${fmtIn(ko.sizes[n - 1])} dia`;
function dropSlug(m, n) {
  if (!m) return;
  m.updateMatrixWorld(true);
  const W0 = m.matrixWorld.clone(), c = new THREE.Vector3().setFromMatrixPosition(W0);
  m.parent.remove(m); scene.add(m);
  m.material = JOB_MAT.panel.clone(); m.material.transparent = true;
  const axis = new THREE.Vector3(1, 0.3, 0.2).normalize();
  animate(k => {
    const off = n.clone().multiplyScalar(-0.9 * k);              // knocked in, into the can
    m.matrix.makeTranslation(c.x + off.x, c.y + off.y - 2.5 * k * k, c.z + off.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, k * 2.4))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)).multiply(W0);
    m.material.opacity = 1 - k * k;
  }, 520).then(() => { scene.remove(m); m.geometry.dispose(); });
}
function knockOut(id, all = false) {
  const kg = panelKOs.get(id); if (!kg) return;
  const { ko, slugs } = kg.userData, n = state.job.kos[id] || 0;
  if (n >= ko.sizes.length) { toast(`Already knocked out to the full ${koSize(ko, n)} size.`); return; }
  setKOHover(null);
  const upto = all ? ko.sizes.length : n + 1;
  for (let k = n; k < upto; k++) {
    const i = pkoTargets.indexOf(slugs[k]); if (i >= 0) pkoTargets.splice(i, 1);
    dropSlug(slugs[k], ko.n); slugs[k] = null;
  }
  state.job.kos[id] = upto;
  toast(`Knocked out: ${koSize(ko, upto)} hole${upto < ko.sizes.length ? ' (click again for the next size)' : ''}.`);
}
// Does any conduit on the wall (held there, or installed by the check) run through this knockout?
// Walks the centerline every 1/4" and looks for a point inside the hole, within an inch of the wall.
function conduitThrough(ko) {
  const n = state.job.kos[ko.id] || 0, R = ko.sizes[Math.max(0, n - 1)] / 2;
  const runs = [];
  if (state.wallFit) runs.push({ c: state.conduit, M: state.wallFit.M, s0: 0, s1: state.conduit.L });
  else if (lastInstalled && jobInstalled.children.length) {
    const { conduit, fit } = lastInstalled;
    const [s0, s1] = fit.inEnd === 'A' ? [0, fit.cutS] : [fit.cutS, conduit.L];
    runs.push({ c: conduit, M: fit.matrix, s0, s1 });
  }
  const v = new THREE.Vector3();
  for (const r of runs) {
    const lay = r.c.layout();
    for (let s0 = r.s0; s0 <= r.s1 + 1e-9; s0 += 0.25) {
      v.copy(r.c.frameAt(lay, Math.min(s0, r.s1)).P).applyMatrix4(r.M).sub(ko.c);
      const a = v.dot(ko.n);
      if (Math.abs(a) <= 1.0 && v.addScaledVector(ko.n, -a).length() < R) return true;
    }
  }
  return false;
}
function resetKO(id) {
  const kg = panelKOs.get(id); if (!kg) return;
  if (!(state.job.kos[id] > 0)) { toast('That knockout is still closed.'); return; }
  if (conduitThrough(kg.userData.ko)) { toast('A conduit runs through that knockout. Take it out first.', true); return; }
  state.job.kos[id] = 0; rebuildJob(); toast('Knockout closed back up.');
}
// one click knocks out the next ring; a second click on the same knockout within 0.3 s is a double click
function pkoClick(id) {
  const now = performance.now();
  if (pkoPending && pkoPending.id === id && now - pkoPending.t < 320) { clearTimeout(pkoPending.timer); pkoPending = null; resetKO(id); return; }
  if (pkoPending) { clearTimeout(pkoPending.timer); const prev = pkoPending.id; pkoPending = null; knockOut(prev); }
  pkoPending = { id, t: now, timer: setTimeout(() => { pkoPending = null; knockOut(id); }, 300) };
}

function jobClick(act) {
  if (act === 'cover') removeCover();
  else if (act === 'cartCover') replaceCover();
  else if (act === 'door') toggleDoor();
}

// ------------------------------------------------------------------ cutting the held conduit at the box
// A click on the piece running past the box connector cuts it where it bottoms out on the connector's
// stop, once both ends are in connectors and the stick lines up.
function tryCut(pw) {
  const c = state.conduit, sc = state.params.scene, M = state.wallFit.M;
  const g = gradePlacement(c, sc, M), m = g.m;
  const pl = pw.clone().sub(JOB_ORIGIN).applyMatrix4(M.clone().invert());
  const lay = c.layout();
  let best = { d: Infinity, s: 0 };
  for (let s0 = 0; s0 <= c.L + 1e-9; s0 += 0.25) { const d = c.frameAt(lay, Math.min(s0, c.L)).P.distanceTo(pl); if (d < best.d) best = { d, s: s0 }; }
  const inDrop = g.inEnd === 'A' ? best.s > g.cutS + 0.05 : best.s < g.cutS - 0.05;
  if (!inDrop) return false;
  if (!state.conn.start || !state.conn.end) { toast('Set a connector in the panel and in the box first: click each knockout.', true); return true; }
  if (m.startGap > 0.25 || m.startAng > 4) { toast('Seat the conduit in the panel connector first.', true); return true; }
  if (m.short || m.behind || m.miss > 0.25 || m.ang > 4) { toast('Line it up with the box connector first, then cut.', true); return true; }
  cutConduit(g.inEnd === 'A' ? 'B' : 'A', g.cutS);
  return true;
}
function cutConduit(dropEnd, sCut) {
  const c = state.conduit;
  const drop = dropEnd === 'B' ? c.L - sCut : sCut;
  if (dropEnd === 'B') {
    c.L = sCut; c.marks = c.marks.filter(mk => mk.s <= sCut);
  } else {
    // shorten from End A: the old frame at the cut becomes the new End A, so move the placement with it
    const f = c.frameAt(c.layout(), sCut);
    const G = new THREE.Matrix4().makeBasis(f.T, f.N, f.B).setPosition(f.P);
    for (const b of c.bends) b.arrowS -= sCut;
    c.marks = c.marks.filter(mk => mk.s >= sCut).map(mk => ({ ...mk, s: mk.s - sCut }));
    c.L -= sCut;
    state.wallFit.M.multiply(G);
  }
  refreshAll();
  showWallFit();
  toast(`Cut ${fmtIn(drop)} off End ${dropEnd}. The stick is ${fmtIn(c.L)} and sits on both connector stops.`);
}

// Draw the student's conduit installed on the job wall, cut to length.
let lastInstalled = null;     // { conduit, fit } of the stick drawn installed on the wall
function showInstalled(conduit, fit) {
  jobInstalled.clear();
  lastInstalled = { conduit: conduit.clone(), fit };
  const lay = conduit.layout(), L = conduit.L;
  const [s0, s1] = fit.inEnd === 'A' ? [0, fit.cutS] : [fit.cutS, L];
  const samples = conduit.sample(lay, 0.4).filter(f => f.s > s0 + 1e-6 && f.s < s1 - 1e-6);
  samples.unshift({ s: s0, ...conduit.frameAt(lay, s0) }); samples.push({ s: s1, ...conduit.frameAt(lay, s1) });
  const M = new THREE.Matrix4().makeTranslation(JOB_ORIGIN.x, JOB_ORIGIN.y, JOB_ORIGIN.z).multiply(fit.matrix);
  const mesh = new THREE.Mesh(conduitGeometry(samples, M, conduit.r), MAT.galv);
  jobInstalled.add(mesh);
  castOnWall(jobInstalled);   // the installed conduit shades the wall behind it
}

// ------------------------------------------------------------------ roll widget (conduit in the shoe)
// A blue ring around the conduit, a little way back from the shoe. Drag it round to roll the conduit;
// the bright knob shows where the printed stripe is.
const rollRing = new THREE.Group(); rollRing.visible = false; scene.add(rollRing);
const ROLL_MAT = new THREE.MeshBasicMaterial({ color: 0x3f86ff, transparent: true, opacity: 0.85, depthTest: false });
const ROLL_KNOB = new THREE.MeshBasicMaterial({ color: 0xff8a1c, transparent: true, opacity: 1, depthTest: false });
let rollRingR = 0, rollRingFor = 0;
function buildRollRing(r) {
  rollRing.clear(); rollRingR = r + 1.3; rollRingFor = r;
  rollRing.add(new THREE.Mesh(new THREE.TorusGeometry(rollRingR, 0.13, 10, 72), ROLL_MAT));
  for (let k = 0; k < 8; k++) {                                     // 45° ticks
    const a = k * Math.PI / 4, t = new THREE.Mesh(new THREE.BoxGeometry(k % 2 ? 0.35 : 0.6, 0.09, 0.09), ROLL_MAT);
    t.position.set(Math.cos(a) * (rollRingR + 0.35), Math.sin(a) * (rollRingR + 0.35), 0); t.rotation.z = a; rollRing.add(t);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), ROLL_KNOB); knob.name = 'knob'; rollRing.add(knob);
  const grab = new THREE.Mesh(new THREE.TorusGeometry(rollRingR, 0.75, 6, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  grab.name = 'grab'; rollRing.add(grab);                           // wide, invisible band that is easy to grab
  rollRing.traverse(o => { o.layers.set(NO_CONTACT_SHADOW); o.renderOrder = 7; });
}
const rollRingActive = () => (state.inBender && state.perm <= 1e-4 && (state.stage === 'place' || state.stage === 'bend') && !!state.pose)
  || (!state.inBender && !!state.ghostPose);
function updateRollRing() {
  if (!rollRingActive()) { rollRing.visible = false; return; }
  const c = state.conduit, p = state.pose || state.ghostPose;
  if (rollRingFor !== c.r) buildRollRing(c.r);
  // on the straight conduit behind the shoe (heel side); the front side if that runs out
  const dir = p.front === 'A' ? 1 : -1;
  let s = p.sArrow + dir * 10;
  if (s < 2 || s > c.L - 2) s = p.sArrow - dir * 6;
  const f = c.frameAt(state.lay, Math.max(1, Math.min(c.L - 1, s)));
  const P = f.P.clone().applyMatrix4(state.matrix), T = f.T.clone().transformDirection(state.matrix);
  const N = f.N.clone().transformDirection(state.matrix);              // stripe side
  rollRing.position.copy(P);
  rollRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T);
  const local = N.clone().applyQuaternion(rollRing.quaternion.clone().invert()).setZ(0).normalize();
  rollRing.getObjectByName('knob').position.copy(local.multiplyScalar(rollRingR));
  rollRing.userData = { P, T, N };
  rollRing.visible = true;
}
// Roll the conduit in the shoe (before the bend starts), keeping the mark where it is.
function rollTo(deg) {
  if (state.inBender && state.perm > 1e-4) { toast('Release & remove first: the conduit can\'t roll with a bend clamped in the shoe.', true); return; }
  if (!state.inBender && state.placement.markId && state.stage !== 'place') insertIntoBender({ stay: true });
  const d = ((deg % 360) + 540) % 360 - 180;
  changePlacement(() => { state.placement.phiDeg = Math.round(d * 10) / 10; });
}
function lockPlacement() {
  const locked = state.inBender && state.perm > 1e-4;
  ['#plMark', '#plRef', '#plRollFine', '#plNudge'].forEach(s => { $(s).disabled = locked; });
  $$('#plFront button, #plRoll button').forEach(b => { b.disabled = locked; });
  $('#rollLockNote').hidden = !locked;
}

// ------------------------------------------------------------------ holding the conduit on the job wall
// state.wallFit = { M } while the bent stick is held against the job wall (M: conduit → wall coordinates).
function conduitPts(c, step = 1) {
  const lay = c.layout(), pts = [];
  for (let s = 0; s <= c.L + 1e-9; s += step) pts.push(c.frameAt(lay, Math.min(s, c.L)).P);
  return pts;
}
// Keep it held at the knockout standoff (~1" off the wall, on clamp-backs): slide it straight in or
// out until its closest point is at the knockout centerline distance off the wall.
function stickToWall(M) {
  const c = state.conduit;
  let minZ = Infinity;
  for (const P of conduitPts(c)) minZ = Math.min(minZ, P.clone().applyMatrix4(M).z);
  return M.premultiply(new THREE.Matrix4().makeTranslation(0, 0, koZ(state.size) - minZ));
}
// The end nearest the panel connector (the one being fed into it): point and outward direction, wall coords.
function wallFitEnd(M) {
  const c = state.conduit, lay = c.layout(), sp = seatOf(state.params.scene, 'start');
  const ends = [[0, 1], [c.L, -1]].map(([s, sign]) => {
    const f = c.frameAt(lay, s);
    return { s, P: f.P.clone().applyMatrix4(M), T: f.T.clone().multiplyScalar(sign).transformDirection(M) };
  });
  return ends[0].P.distanceTo(sp) <= ends[1].P.distanceTo(sp) ? ends[0] : ends[1];
}
function wallFitEnter() {
  if (!state.lesson.route) return;
  if (state.inBender) removeFromBender();
  const c = state.conduit, sc = state.params.scene, pts = conduitPts(c, 2);
  // start with End A in the panel connector and the stick lying as flat to the wall as it will go
  let best = null;
  for (let k = 0; k < 72; k++) {
    const M = placeInPanel(c, sc, 'A', k * 5 * DEG);
    let mn = Infinity, mx = -Infinity;
    for (const P of pts) { const z = P.clone().applyMatrix4(M).z; mn = Math.min(mn, z); mx = Math.max(mx, z); }
    const score = (mx - mn) + 0.001 * k;
    if (!best || score < best.score) best = { score, M };
  }
  state.wallFit = { M: stickToWall(best.M) };
  showWallFit(); setView('job'); renderWallFitTools();
}
function wallFitExit() {
  if (!state.wallFit) return;
  state.wallFit = null; jobInstalled.clear();
  updateScene(); renderWallFitTools();
}
function wallFitApply(fn) { if (!state.wallFit) return; fn(state.wallFit.M); stickToWall(state.wallFit.M); showWallFit(); }
function wallFitMove(dx, dy) { wallFitApply(M => M.premultiply(new THREE.Matrix4().makeTranslation(dx, dy, 0))); }
function wallFitRotate(ax, deg) {
  if (!state.wallFit) return;
  // swinging or tilting into the wall would just shove the stick off the panel; refuse and say so
  const before = state.wallFit.M.clone();
  if (ax === 'x' || ax === 'y') {
    const e = wallFitEnd(before);
    const axis = ax === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const test = before.clone().premultiply(new THREE.Matrix4().makeTranslation(e.P.x, e.P.y, e.P.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, deg * DEG)).multiply(new THREE.Matrix4().makeTranslation(-e.P.x, -e.P.y, -e.P.z)));
    const z0 = before.elements[14];
    stickToWall(test);
    if (test.elements[14] - z0 > 1 / 16) { toast('That turns it into the wall. Turn it the other way.', true); return; }
  }
  wallFitApply(M => {
    const e = wallFitEnd(M);
    const axis = ax === 'x' ? new THREE.Vector3(1, 0, 0) : ax === 'y' ? new THREE.Vector3(0, 1, 0) : ax === 'z' ? new THREE.Vector3(0, 0, 1) : e.T.clone().normalize();
    const R = new THREE.Matrix4().makeTranslation(e.P.x, e.P.y, e.P.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, deg * DEG))
      .multiply(new THREE.Matrix4().makeTranslation(-e.P.x, -e.P.y, -e.P.z));
    M.premultiply(R);
  });
}
function wallFitSeat() {
  wallFitApply(M => { const e = wallFitEnd(M), sp = seatOf(state.params.scene, 'start'); M.premultiply(new THREE.Matrix4().makeTranslation(sp.x - e.P.x, sp.y - e.P.y, 0)); });
}
// Draw the held conduit (full length, with a red ring where it would be cut) and grade it live.
function showWallFit() {
  if (!state.wallFit) return;
  const c = state.conduit, lay = c.layout(), sc = state.params.scene, M = state.wallFit.M;
  const g = gradePlacement(c, sc, M);
  jobInstalled.clear();
  const W = new THREE.Matrix4().makeTranslation(JOB_ORIGIN.x, JOB_ORIGIN.y, JOB_ORIGIN.z).multiply(M);
  const samples = c.sample(lay, 0.4);
  jobInstalled.add(new THREE.Mesh(conduitGeometry(samples, W, c.r), MAT.galv));
  if (!g.m.short) {
    const f = c.frameAt(lay, g.cutS);
    const cut = new THREE.Mesh(new THREE.TorusGeometry(c.r * 1.06, 0.09, 8, 40), MAT.red);
    cut.position.copy(f.P.clone().applyMatrix4(W)); cut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.T.clone().transformDirection(W));
    jobInstalled.add(cut);
  }
  castOnWall(jobInstalled);
  const ok = g.rows.every(r => r.status === 'good'), bad = g.rows.some(r => r.status === 'bad');
  $('#wallFitOut').innerHTML = `<div class="result"><table>${g.rows.map(r => `<tr><td>${r.label}</td><td>${r.measured}</td><td><span class="badge ${r.status}">${r.status.toUpperCase()}</span></td></tr>`).join('')}</table></div>`
    + `<p class="verdict ${ok ? 'good' : bad ? 'bad' : 'okc'}">${ok ? 'FITS · strap it' : bad ? 'DOES NOT FIT YET' : 'CLOSE · tighten it up'}</p>`;
  updateScene();
}
function renderWallFitTools() {
  const box = $('#wallFitTools'); if (!box) return;
  box.hidden = !state.lesson.route;
  $('#wallFitCtl').hidden = !state.wallFit;
  $('#btnWallHold').hidden = !!state.wallFit;
  $('#btnWallBack').hidden = !state.wallFit;
}

// ------------------------------------------------------------------ connectors in the knockouts
function openKoMenu(which, clientX, clientY) {
  const m = $('#koMenu'), CN = CONNECTOR[state.size], has = state.conn[which];
  const where = which === 'start' ? 'Panel knockout' : 'Box knockout';
  m.innerHTML = `<div class="ko-h"><b>${where}</b> · ${state.size}" EMT<button class="ko-x" title="Close">✕</button></div>
    <p class="small muted">Knockout ${fmtIn(CN.ko)} dia, center ${fmtIn(koZ(state.size))} off the wall.</p>
    ${has ? `<p class="small">Steel set-screw connector: body ${fmtIn(CN.B)} long × ${fmtIn(CN.C)} OD, ${fmtIn(CN.A - CN.B)} of thread with a locknut inside. The conduit goes in ${fmtIn(CN.B - CN.stop)} to the stop.</p>
      <button class="btn small" data-act="off">Remove connector</button>`
    : `<p class="small">Steel set-screw connector, ${state.size}": ${fmtIn(CN.A)} long overall, body ${fmtIn(CN.B)} × ${fmtIn(CN.C)} OD. The conduit seats ${fmtIn(CN.B - CN.stop)} deep, on the stop.</p>
      <button class="btn small primary" data-act="on">Set connector</button>`}`;
  const vr = viewport.getBoundingClientRect();
  m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.min(vr.width - w - 8, Math.max(8, clientX - vr.left + 12)) + 'px';
  m.style.top = Math.min(vr.height - h - 8, Math.max(8, clientY - vr.top + 12)) + 'px';
  m.querySelector('.ko-x').onclick = () => { m.hidden = true; };
  m.querySelector('[data-act]').onclick = (e) => {
    state.conn[which] = e.target.dataset.act === 'on';
    m.hidden = true;
    rebuildJob();
    toast(state.conn[which] ? `Connector set in the ${which === 'start' ? 'panel' : 'box'}. The conduit seats on its stop, ${fmtIn(CN.B - CN.stop)} in.` : 'Connector removed.');
  };
}

// Highlight the chosen bender reference with a small red pointer while placing.
function updateRefMarker() {
  refMarker.clear();
  if (!state.inBender) return;
  const b = state.bender;
  const ref = benderRefs(b)[state.placement.ref];
  if (!ref || loadedTheta() > 0.001) return;
  const r = state.conduit.r;
  const y0 = b.type === 'hand' ? r : ELECTRIC_BEND_HEIGHT;
  refMarker.matrixAutoUpdate = false;
  refMarker.matrix.copy(placeM(state.stationW));
  const x = ref.x;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 16), MAT.red);
  cone.rotation.x = -Math.PI / 2; // point at the conduit from the front
  cone.position.set(x, y0, r + 2.0);
  refMarker.add(cone);
  const lab = makeLabelSprite(ref.short, { size: 0.85, bg: 'rgba(214,72,60,.92)', color: '#fff' });
  lab.position.set(x, y0 - r - 1.4, r + 2.6);
  refMarker.add(lab);
}

// ------------------------------------------------------------------ measuring references
function measureRefs() {
  const c = state.conduit;
  const out = [{ key: 'A', label: 'End A', s0: 0, dir: 1 }, { key: 'B', label: 'End B', s0: c.L, dir: -1 }];
  const an = analyze(c);
  c.layout().list.forEach((b, i) => {
    const deg = b.theta / DEG;
    if (deg < 60) return;
    out.push({ key: `bk${b.id}B`, label: `Back of bend ${i + 1} (${fmtDeg(deg)}) → toward B`, s0: backOfBendS(c, b.id, 'B'), dir: 1, lineS: b.sb });
    out.push({ key: `bk${b.id}A`, label: `Back of bend ${i + 1} (${fmtDeg(deg)}) → toward A`, s0: backOfBendS(c, b.id, 'A'), dir: -1, lineS: b.sa });
  });
  for (const m of c.marks) {
    out.push({ key: `m${m.id}B`, label: `Mark ${m.label} → toward B`, s0: m.s, dir: 1 });
    out.push({ key: `m${m.id}A`, label: `Mark ${m.label} → toward A`, s0: m.s, dir: -1 });
  }
  void an;
  return out;
}
function currentMeasureRef() {
  const refs = measureRefs();
  return refs.find(r => r.key === $('#measFrom').value) || refs[0];
}
function fillMeasureSelect() {
  const sel = $('#measFrom'); const cur = sel.value;
  sel.innerHTML = measureRefs().map(r => `<option value="${r.key}">${r.label}</option>`).join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function updateTape() {
  if (!tape) return;
  tape.visible = !state.inBender && state.stage === 'mark';
  if (!tape.visible) return;
  const c = state.conduit, ref = currentMeasureRef();
  const lineS = ref.lineS ?? ref.s0;
  const f = c.frameAt(state.lay, Math.max(0, Math.min(c.L, lineS)));
  const rot = new THREE.Matrix3().setFromMatrix4(state.matrix);
  const T = f.T.clone().applyMatrix3(rot).normalize().multiplyScalar(ref.dir);
  const P0 = f.P.clone().applyMatrix4(state.matrix).addScaledVector(T, (ref.s0 - lineS) * ref.dir);
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(up.dot(T)) > 0.9) up = new THREE.Vector3(0, 0, 1);
  const normal = up.clone().sub(T.clone().multiplyScalar(up.dot(T))).normalize();
  const yAx = new THREE.Vector3().crossVectors(normal, T);
  tape.matrixAutoUpdate = false;
  const pos = P0.clone().addScaledVector(normal, c.r + 0.06);
  tape.matrix.makeBasis(T, yAx, normal).setPosition(pos);
}

function updateDims() {
  dimGroup.clear();
  if (state.inBender) return;
  const c = state.conduit;
  if (!c.bends.length) return;
  for (const [s, name] of [[0, 'A'], [c.L, 'B']]) {
    const P = c.frameAt(state.lay, s).P.clone().applyMatrix4(state.matrix);
    if (P.y < c.r + 0.75) continue;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(P.x, 0.05, P.z), P]);
    dimGroup.add(new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xc8913f, dashSize: 0.6, gapSize: 0.4 })).computeLineDistances());
    const lab = makeLabelSprite(`${name} ↕ ${fmtIn(P.y)}`, { size: 0.95, bg: 'rgba(20,30,52,.92)', color: '#9fc2ff' });
    lab.position.set(P.x + 2, P.y / 2, P.z); dimGroup.add(lab);
  }
}

// ------------------------------------------------------------------ UI: marks
function nextMarkLabel() {
  const steps = state.lesson.steps(state.params, state.bender).filter(s => s.type === 'mark');
  for (const st of steps) if (!state.conduit.marks.some(m => m.label === st.label)) return st.label;
  return 'M' + (state.conduit.marks.length + 1);
}

function addMark(s, label) {
  const c = state.conduit;
  if (!(s > 0 && s < c.L)) { toast('That mark is off the conduit.', true); return; }
  label = (label || nextMarkLabel()).trim();
  const old = c.marks.find(m => m.label === label);
  if (old) old.s = s; else c.marks.push({ id: 'k' + (++state.markSeq), label, s });
  c.marks.sort((a, b) => a.s - b.s);
  const mk = c.marks.find(m => m.label === label);
  // lesson feedback
  const st = state.lesson.steps(state.params, state.bender).find(x => x.type === 'mark' && x.label === label);
  if (st) {
    const want = st.s(c), err = s - want;
    toast(Math.abs(err) < 1 / 32 ? `✔ ${label} is right on the layout (${fmtIn(s)} from End A)` : `${label} is ${fmtIn(Math.abs(err))} ${err > 0 ? 'past' : 'short of'} the layout`, Math.abs(err) > 1 / 8);
  }
  if (!state.placement.markId) state.placement.markId = mk.id;
  refreshAll();
}

function renderMarks() {
  const ul = $('#markList');
  const c = state.conduit;
  ul.innerHTML = c.marks.length ? '' : '<li class="muted">No marks yet</li>';
  for (const m of c.marks) {
    const li = document.createElement('li');
    if (m.id === state.placement.markId) li.classList.add('sel');
    li.innerHTML = `<span><b>${m.label}</b> &nbsp; ${fmtIn(m.s)} from A · ${fmtIn(c.L - m.s)} from B</span><button title="Erase mark">✕</button>`;
    li.onclick = () => { if (!state.inBender || state.perm === 0) { state.placement.markId = m.id; refreshAll(); } };
    li.querySelector('button').onclick = (e) => { e.stopPropagation(); c.marks = c.marks.filter(x => x !== m); if (state.placement.markId === m.id) state.placement.markId = c.marks[0]?.id ?? null; refreshAll(); };
    ul.appendChild(li);
  }
  $('#markLabel').placeholder = nextMarkLabel();
  const ref = currentMeasureRef();
  const d = parseInches($('#markDist').value);
  $('#markHint').innerHTML = isNaN(d) ? `Tape hooked on <b>${ref.label}</b>.` : `Mark will be at <b>${fmtIn(ref.s0 + ref.dir * d)}</b> from End A.`;
}

// ------------------------------------------------------------------ UI: placement
function fillRefSelect() {
  const refs = benderRefs(state.bender);
  $('#plRef').innerHTML = Object.entries(refs).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
}
function syncPlacementUI() {
  const p = state.placement, c = state.conduit;
  $('#plMark').innerHTML = c.marks.map(m => `<option value="${m.id}">${m.label} (${fmtIn(m.s)})</option>`).join('') || '<option value="">— add a mark first —</option>';
  if (p.markId) $('#plMark').value = p.markId;
  $('#plRef').value = p.ref;
  $$('#plFront button').forEach(b => b.classList.toggle('on', b.dataset.v === p.front));
  const ph = ((p.phiDeg % 360) + 360) % 360;
  $$('#plRoll button').forEach(b => b.classList.toggle('on', Math.abs(parseFloat(b.dataset.v) - ph) < 0.5));
  $('#plRollFine').value = ph > 180 ? ph - 360 : ph;
  $('#plRollVal').textContent = `${Math.round(ph)}°`;
  $('#plNudge').value = p.nudge;
  $('#plNudgeVal').textContent = (p.nudge >= 0 ? '+' : '') + fmtIn(p.nudge);
  const locked = state.inBender && state.perm > 0;
  ['#plMark', '#plRef', '#plRollFine', '#plNudge'].forEach(s => $(s).disabled = locked || (s !== '#plMark' && false));
  $$('#plFront button, #plRoll button').forEach(b => b.disabled = locked);
  $('#btnInsert').disabled = state.inBender || !p.markId;
  $('#btnRemove').disabled = !state.inBender;

  // placement info
  let info = '';
  if (p.markId) {
    const pl = placementWithMark();
    const sArrow = arrowSFor(state.bender, pl);
    const frontLen = p.front === 'A' ? sArrow : c.L - sArrow;
    const ref = benderRefs(state.bender)[p.ref];
    info = `Mark <b>${c.marks.find(m => m.id === p.markId)?.label}</b> on the <b>${ref.short}</b>. The bend starts ${fmtIn(sArrow)} from End A, and ${fmtIn(frontLen)} of conduit sticks out past the shoe tangent on the hook side.`;
    const ex = findExisting(pl);
    if (ex) info += `<br>⟳ This lines up with existing bend (${fmtDeg(ex.theta / DEG)}). Inserting it lets you <b>add to that bend</b>.`;
  }
  $('#placeInfo').innerHTML = info;
}

function findExisting(pl) {
  const sArrow = arrowSFor(state.bender, pl);
  return state.conduit.bends.find(b => b.front === pl.front && Math.abs(b.arrowS - sArrow) < 0.06 &&
    Math.abs(((b.phi / DEG - pl.phiDeg) % 360 + 540) % 360 - 180) < 1.5) || null;
}

// Where the bender has to stand (and which way it faces) so the selected mark sits on the
// bender's reference mark while the conduit stays where it lies. Turning the hook toward
// the other end flips the bender 180° around the mark.
function stationFor(pl, ex, pose, matrix, lay) {
  const f = state.conduit.frameAt(lay, pl.markS);
  const Pm = f.P.clone().applyMatrix4(matrix);
  const Tm = f.T.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const u = (ex ? ex.front : pl.front) === 'A' ? -1 : 1;
  const xm = (pl.markS - pose.sArrow) * u; // mark's position along the shoe (local x)
  let yaw = state.pipeW.yaw;
  if (Math.hypot(Tm.x, Tm.z) > 0.3) yaw = Math.atan2(-Tm.z * u, Tm.x * u);
  return { x: Pm.x - Math.cos(yaw) * xm, z: Pm.z + Math.sin(yaw) * xm, yaw };
}

// Change the hook end or the mark. Before the bend is started, the bender turns or slides
// to the conduit, so the conduit doesn't swing around.
function changePlacement(fn) {
  const before = state.inBender && state.perm <= 1e-4 ? { matrix: state.matrix.clone(), lay: state.lay } : null;
  fn();
  if (before) {
    const pl = placementWithMark();
    if (pl) {
      const ex = findExisting(pl);
      const pose = benderPose(state.conduit, state.bender, pl, ex ? ex.theta : 0, ex);
      state.stationW = stationFor(pl, ex, pose, before.matrix, before.lay);
      state.existing = ex;
      state.perm = state.handle = ex ? ex.theta : 0;
    }
  }
  refreshAll();
}

function insertIntoBender(opts = {}) {
  if (state.wallFit) wallFitExit();
  const pl = placementWithMark();
  if (!pl) { toast('Select a mark first.', true); return; }
  const ex = findExisting(pl);
  const pose = benderPose(state.conduit, state.bender, pl, ex ? ex.theta : 0, ex);
  const sArrow = arrowSFor(state.bender, pl);
  if (sArrow <= 0.5 || sArrow >= state.conduit.L - 0.5) { toast('The mark is too close to the end to grip in the bender.', true); return; }
  if (pose.error && !ex) { toast(pose.error, true); return; }
  // Bring the bender to the conduit: the mark stays where it lies on the floor and the shoe lines up with it.
  state.stationW = stationFor(pl, ex, pose, state.matrix, state.lay);
  state.existing = ex;
  state.perm = ex ? ex.theta : 0;
  state.handle = state.perm;
  state.inBender = true;
  if (!opts.stay) setStage('bend');
  refreshAll();
  if (!opts.stay) setView('bender');
}

function removeFromBender() {
  if (!state.inBender) return;
  release(true);
  const th = state.perm;
  if (th > 0.05 * DEG) {
    if (state.existing) {
      const b = state.conduit.bends.find(x => x.id === state.existing.id); b.theta = th;
    } else {
      const pose = state.pose;
      state.conduit.bends.push({ id: 'b' + (++state.bendSeq), arrowS: pose.sArrow, front: pose.front, theta: th, R: state.bender.R, phi: pose.phi });
    }
  }
  // lay the conduit down where it was bent
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of state.samples) { minX = Math.min(minX, p.W.x); maxX = Math.max(maxX, p.W.x); minZ = Math.min(minZ, p.W.z); maxZ = Math.max(maxZ, p.W.z); }
  state.pipeW = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, yaw: state.pipeW.yaw };
  state.inBender = false; state.existing = null; state.handle = 0; state.perm = 0; state.benderFree = false;
  setStage('place');   // the conduit has to be placed in the bender again
  refreshAll();
  setView('overview');
}

// ------------------------------------------------------------------ bending
function setHandle(th) {
  if (!state.inBender) return;
  th = Math.max(state.perm, Math.min(100 * DEG, th));
  if (th > loadedTheta()) {
    const test = benderPose(state.conduit, state.bender, placementWithMark(), th, state.existing);
    if (test.error) { toast(test.error + ' Stop and re-mark.', true); state.pulling = 0; return; }
  }
  state.handle = th;
  refreshBend();
  updateScene();
}

function release(silent = false) {
  if (!state.inBender) return;
  const sb = state.spring ? state.bender.springback * DEG : 0;
  if (state.handle > state.perm + 1e-6) {
    const before = state.handle;
    state.perm = Math.max(state.perm, state.handle - sb);
    state.handle = state.perm;
    if (!silent && sb > 0) toast(`Released at ${fmtDeg(before / DEG)} and sprang back to ${fmtDeg(state.perm / DEG)}`);
  }
  refreshBend(); updateScene(); refreshInspect(); renderLesson();
}

function currentBendStep() {
  const st = currentStep();
  return st && st.type === 'bend' ? st : null;
}

function refreshBend() {
  const loaded = loadedTheta() / DEG;
  $('#gAngle').textContent = state.inBender ? fmtDeg(loaded) : '—';
  $('#bendSlider').value = loaded;
  $('#bendSlider').disabled = !state.inBender;
  ['#btnPull', '#btnPullFine', '#btnRelease', '#btnRemove2'].forEach(s => $(s).disabled = !state.inBender);
  const st = currentBendStep();
  let sub = state.inBender ? `set: ${fmtDeg(state.perm / DEG)} · ${state.handle > state.perm ? 'loaded' : 'released'}` : 'no conduit in bender';
  $('#gSub').textContent = sub;
  lockPlacement();
  let info = '';
  if (state.inBender && st) {
    const sb = state.spring ? state.bender.springback : 0;
    info = `Target <b>${fmtDeg(st.angle)}</b>. With about ${sb}° of springback, pull to roughly <b>${fmtDeg(st.angle + sb)}</b> and release.`;
  }
  if (state.inBender) {
    const ar = state.bender.R * loaded * DEG;
    info += `${info ? '<br>' : ''}Conduit in the arc: ${fmtIn(ar)} (π·R·θ/180, R = ${fmtIn(state.bender.R)})`;
  }
  $('#bendInfo').innerHTML = info;
  $('#hudStage').textContent = state.inBender
    ? `${state.bender.type === 'hand' ? 'Hand bender' : 'Electric bender'} · ${state.size}" EMT · ${fmtDeg(loaded)}`
    : `${state.size}" EMT · ${state.conduit.bends.length} bend(s) · ${fmtDeg(analyze(state.conduit).totalDegrees)} total`;
}

// ------------------------------------------------------------------ inspect
// The conduit as it would come out of the bender right now. A bend is only written to the conduit
// when it is removed, so a bend still in the shoe is added here at its permanent set (after springback).
function measuredConduit() {
  const c = state.conduit;
  if (!state.inBender || !state.pose) return c;
  // what the bend would spring back to if the handle were let go now (same rule as release())
  const sb = state.spring ? state.bender.springback * DEG : 0;
  const set = Math.max(state.perm, state.handle - sb);
  if (set <= 0.05 * DEG) return c;
  const m = c.clone();
  if (state.existing) {
    const b = m.bends.find(x => x.id === state.existing.id); if (b) b.theta = set;
  } else {
    const p = state.pose;
    m.bends.push({ id: 'live', arrowS: p.sArrow, front: p.front, theta: set, R: state.bender.R, phi: p.phi });
  }
  return m;
}

function refreshInspect() {
  const c = measuredConduit(), an = analyze(c);
  let h = state.inBender && c !== state.conduit
    ? `<div class="hint">Conduit is still in the bender. Measured as if released (springback applied).</div>` : '';
  h += `<table class="kv">`;
  h += `<tr><th>Length</th><td>${fmtIn(c.L)} (${(c.L / 12).toFixed(1)} ft)</td></tr>`;
  h += `<tr><th>Bends</th><td>${an.bends.length ? an.bends.map((b, i) => `#${i + 1}: <b>${fmtDeg(b.deg)}</b> centered ${fmtIn(b.center)} from A`).join('<br>') : 'none'}</td></tr>`;
  h += `<tr><th>Total degrees</th><td>${fmtDeg(an.totalDegrees)} ${an.totalDegrees > 360 ? '<span class="bad">✖ more than 360°. Add a pull point.</span>' : '<span class="good">✔ ≤ 360° (358.26)</span>'}</td></tr>`;
  if (an.bends.length) {
    if (an.bends[0].deg > 60) h += `<tr><th>Stub, End A</th><td>${fmtIn(an.stubA)} (end to back of next leg)</td></tr>`;
    if (an.bends[an.bends.length - 1].deg > 60) h += `<tr><th>Stub, End B</th><td>${fmtIn(an.stubB)}</td></tr>`;
    h += `<tr><th>End legs</th><td>${an.parallel ? 'parallel' : `${fmtDeg(an.endAngle)} apart`}</td></tr>`;
    if (an.parallel && an.legSeparation > 0.05) h += `<tr><th>Leg separation</th><td>${fmtIn(an.legSeparation)} centerline (offset depth)${an.endAngle > 179 ? `<br>back-to-back ${fmtIn(an.backToBack)}` : ''}</td></tr>`;
    if (an.parallel && an.legSeparation <= 0.05) h += `<tr><th>Saddle rise</th><td>${fmtIn(an.bentRise)}</td></tr>`;
  }
  h += `</table>`;
  $('#inspectOut').innerHTML = h;
}

function runCheck() {
  refreshInspect();
  const conduit = measuredConduit();
  let res;
  if (state.lesson.route) {
    // field job: install the conduit on the job wall and grade the fit
    if (state.wallFit) { res = gradePlacement(state.conduit, state.params.scene, state.wallFit.M).rows; showWallFit(); }
    else {
      const fit = fitRoute(conduit, state.params.scene);
      res = fit.rows;
      showInstalled(conduit, fit);
    }
    setView('job');
  } else res = state.lesson.check(analyze(conduit), state.params, conduit);
  if (!res.length) { $('#checkOut').innerHTML = '<p class="muted small">Free bend: no targets. Geometry is listed above.</p>'; return; }
  const score = res.every(r => r.status === 'good') ? 'good' : res.some(r => r.status === 'bad') ? 'bad' : 'ok';
  const msg = state.lesson.route
    ? { good: 'PASS · it fits the job', ok: 'MARGINAL · fits, but tighten it up', bad: 'FAIL · it will not go in as bent' }[score]
    : { good: 'PASS · all within ±1/8" / ±1°', ok: 'MARGINAL · within ±1/4" / ±2°', bad: 'FAIL · out of tolerance' }[score];
  $('#checkOut').innerHTML = `<div class="result"><table><tr><th>Check</th><th>Target</th><th>Measured</th><th></th></tr>${res.map(r => `<tr><td>${r.label}</td><td>${r.target}</td><td>${r.measured} <span class="muted small">${r.error}</span></td><td><span class="badge ${r.status}">${r.status.toUpperCase()}</span></td></tr>`).join('')}</table></div><p class="verdict ${score === 'good' ? 'good' : score === 'ok' ? 'okc' : 'bad'}">${msg}</p>`;
}

// ------------------------------------------------------------------ lessons
function stepDone(st, i, steps) {
  const c = state.conduit;
  if (st.type === 'mark') return c.marks.some(m => m.label === st.label);
  const nBefore = steps.slice(0, i + 1).filter(x => x.type === 'bend').length;
  return c.bends.length >= nBefore;
}
function currentStep() {
  const steps = state.lesson.steps(state.params, state.bender);
  return steps.find((st, i) => !stepDone(st, i, steps)) || null;
}

function renderLesson() {
  const L = state.lesson, p = state.params, b = state.bender;
  const steps = L.steps(p, b);
  const cur = currentStep();
  $('#tabLesson').innerHTML = `
    <h3>${L.title}</h3>
    <p class="small">${L.summary}</p>
    ${L.route ? '' : `<div class="formula">${L.math(p, b).map(x => `<div>${x}</div>`).join('')}</div>`}
    ${L.route ? `<h4>Job · ${state.size}" EMT</h4>
    <ul class="tight">${L.route ? state.params.scene.dims.map(d => `<li>${d}</li>`).join('') : ''}</ul>
    <p class="small muted">Work out your marks, bend the conduit, then <b>04 Inspect → Run check</b> to install it on the wall.</p>
    <div class="row"><button class="btn" id="btnJobView">View job wall</button></div>
    <p class="small muted">Lay out on the wall with the pencil and tape: <b>01 Mark → Wall layout</b>.</p>
    <h4>Wall mark labels · show</h4>
    <div id="wallMarkToggles"></div>` : ''}
    ${steps.length ? `${L.route ? `<details class="solution" ${state.showSolution ? 'open' : ''}><summary>Worked solution</summary>
      <div class="formula">${L.math(p, b).map(x => `<div>${x}</div>`).join('')}</div>` : ''}
    <h4>Procedure · ${state.size}" EMT · ${b.type === 'hand' ? 'hand bender' : 'electric bender'}</h4>
    <ol class="steps">${steps.map((st, i) => `<li class="${stepDone(st, i, steps) ? 'done' : st === cur ? 'cur' : ''}">${st.text}</li>`).join('')}</ol>
    <div class="row">
      <button class="btn primary" id="btnDemo" ${cur && !state.busy ? '' : 'disabled'}>Run step</button>
      <button class="btn" id="btnAutoMark">Lay out marks</button>
      <button class="btn" id="btnDemoAll" ${cur && !state.busy ? '' : 'disabled'}>Run all</button>
    </div>
    ${!cur ? '<p class="verdict good">COMPLETE · 04 Inspect → Run check</p>' : ''}${L.route ? '</details>' : ''}` : ''}
  `;
  const sol = $('#tabLesson details.solution'); if (sol) sol.ontoggle = () => { state.showSolution = sol.open; };
  const jv = $('#btnJobView'); if (jv) jv.onclick = () => setView('job');
  renderWallMarkToggles();

  const demo = $('#btnDemo'); if (demo) demo.onclick = () => runStep();
  const all = $('#btnDemoAll'); if (all) all.onclick = async () => { while (currentStep() && !state.abort) { if (!(await runStep())) break; } };
  const am = $('#btnAutoMark'); if (am) am.onclick = () => {
    for (const st of steps) if (st.type === 'mark') { try { const s = st.s(state.conduit); if (isFinite(s)) addMarkSilent(s, st.label); } catch { /* needs earlier bend */ } }
    if (!state.placement.markId && state.conduit.marks.length) state.placement.markId = state.conduit.marks[0].id;
    refreshAll();
  };
  // compact HUD: step counter + the first sentence only (full text is in the Lesson tab)
  const idx = cur ? steps.indexOf(cur) + 1 : 0;
  const short = cur ? cur.text.replace(/<[^>]+>/g, '').split(/(?<=\.)\s/)[0] : '';
  const msg = L.route && !state.showSolution ? `<span class="hud-step">JOB</span> ${L.summary}`
    : cur ? `<span class="hud-step">${idx}/${steps.length}</span> ${short}` : '';
  $('#hudMsg').innerHTML = msg;
}

function addMarkSilent(s, label) {
  const c = state.conduit;
  const old = c.marks.find(m => m.label === label);
  if (old) old.s = s; else c.marks.push({ id: 'k' + (++state.markSeq), label, s });
  c.marks.sort((a, b) => a.s - b.s);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function animate(fn, ms) {
  const t0 = performance.now();
  return new Promise(res => {
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(tick); else res(); };
    tick();
  });
}

async function runStep() {
  const st = currentStep();
  if (!st || state.busy) return false;
  state.busy = true; renderLesson();
  try {
    if (st.type === 'mark') {
      setStage('mark');
      const s = st.s(state.conduit);
      addMarkSilent(s, st.label);
      toast(`Marked ${st.label} at ${fmtIn(s)} from End A`);
      refreshAll();
      await sleep(600);
    } else {
      if (state.inBender) removeFromBender();
      const m = state.conduit.marks.find(x => x.label === st.mark);
      if (!m) { toast(`Mark ${st.mark} first.`, true); return false; }
      setStage('place');
      Object.assign(state.placement, { markId: m.id, ref: st.ref, front: st.front, phiDeg: st.phiDeg, nudge: 0 });
      refreshAll();
      await sleep(500);
      insertIntoBender();
      await sleep(500);
      const target = (st.angle + (state.spring ? state.bender.springback : 0)) * DEG;
      const start = state.perm;
      await animate(k => setHandle(start + (target - start) * (1 - Math.pow(1 - k, 2))), 1800);
      await sleep(300);
      release();
      await sleep(700);
      removeFromBender();
      await sleep(400);
    }
  } finally { state.busy = false; renderLesson(); }
  return true;
}

// ------------------------------------------------------------------ stage, views, toast
function setStage(stage) {
  state.stage = stage;
  if (stage !== 'mark') showPencil(null);
  $$('.stages button').forEach(b => b.classList.toggle('active', b.dataset.stage === stage));
  $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === stage));
  if (stage === 'inspect') refreshInspect();
  updateScene();
}

function setView(v) {
  const b = state.bender;
  const sc = Math.max(1, b.R / 6);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const atStation = state.inBender || v === 'bender';
  const w = atStation ? state.stationW : state.pipeW;
  let t, c;
  if (v === 'bender') {
    const cl = state.inBender && state.pose ? state.pose.shoe.center.clone()
      : V(0, b.type === 'hand' ? 3 : ELECTRIC_BEND_HEIGHT + b.R / 2, 0);
    if (b.type === 'electric') cl.set(0, ELECTRIC_BEND_HEIGHT + b.R, 0);
    t = V(cl.x - 2 * sc, cl.y * 0.8, cl.z); c = V(cl.x + 13 * sc, cl.y + 12 * sc, cl.z + 40 * sc);
  } else if (v === 'side') {
    const y = state.inBender ? benderObj.root.position.y : 10;
    t = V(state.inBender ? -10 : 0, y * 0.6, 0); c = V(t.x, t.y + 2, 150);
  } else if (v === 'top') {
    t = V(0, 0, 0); c = V(0.01, 190, 0.01);
  } else if (v === 'conduit') {
    const box = new THREE.Box3();
    if (state.wallFit && jobInstalled.children.length) box.setFromObject(jobInstalled);
    else for (const p of state.samples) box.expandByPoint(p.W);
    box.expandByScalar(state.conduit.r + 1);
    const ctr = box.getCenter(V(0, 0, 0)), rad = box.getSize(V(0, 0, 0)).length() / 2;
    // far enough back that the whole stick fits the narrower side of the view
    const half = camera.fov * DEG / 2, fit = Math.min(1, camera.aspect);
    const dist = rad / Math.sin(half) / fit * 1.05;
    const dir = (state.wallFit ? V(0.12, 0.22, 1) : V(0.3, 0.75, 0.6)).normalize();
    controls.target.copy(ctr); camera.position.copy(ctr.clone().addScaledVector(dir, dist)); controls.update();
    return;
  } else if (v === 'job' && state.lesson.route) {
    // straight on to the job wall
    const tt = JOB_ORIGIN.clone().add(V(state.params.scene.cx ?? 40, 62, 0));
    controls.target.copy(tt); camera.position.copy(tt.clone().add(V(0, 6, 175))); controls.update();
    return;
  } else {
    t = V(0, 12, state.inBender ? 0 : -REST_Z * 0.4); c = V(40, 55, 120);
  }
  controls.target.copy(toW(t, w));
  camera.position.copy(toW(c, w));
  controls.update();
}

let toastT = 0;
function toast(msg, warn = false) {
  const t = $('#toast'); t.innerHTML = msg; t.className = 'show' + (warn ? ' warn' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 3200);
}

function refreshAll() {
  fillMeasureSelect();
  renderMarks();
  syncPlacementUI();
  refreshBend();
  refreshInspect();
  renderLesson();
  updateScene();
}

// ------------------------------------------------------------------ events
function wire() {
  $('#selSize').innerHTML = SIZES.map(s => `<option value="${s}">${s}" EMT · ${BENDERS[s].type === 'hand' ? 'hand' : 'electric'}</option>`).join('');
  $('#selSize').onchange = (e) => setSize(e.target.value);
  $('#selLen').onchange = (e) => { state.L = parseFloat(e.target.value); newConduit(); };
  $('#selLesson').innerHTML = `<optgroup label="Bends">${LESSONS.map(l => `<option value="${l.id}">${l.title}</option>`).join('')}</optgroup>`
    + `<optgroup label="Field jobs">${ROUTES.map(l => `<option value="${l.id}">${l.title}</option>`).join('')}</optgroup>`;
  $('#selLesson').onchange = (e) => {
    state.lesson = EXERCISES.find(l => l.id === e.target.value); newConduit(); tabTo('lesson');
    if (state.lesson.route) setView('job');
  };
  $('#btnNew').onclick = newConduit;
  $('#btnUndo').onclick = () => {
    if (state.inBender) { state.inBender = false; state.existing = null; state.handle = state.perm = 0; state.benderFree = false; }
    else if (state.conduit.bends.length) state.conduit.bends.pop();
    refreshAll();
  };
  $$('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('.stages button').forEach(b => b.onclick = () => { if (b.dataset.stage === 'place') snapGhost(); setStage(b.dataset.stage); });
  // start the exercise over: new stick, no marks, and the job wall back the way it started
  $('#btnReset').onclick = () => {
    if (state.busy) return;
    state.wallMarksFor = '';
    newConduit(); setStage('mark');
    if (state.lesson.route) setView('job');
    toast('Exercise reset.');
  };
  // fold the side panels away to clear the view
  const fold = (side) => {
    const on = $('#app').classList.toggle('fold-' + side), btn = $(side === 'l' ? '#btnFoldL' : '#btnFoldR');
    const toLeft = (side === 'l') !== on;     // arrow points the way the panel will move
    btn.innerHTML = toLeft ? '&#8249;' : '&#8250;';
    btn.title = (on ? 'Show' : 'Hide') + (side === 'l' ? ' the left panel' : ' the right panel');
  };
  $('#btnFoldL').onclick = () => fold('l');
  $('#btnFoldR').onclick = () => fold('r');
  wireContextMenu(fold);
  $$('.tabs button').forEach(b => b.onclick = () => tabTo(b.dataset.tab));

  // mark
  $('#measFrom').onchange = () => { renderMarks(); updateScene(); };
  $('#markDist').oninput = renderMarks;
  $('#markDist').onkeydown = (e) => { if (e.key === 'Enter') $('#btnAddMark').click(); };
  $('#btnAddMark').onclick = () => {
    const d = parseInches($('#markDist').value);
    if (isNaN(d)) { toast('Enter a distance, e.g. 6, 12-3/16 or 2\' 6', true); return; }
    const ref = currentMeasureRef();
    addMark(ref.s0 + ref.dir * d, $('#markLabel').value);
    $('#markLabel').value = '';
  };

  // holding the conduit on the job wall
  $('#btnWallHold').onclick = wallFitEnter;
  $('#btnWallBack').onclick = () => { wallFitExit(); setView('overview'); };
  $('#btnWallBest').onclick = () => {
    if (!state.wallFit) wallFitEnter();
    state.wallFit.M = fitRoute(state.conduit, state.params.scene).matrix.clone(); showWallFit();
  };
  $('#btnWallSeat').onclick = wallFitSeat;
  const step = () => ($('#wfFine').checked ? 1 / 16 : 1);
  $$('#wfMove button').forEach(b => b.onclick = () => wallFitMove(+b.dataset.dx * step(), +b.dataset.dy * step()));
  $$('.wfRot button').forEach(b => b.onclick = () => wallFitRotate(b.dataset.ax, +b.dataset.s * ($('#wfFineRot').checked ? 1 : 15)));
  window.addEventListener('keydown', (e) => {
    if (!state.wallFit || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) && document.activeElement.type !== 'checkbox') return;
    const st = e.shiftKey ? 1 / 16 : 1;
    const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[e.key];
    if (mv) { wallFitMove(...mv); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'q' || e.key === 'Q') { wallFitRotate('z', e.shiftKey ? 5 : 15); e.stopImmediatePropagation(); }
    if (e.key === 'e' || e.key === 'E') { wallFitRotate('z', e.shiftKey ? -5 : -15); e.stopImmediatePropagation(); }
  }, true);

  // wall layout (field jobs)
  $$('#wtOrigin button').forEach(bt => bt.onclick = () => { state.wallTapeFrom = bt.dataset.v; if (bt.dataset.v === 'floor') state.wallTapeAxis = 'v'; renderWallTools(); });
  $$('#wtAxis button').forEach(bt => bt.onclick = () => { state.wallTapeAxis = bt.dataset.v; renderWallTools(); });
  $('#btnClearWall').onclick = () => { state.wallMarks = []; state.wallMarkHi = null; drawWallMarks(); renderWallTools(); };
  window.addEventListener('keydown', (e) => {
    if ((e.key === 't' || e.key === 'T') && state.lesson.route && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) {
      state.wallTapeAxis = { h: 'v', v: 'd', d: 'h' }[state.wallTapeAxis]; renderWallTools();
    }
  });

  // place
  $('#plMark').onchange = (e) => changePlacement(() => { state.placement.markId = e.target.value; });
  $('#plRef').onchange = (e) => { state.placement.ref = e.target.value; refreshAll(); };
  $$('#plFront button').forEach(b => b.onclick = () => changePlacement(() => { state.placement.front = b.dataset.v; }));
  $$('#plRoll button').forEach(b => b.onclick = () => rollTo(parseFloat(b.dataset.v)));
  $('#plRollFine').oninput = (e) => rollTo(parseFloat(e.target.value));
  $('#plNudge').oninput = (e) => { state.placement.nudge = parseFloat(e.target.value); syncPlacementUI(); updateScene(); };
  $('#btnInsert').onclick = insertIntoBender;
  $('#btnRemove').onclick = removeFromBender;
  $('#btnRemove2').onclick = removeFromBender;

  // bend
  $('#bendSlider').oninput = (e) => setHandle(parseFloat(e.target.value) * DEG);
  $('#bendSlider').onchange = () => {};
  const startPull = (rate) => { state.pulling = rate; };
  const stopPull = () => { state.pulling = 0; };
  $('#btnPull').addEventListener('pointerdown', () => startPull(14));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('#btnPull').addEventListener(ev, stopPull));
  $('#btnPullFine').onclick = () => setHandle(loadedTheta() + 0.5 * DEG);
  $('#btnRelease').onclick = () => release();
  $('#chkSpring').onchange = (e) => { state.spring = e.target.checked; refreshBend(); };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key === 'ArrowUp' && state.inBender) { e.preventDefault(); startPull(e.shiftKey ? 2 : 14); }
    if ((e.key === 'r' || e.key === 'R') && state.inBender) release();
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'ArrowUp') stopPull(); });

  // inspect
  $('#btnCheck').onclick = runCheck;

  // Drag the conduit (or the bender) to move it anywhere on the floor; click it to mark (when enabled).
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  ray.layers.enable(NO_CONTACT_SHADOW); // the job wall lives on this layer
  const cv = renderer.domElement;
  let drag = null, raf = 0;
  const rayAt = (e) => {
    const rect = cv.getBoundingClientRect();
    mouse.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    return ray;
  };
  const pick = (e) => {
    rayAt(e);
    // the bender only while it can be seen (it steps aside for its preview in 02 Place)
    const objs = benderObj.root.visible ? [conduitMesh, benderObj.root] : [conduitMesh];
    const hit = ray.intersectObjects(objs, true)[0];
    if (!hit) return null;
    return { hit, onConduit: hit.object === conduitMesh };
  };
  const floorPoint = (e, y) => {
    rayAt(e);
    const pt = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), pt) ? pt : null;
  };
  cv.addEventListener('pointerleave', () => { showPencil(null); wallHover = null; setKOHover(null); });
  let wallHover = null, wallDown = null, special = null, clickDown = null;
  const endSpecial = (e) => {
    if (!special || e.pointerId !== special.id) return;
    const sp = special; special = null; cv.style.cursor = '';
    if (sp.moved) return;
    // a click (no drag) on the held conduit cuts it at the box; on the cart's cover, puts it back
    if (sp.kind === 'wall' && state.wallFit) tryCut(sp.start);
    if (sp.kind === 'cart' && sp.act) jobClick(sp.act);
  };
  // the thing on the job wall (or the cart) under the pointer: { kind: 'ko' | 'act' | 'cart', hit }
  const jobHit = () => {
    if (!state.lesson.route || state.busy) return null;
    const hs = ray.intersectObjects([...koTargets, ...pkoTargets, ...jobClickables, cart], true);
    for (const h of hs) {
      if (h.object.userData.ko) return { kind: 'ko', hit: h };
      if (h.object.userData.pko) return { kind: 'pko', hit: h };
      if (h.object.userData.act && h.object.userData.act !== 'cartCover') return { kind: 'act', hit: h };
      let o = h.object; while (o && o !== cart) o = o.parent;
      if (o === cart) return { kind: 'cart', hit: h };
    }
    return null;
  };
  window.addEventListener('pointerup', endSpecial);
  window.addEventListener('pointercancel', endSpecial);
  ctxHit = (e) => { rayAt(e); return jobHit(); };
  // the front face of the job wall, if nothing else on the wall is in the way
  const wallHit = (e) => {
    if (!state.lesson.route || !jobWall || state.busy || e.pointerType !== 'mouse' || !$('#chkClick').checked) return null;
    rayAt(e);
    const h = ray.intersectObjects([...jobGroup.children.filter(o => !o.isSprite), jobInstalled], true).filter(x => !x.object.isSprite)[0];
    if (state.wallTapeAxis === 'd') return h && h.object !== jobWall && h.point.z - JOB_ORIGIN.z > 0.02 ? h : null;
    return h && h.object === jobWall && h.face && h.face.normal.z > 0.5 ? h : null;
  };
  window.addEventListener('pointerup', (e) => {
    const k = clickDown; clickDown = null;
    if (k && e.pointerId === k.id && Math.hypot(e.clientX - k.x, e.clientY - k.y) <= 5) {
      if (k.ko) openKoMenu(k.ko, e.clientX, e.clientY); else if (k.pko) pkoClick(k.pko); else jobClick(k.act);
      return;
    }
    const d = wallDown; wallDown = null;
    if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const wh = wallHit(e);
    if (wh) addWallMark(showWallPencil(wh.point));
  });
  viewport.addEventListener('pointerdown', (e) => {
    if (e.target !== cv || state.busy) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) { drag = null; return; } // a second finger: hand over to the camera
    rayAt(e);
    if (rollRingActive() && ray.intersectObject(rollRing, true).length) {
      e.stopPropagation(); special = { kind: 'roll', id: e.pointerId }; cv.style.cursor = 'grabbing'; return;
    }
    const jh = jobHit();
    if (state.wallFit && state.wallTapeAxis !== 'd') {
      const h = ray.intersectObject(jobInstalled, true)[0];
      // the conduit, unless a door, cover or the cart is in front of it
      if (h && !(jh && jh.kind !== 'ko' && jh.hit.distance < h.distance - 0.05)) {
        e.stopPropagation();
        special = { kind: 'wall', id: e.pointerId, z: h.point.z, start: h.point.clone(), M0: state.wallFit.M.clone(), x0: e.clientX, y0: e.clientY, moved: false };
        cv.style.cursor = 'grabbing'; return;
      }
    }
    if (jh && jh.kind === 'cart') {
      e.stopPropagation();
      const y = jh.hit.point.y;
      special = { kind: 'cart', id: e.pointerId, y, start: floorPoint(e, y), w0: { ...state.cartW }, x0: e.clientX, y0: e.clientY, moved: false, act: jh.hit.object.userData.act };
      return;
    }
    if (jh && !jobAnim) {
      clickDown = { x: e.clientX, y: e.clientY, id: e.pointerId, ko: jh.kind === 'ko' ? jh.hit.object.userData.ko : null, pko: jh.kind === 'pko' ? jh.hit.object.userData.pko : null, act: jh.hit.object.userData.act };
      return;
    }
    const p = pick(e);
    if (!p) {
      // on the job wall a click (no drag) makes a pencil mark; a drag still orbits the camera
      wallDown = wallHit(e) ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
      return;
    }
    e.stopPropagation(); // keep OrbitControls from orbiting
    // grabbing the bender moves the bender (with the stick in it, while bending); grabbing the
    // conduit on the floor moves just the conduit
    const key = state.inBender || !p.onConduit ? 'stationW' : 'pipeW';
    state.moveTarget = key;
    if (key === 'stationW' && !state.inBender) state.benderFree = true; // stays where you put it
    const y = Math.max(0, Math.min(p.hit.point.y, 40));
    drag = { id: e.pointerId, key, y, start: floorPoint(e, y), w0: { ...state[key] }, x0: e.clientX, y0: e.clientY, moved: false, p };
    if (e.altKey) {
      // a vertical plane through the grab point, square to the view: the pointer's rise is the lift
      const n = camera.getWorldDirection(new THREE.Vector3()).setY(0);
      if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
      drag.lift = new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), p.hit.point);
      drag.liftAt = p.hit.point.y;
    }
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (special && e.pointerId === special.id) {
      rayAt(e);
      if (special.kind === 'wall' || special.kind === 'cart') {
        if (!special.moved && Math.hypot(e.clientX - special.x0, e.clientY - special.y0) < 5) return;
        if (!special.moved) { special.moved = true; cv.style.cursor = 'grabbing'; }
      }
      if (special.kind === 'cart') {
        const pt = floorPoint(e, special.y);
        if (!pt || !special.start) return;
        state.cartW = { x: special.w0.x + pt.x - special.start.x, z: special.w0.z + pt.z - special.start.z };
        cart.position.set(state.cartW.x, 0, state.cartW.z);
        return;
      }
      if (special.kind === 'roll') {
        // turn the conduit so the stripe knob follows the pointer round the ring
        const { P, T, N } = rollRing.userData;
        const q = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(T, P), q)) return;
        const v = q.sub(P); v.addScaledVector(T, -v.dot(T));
        if (v.lengthSq() < 1e-6) return;
        const a = Math.atan2(new THREE.Vector3().crossVectors(N, v).dot(T), N.dot(v.normalize())) / DEG;
        const before = state.placement.phiDeg;
        let next = before - a;
        if (!e.shiftKey) next = Math.round(next / 5) * 5;
        if (Math.abs(next - before) > 1e-6) {
          rollTo(next);
          // if the knob moved the wrong way, the stripe convention is mirrored: flip
          const N2 = rollRing.userData.N;
          const a2 = Math.atan2(new THREE.Vector3().crossVectors(N2, v).dot(T), N2.dot(v)) / DEG;
          if (Math.abs(a2) > Math.abs(a) + 1) rollTo(e.shiftKey ? before + a : Math.round((before + a) / 5) * 5);
        }
      } else {
        const q = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -special.z), q)) return;
        const d = q.sub(special.start);
        if (!special.raf) special.raf = requestAnimationFrame(() => {
          if (!special) return; special.raf = 0;
          state.wallFit.M.copy(special.M0).premultiply(new THREE.Matrix4().makeTranslation(d.x, d.y, 0));
          stickToWall(state.wallFit.M); showWallFit();
        });
      }
      return;
    }
    if (!drag) {
      if (e.target === cv && e.pointerType === 'mouse' && !e.buttons) {
        const p = pick(e);
        const marking = p && p.onConduit && canMark();
        setKOHover(null);
        if (!p && rayAt(e)) {
          const jh = jobHit();
          if (jh && jh.kind === 'pko') setKOHover(jh.hit.object.userData.pko);
          if (jh && !(state.wallFit && ray.intersectObject(jobInstalled, true).some(h => h.distance < jh.hit.distance - 0.05))) {
            wallHover = null; showPencil(null); cv.style.cursor = jh.kind === 'cart' && !jh.hit.object.userData.act ? 'grab' : 'pointer'; return;
          }
        }
        const wh = !p && wallHit(e);
        if (wh) { wallHover = showWallPencil(wh.point); cv.style.cursor = state.wallTapeAxis === 'd' ? 'crosshair' : 'none'; return; }
        if (rollRingActive() && rayAt(e) && ray.intersectObject(rollRing, true).length) { showPencil(null); cv.style.cursor = 'grab'; return; }
        if (state.wallFit && rayAt(e) && ray.intersectObject(jobInstalled, true).length) { showPencil(null); cv.style.cursor = 'grab'; return; }
        wallHover = null;
        showPencil(marking ? p.hit : null);
        cv.style.cursor = marking ? 'none' : p ? 'grab' : '';
      } else if (e.target !== cv) showPencil(null);
      return;
    }
    showPencil(null);
    if (e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    drag.moved = true; cv.style.cursor = 'grabbing';
    if (drag.lift) {
      rayAt(e);
      const q = new THREE.Vector3();
      if (!ray.ray.intersectPlane(drag.lift, q)) return;
      const y = Math.max(0, Math.min(96, (drag.w0.y || 0) + q.y - drag.liftAt));
      state[drag.key] = { ...drag.w0, y };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateScene(); });
      return;
    }
    const pt = floorPoint(e, drag.y);
    if (!pt || !drag.start) return;
    state[drag.key] = { ...drag.w0, x: drag.w0.x + pt.x - drag.start.x, z: drag.w0.z + pt.z - drag.start.z };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateScene(); });
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; cv.style.cursor = '';
    if (d.moved || !d.p.onConduit || !canMark()) return;
    const snap = markSnap(exactS(d.p.hit.point)), snapped = snap.s;
    addMark(snapped, $('#markLabel').value);
    toast(snap.d >= 0 ? `Marked at ${fmtIn(snap.d)} from ${snap.from}` : `Marked ${fmtIn(-snap.d)} behind ${snap.from}`);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // rotate / reset what you are moving
  const turn = (deg) => {
    // Q/E turn whatever was moved last (the bender or the conduit); the bender turns where it stands
    const key = state.inBender || state.moveTarget === 'stationW' ? 'stationW' : 'pipeW';
    const at = benderObj.root.position.clone();
    state[key] = { ...state[key], yaw: state[key].yaw + deg * DEG };
    updateScene();
    if (key === 'stationW' && !state.inBender) {
      const now = benderObj.root.position;
      state.stationW = { ...state.stationW, x: state.stationW.x + at.x - now.x, z: state.stationW.z + at.z - now.z };
      updateScene();
    }
  };
  $('#btnRotL').onclick = () => turn(15);
  $('#btnRotR').onclick = () => turn(-15);
  $('#btnHome').onclick = () => {
    if (state.inBender) state.stationW = { x: 0, z: 0, yaw: 0 };
    else { state.pipeW = { x: 0, z: REST_Z, yaw: 0 }; state.stationW = { x: 0, z: 0, yaw: 0 }; state.benderFree = false; }
    updateScene(); setView(state.inBender ? 'bender' : 'overview');
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key === 'q' || e.key === 'Q') turn(e.shiftKey ? 5 : 15);
    if (e.key === 'e' || e.key === 'E') turn(e.shiftKey ? -5 : -15);
  });
}

// Exact position along the conduit (inches from End A) for a point on its surface: start from the
// nearest sample, then solve (p − P(s)) · T(s) = 0 on the true centerline, so on a bend the mark lands
// in the plane square to the conduit through the point you picked.
function exactS(p) {
  const c = state.conduit, lay = state.lay, M = state.matrix;
  let s = nearestS(p);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const f = c.frameAt(lay, s);
    P.copy(f.P).applyMatrix4(M); T.copy(f.T).transformDirection(M);
    const ds = p.clone().sub(P).dot(T);
    s = Math.max(0, Math.min(c.L, s + ds));
    if (Math.abs(ds) < 1e-5) break;
  }
  return s;
}
// What a click there would mark: the exact spot rounded to the tape's 1/16".
// What a click there would mark, read off the tape: the distance from wherever the tape is hooked
// (the Datum: End A, End B, the back of a bend or another mark), rounded to the tape's 1/16".
function markSnap(sExact) {
  const ref = currentMeasureRef();
  const d = Math.round((sExact - ref.s0) * ref.dir * 16) / 16;
  return { s: ref.s0 + ref.dir * d, d, from: ref.label.split('→')[0].trim() };
}

function nearestS(p) {
  const S = state.samples;
  let best = { d: Infinity, s: 0 };
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i].W, b = S[i + 1].W;
    const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
    const q = a.clone().addScaledVector(ab, t), d = q.distanceTo(p);
    if (d < best.d) best = { d, s: S[i].s + (S[i + 1].s - S[i].s) * t };
  }
  return best.s;
}

function tabTo(tab) {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tabpanel').forEach(p => p.classList.toggle('active', p.dataset.tabpanel === tab));
}

// ------------------------------------------------------------------ loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.pulling && state.inBender) setHandle(loadedTheta() + state.pulling * DEG * dt);
  controls.update();
  contact.update();
  if (wallContact.group.visible) wallContact.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

wire();
renderSources($('#tabSources'));
resize();
setSize('3/4');
setStage('mark');
requestAnimationFrame(loop);
window.__app = { state, analyze, setView, camera, controls, scene, contact, wallContact, renderer, exactS, nearestS, get bender() { return benderObj; } };
