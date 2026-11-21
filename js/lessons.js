// Guided lessons. Each lesson computes its layout from the selected bender, so the numbers on screen
// are the real numbers for that conduit size.
import { offsetRow, fmtIn, fmtDeg } from './data.js';
import { backOfBendS } from './rig.js';

const TOL_GOOD = 1 / 8, TOL_OK = 1 / 4;

function grade(label, measured, target, unit = 'in', tolGood = TOL_GOOD, tolOk = TOL_OK) {
  const err = measured - target;
  const a = Math.abs(err);
  const status = a <= tolGood ? 'good' : a <= tolOk ? 'ok' : 'bad';
  const f = unit === 'deg' ? fmtDeg : fmtIn;
  return { label, measured: f(measured), target: f(target), error: (err >= 0 ? '+' : '') + (unit === 'deg' ? fmtDeg(err) : fmtIn(err)), status };
}

// Conduit must clear the obstruction (rise >= H) without floating too far above it.
function clears(label, rise, H, maxGap = 0.25) {
  const gap = rise - H;
  const status = gap < -1 / 64 ? 'bad' : gap <= maxGap ? 'good' : gap <= maxGap * 2 ? 'ok' : 'bad';
  return { label, measured: fmtIn(rise), target: `>= ${fmtIn(H)}`, error: gap < -1 / 64 ? 'hits it' : `gap ${fmtIn(Math.max(0, gap))}`, status };
}

// After a saddle the two end legs should be parallel and on the same line.
function legsInLine(an) {
  const sep = an.legSeparation ?? 0;
  const status = !an.parallel ? 'bad' : sep < 0.25 ? 'good' : sep < 0.5 ? 'ok' : 'bad';
  return { label: 'Legs in line', measured: fmtIn(sep), target: '0"', error: an.parallel ? '' : `${fmtDeg(an.endAngle ?? 0)} kick`, status };
}

function bendAngles(an, targets) {
  return targets.map((t, i) => an.bends[i]
    ? grade(`Bend ${i + 1} angle`, an.bends[i].deg, t, 'deg', 1, 2)
    : { label: `Bend ${i + 1} angle`, measured: 'missing', target: fmtDeg(t), error: '', status: 'bad' });
}

function sizeVal(size, table) { return table[size]; }

// placement ref for laying out offsets/saddles: hand benders use the arrow,
// electric shoes use the tangent line (training aid) so both bends shift equally.
const layoutRef = (b) => (b.type === 'hand' ? 'arrow' : 'tangent');
const stubRef = (b) => (b.type === 'hand' ? 'arrow' : 'hook');

export const LESSONS = [
  {
    id: 'stub',
    title: '90° Stub-Up',
    summary: 'The most common bend: a 90° that turns the conduit up into a box or panel.',
    params(size, b) {
      const H = sizeVal(size, { '3/4': 12, '1': 12, '1-1/4': 16, '1-1/2': 24, '2': 24 });
      return { H, mark: H - b.deduct };
    },
    math(p, b) {
      return [
        `Stub height (end to back of the 90): <b>${fmtIn(p.H)}</b>`,
        `${b.type === 'hand' ? 'Take-up' : 'Deduct'} for this ${b.size}" bender: <b>${fmtIn(b.deduct)}</b>`,
        `Mark = Stub − ${b.type === 'hand' ? 'Take-up' : 'Deduct'} = ${fmtIn(p.H)} − ${fmtIn(b.deduct)} = <b>${fmtIn(p.mark)}</b> from End A`,
      ];
    },
    steps(p, b) {
      return [
        { type: 'mark', label: 'M1', s: () => p.mark, text: `Hook your tape on End A and mark <b>${fmtIn(p.mark)}</b> (M1).` },
        { type: 'bend', mark: 'M1', ref: stubRef(b), front: 'A', phiDeg: 0, angle: 90,
          text: `Put End A toward the hook and line M1 up with the <b>${b.type === 'hand' ? 'arrow' : 'front edge of the hook'}</b>. Bend to 90° and check it with a level or the degree marks. Over-bend a little to make up for springback.` },
      ];
    },
    check(an, p) {
      return [grade('Stub height (End A)', an.stubA ?? 0, p.H), ...bendAngles(an, [90])];
    },
  },
  {
    id: 'b2b',
    title: 'Back-to-Back 90s',
    summary: 'Two 90s whose backs must be a set distance apart, such as between two boxes or across a doorway.',
    params(size, b) {
      const H = sizeVal(size, { '3/4': 12, '1': 12, '1-1/4': 16, '1-1/2': 24, '2': 24 });
      const D = sizeVal(size, { '3/4': 36, '1': 36, '1-1/4': 40, '1-1/2': 48, '2': 48 });
      return { H, D, mark1: H - b.deduct };
    },
    math(p, b) {
      return [
        `First 90: mark = ${fmtIn(p.H)} − ${fmtIn(b.deduct)} = <b>${fmtIn(p.mark1)}</b>`,
        `Back-to-back distance: <b>${fmtIn(p.D)}</b>, measured from the back of the first 90`,
        `The <b>star</b> is the back of the 90. It sits one take-up (${fmtIn(b.takeUp)}) behind the arrow, so the back of the second 90 lands on your mark.`,
      ];
    },
    steps(p, b) {
      return [
        { type: 'mark', label: 'M1', s: () => p.mark1, text: `Mark M1 at <b>${fmtIn(p.mark1)}</b> from End A.` },
        { type: 'bend', mark: 'M1', ref: stubRef(b), front: 'A', phiDeg: 0, angle: 90, text: `Bend the first 90° with M1 on the ${b.type === 'hand' ? 'arrow' : 'hook edge'}.` },
        { type: 'mark', label: 'M2', s: (c) => backOfBendS(c, c.bends[0]?.id, 'B') + p.D,
          text: `Hook your tape on the <b>back of the first 90</b> and mark <b>${fmtIn(p.D)}</b> (M2).` },
        { type: 'bend', mark: 'M2', ref: 'star', front: 'A', phiDeg: 0, angle: 90,
          text: `Keep End A (with the first 90) toward the hook and put the free end toward the heel. Line M2 up with the <b>${b.type === 'hand' ? 'star' : 'back-of-90 line'}</b>, keep the stripe up so both stubs end up on the same side, and bend to 90°.` },
      ];
    },
    check(an, p) {
      return [grade('Stub height (End A)', an.stubA ?? 0, p.H), grade('Back-to-back', an.backToBack ?? 0, p.D), ...bendAngles(an, [90, 90])];
    },
  },
  {
    id: 'offset',
    title: 'Offset (30°)',
    obstacle: (p) => ({ type: 'step', at: p.X, H: p.H }),
    summary: 'Two equal bends in opposite directions that shift the conduit up onto a raised surface or around an obstruction.',
    params(size, b) {
      const H = sizeVal(size, { '3/4': 4, '1': 4, '1-1/4': 6, '1-1/2': 6, '2': 8 });
      const X = sizeVal(size, { '3/4': 30, '1': 30, '1-1/4': 36, '1-1/2': 40, '2': 44 });
      const row = offsetRow(30);
      const shrink = H * row.shrink;
      const dist = H * row.mult;
      return { H, X, angle: 30, row, shrink, dist, m2: X + shrink, m1: X + shrink - dist };
    },
    math(p) {
      return [
        `Offset depth H = <b>${fmtIn(p.H)}</b>. The raised surface starts <b>${fmtIn(p.X)}</b> from End A.`,
        `Distance between bends = H × multiplier (csc 30° = 2.0) = ${fmtIn(p.H)} × 2 = <b>${fmtIn(p.dist)}</b>`,
        `Shrink = H × ¼" per inch (tan 15° ≈ 0.268) = <b>${fmtIn(p.shrink)}</b>`,
        `Working toward the obstruction, add the shrink: M2 = ${fmtIn(p.X)} + ${fmtIn(p.shrink)} = <b>${fmtIn(p.m2)}</b>, then M1 = M2 − ${fmtIn(p.dist)} = <b>${fmtIn(p.m1)}</b>`,
        `Make both bends with the <b>obstruction end (End B) toward the hook</b>. Each bend then forms on the End A side of its mark, so the conduit is at full height by M2 and lies flat on the surface.`,
      ];
    },
    steps(p, b) {
      const ref = layoutRef(b);
      const refName = b.type === 'hand' ? 'arrow' : 'tangent line';
      return [
        { type: 'mark', label: 'M1', s: () => p.m1, text: `Mark M1 at <b>${fmtIn(p.m1)}</b>.` },
        { type: 'mark', label: 'M2', s: () => p.m2, text: `Mark M2 at <b>${fmtIn(p.m2)}</b>.` },
        { type: 'bend', mark: 'M1', ref, front: 'B', phiDeg: 0, angle: 30, text: `Put End B (the end that goes over the obstruction) toward the hook with the stripe up. Line M1 up with the ${refName} and bend <b>30°</b>.` },
        { type: 'bend', mark: 'M2', ref, front: 'B', phiDeg: 180, angle: 30,
          text: `Keep End B toward the hook. Roll the conduit <b>180°</b> (stripe down), slide it to M2 on the ${refName}, and bend <b>30°</b>. Sight down the conduit to check for a dog-leg.` },
      ];
    },
    check(an, p) {
      // depth is measured at the second bend; the top run must not dip below the surface anywhere
      const r = [grade('Offset depth', an.legSeparation ?? 0, p.H), ...bendAngles(an, [30, 30])];
      r.push({ label: 'Legs parallel', measured: fmtDeg(an.endAngle ?? 0), target: '0.0°', error: an.parallel ? '' : 'dog-leg / kick', status: an.parallel ? 'good' : 'bad' });
      r.push(clears('Rests on the surface', an.lastLegMinRise ?? 0, p.H));
      return r;
    },
  },
  {
    id: 'saddle3',
    title: '3-Point Saddle (45° / 22½°)',
    obstacle: (p) => ({ type: 'pipe', at: p.Xc, H: p.H }),
    summary: 'Crosses a round obstruction such as another pipe. A 45° center bend with two 22½° outer bends.',
    params(size) {
      const H = sizeVal(size, { '3/4': 2, '1': 2, '1-1/4': 3, '1-1/2': 3, '2': 4 });
      const Xc = sizeVal(size, { '3/4': 40, '1': 40, '1-1/4': 48, '1-1/2': 54, '2': 60 });
      const clr = 0.25;               // layout allowance: the 2½ rule rises a little short
      const Hl = H + clr;             // height used for the layout
      const shrink = Hl * 3 / 16;
      const C = Xc + shrink;
      return { H, Xc, clr, Hl, shrink, C, out: 2.5 * Hl, mA: C - 2.5 * Hl, mB: C + 2.5 * Hl };
    },
    math(p) {
      return [
        `Obstruction: <b>${fmtIn(p.H)}</b> pipe, centered <b>${fmtIn(p.Xc)}</b> from End A.`,
        `Lay out for H + ${fmtIn(p.clr)} clearance = <b>${fmtIn(p.Hl)}</b>. The 2½ × H rule rises about 4% short, so without this allowance the saddle drags on the pipe.`,
        `Shrink = 3/16" per inch = <b>${fmtIn(p.shrink)}</b>, so center mark C = ${fmtIn(p.Xc)} + ${fmtIn(p.shrink)} = <b>${fmtIn(p.C)}</b>`,
        `Outer marks = 2½ × ${fmtIn(p.Hl)} = <b>${fmtIn(p.out)}</b> each side of C: ${fmtIn(p.mA)} and ${fmtIn(p.mB)}`,
        `Total degrees: 45 + 22½ + 22½ = <b>90°</b>, which counts toward the 360° limit.`,
      ];
    },
    steps(p, b) {
      const ref = layoutRef(b);
      const refName = b.type === 'hand' ? 'arrow' : 'tangent line';
      return [
        { type: 'mark', label: 'C', s: () => p.C, text: `Mark the center C at <b>${fmtIn(p.C)}</b>.` },
        { type: 'mark', label: 'A1', s: () => p.mA, text: `Mark A1 at <b>${fmtIn(p.mA)}</b> (2½ × ${fmtIn(p.Hl)} before C).` },
        { type: 'mark', label: 'B1', s: () => p.mB, text: `Mark B1 at <b>${fmtIn(p.mB)}</b> (2½ × ${fmtIn(p.Hl)} after C).` },
        { type: 'bend', mark: 'C', ref: 'notch', front: 'A', phiDeg: 0, angle: 45, text: `Line C up with the <b>${b.type === 'hand' ? 'rim notch' : '45° center line'}</b> (center of a 45°) and bend <b>45°</b>.` },
        { type: 'bend', mark: 'A1', ref, front: 'B', phiDeg: 180, angle: 22.5, text: `Roll the conduit <b>180°</b> (stripe down). Point End B toward the hook so the bend forms on the far side of A1, away from the center. Line A1 up with the ${refName} and bend <b>22½°</b>.` },
        { type: 'bend', mark: 'B1', ref, front: 'A', phiDeg: 180, angle: 22.5, text: `Turn the conduit end-for-end so End A points toward the hook. Keep the stripe down, line B1 up with the ${refName} and bend <b>22½°</b>.` },
      ];
    },
    check(an, p) {
      const r = [clears('Clears the pipe (rise)', an.bentRise ?? 0, p.H, 0.5), ...bendAngles(an, [22.5, 45, 22.5])];
      r.push(legsInLine(an));
      return r;
    },
  },
  {
    id: 'saddle4',
    title: '4-Point Saddle (22½°)',
    obstacle: (p) => ({ type: 'box', at: p.X, H: p.H, W: p.W }),
    summary: 'Two offsets back to back that carry the conduit over a square obstruction such as a beam or duct.',
    params(size) {
      const H = sizeVal(size, { '3/4': 3, '1': 3, '1-1/4': 4, '1-1/2': 4, '2': 5 });
      const W = sizeVal(size, { '3/4': 8, '1': 8, '1-1/4': 10, '1-1/2': 12, '2': 14 });
      const X = sizeVal(size, { '3/4': 30, '1': 30, '1-1/4': 36, '1-1/2': 40, '2': 44 });
      const clr = 1 / 16;             // 2.6 is slightly under csc 22½° (2.613)
      const Hl = H + clr;
      const row = offsetRow(22.5);
      const shrink = Hl * row.shrink, dist = Hl * row.mult;
      const m2 = X + shrink, m1 = m2 - dist, m3 = m2 + W, m4 = m3 + dist;
      return { H, W, X, clr, Hl, row, shrink, dist, m1, m2, m3, m4 };
    },
    math(p) {
      return [
        `Obstruction: <b>${fmtIn(p.H)}</b> high × <b>${fmtIn(p.W)}</b> wide, starting <b>${fmtIn(p.X)}</b> from End A.`,
        `Lay out for H + ${fmtIn(p.clr)} = <b>${fmtIn(p.Hl)}</b>, because the field multiplier 2.6 is a hair under csc 22½° (2.613).`,
        `Distance between bends = ${fmtIn(p.Hl)} × 2.6 = <b>${fmtIn(p.dist)}</b>`,
        `Shrink = 3/16" per inch = <b>${fmtIn(p.shrink)}</b>. M2 = ${fmtIn(p.X)} + ${fmtIn(p.shrink)} = <b>${fmtIn(p.m2)}</b>; M1 = M2 − ${fmtIn(p.dist)} = <b>${fmtIn(p.m1)}</b>`,
        `M3 = M2 + width = <b>${fmtIn(p.m3)}</b>; M4 = M3 + ${fmtIn(p.dist)} = <b>${fmtIn(p.m4)}</b>`,
        `Make bends 1–2 with End B toward the hook and bends 3–4 with End A toward the hook. Every bend then forms <b>outside</b> M2–M3, so the top run sits flat on the obstruction.`,
        `Total degrees: 4 × 22½ = <b>90°</b>`,
      ];
    },
    steps(p, b) {
      const ref = layoutRef(b);
      const refName = b.type === 'hand' ? 'arrow' : 'tangent line';
      return [
        { type: 'mark', label: 'M1', s: () => p.m1, text: `Mark M1 at <b>${fmtIn(p.m1)}</b>.` },
        { type: 'mark', label: 'M2', s: () => p.m2, text: `Mark M2 at <b>${fmtIn(p.m2)}</b>.` },
        { type: 'mark', label: 'M3', s: () => p.m3, text: `Mark M3 at <b>${fmtIn(p.m3)}</b>.` },
        { type: 'mark', label: 'M4', s: () => p.m4, text: `Mark M4 at <b>${fmtIn(p.m4)}</b>.` },
        { type: 'bend', mark: 'M1', ref, front: 'B', phiDeg: 0, angle: 22.5, text: `Put End B toward the hook with the stripe up. Put M1 on the ${refName} and bend <b>22½°</b>.` },
        { type: 'bend', mark: 'M2', ref, front: 'B', phiDeg: 180, angle: 22.5, text: `Keep End B toward the hook and roll the conduit 180°. Put M2 on the ${refName} and bend <b>22½°</b>. That finishes the first offset.` },
        { type: 'bend', mark: 'M3', ref, front: 'A', phiDeg: 180, angle: 22.5, text: `Turn the conduit end-for-end (End A toward the hook) and keep the stripe down. Put M3 on the ${refName} and bend <b>22½°</b>.` },
        { type: 'bend', mark: 'M4', ref, front: 'A', phiDeg: 0, angle: 22.5, text: `Roll the conduit 180° (stripe up). Put M4 on the ${refName} and bend <b>22½°</b>.` },
      ];
    },
    check(an, p) {
      const r = [grade('Saddle height', an.middleRise ?? 0, p.H), clears('Clears the obstruction', an.middleRise ?? 0, p.H), ...bendAngles(an, [22.5, 22.5, 22.5, 22.5])];
      r.push(legsInLine(an));
      return r;
    },
  },
  {
    id: 'free',
    title: 'Free Bending',
    summary: 'No targets. Mark, place and bend however you like, then use Inspect to measure the result.',
    params() { return {}; },
    math() { return ['Use the <b>Math</b> tab calculators to lay out your own bends.']; },
    steps() { return []; },
    check() { return []; },
  },
];
