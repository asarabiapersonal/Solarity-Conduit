// Headless check: run each lesson's procedure with perfect bends and confirm the results.
import { Conduit } from '../js/geometry.js';
import { BENDERS, EMT, SIZES } from '../js/data.js';
import { arrowSFor, analyze, benderPose, restPose } from '../js/rig.js';
import { LESSONS } from '../js/lessons.js';

const DEG = Math.PI / 180;
let fails = 0;
for (const size of SIZES) {
  const b = BENDERS[size];
  for (const L of LESSONS) {
    if (L.id === 'free') continue;
    const c = new Conduit(120, EMT[size].od);
    const p = L.params(size, b);
    let n = 0;
    for (const st of L.steps(p, b)) {
      if (st.type === 'mark') c.marks.push({ id: st.label, label: st.label, s: st.s(c) });
      else {
        const m = c.marks.find(x => x.label === st.mark);
        const pl = { markS: m.s, ref: st.ref, front: st.front, phiDeg: st.phiDeg };
        const pose = benderPose(c, b, pl, st.angle * DEG, null);
        if (pose.error) { console.log(size, L.id, 'ERROR', pose.error); fails++; }
        c.bends.push({ id: 'b' + (++n), arrowS: arrowSFor(b, pl), front: st.front, theta: st.angle * DEG, R: b.R, phi: st.phiDeg * DEG });
      }
    }
    restPose(c);
    const an = analyze(c);
    const res = L.check(an, p);
    const bad = res.filter(r => r.status === 'bad');
    if (bad.length) fails++;
    console.log(size.padEnd(6), L.id.padEnd(8), res.map(r => `${r.label}: ${r.measured} (${r.status})`).join(' | '));
  }
}
console.log(fails ? `${fails} FAIL` : 'ALL GOOD');
