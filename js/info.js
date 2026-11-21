// Info panels: bender specs, bending math calculators, conduit fill, support rules, sources.
import { EMT, SIZES, BENDERS, OFFSET_TABLE, THHN, THHN_DIA, NEC_MIN_RADIUS, RMC_SUPPORT, fmtIn, fmtDeg } from './data.js';
import { benderRefs } from './rig.js';

const $ = (s, el = document) => el.querySelector(s);

export function parseInches(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim().replace(/["”]/g, '').replace(/in$/i, '').trim();
  if (!str) return NaN;
  // feet-inches: 3' 4-1/2
  let feet = 0;
  const fm = str.match(/^(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (fm) { feet = parseFloat(fm[1]); str = fm[2].trim() || '0'; }
  // 12-3/16 or 12 3/16 or 3/16 or 12.25
  let m = str.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (m) return feet * 12 + parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]);
  m = str.match(/^(\d+)\/(\d+)$/);
  if (m) return feet * 12 + parseInt(m[1]) / parseInt(m[2]);
  const v = parseFloat(str);
  return isNaN(v) ? NaN : feet * 12 + v;
}

// ---------------- Bender tab ----------------
export function renderBenderInfo(el, size) {
  const b = BENDERS[size], e = EMT[size], r = e.od / 2;
  const gain = 2 * b.takeUp - Math.PI * b.R / 2;
  const refs = benderRefs(b);
  const nec = NEC_MIN_RADIUS[size];
  el.innerHTML = `
    <h3>${b.model}</h3>
    <table class="kv">
      <tr><th>Conduit</th><td>${size}" EMT, OD ${e.od}" / ID ${e.id}"</td></tr>
      <tr><th>Bender type</th><td>${b.type === 'hand' ? 'Hand bender, used on the floor' : 'Electric bender on a stand (fixed shoe)'}</td></tr>
      <tr><th>${b.type === 'hand' ? 'Take-up' : 'Deduct (to hook edge)'}</th><td><b>${fmtIn(b.deduct)}</b></td></tr>
      ${b.type !== 'hand' ? `<tr><th>Take-up to tangent</th><td>${fmtIn(b.takeUp)} (hook edge is ${fmtIn(b.hookOffset)} ahead of the tangent)</td></tr>` : ''}
      <tr><th>Centerline radius</th><td>${fmtIn(b.R)} <span class="muted">(NEC Table 2 minimum: ${nec.oneShot}" for one-shot shoes ${b.R >= nec.oneShot ? '✔' : '✖'})</span></td></tr>
      <tr><th>Gain (90°)</th><td>${fmtIn(gain)} <span class="muted">= 2 × take-up − π·R/2</span></td></tr>
      <tr><th>Developed length of a 90</th><td>${fmtIn(Math.PI * b.R / 2)} of conduit forms the arc <span class="muted">(π·R/2)</span></td></tr>
      <tr><th>Typical springback</th><td>≈ ${b.springback}° <span class="muted">(varies with the batch and wall of the tubing, so bend a test piece)</span></td></tr>
      ${b.type === 'hand' ? `<tr><th>Handle</th><td>${b.handleName}, ≈ ${b.handleLen}" long</td></tr>` : ''}
    </table>
    <h4>Bender marks</h4>
    <ul class="tight">
      ${Object.entries(refs).map(([k, v]) => `<li><b>${v.short}</b>: ${v.label}. It sits ${fmtIn(Math.abs(v.x))} ${v.x > 0 ? 'ahead of' : v.x < 0 ? 'behind' : 'at'} the bend start.</li>`).join('')}
      <li><b>Degree scale</b>: radial ticks at 10°, 22½°, 30°, 45°, 60° and 90°. When a tick is straight above the spot where the conduit leaves the shoe, you have reached that angle. Check 90s with a torpedo level.</li>
    </ul>
    <h4>Using the bender</h4>
    ${b.type === 'hand' ? `
    <ol class="tight">
      <li>Lay the conduit on a flat, hard floor. Put the hook toward the end you are bending (the stub).</li>
      <li>Line your mark up with the right reference: arrow for stubs and offsets, rim notch for a saddle center, star for the back of a 90.</li>
      <li>Keep heavy, steady <b>foot pressure on the heel</b>. That keeps the conduit in the shoe groove and stops it kinking. Pull the handle with smooth, even force.</li>
      <li>Watch the degree scale, then check with a level. Over-bend slightly for springback.</li>
    </ol>` : `
    <ol class="tight">
      <li>Fit the ${size}" EMT shoe and support roller. Set the conduit on the roller, then slide the end through the hook.</li>
      <li>Line the stub mark up with the <b>front edge of the hook</b> (the deduct already includes the hook offset).</li>
      <li>Run the bender with the foot switch. Watch the degree scale and stop a little past the target, following the manual's scale-reading table for springback.</li>
      <li>Release (UNLOAD) and check the angle with a level or protractor.</li>
    </ol>`}
    <p class="muted small">Take-up and deduct values are from manufacturer charts. Always confirm against the chart cast on your own bender and make a test bend: values vary by brand and model.</p>
  `;
}

// ---------------- Math tab ----------------
export function renderMath(el, size) {
  const b = BENDERS[size];
  const rows = OFFSET_TABLE.map(r => {
    const csc = 1 / Math.sin(r.angle * Math.PI / 180), th = Math.tan(r.angle * Math.PI / 360);
    return `<tr><td>${r.angle === 22.5 ? '22½' : r.angle}°</td><td>${r.mult}</td><td>${csc.toFixed(3)}</td><td>${fmtIn(r.shrink)}</td><td>${th.toFixed(3)}</td></tr>`;
  }).join('');
  el.innerHTML = `
    <h3>Bending math</h3>
    <div class="formula">
      <div><b>Stub-up:</b> Mark = Stub height − Take-up (${fmtIn(b.deduct)})</div>
      <div><b>Offset:</b> Distance between bends = Offset depth × csc θ (the multiplier)</div>
      <div><b>Shrink:</b> Shrink = Offset depth × tan(θ/2). Add it when you measure toward an obstruction.</div>
      <div><b>Gain:</b> Gain = 2(R + OD/2) − π·R/2. Developed length = sum of legs − gain.</div>
      <div><b>Rolling offset:</b> True offset = √(rise² + roll²). Then use the true offset as the depth.</div>
      <div><b>3-pt saddle (45°/22½°):</b> Center mark + 3/16" per inch of height; outer marks are 2½ × height from center</div>
      <div><b>Arc length:</b> Conduit in a bend = π·R·θ/180 (centerline)</div>
    </div>
    <h4>Offset chart</h4>
    <table class="grid"><tr><th>Angle</th><th>Multiplier</th><th>csc θ</th><th>Shrink / in</th><th>tan(θ/2)</th></tr>${rows}</table>
    <p class="muted small">Field multipliers are rounded trig values. The workshop bends the exact geometry, so you can see what that rounding costs you.</p>

    <h4>Calculators (${size}" EMT)</h4>
    <div class="calc" id="calcStub">
      <div class="calc-h">90° stub</div>
      <label>Stub height <input data-k="h" value="12"></label>
      <div class="out"></div>
    </div>
    <div class="calc" id="calcOffset">
      <div class="calc-h">Offset</div>
      <label>Depth <input data-k="h" value="4"></label>
      <label>Angle <select data-k="a">${OFFSET_TABLE.map(r => `<option value="${r.angle}" ${r.angle === 30 ? 'selected' : ''}>${r.angle}°</option>`).join('')}</select></label>
      <label>Distance to obstruction <input data-k="x" value="30"></label>
      <div class="out"></div>
    </div>
    <div class="calc" id="calcSaddle3">
      <div class="calc-h">3-point saddle</div>
      <label>Obstruction height (OD) <input data-k="h" value="2"></label>
      <label>Distance to center <input data-k="x" value="40"></label>
      <div class="out"></div>
    </div>
    <div class="calc" id="calcSaddle4">
      <div class="calc-h">4-point saddle</div>
      <label>Height <input data-k="h" value="3"></label>
      <label>Width <input data-k="w" value="8"></label>
      <label>Distance to obstruction <input data-k="x" value="30"></label>
      <label>Angle <select data-k="a">${OFFSET_TABLE.map(r => `<option value="${r.angle}" ${r.angle === 22.5 ? 'selected' : ''}>${r.angle}°</option>`).join('')}</select></label>
      <div class="out"></div>
    </div>
    <div class="calc" id="calcRoll">
      <div class="calc-h">Rolling offset</div>
      <label>Rise <input data-k="rise" value="6"></label>
      <label>Roll <input data-k="roll" value="8"></label>
      <label>Angle <select data-k="a">${OFFSET_TABLE.map(r => `<option value="${r.angle}" ${r.angle === 30 ? 'selected' : ''}>${r.angle}°</option>`).join('')}</select></label>
      <div class="out"></div>
    </div>
    <div class="calc" id="calcCut">
      <div class="calc-h">Cut length with two 90s</div>
      <label>Leg 1 (to back) <input data-k="l1" value="12"></label>
      <label>Middle (back to back) <input data-k="l2" value="36"></label>
      <label>Leg 3 (to back) <input data-k="l3" value="12"></label>
      <div class="out"></div>
    </div>
  `;
  const gain = 2 * b.takeUp - Math.PI * b.R / 2;
  const get = (box) => Object.fromEntries([...box.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.tagName === 'SELECT' ? parseFloat(i.value) : parseInches(i.value)]));
  const row = (a) => OFFSET_TABLE.find(r => r.angle === a);
  const calcs = {
    calcStub: (v) => `Mark at <b>${fmtIn(v.h - b.deduct)}</b> from the end and put it on the ${b.type === 'hand' ? 'arrow' : 'hook edge'}.`,
    calcOffset: (v) => {
      const r = row(v.a), d = v.h * r.mult, s = v.h * r.shrink;
      return `Between bends: <b>${fmtIn(d)}</b> · Shrink: <b>${fmtIn(s)}</b><br>Mark 2 = ${fmtIn(v.x)} + ${fmtIn(s)} = <b>${fmtIn(v.x + s)}</b>; Mark 1 = <b>${fmtIn(v.x + s - d)}</b>`;
    },
    calcSaddle3: (v) => {
      const s = v.h * 3 / 16, c = v.x + s;
      return `Center mark: <b>${fmtIn(c)}</b> (rim notch, 45°)<br>Outer marks: <b>${fmtIn(c - 2.5 * v.h)}</b> and <b>${fmtIn(c + 2.5 * v.h)}</b> (22½°)`;
    },
    calcSaddle4: (v) => {
      const r = row(v.a), d = v.h * r.mult, s = v.h * r.shrink;
      const m2 = v.x + s;
      return `Marks: <b>${fmtIn(m2 - d)}</b>, <b>${fmtIn(m2)}</b>, <b>${fmtIn(m2 + v.w)}</b>, <b>${fmtIn(m2 + v.w + d)}</b><br>Total shrink ≈ ${fmtIn(2 * s)}`;
    },
    calcRoll: (v) => {
      const t = Math.hypot(v.rise, v.roll), r = row(v.a);
      return `True offset: <b>${fmtIn(t)}</b> · Between bends: <b>${fmtIn(t * r.mult)}</b> · Shrink: <b>${fmtIn(t * r.shrink)}</b>`;
    },
    calcCut: (v) => `Gain per 90: ${fmtIn(gain)}<br>Developed length = ${fmtIn(v.l1 + v.l2 + v.l3)} − 2 × ${fmtIn(gain)} = <b>${fmtIn(v.l1 + v.l2 + v.l3 - 2 * gain)}</b>`,
  };
  for (const [id, fn] of Object.entries(calcs)) {
    const box = el.querySelector('#' + id);
    const upd = () => { const v = get(box); box.querySelector('.out').innerHTML = Object.values(v).some(isNaN) ? 'Enter a number (fractions OK, e.g. 12-3/8)' : fn(v); };
    box.addEventListener('input', upd); upd();
  }
}

// ---------------- Fill tab ----------------
export function renderFill(el, size) {
  el.innerHTML = `
    <h3>Conduit fill (NEC Chapter 9)</h3>
    <p class="small">Table 1 limits: <b>1 conductor 53%</b>, <b>2 conductors 31%</b>, <b>3 or more conductors 40%</b>. Nipples of 24" or less may be filled to 60%. Conductor areas come from Table 5 (THHN/THWN-2) and EMT areas from Table 4.</p>
    <div class="calc">
      <label>EMT size <select id="fillSize">${SIZES.map(s => `<option ${s === size ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <div id="fillRows"></div>
      <button id="fillAdd" class="btn small">+ Add conductors</button>
      <div class="out" id="fillOut"></div>
      <canvas id="fillCanvas" width="260" height="260"></canvas>
    </div>
    <h4>EMT internal area (Table 4)</h4>
    <table class="grid"><tr><th>Size</th><th>ID</th><th>100%</th><th>40%</th><th>31%</th><th>53%</th></tr>
      ${SIZES.map(s => `<tr><td>${s}"</td><td>${EMT[s].id}</td><td>${EMT[s].area}</td><td>${EMT[s].area40}</td><td>${EMT[s].area31}</td><td>${EMT[s].area53}</td></tr>`).join('')}
    </table>
    <h4>Max THHN conductors, same size (40%)</h4>
    <table class="grid"><tr><th>AWG</th>${SIZES.map(s => `<th>${s}"</th>`).join('')}</tr>
      ${THHN.slice(0, 13).map(([w, a]) => `<tr><td>${w}</td>${SIZES.map(s => `<td>${Math.floor(EMT[s].area40 / a + 1e-9)}</td>`).join('')}</tr>`).join('')}
    </table>
    <p class="muted small">Counts are worked out from Table 4 and Table 5. Annex C allows rounding up when the decimal is 0.8 or more for conductors of the same size, so Annex C tables can show one more. Your AHJ's adopted code edition governs.</p>
  `;
  const rows = el.querySelector('#fillRows');
  const addRow = (w = '12', q = 3) => {
    const d = document.createElement('div'); d.className = 'fill-row';
    d.innerHTML = `<input type="number" min="1" value="${q}" class="q"> × <select class="w">${THHN.map(([n]) => `<option ${n === w ? 'selected' : ''}>${n}</option>`).join('')}</select> THHN <button class="x" title="remove">✕</button>`;
    d.querySelector('.x').onclick = () => { d.remove(); calc(); };
    rows.appendChild(d);
  };
  const calc = () => {
    const s = el.querySelector('#fillSize').value;
    const list = [...rows.querySelectorAll('.fill-row')].map(r => ({ w: r.querySelector('.w').value, q: Math.max(0, parseInt(r.querySelector('.q').value) || 0) }));
    const n = list.reduce((a, b) => a + b.q, 0);
    const area = list.reduce((a, b) => a + b.q * THHN.find(t => t[0] === b.w)[1], 0);
    const limitPct = n === 1 ? 53 : n === 2 ? 31 : 40;
    const allowed = EMT[s].area * limitPct / 100;
    const pct = area / EMT[s].area * 100;
    const ok = area <= allowed + 1e-9;
    let jam = '';
    if (n === 3 && list.filter(x => x.q > 0).length === 1) {
      const ratio = EMT[s].id / THHN_DIA[list.find(x => x.q > 0).w];
      jam = `<br>Jam ratio (ID ÷ conductor OD) = ${ratio.toFixed(2)} ${ratio >= 2.8 && ratio <= 3.2 ? '<span class="bad">⚠ 2.8–3.2: the conductors can jam in the pull</span>' : '<span class="good">OK</span>'}`;
    }
    el.querySelector('#fillOut').innerHTML = n === 0 ? 'Add conductors.' :
      `${n} conductor${n > 1 ? 's' : ''}: ${area.toFixed(4)} in² of ${EMT[s].area} in² = <b>${pct.toFixed(1)}%</b><br>
       Allowed (${limitPct}%): ${allowed.toFixed(3)} in² → ${ok ? '<span class="good">✔ Complies</span>' : '<span class="bad">✖ Over fill: use a larger conduit</span>'}${jam}`;
    drawFill(el.querySelector('#fillCanvas'), EMT[s], list);
  };
  addRow('12', 3); addRow('12', 1);
  el.querySelector('#fillAdd').onclick = () => { addRow('12', 1); calc(); };
  el.addEventListener('input', calc); el.addEventListener('change', calc);
  calc();
}

// Simple packing picture of the conductors in the conduit cross-section.
function drawFill(cv, e, list) {
  const ctx = cv.getContext('2d');
  const W = cv.width, c = W / 2, scale = (W * 0.46) / (e.od / 2);
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = '#c9ced3'; ctx.beginPath(); ctx.arc(c, c, e.od / 2 * scale, 0, 7); ctx.fill();
  ctx.fillStyle = '#0a1020'; ctx.beginPath(); ctx.arc(c, c, e.id / 2 * scale, 0, 7); ctx.fill();
  const wires = [];
  for (const it of list) for (let i = 0; i < it.q; i++) wires.push(THHN_DIA[it.w] / 2);
  wires.sort((a, b) => b - a);
  const colors = ['#111', '#d22', '#26c', '#eee', '#2a2', '#e8c000'];
  const placed = [];
  const Rin = e.id / 2;
  for (let i = 0; i < wires.length; i++) {
    const wr = wires[i];
    let best = null;
    for (let k = 0; k < 4000 && !best; k++) {
      // search from bottom up (gravity)
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * (Rin - wr);
      const x = rad * Math.cos(ang), y = rad * Math.sin(ang);
      if (placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + wr - 1e-4)) best = { x, y, r: wr };
    }
    if (best) placed.push(best);
  }
  placed.forEach((p, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath(); ctx.arc(c + p.x * scale, c - p.y * scale, p.r * scale, 0, 7); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#b87333'; ctx.beginPath(); ctx.arc(c + p.x * scale, c - p.y * scale, p.r * scale * 0.55, 0, 7); ctx.fill();
  });
  if (placed.length < wires.length) {
    ctx.fillStyle = '#ff5a6a'; ctx.font = 'bold 13px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${wires.length - placed.length} won't fit`, c, W - 6);
  }
}

// ---------------- Support tab ----------------
export function renderSupport(el, size) {
  el.innerHTML = `
    <h3>Securing & supporting EMT (NEC Article 358)</h3>
    <ul class="tight">
      <li><b>358.30(A) Securely fastened:</b> within <b>3 ft</b> of each outlet box, junction box, device box, cabinet, conduit body or other termination. Where structural members don't readily allow it, this may be up to <b>5 ft</b>.</li>
      <li><b>358.30(A) Intervals:</b> fastened at least every <b>10 ft</b>.</li>
      <li><b>358.30(B) Supports:</b> horizontal runs supported by openings through framing members at intervals of 10 ft or less, and securely fastened within 3 ft of terminations, are permitted.</li>
      <li><b>358.24 Bends, how made:</b> without damaging the tubing or effectively reducing its internal diameter. Radius not less than Chapter 9, Table 2.</li>
      <li><b>358.26 Number of bends:</b> no more than the equivalent of four quarter bends (<b>360° total</b>) between pull points, such as boxes and conduit bodies.</li>
      <li><b>358.28 Reaming & threading:</b> cut ends must be reamed or finished to remove rough edges. EMT must not be threaded.</li>
      <li><b>358.42 Couplings & connectors:</b> must be made up tight. Use concrete-tight or raintight fittings where required.</li>
    </ul>
    <p class="small">For comparison, rigid metal conduit (RMC) with threaded couplings may be supported every <b>${RMC_SUPPORT[size]} ft</b> in ${size}" trade size (344.30(B)(2)), but EMT stays at 10 ft for every size.</p>
    <h4>Strap layout planner</h4>
    <div class="calc">
      <label>Run length between boxes (ft) <input id="supLen" value="27"></label>
      <label>Total bend degrees in the run <input id="supDeg" value="180"></label>
      <div class="out" id="supOut"></div>
      <svg id="supSvg" viewBox="0 0 300 90" width="100%"></svg>
    </div>
    <h4>Running conduit: good practice</h4>
    <ul class="tight">
      <li>Measure, then mark with a fine pencil or marker <b>all the way around</b> the conduit so the mark is visible from any side.</li>
      <li>Use the printed stripe (manufacturer's label) as a roll reference. Every bend in one plane should keep the stripe in the same place, so you avoid dog-legs.</li>
      <li>Sight down the conduit after each bend. Fix a dog-leg by twisting it back in the bender, not on the wall.</li>
      <li>Cut square, ream every cut, and tighten every set-screw or compression fitting.</li>
      <li>Kick out of boxes with a box offset (about ½" depth) so the conduit sits flat on the wall.</li>
    </ul>
  `;
  const upd = () => {
    const L = parseFloat(el.querySelector('#supLen').value) || 0;
    const deg = parseFloat(el.querySelector('#supDeg').value) || 0;
    const straps = [];
    if (L > 0) {
      const first = Math.min(3, L / 2), last = Math.max(L - 3, L / 2);
      straps.push(first);
      if (last - first > 0.01) {
        const n = Math.ceil((last - first) / 10 - 1e-9);
        for (let i = 1; i <= n; i++) straps.push(first + (last - first) * i / n);
      }
    }
    el.querySelector('#supOut').innerHTML = `Minimum straps: <b>${straps.length}</b> at ${straps.map(s => s.toFixed(1) + ' ft').join(', ')}<br>` +
      (deg > 360 ? `<span class="bad">✖ ${deg}° of bends: more than 360°. Add a pull point (box or conduit body).</span>` : `<span class="good">✔ ${deg}° of bends (≤ 360°)</span>`);
    const svg = el.querySelector('#supSvg');
    const x = (ft) => 20 + (L ? ft / L : 0) * 260;
    let s = `<rect x="4" y="30" width="16" height="30" fill="#2a3858" stroke="#5a6d92"/><rect x="280" y="30" width="16" height="30" fill="#2a3858" stroke="#5a6d92"/>
             <line x1="20" y1="45" x2="280" y2="45" stroke="#cfd4d8" stroke-width="6"/>`;
    for (const st of straps) s += `<rect x="${x(st) - 3}" y="38" width="6" height="14" fill="#3f86ff"/><text x="${x(st)}" y="72" font-size="9" text-anchor="middle" fill="#9fb2cc">${st.toFixed(1)}'</text>`;
    s += `<text x="12" y="22" font-size="9" fill="#9fb2cc">BOX</text><text x="288" y="22" font-size="9" text-anchor="middle" fill="#9fb2cc">BOX</text>`;
    svg.innerHTML = s;
  };
  el.addEventListener('input', upd); upd();
}

export function renderSources(el) {
  const src = [
    ['QuickBend: bender marks and hand-bender deducts', 'https://bhardman1986.github.io/quickbend-docs/docs/benders'],
    ['Greenlee 854 manual: EMT deduct table and bending instructions', 'https://www.manualslib.com/manual/271986/Greenlee-854.html?page=12'],
    ['Greenlee 777 manual: laying out offset bends', 'https://www.manualslib.com/manual/1893545/Greenlee-777.html?page=8'],
    ['Greenlee Site-Rite 840A: offset chart', 'https://www.manualslib.fr/manual/433007/Greenlee-Site-Rite-840A.html?page=6'],
    ['Klein 56207 3/4" EMT aluminum bender', 'https://kleintools.com/product/56207'],
    ['Gardner Bender: hand bender how-to guide', 'https://www.gardnerbender.com/-/media/inriver/GAR_BRO_032_1220_Hand%20Bender%20How%20To%20Guide.pdf'],
    ['Geometry for conduit bending', 'https://expertce.com/learn-articles/geometry-for-conduit-bending/'],
    ['Steel Tube Institute: NEC conduit and EMT fill tables', 'https://steeltubeinstitute.org/resources/nec-conduit-and-emt-fill-tables/'],
    ['EC&M: rules for securing and supporting raceways', 'https://www.ecmweb.com/national-electrical-code/qa/article/20898549/stumped-by-the-code-rules-for-securing-and-supporting-raceways'],
    ['EC&M: the apprentice\'s guide to EMT', 'https://www.ecmweb.com/training/article/21177704/the-apprentices-guide-to-electrical-metallic-tubing'],
  ];
  el.innerHTML = `<h3>Sources</h3><ul class="tight">${src.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('')}</ul>
  <p class="small muted">The code references follow the NEC (NFPA 70) as summarized in these sources. Check the edition your jurisdiction has adopted. Bender values vary by manufacturer, so always use the chart on your own tool.</p>
  <h4>How the simulation works</h4>
  <p class="small">The conduit is modeled as an exact centerline made of straight legs and circular arcs at the bender's centerline radius. A mark sits at a real distance along the tube. Where you place the mark on the bender decides where the arc forms, and rolling the conduit decides which way it bends. The hand bender rolls along the floor leg just as it does in real life, so measurements on the finished piece are true geometry and not a lookup.</p>`;
}
