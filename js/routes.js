// Field jobs: get from one spot to another on a wall, around real-world obstacles.
//
// Wall coordinates, inches: x runs along the wall (to the right), y is height above the floor,
// z is distance out from the wall face (the wall face is z = 0). Knockouts on the panel and boxes
// sit about 1" out from the surface they are mounted on (koZ), so the runs between them do too.
//
// Each job is an exercise like the bend lessons (params / math / steps / check). The steps are a
// worked solution using the standard field methods; the check takes whatever conduit the student
// bent, installs it on the wall and grades the fit.
import * as THREE from 'three';
import { LESSONS } from './lessons.js';
import { fmtIn, fmtDeg, CONNECTOR, koZ } from './data.js';

const DEG = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const base = (id) => LESSONS.find(l => l.id === id);
const sizeVal = (size, t) => t[size];
const layoutRef = (b) => (b.type === 'hand' ? 'arrow' : 'tangent');
const stubRef = (b) => (b.type === 'hand' ? 'arrow' : 'hook');
const dName = (b) => (b.type === 'hand' ? 'take-up' : 'deduct');

// Common pieces
const panel = (x0, x1, y0, y1, label = 'Panel') => ({ kind: 'panel', min: [x0, y0, 0], max: [x1, y1, 4], label });
// Steel box sized for the knockout: 4" sq × 2-1/8" up to 1", 4-11/16" sq for 1-1/4", a 6×6×4 pull box above.
const BOX = { '3/4': [4, 2.125], '1': [4, 2.125], '1-1/4': [4.6875, 2.125], '1-1/2': [6, 4], '2': [6, 4] };
// The box face with the knockout is at `p`; `d` points into the box; the box back sits on z = cz.
const box = (p, d, cz, label, size) => {
  const [W, D] = BOX[size], h = W / 2;
  const cx = p.x + d.x * h, cy = p.y + d.y * h;
  return { kind: 'box', min: [cx - h, cy - h, cz], max: [cx + h, cy + h, cz + D], label };
};

// ----------------------------------------------------------------------------------------------
export const ROUTES = [
  {
    id: 'job-stub',
    route: true,
    title: 'Job 1 · Panel up to an overhead box',
    summary: 'Leave the top of the panel, turn 90° and run along the wall to a junction box.',
    params(size, b, od) {
      const r = od / 2, k = koZ(size);
      const rise = sizeVal(size, { '3/4': 24, '1': 24, '1-1/4': 24, '1-1/2': 30, '2': 30 });
      const Yp = 56, stub = rise + r;
      const run = 44;
      return { r, rise, Yp, stub, mark: stub - b.deduct, run,
        scene: {
          start: { p: V(0, Yp, k), d: V(0, 1, 0) },
          end: { p: V(run, Yp + rise, k), d: V(1, 0, 0) },
          items: [panel(-8, 8, Yp - 30, Yp), box(V(run, Yp + rise, 0), V(1, 0, 0), 0, 'J-box', size)],
          obstacles: [],
          dims: [`Panel top connector at ${fmtIn(Yp)}`, `Box centerline ${fmtIn(rise)} above the connector`],
        } };
    },
    math(p, b) {
      return [
        `The run goes <b>${fmtIn(p.rise)}</b> above the panel connector (to the conduit centerline), then along the wall to the box.`,
        `Measure the stub to the <b>back</b> of the run: ${fmtIn(p.rise)} + ½ OD (${fmtIn(p.r)}) = <b>${fmtIn(p.stub)}</b>.`,
        `Mark = stub − ${dName(b)} (${fmtIn(b.deduct)}) = <b>${fmtIn(p.mark)}</b> from the end that goes in the panel.`,
        `Bend 90°, then cut the run to length at the box.`,
      ];
    },
    steps(p, b) {
      return [
        { type: 'mark', label: 'M1', s: () => p.mark, text: `Mark M1 at <b>${fmtIn(p.mark)}</b> from End A.` },
        { type: 'bend', mark: 'M1', ref: stubRef(b), front: 'A', phiDeg: 0, angle: 90, text: `End A toward the hook, M1 on the ${b.type === 'hand' ? 'arrow' : 'hook edge'}, bend 90°.` },
      ];
    },
  },
  {
    id: 'job-offset',
    route: true,
    title: 'Job 2 · Offset over a gas line',
    summary: 'A gas line runs along the wall at the height of the panel connector. Offset up over it to a box set higher.',
    params(size, b, od) {
      const o = base('offset').params(size, b);
      const r = od / 2, k = koZ(size), Y = 44;
      return { ...o, r, Y,
        scene: {
          start: { p: V(0, Y, k), d: V(1, 0, 0) },
          end: { p: V(o.X + 30, Y + o.H, k), d: V(1, 0, 0) },
          items: [panel(-16, 0, Y - 16, Y + 14), box(V(o.X + 30, Y + o.H, 0), V(1, 0, 0), 0, 'Box', size),
            { kind: 'pipe', a: [o.X, Y, 0.65], b: [o.X + 60, Y, 0.65], rad: 0.65, color: 0xd9b23a, label: '1" gas line' }],
          obstacles: [{ type: 'pipe', a: V(o.X, Y, 0.65), b: V(o.X + 60, Y, 0.65), rad: 0.65, name: 'gas line' }],
          dims: [`Gas line starts ${fmtIn(o.X)} from the panel`, `Box is ${fmtIn(o.H)} higher than the panel connector`],
        } };
    },
    math(p) {
      return [
        `Offset depth = <b>${fmtIn(p.H)}</b> (panel connector to box connector). The gas line starts <b>${fmtIn(p.X)}</b> out, so the offset must be finished by then.`,
        `30° offset: distance between marks = ${fmtIn(p.H)} × 2 = <b>${fmtIn(p.dist)}</b>; shrink = ${fmtIn(p.H)} × ¼ = <b>${fmtIn(p.shrink)}</b>.`,
        `M2 = ${fmtIn(p.X)} + shrink = <b>${fmtIn(p.m2)}</b>, M1 = M2 − ${fmtIn(p.dist)} = <b>${fmtIn(p.m1)}</b>.`,
      ];
    },
    steps(p, b) { return base('offset').steps(p, b); },
  },
  {
    id: 'job-column',
    route: true,
    title: 'Job 3 · Offset onto a column face',
    summary: 'A concrete column sticks out from the wall. Kick the conduit out so it runs flat on the column face to a box mounted there.',
    params(size, b, od) {
      const o = base('offset').params(size, b);
      const r = od / 2, k = koZ(size), Y = 48, CW = 18;
      return { ...o, r, Y, CW,
        scene: {
          start: { p: V(0, Y, k), d: V(1, 0, 0) },
          end: { p: V(o.X + CW - 4, Y, o.H + k), d: V(1, 0, 0) },
          items: [panel(-16, 0, Y - 16, Y + 14), box(V(o.X + CW - 4, Y, 0), V(1, 0, 0), o.H, 'Box', size),
            { kind: 'block', min: [o.X, 0, 0], max: [o.X + CW, 120, o.H], look: 'concrete', color: 0x9a9da3, label: `Column, ${fmtIn(o.H)} out` }],
          obstacles: [{ type: 'box', min: V(o.X, 0, 0), max: V(o.X + CW, 120, o.H), name: 'column' }],
          dims: [`Column face is ${fmtIn(o.H)} out from the wall`, `Column starts ${fmtIn(o.X)} from the panel`],
        } };
    },
    math(p) {
      return [
        `This offset kicks <b>out from the wall</b>: depth = how far the column sticks out = <b>${fmtIn(p.H)}</b>.`,
        `30° offset: marks ${fmtIn(p.dist)} apart, shrink ${fmtIn(p.shrink)}. M2 = ${fmtIn(p.X)} + ${fmtIn(p.shrink)} = <b>${fmtIn(p.m2)}</b>, M1 = <b>${fmtIn(p.m1)}</b>.`,
        `Bend both in the same plane; when you install it, roll the stick so the offset points away from the wall.`,
      ];
    },
    steps(p, b) { return base('offset').steps(p, b); },
  },
  {
    id: 'job-saddle3',
    route: true,
    title: 'Job 4 · Saddle over a water pipe',
    summary: 'A water line runs up the wall between the panel and the box. Saddle out over it and come back to the wall.',
    params(size, b, od) {
      const s = base('saddle3').params(size, b);
      const r = od / 2, k = koZ(size), Y = 48;
      return { ...s, r, Y,
        scene: {
          start: { p: V(0, Y, k), d: V(1, 0, 0) },
          end: { p: V(s.Xc + 34, Y, k), d: V(1, 0, 0) },
          items: [panel(-16, 0, Y - 16, Y + 14), box(V(s.Xc + 34, Y, 0), V(1, 0, 0), 0, 'Box', size),
            { kind: 'pipe', a: [s.Xc, 0, s.H / 2], b: [s.Xc, 120, s.H / 2], rad: s.H / 2, color: 0x3d7fc4, label: `${fmtIn(s.H)} water pipe` }],
          obstacles: [{ type: 'pipe', a: V(s.Xc, -10, s.H / 2), b: V(s.Xc, 130, s.H / 2), rad: s.H / 2, name: 'water pipe' }],
          dims: [`Pipe center ${fmtIn(s.Xc)} from the panel`, `Pipe OD ${fmtIn(s.H)}`],
        } };
    },
    math(p) {
      return [
        `Saddle height = pipe OD = <b>${fmtIn(p.H)}</b> (lay out for ${fmtIn(p.Hl)} to clear).`,
        `Center mark C = ${fmtIn(p.Xc)} + shrink (${fmtIn(p.shrink)}) = <b>${fmtIn(p.C)}</b>; outer marks ±${fmtIn(p.out)}: <b>${fmtIn(p.mA)}</b> and <b>${fmtIn(p.mB)}</b>.`,
        `45° at C, 22½° at each outer mark. Roll it out from the wall when you install it.`,
      ];
    },
    steps(p, b) { return base('saddle3').steps(p, b); },
  },
  {
    id: 'job-saddle4',
    route: true,
    title: 'Job 5 · Saddle over a wireway',
    summary: 'A surface wireway runs up the wall. Go out over it with a 4-point saddle and back to the wall.',
    params(size, b, od) {
      const s = base('saddle4').params(size, b);
      const r = od / 2, k = koZ(size), Y = 48;
      return { ...s, r, Y,
        scene: {
          start: { p: V(0, Y, k), d: V(1, 0, 0) },
          end: { p: V(s.X + s.W + 32, Y, k), d: V(1, 0, 0) },
          items: [panel(-16, 0, Y - 16, Y + 14), box(V(s.X + s.W + 32, Y, 0), V(1, 0, 0), 0, 'Box', size),
            { kind: 'block', min: [s.X, 0, 0], max: [s.X + s.W, 120, s.H], look: 'wireway', color: 0x5b6f86, label: `Wireway ${fmtIn(s.W)} × ${fmtIn(s.H)}` }],
          obstacles: [{ type: 'box', min: V(s.X, -10, 0), max: V(s.X + s.W, 130, s.H), name: 'wireway' }],
          dims: [`Wireway ${fmtIn(s.W)} wide, ${fmtIn(s.H)} deep`, `Starts ${fmtIn(s.X)} from the panel`],
        } };
    },
    math(p) {
      return [
        `Two offsets back to back: depth <b>${fmtIn(p.H)}</b> (lay out ${fmtIn(p.Hl)}), width <b>${fmtIn(p.W)}</b>.`,
        `22½° offsets: marks ${fmtIn(p.dist)} apart, shrink ${fmtIn(p.shrink)}.`,
        `M1 <b>${fmtIn(p.m1)}</b> · M2 <b>${fmtIn(p.m2)}</b> · M3 <b>${fmtIn(p.m3)}</b> · M4 <b>${fmtIn(p.m4)}</b>`,
      ];
    },
    steps(p, b) { return base('saddle4').steps(p, b); },
  },
  {
    id: 'job-door',
    route: true,
    title: 'Job 6 · Up and over an access door',
    summary: 'The box is on the other side of an access door. Go up out of the panel, across above the door and down into the box.',
    params(size, b, od) {
      const s = base('b2b').params(size, b);
      const r = od / 2, k = koZ(size), Yp = 58;
      const xB = s.D - 2 * r;                // centerline of the second leg
      const yRun = Yp + s.H - r;             // centerline of the run
      const R = b.R;
      const doorTop = yRun - r - 2.5;
      return { ...s, r, Yp, xB, yRun,
        scene: {
          start: { p: V(0, Yp, k), d: V(0, 1, 0) },
          end: { p: V(xB, Yp, k), d: V(0, -1, 0) },
          items: [panel(-8, 8, Yp - 30, Yp), box(V(xB, Yp, 0), V(0, -1, 0), 0, 'Box', size),
            { kind: 'block', min: [R + 1.5, 0, 0], max: [xB - R - 1.5, doorTop, 1.5], look: 'door', color: 0x7a5a3c, label: 'Access door' }],
          obstacles: [{ type: 'box', min: V(R + 1.5, 0, -1), max: V(xB - R - 1.5, doorTop, 1.5), name: 'door' }],
          dims: [`Box connector ${fmtIn(s.D)} back-to-back from the panel leg`, `Run ${fmtIn(s.H)} above the connectors (to the top of the conduit)`],
        } };
    },
    math(p, b) {
      return [
        `Stub: panel connector to the top of the run = <b>${fmtIn(p.H)}</b>, so mark = ${fmtIn(p.H)} − ${fmtIn(b.deduct)} = <b>${fmtIn(p.mark1)}</b>.`,
        `Back-to-back from the outside of the panel leg to the outside of the box leg = <b>${fmtIn(p.D)}</b>.`,
        `Second 90 on the <b>star</b> (back of 90) at ${fmtIn(p.D)} from the back of the first. Cut the down leg at the box.`,
      ];
    },
    steps(p, b) { return base('b2b').steps(p, b); },
  },
];

// ------------------------------------------------------------------ installing and grading
function boxDist(p, min, max) {
  const dx = Math.max(min.x - p.x, 0, p.x - max.x);
  const dy = Math.max(min.y - p.y, 0, p.y - max.y);
  const dz = Math.max(min.z - p.z, 0, p.z - max.z);
  if (dx || dy || dz) return Math.hypot(dx, dy, dz);
  return -Math.min(p.x - min.x, max.x - p.x, p.y - min.y, max.y - p.y, p.z - min.z, max.z - p.z); // inside
}
function segDist(p, a, b) {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}
// Rotation that takes local (e1, e2) onto (f1, f2)
function basisMap(e1, e2, f1, f2) {
  const a1 = e1.clone().normalize(), a2 = e2.clone().sub(a1.clone().multiplyScalar(e2.dot(a1))).normalize();
  const b1 = f1.clone().normalize(), b2 = f2.clone().sub(b1.clone().multiplyScalar(f2.dot(b1))).normalize();
  const E = new THREE.Matrix4().makeBasis(a1, a2, new THREE.Vector3().crossVectors(a1, a2));
  const F = new THREE.Matrix4().makeBasis(b1, b2, new THREE.Vector3().crossVectors(b1, b2));
  return F.multiply(E.transpose());
}

// Where the conduit end bottoms out at a knockout. A bare knockout: on the face. With a connector
// set in it (ep.conn = CONNECTOR row): on the connector's internal stop, just out from the face.
export function seatOf(scene, which) {
  const ep = scene[which];
  if (!ep.conn) return ep.p.clone();
  const out = which === 'start' ? ep.d.clone().normalize() : ep.d.clone().normalize().negate();
  return ep.p.clone().addScaledVector(out, ep.conn.stop);
}
export { CONNECTOR };

// ---- shared pieces for installing a conduit on the wall (placement M: conduit local → wall) ----
function prep(conduit) {
  const lay = conduit.layout(), L = conduit.L;
  const segs = conduit.segments(lay);
  // every ½" along the whole conduit (sample() only gives the ends of straight runs)
  const pts = [];
  for (let s = 0; s <= L + 1e-9; s += 0.5) pts.push({ s, P: conduit.frameAt(lay, Math.min(s, L)).P });
  return { lay, L, r: conduit.r, segs, pts };
}
const ORIENTS = { A: { end: 'A', s0: 0, sign: 1, label: 'End A' }, B: { end: 'B', s0: null, sign: -1, label: 'End B' } };
const orient = (key, L) => ({ ...ORIENTS[key], s0: key === 'A' ? 0 : L });

// Measure one placement, with the end `o` taken as the end that goes in the panel.
function measure(conduit, scene, M, o, P) {
  const { L, r, segs, pts, lay } = P;
  const { start, end } = scene;
  const sP = seatOf(scene, 'start'), eP = seatOf(scene, 'end');
  const dE = end.d.clone().normalize();
  // the panel end: how far from the connector, and how square to it
  const f0 = conduit.frameAt(lay, o.s0);
  const e0 = f0.P.clone().applyMatrix4(M);
  const t0 = f0.T.clone().multiplyScalar(o.sign).transformDirection(M);
  const startGap = e0.distanceTo(sP);
  const startAng = Math.acos(Math.max(-1, Math.min(1, t0.dot(start.d.clone().normalize())))) / DEG;
  // the leg at the far end, followed in the direction of travel
  const seg = o.end === 'A' ? segs[segs.length - 1] : segs[0];
  const q = (o.end === 'A' ? seg.P0 : seg.P1).clone().applyMatrix4(M);
  const dl = seg.T.clone().multiplyScalar(o.sign).transformDirection(M);
  const v = eP.clone().sub(q);
  const proj = v.dot(dl), legLen = seg.len;
  const miss = v.clone().addScaledVector(dl, -proj).length();
  const ang = Math.acos(Math.max(-1, Math.min(1, dl.dot(dE)))) / DEG;
  const short = Math.max(0, proj - legLen), behind = Math.max(0, -proj);
  // installed part only (up to the cut)
  const travelCut = (o.end === 'A' ? seg.s0 : L - seg.s1) + Math.max(0, Math.min(legLen, proj));
  let wallMin = Infinity; const clear = scene.obstacles.map(() => Infinity);
  for (const pt of pts) {
    const travel = o.end === 'A' ? pt.s : L - pt.s;
    if (travel > travelCut + 1e-6) continue;
    const W = pt.P.clone().applyMatrix4(M);
    wallMin = Math.min(wallMin, W.z - r);
    scene.obstacles.forEach((ob, i) => {
      const d = ob.type === 'box' ? boxDist(W, ob.min, ob.max) - r : segDist(W, ob.a, ob.b) - ob.rad - r;
      clear[i] = Math.min(clear[i], d);
    });
  }
  const pen = Math.max(0, -wallMin - 1 / 32) + clear.reduce((s2, c) => s2 + Math.max(0, -c - 1 / 32), 0);
  const cost = startGap * 2 + startAng * 0.15 + miss + ang * 0.15 + 5 * (short + behind) + 20 * pen;
  return { o, M, startGap, startAng, miss, ang, short, behind, travelCut, wallMin, clear, cost };
}

function rowsFor(m, scene, L, auto) {
  const rows = [];
  const inEnd = m.o.label, farEnd = m.o.end === 'A' ? 'End B' : 'End A';
  if (auto) rows.push({ label: 'Into the panel', measured: inEnd, target: '', error: 'rolled to fit', status: 'good' });
  else {
    const st = m.startGap <= 0.25 && m.startAng <= 2 ? 'good' : m.startGap <= 0.5 && m.startAng <= 4 ? 'ok' : 'bad';
    rows.push({ label: `${inEnd} in the panel`, measured: `${fmtIn(m.startGap)} · ${fmtDeg(m.startAng)}`, target: '≤ 1/4" · 2°', error: '', status: st });
  }
  const reach = m.short > 0 ? { measured: `short ${fmtIn(m.short)}`, status: 'bad' }
    : m.behind > 0 ? { measured: 'box is behind the last bend', status: 'bad' }
    : { measured: fmtIn(m.miss), status: m.miss <= 0.25 ? 'good' : m.miss <= 0.5 ? 'ok' : 'bad' };
  rows.push({ label: 'Lines up with the box', target: '≤ 1/4"', error: reach.status === 'bad' && m.miss > 0.5 ? `off by ${fmtIn(m.miss)}` : '', ...reach });
  rows.push({ label: 'Enters square', measured: fmtDeg(m.ang), target: '≤ 2°', error: '', status: m.ang <= 2 ? 'good' : m.ang <= 4 ? 'ok' : 'bad' });
  scene.obstacles.forEach((ob, i) => {
    const c = m.clear[i];
    rows.push({ label: `Clears the ${ob.name}`, measured: c < -1 / 32 ? 'hits it' : `gap ${fmtIn(Math.max(0, c))}`, target: '> 0"', error: '', status: c < -1 / 32 ? 'bad' : 'good' });
  });
  rows.push({ label: 'Stays off the wall', measured: m.wallMin < -1 / 32 ? `into it ${fmtIn(-m.wallMin)}` : 'yes', target: '', error: '', status: m.wallMin < -1 / 32 ? 'bad' : 'good' });
  rows.push({ label: 'Cut to length', measured: `${fmtIn(m.travelCut)} from ${inEnd}`, target: '', error: `drop ${fmtIn(L - m.travelCut)} off ${farEnd}`, status: m.short > 0 ? 'bad' : 'good' });
  return rows;
}

// Placement with one end seated in the panel connector, pointing out along it, rolled by psi.
export function placeInPanel(conduit, scene, endKey = 'A', psi = 0) {
  const lay = conduit.layout(), o = orient(endKey, conduit.L);
  const dS = scene.start.d.clone().normalize();
  const u0 = (Math.abs(dS.y) < 0.9 ? new THREE.Vector3().crossVectors(dS, V(0, 1, 0)) : new THREE.Vector3().crossVectors(dS, V(1, 0, 0))).normalize();
  const w0 = new THREE.Vector3().crossVectors(dS, u0);
  const f0 = conduit.frameAt(lay, o.s0);
  const t0 = f0.T.clone().multiplyScalar(o.sign);
  const u = u0.clone().multiplyScalar(Math.cos(psi)).addScaledVector(w0, Math.sin(psi));
  const M = basisMap(t0, f0.N, dS, u);
  M.setPosition(seatOf(scene, 'start').sub(f0.P.clone().applyMatrix4(M)));
  return M;
}

// Grade a placement the student set up by hand: the end nearer the panel connector is the panel end.
export function gradePlacement(conduit, scene, M) {
  const P = prep(conduit), sP = seatOf(scene, 'start');
  const a = conduit.frameAt(P.lay, 0).P.clone().applyMatrix4(M).distanceTo(sP);
  const b = conduit.frameAt(P.lay, P.L).P.clone().applyMatrix4(M).distanceTo(sP);
  const m = measure(conduit, scene, M, orient(a <= b ? 'A' : 'B', P.L), P);
  return { rows: rowsFor(m, scene, P.L, false), matrix: M, inEnd: m.o.end, cutS: m.o.end === 'A' ? m.travelCut : P.L - m.travelCut, m };
}

// Put the bent conduit on the wall the way an installer would: one end in the panel connector,
// twisted about that connector to the roll that fits best, then cut where it meets the box.
// Tries both ends in the panel. Returns the placement (local → wall) and the graded results.
export function fitRoute(conduit, scene) {
  const P = prep(conduit);
  let best = null;
  const tryIt = (key, psi) => { const m = measure(conduit, scene, placeInPanel(conduit, scene, key, psi), orient(key, P.L), P); m.psi = psi; if (!best || m.cost < best.cost) best = m; };
  for (const key of ['A', 'B']) for (let k = 0; k < 360; k += 2) tryIt(key, k * DEG);
  const k0 = best.o.end, p0 = best.psi;
  for (let d = -2; d <= 2; d += 0.1) tryIt(k0, p0 + d * DEG);
  const cutS = best.o.end === 'A' ? best.travelCut : P.L - best.travelCut;
  return { rows: rowsFor(best, scene, P.L, true), matrix: best.M, inEnd: best.o.end, cutS, keep: best.travelCut, best };
}

// every job is graded the same way: install it and look at the fit
for (const job of ROUTES) job.check = (an, p, conduit) => fitRoute(conduit, p.scene).rows;
