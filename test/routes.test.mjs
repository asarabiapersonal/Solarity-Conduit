// Headless check: bend each field job's worked solution for every size, install it on the wall
// and confirm it reaches the box square, clears every obstacle and stays off the wall.
import { Conduit } from '../js/geometry.js';
import { BENDERS, EMT, SIZES, CONNECTOR, koZ } from '../js/data.js';
import { arrowSFor, benderPose } from '../js/rig.js';
import { ROUTES, fitRoute, seatOf } from '../js/routes.js';

const DEG = Math.PI / 180;
let fails = 0;
for (const size of SIZES) {
  const b = BENDERS[size];
  for (const J of ROUTES) {
    const c = new Conduit(120, EMT[size].od);
    const p = J.params(size, b, EMT[size].od);
    let n = 0;
    for (const st of J.steps(p, b)) {
      if (st.type === 'mark') c.marks.push({ id: st.label, label: st.label, s: st.s(c) });
      else {
        const m = c.marks.find(x => x.label === st.mark);
        const pl = { markS: m.s, ref: st.ref, front: st.front, phiDeg: st.phiDeg };
        const pose = benderPose(c, b, pl, st.angle * DEG, null);
        if (pose.error) { console.log(size, J.id, 'BEND ERROR', pose.error); fails++; }
        c.bends.push({ id: 'b' + (++n), arrowS: arrowSFor(b, pl), front: st.front, theta: st.angle * DEG, R: b.R, phi: st.phiDeg * DEG });
      }
    }
    const fit = fitRoute(c, p.scene);
    const bad = fit.rows.filter(r => r.status === 'bad');
    if (bad.length) fails++;
    // knockouts about 1" (or more for big sizes) off the wall
    if (Math.abs(p.scene.start.p.z - koZ(size)) > 1e-9) { fails++; console.log(size, J.id, 'KNOCKOUT Z', p.scene.start.p.z); }
    // with connectors set at both ends, the pipe bottoms out on each connector stop
    p.scene.start.conn = CONNECTOR[size]; p.scene.end.conn = CONNECTOR[size];
    const fc = fitRoute(c, p.scene);
    const sP = seatOf(p.scene, 'start'), lay = c.layout();
    const endIn = c.frameAt(lay, fc.inEnd === 'A' ? 0 : c.L).P.applyMatrix4(fc.matrix);
    const cutP = c.frameAt(lay, fc.cutS).P.applyMatrix4(fc.matrix);
    const eP = seatOf(p.scene, 'end');
    if (endIn.distanceTo(sP) > 1e-6 || cutP.distanceTo(eP) > 0.25 || Math.abs(sP.distanceTo(p.scene.start.p) - CONNECTOR[size].stop) > 1e-9) {
      fails++; console.log(size, J.id, 'CONNECTOR SEAT', endIn.distanceTo(sP), cutP.distanceTo(eP));
    }
    if (fc.rows.some(r => r.status === 'bad')) { fails++; console.log(size, J.id, 'FAILS WITH CONNECTORS'); }
    console.log(size.padEnd(6), J.id.padEnd(12), fit.rows.map(r => `${r.label}: ${r.measured}${r.error ? ' [' + r.error + ']' : ''} (${r.status})`).join(' | '));
  }
}
// a straight stick must fail every job that needs bends
for (const J of ROUTES) {
  const c = new Conduit(120, EMT['3/4'].od);
  const fit = fitRoute(c, J.params('3/4', BENDERS['3/4'], EMT['3/4'].od).scene);
  const ok = fit.rows.some(r => r.status === 'bad');
  if (!ok) { fails++; console.log('STRAIGHT STICK PASSED', J.id); }
}
console.log(fails ? `${fails} FAIL` : 'ALL JOBS FIT');
