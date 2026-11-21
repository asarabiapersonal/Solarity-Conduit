// Reference data for the Conduit Bending Workshop.
// All lengths are in inches unless noted. Areas in square inches.
//
// Sources (see the "Sources" tab in the app):
//  - EMT dimensions & internal area: NEC Chapter 9, Table 4 (Article 358 – EMT)
//  - THHN/THWN-2 conductor areas: NEC Chapter 9, Table 5
//  - Fill percentages: NEC Chapter 9, Table 1
//  - Hand-bender take-up (deduct): manufacturer charts (Klein / Ideal / Greenlee / Gardner Bender),
//    3/4" = 6", 1" = 8", 1-1/4" = 11"
//  - Electric bender deducts (1-1/2" = 14-7/8", 2" = 16-3/8"): Greenlee 854 Quad Bender manual, EMT deduct table
//  - Electric-bender centerline radius: NEC Chapter 9, Table 2 (one-shot / full shoe column)
//  - Offset multipliers & shrink: Greenlee / Klein bending charts
//  - Support: NEC 358.30(A) & (B); bends: 358.24, 358.26

export const SIZES = ['3/4', '1', '1-1/4', '1-1/2', '2'];

// NEC Ch.9 Table 4 – EMT
export const EMT = {
  '3/4':   { od: 0.922, id: 0.824, area: 0.533, area40: 0.213, area31: 0.165, area53: 0.283 },
  '1':     { od: 1.163, id: 1.049, area: 0.864, area40: 0.346, area31: 0.268, area53: 0.458 },
  '1-1/4': { od: 1.510, id: 1.380, area: 1.496, area40: 0.598, area31: 0.464, area53: 0.793 },
  '1-1/2': { od: 1.740, id: 1.610, area: 2.036, area40: 0.814, area31: 0.631, area53: 1.079 },
  '2':     { od: 2.197, id: 2.067, area: 3.356, area40: 1.342, area31: 1.040, area53: 1.778 },
};

// NEC Ch.9 Table 2 – minimum radius of conduit bends (inches)
export const NEC_MIN_RADIUS = {
  '3/4':   { oneShot: 4.5,  other: 5 },
  '1':     { oneShot: 5.75, other: 6 },
  '1-1/4': { oneShot: 7.25, other: 8 },
  '1-1/2': { oneShot: 8.25, other: 10 },
  '2':     { oneShot: 9.5,  other: 12 },
};

// Bender definitions.
// type 'hand': floor bending, the bender rolls on the conduit; the heel-side leg stays on the floor.
// type 'electric': fixed shoe on a stand; the conduit feeds into the shoe.
//  takeUp   = stub height minus the distance from the end to the alignment mark (arrow / hook edge)
//  R        = centerline radius of the shoe
//  hookOffset = distance the alignment reference (hook edge) sits ahead of the bend tangent point
//  springback = typical elastic return, degrees (EMT)
function hand(size, takeUp, model, handle, springback) {
  const r = EMT[size].od / 2;
  return {
    size, type: 'hand', model, takeUp, R: takeUp - r, hookOffset: 0, deduct: takeUp,
    handleOD: handle.od, handleLen: handle.len, handleName: handle.name, springback,
  };
}
function electric(size, R, deduct, model, springback) {
  const r = EMT[size].od / 2;
  const takeUp = R + r; // geometric take-up measured to the tangent point
  return {
    size, type: 'electric', model, takeUp, R, hookOffset: deduct - takeUp, deduct,
    handleOD: 0, handleLen: 0, handleName: '', springback,
  };
}

export const BENDERS = {
  '3/4':   hand('3/4', 6, '3/4" EMT hand bender (Klein 56207 / Ideal 74-027 class)', { od: 1.315, len: 38, name: '1" rigid handle' }, 2),
  '1':     hand('1', 8, '1" EMT hand bender (Klein / Ideal / Greenlee class)', { od: 1.66, len: 42, name: '1-1/4" rigid handle' }, 2.5),
  '1-1/4': hand('1-1/4', 11, '1-1/4" EMT hand bender (Greenlee / Gardner Bender class)', { od: 1.90, len: 46, name: '1-1/2" rigid handle' }, 3),
  '1-1/2': electric('1-1/2', 8.25, 14.875, 'Electric one-shot bender (Greenlee 854 / 555 class)', 3),
  '2':     electric('2', 9.5, 16.375, 'Electric one-shot bender (Greenlee 854 / 555 class)', 4),
};

// Offset chart (field multipliers & shrink per inch of offset depth)
export const OFFSET_TABLE = [
  { angle: 10,   mult: 6.0, shrink: 1 / 16 },
  { angle: 22.5, mult: 2.6, shrink: 3 / 16 },
  { angle: 30,   mult: 2.0, shrink: 1 / 4 },
  { angle: 45,   mult: 1.4, shrink: 3 / 8 },
  { angle: 60,   mult: 1.2, shrink: 1 / 2 },
];
export function offsetRow(angle) {
  return OFFSET_TABLE.find(r => Math.abs(r.angle - angle) < 0.01) || {
    angle, mult: 1 / Math.sin(angle * Math.PI / 180), shrink: Math.tan(angle * Math.PI / 360),
  };
}

// NEC Ch.9 Table 5 – THHN / THWN / THWN-2 approximate area (sq in)
export const THHN = [
  ['14', 0.0097], ['12', 0.0133], ['10', 0.0211], ['8', 0.0366], ['6', 0.0507],
  ['4', 0.0824], ['3', 0.0973], ['2', 0.1158], ['1', 0.1562], ['1/0', 0.1855],
  ['2/0', 0.2223], ['3/0', 0.2679], ['4/0', 0.3237], ['250', 0.3970], ['300', 0.4608],
  ['350', 0.5242], ['400', 0.5863], ['500', 0.7073],
];
// THHN diameters (in) for jam-ratio check (NEC Ch.9 Table 5)
export const THHN_DIA = {
  '14': 0.111, '12': 0.130, '10': 0.164, '8': 0.216, '6': 0.254, '4': 0.324, '3': 0.352,
  '2': 0.384, '1': 0.446, '1/0': 0.486, '2/0': 0.532, '3/0': 0.584, '4/0': 0.642,
  '250': 0.711, '300': 0.766, '350': 0.817, '400': 0.864, '500': 0.949,
};

// RMC support table 344.30(B)(2) for comparison (feet)
// Steel set-screw EMT connector, by trade size (inches). A = overall length, B = body length (outside
// the box), C = body OD, from a distributor's chart of steel set-screw connectors. The male thread
// (NPSM, straight) is A − B long; thread OD, knockout and locknut sizes are the standard trade-size
// values. stop = how far the internal conduit stop sits out from the box face: the conduit goes
// B − stop into the body before it bottoms out.
export const CONNECTOR = {
  '3/4':   { A: 1.4375, B: 0.9375, C: 1.1875, thread: 1.050, ko: 1.109, nut: 1.4375, stop: 0.125, screws: 1 },
  '1':     { A: 1.625,  B: 1.0625, C: 1.4375, thread: 1.315, ko: 1.375, nut: 1.75,   stop: 0.125, screws: 1 },
  '1-1/4': { A: 2.0,    B: 1.375,  C: 1.875,  thread: 1.660, ko: 1.734, nut: 2.1875, stop: 0.125, screws: 2 },
  '1-1/2': { A: 2.3125, B: 1.5625, C: 2.0625, thread: 1.900, ko: 1.984, nut: 2.4375, stop: 0.125, screws: 2 },
  '2':     { A: 2.5625, B: 1.8125, C: 2.5625, thread: 2.375, ko: 2.469, nut: 2.9375, stop: 0.125, screws: 2 },
};
// Knockouts on the job wall's panel and boxes sit about 1" out from the wall (centerline), or far
// enough out that the knockout clears the wall for the big sizes.
export const koZ = (size) => Math.max(1, CONNECTOR[size].ko / 2 + 0.25);

export const RMC_SUPPORT = { '3/4': 10, '1': 12, '1-1/4': 14, '1-1/2': 14, '2': 16 };

export const IN_TO_M = 0.0254;

// Format inches to nearest 1/16 as a fraction string, e.g. 12-3/16"
export function fmtIn(x, denom = 16) {
  if (!isFinite(x)) return '—';
  const sign = x < 0 ? '-' : '';
  x = Math.abs(x);
  let whole = Math.floor(x);
  let num = Math.round((x - whole) * denom);
  if (num === denom) { whole += 1; num = 0; }
  let frac = '';
  if (num) {
    let d = denom;
    while (num % 2 === 0 && d > 1) { num /= 2; d /= 2; }
    frac = `${num}/${d}`;
  }
  if (whole && frac) return `${sign}${whole}-${frac}"`;
  if (frac) return `${sign}${frac}"`;
  return `${sign}${whole}"`;
}
export const fmtDeg = (d) => `${(Math.round(d * 10) / 10).toFixed(1)}°`;
