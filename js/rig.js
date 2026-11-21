// Positions the conduit in the bender (or at rest on the floor) and does the measuring.
import * as THREE from 'three';
import { Conduit, pointLineDist, angleBetween, DEG } from './geometry.js';

export const ELECTRIC_BEND_HEIGHT = 34; // conduit centerline height above floor on the electric bender stand

// Alignment references on the bender, as positions along the conduit (x, inches) when the conduit lies
// straight in the shoe. x = 0 is the shoe tangent point (where the bend starts). +x = toward the hook / front.
export function benderRefs(bender) {
  const { R, takeUp, hookOffset } = bender;
  if (bender.type === 'hand') {
    return {
      arrow: { x: 0, label: 'Arrow (take-up / deduct)', short: 'Arrow' },
      notch: { x: -R * Math.PI / 8, label: 'Rim notch (center of 45°)', short: 'Rim notch' },
      star: { x: -takeUp, label: 'Star (back of 90°)', short: 'Star' },
    };
  }
  return {
    hook: { x: hookOffset, label: 'Front edge of hook (deduct mark)', short: 'Hook edge' },
    tangent: { x: 0, label: 'Shoe tangent line, where the bend starts (training aid)', short: 'Tangent' },
    notch: { x: -R * Math.PI / 8, label: 'Center-of-45° line (training aid)', short: '45° center' },
    star: { x: -takeUp, label: 'Back-of-90° line (training aid)', short: 'Back-of-90' },
  };
}

export function defaultRef(bender) { return bender.type === 'hand' ? 'arrow' : 'hook'; }

// placement: { markS, ref, front:'A'|'B', phiDeg, nudge }
// Returns the pipe s that sits on the tangent point.
export function arrowSFor(bender, placement) {
  const refs = benderRefs(bender);
  const x = refs[placement.ref].x;
  const u = placement.front === 'A' ? -1 : 1; // direction of increasing s along world x
  return placement.markS + (placement.nudge || 0) - u * x;
}

// Build the in-bender pose. existing = bend being continued (or null).
export function benderPose(conduit, bender, placement, thetaRad, existing) {
  const sArrow = existing ? existing.arrowS : arrowSFor(bender, placement);
  const front = existing ? existing.front : placement.front;
  const phi = existing ? existing.phi : placement.phiDeg * DEG;
  const active = { id: existing ? existing.id : 'active', arrowS: sArrow, front, theta: thetaRad, R: bender.R, phi };

  const tmp = conduit.clone();
  if (existing) tmp.bends = tmp.bends.filter(b => b.id !== existing.id);
  const lay = tmp.layout(active);

  const [sa, sb] = Conduit.arcRange(active);
  const error = tmp.validRange(sa, sb);
  const anchorS = front === 'A' ? sb : sa;
  const f = tmp.frameAt(lay, Math.max(0, Math.min(conduit.L, anchorS)));
  let n = f.n;
  if (!n) n = f.N.clone().multiplyScalar(Math.cos(phi)).addScaledVector(f.B, Math.sin(phi)).normalize();

  const Wt = new THREE.Vector3(front === 'A' ? -1 : 1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const R = bender.R;
  const y0 = bender.type === 'hand' ? conduit.r : ELECTRIC_BEND_HEIGHT;
  const anchorX = bender.type === 'hand' ? -thetaRad * R : 0;
  const anchorW = new THREE.Vector3(anchorX, y0, 0);

  const M = basisMap(f.T, n, Wt, up);
  M.setPosition(anchorW.clone().sub(f.P.clone().applyMatrix4(M)));
  return {
    matrix: M, lay, active, error, sArrow, front, phi,
    shoe: { center: new THREE.Vector3(anchorX, y0 + R, 0), angle: thetaRad },
  };
}

// Rotation that maps local (e1, e2) to world (f1, f2)
function basisMap(e1, e2, f1, f2) {
  const a1 = e1.clone().normalize();
  const a2 = e2.clone().sub(a1.clone().multiplyScalar(e2.dot(a1))).normalize();
  const a3 = new THREE.Vector3().crossVectors(a1, a2);
  const b1 = f1.clone().normalize();
  const b2 = f2.clone().normalize();
  const b3 = new THREE.Vector3().crossVectors(b1, b2);
  const E = new THREE.Matrix4().makeBasis(a1, a2, a3);
  const F = new THREE.Matrix4().makeBasis(b1, b2, b3);
  return F.multiply(E.transpose());
}

// Resting pose: the longest straight leg lies on the floor along X, the rest of the conduit above it.
export function restPose(conduit, preferFirst = false) {
  const lay = conduit.layout();
  const segs = conduit.segments(lay);
  let seg = segs[0];
  if (!preferFirst) for (const s of segs) if (s.len > seg.len) seg = s;
  const mid = conduit.frameAt(lay, (seg.s0 + seg.s1) / 2);
  const pts = conduit.sample(lay, 2).map(p => p.P);
  let best = null;
  for (let k = 0; k < 72; k++) {
    const psi = k * 5 * DEG;
    const e2 = mid.N.clone().multiplyScalar(Math.cos(psi)).addScaledVector(mid.B, Math.sin(psi));
    let min = Infinity, sum = 0;
    for (const p of pts) {
      const y = p.clone().sub(mid.P).dot(e2);
      min = Math.min(min, y); sum += y;
    }
    const score = Math.round(min * 100) * 1e6 + sum;
    if (!best || score > best.score) best = { score, e2 };
  }
  const M = basisMap(mid.T, best.e2, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  // center along X, set the leg on the floor
  let minX = Infinity, maxX = -Infinity;
  const midW = mid.P.clone().applyMatrix4(M);
  for (const p of pts) { const q = p.clone().applyMatrix4(M); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }
  const cx = (minX + maxX) / 2;
  M.setPosition(new THREE.Vector3(-cx, conduit.r - midW.y, -midW.z).add(new THREE.Vector3(0, 0, 0)));
  // setPosition replaces translation; account for the rotated mid point
  const t = new THREE.Vector3(-cx, conduit.r - midW.y, -midW.z);
  M.setPosition(t);
  return { matrix: M, lay };
}

// ---- Measurements (pose independent, in conduit-local coordinates) ----
export function analyze(conduit) {
  const lay = conduit.layout();
  const segs = conduit.segments(lay);
  const r = conduit.r;
  const out = { bends: [], segs, totalDegrees: 0 };
  for (const b of lay.list) {
    out.bends.push({ id: b.id, deg: b.theta / DEG, sa: b.sa, sb: b.sb, center: (b.sa + b.sb) / 2 });
    out.totalDegrees += b.theta / DEG;
  }
  const PA = conduit.frameAt(lay, 0).P, PB = conduit.frameAt(lay, conduit.L).P;
  if (segs.length >= 2) {
    const first = segs[0], last = segs[segs.length - 1];
    // stub heights: end to the back (outside) of the next leg
    out.stubA = pointLineDist(PA, segs[1].P0, segs[1].T) + r;
    out.stubB = pointLineDist(PB, segs[segs.length - 2].P0, segs[segs.length - 2].T) + r;
    out.endAngle = angleBetween(first.T, last.T);
    out.parallel = out.endAngle < 1.0 || out.endAngle > 179.0;
    // Measured like a tape: from the first leg's centerline to where the last leg starts
    // (the top of an offset at its second bend, or the floor end of the second 90).
    // When the legs are not parallel this is still the real distance at that point.
    out.legSeparation = pointLineDist(last.P0, first.P0, first.T); // centerline to centerline
    out.backToBack = out.legSeparation + 2 * r;
    // lowest point of the last leg above the first leg's line (does an offset's top run sit on the surface?)
    out.lastLegMinRise = Math.min(out.legSeparation, pointLineDist(last.P1, first.P0, first.T));
    // Rise over an obstruction: the highest point of the bent section (first bend start to last
    // bend end). Leaving out the end legs keeps a kicked end leg from counting as clearance.
    let rise = 0, bentRise = 0;
    const s0 = lay.list[0].sa, s1 = lay.list[lay.list.length - 1].sb;
    for (const p of conduit.sample(lay, 0.25)) {
      const d = pointLineDist(p.P, first.P0, first.T);
      rise = Math.max(rise, d);
      if (p.s >= s0 - 1e-6 && p.s <= s1 + 1e-6) bentRise = Math.max(bentRise, d);
    }
    out.maxRise = rise;
    out.bentRise = bentRise;
    if (segs.length >= 3) {
      const mids = segs.slice(1, -1);
      out.middleRise = Math.max(...mids.map(m => pointLineDist(m.P0.clone().lerp(m.P1, 0.5), first.P0, first.T)));
    }
    // horizontal travel along the first leg's direction (for shrink): projection of B end
    out.runLength = PB.clone().sub(PA).dot(first.T);
  }
  return out;
}

// Pipe s of the "back" of a bend, measured along the leg on the given side.
// side 'B' = measuring along the leg toward End B.
export function backOfBendS(conduit, bendId, side) {
  const lay = conduit.layout();
  const b = lay.list.find(x => x.id === bendId);
  if (!b) return null;
  const k = (b.R + conduit.r) * Math.tan(b.theta / 2);
  return side === 'B' ? b.sb - k : b.sa + k;
}
