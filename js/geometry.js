// Exact centerline geometry of a bent conduit.
// The conduit is parameterized by arc length s (inches) measured along the centerline from End A (s=0)
// to End B (s=L). Each bend is a circular arc of radius R. A bend is defined the way it is made in the
// bender: the pipe point under the bender's tangent (arrowS), which end points toward the hook (front),
// the bend angle, and the roll (phi) = direction of curvature relative to the conduit's printed stripe.
import * as THREE from 'three';

const DEG = Math.PI / 180;

export class Conduit {
  constructor(length, od) {
    this.L = length;
    this.od = od;
    this.r = od / 2;
    this.bends = []; // {id, arrowS, front:'A'|'B', theta(rad), R, phi(rad)}
    this.marks = []; // {id, s, label}
    this._cache = null;
  }

  clone() {
    const c = new Conduit(this.L, this.od);
    c.bends = this.bends.map(b => ({ ...b }));
    c.marks = this.marks.map(m => ({ ...m }));
    return c;
  }

  static arcRange(b) {
    const len = b.theta * b.R;
    return b.front === 'A' ? [b.arrowS, b.arrowS + len] : [b.arrowS - len, b.arrowS];
  }

  // Build list of bends sorted with arc ranges, plus the walking state at each bend start.
  _build(extra) {
    const list = this.bends.concat(extra ? [extra] : []).map(b => {
      const [sa, sb] = Conduit.arcRange(b);
      return { ...b, sa, sb };
    }).filter(b => b.theta > 1e-6).sort((a, b) => a.sa - b.sa);

    let P = new THREE.Vector3(0, 0, 0);
    let T = new THREE.Vector3(1, 0, 0);
    let N = new THREE.Vector3(0, 1, 0);
    let B = new THREE.Vector3(0, 0, 1);
    let s = 0;
    for (const b of list) {
      // straight to sa
      P = P.clone().addScaledVector(T, b.sa - s);
      b.P0 = P.clone(); b.T0 = T.clone(); b.N0 = N.clone(); b.B0 = B.clone();
      b.d = N.clone().multiplyScalar(Math.cos(b.phi)).addScaledVector(B, Math.sin(b.phi)).normalize();
      b.axis = new THREE.Vector3().crossVectors(T, b.d).normalize();
      b.C = P.clone().addScaledVector(b.d, b.R);
      // advance through arc
      const q = new THREE.Quaternion().setFromAxisAngle(b.axis, b.theta);
      P = this._arcPoint(b, b.theta * b.R);
      T = T.clone().applyQuaternion(q);
      N = N.clone().applyQuaternion(q);
      B = B.clone().applyQuaternion(q);
      s = b.sb;
    }
    return { list, Pend: P, Tend: T, Nend: N, Bend: B, sEnd: s };
  }

  _arcPoint(b, t) {
    const a = t / b.R;
    return b.C.clone().addScaledVector(b.d, -b.R * Math.cos(a)).addScaledVector(b.T0, b.R * Math.sin(a));
  }

  layout(extra = null) { return this._build(extra); }

  // Frame at s for a given layout. Returns {P,T,N,B, bend (or null), n (curvature dir or null)}
  frameAt(lay, s) {
    let prev = null;
    for (const b of lay.list) {
      if (s < b.sa) {
        return this._straightFrom(prev, b.P0, b.T0, b.N0, b.B0, b.sa, s);
      }
      if (s <= b.sb) {
        const t = s - b.sa;
        const q = new THREE.Quaternion().setFromAxisAngle(b.axis, t / b.R);
        const P = this._arcPoint(b, t);
        const n = b.C.clone().sub(P).divideScalar(b.R);
        return { P, T: b.T0.clone().applyQuaternion(q), N: b.N0.clone().applyQuaternion(q), B: b.B0.clone().applyQuaternion(q), bend: b, n };
      }
      prev = b;
    }
    // after last bend
    return {
      P: lay.Pend.clone().addScaledVector(lay.Tend, s - lay.sEnd),
      T: lay.Tend.clone(), N: lay.Nend.clone(), B: lay.Bend.clone(), bend: null, n: null,
    };
  }

  _straightFrom(prev, P0, T0, N0, B0, s0, s) {
    // point on straight segment that ends at s0 with frame (P0,T0...)
    return { P: P0.clone().addScaledVector(T0, s - s0), T: T0.clone(), N: N0.clone(), B: B0.clone(), bend: null, n: null };
  }

  // Sample positions and frames along the conduit for rendering.
  sample(lay, step = 0.5) {
    const pts = [];
    const stops = new Set([0, this.L]);
    for (const b of lay.list) { stops.add(Math.max(0, Math.min(this.L, b.sa))); stops.add(Math.max(0, Math.min(this.L, b.sb))); }
    const sorted = [...stops].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], c = sorted[i + 1];
      const inArc = lay.list.some(b => a >= b.sa - 1e-9 && c <= b.sb + 1e-9);
      const n = inArc ? Math.max(2, Math.ceil((c - a) / step)) : 1;
      for (let k = 0; k < n; k++) pts.push(a + (c - a) * k / n);
    }
    pts.push(this.L);
    return pts.map(s => ({ s, ...this.frameAt(lay, s) }));
  }

  // Straight segments between bends: [{s0, s1, P0, P1, T}]
  segments(lay) {
    const segs = [];
    let s = 0;
    for (const b of lay.list) {
      if (b.sa - s > 1e-6) segs.push(this._seg(lay, s, b.sa));
      s = b.sb;
    }
    if (this.L - s > 1e-6) segs.push(this._seg(lay, s, this.L));
    return segs;
  }
  _seg(lay, s0, s1) {
    const f0 = this.frameAt(lay, s0), f1 = this.frameAt(lay, s1);
    return { s0, s1, len: s1 - s0, P0: f0.P, P1: f1.P, T: f0.T.clone() };
  }

  // Check that a candidate bend range does not overlap existing bends or run off the conduit.
  validRange(sa, sb, ignoreId = null) {
    if (sa < 0 || sb > this.L) return 'The bend would run off the end of the conduit.';
    for (const b of this.bends) {
      if (b.id === ignoreId) continue;
      const [a, c] = Conduit.arcRange(b);
      if (sb > a + 1e-6 && sa < c - 1e-6) return 'The bend would run into an existing bend.';
    }
    return null;
  }
}

// Distance from point p to an infinite line (point a, unit dir t)
export function pointLineDist(p, a, t) {
  const v = p.clone().sub(a);
  return v.sub(t.clone().multiplyScalar(v.dot(t))).length();
}

export function angleBetween(t1, t2) {
  return Math.acos(Math.max(-1, Math.min(1, t1.dot(t2)))) / DEG;
}

export { DEG };
