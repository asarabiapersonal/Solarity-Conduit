// Headless check: after each obstacle lesson is bent per its procedure, the finished conduit (resting
// pose used in the app) must not pass through the obstruction, and should rest on / just clear it.
import * as THREE from 'three';
import { Conduit } from '../js/geometry.js';
import { BENDERS, EMT, SIZES, fmtIn } from '../js/data.js';
import { arrowSFor, restPose } from '../js/rig.js';
import { LESSONS } from '../js/lessons.js';

const DEG = Math.PI / 180;
const TOL = 1 / 64; // allowed numerical overlap
let fails = 0;

export function buildLesson(size, L) {
  const b = BENDERS[size];
  const c = new Conduit(120, EMT[size].od);
  const p = L.params(size, b);
  let n = 0;
  for (const st of L.steps(p, b)) {
    if (st.type === 'mark') c.marks.push({ id: st.label, label: st.label, s: st.s(c) });
    else {
      const m = c.marks.find(x => x.label === st.mark);
      const pl = { markS: m.s, ref: st.ref, front: st.front, phiDeg: st.phiDeg };
      c.bends.push({ id: 'b' + (++n), arrowS: arrowSFor(b, pl), front: st.front, theta: st.angle * DEG, R: b.R, phi: st.phiDeg * DEG });
    }
  }
  return { c, p };
}

// Signed clearance of a surface point from the obstruction (negative = inside it), in the X-Y plane.
function clearance(ob, x, y) {
  if (ob.type === 'pipe') return Math.hypot(x - ob.at, y - ob.H / 2) - ob.H / 2;
  const x0 = ob.at, x1 = ob.type === 'box' ? ob.at + ob.W : Infinity;
  if (x < x0 || x > x1) return Infinity;
  return y - ob.H;
}

for (const size of SIZES) {
  for (const L of LESSONS.filter(l => l.obstacle)) {
    const { c, p } = buildLesson(size, L);
    const ob = L.obstacle(p);
    const { matrix, lay } = restPose(c, true);
    const xA = c.frameAt(lay, 0).P.clone().applyMatrix4(matrix).x;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    let minClr = Infinity;
    for (const smp of c.sample(lay, 0.1)) {
      const P = smp.P.clone().applyMatrix4(matrix);
      const N = smp.N.clone().applyMatrix3(nm).normalize(), B = smp.B.clone().applyMatrix3(nm).normalize();
      for (let k = 0; k < 48; k++) {
        const a = k / 48 * Math.PI * 2;
        const q = P.clone().addScaledVector(N, c.r * Math.cos(a)).addScaledVector(B, c.r * Math.sin(a));
        minClr = Math.min(minClr, clearance(ob, q.x - xA, q.y));
      }
    }
    const ok = minClr >= -TOL;
    if (!ok) fails++;
    console.log(size.padEnd(6), L.id.padEnd(8), `min clearance ${minClr >= 0 ? '+' : ''}${minClr.toFixed(3)}" (${fmtIn(minClr)})`, ok ? 'OK' : 'PASSES THROUGH');
  }
}
console.log(fails ? `${fails} FAIL` : 'ALL CLEAR');
