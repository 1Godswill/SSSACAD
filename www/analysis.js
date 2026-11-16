/* ================= ANALYSIS TAB (v3.13.0) =================
   Performance analysis for the open class, for any Term or the Annual view:
     - Snapshot (pupils scored, class average, highest, lowest, pass rate)
     - Male vs Female (average, highest, lowest, pass rate, grade spread, top pupil)
     - Subject by subject (class average, pass rate, boys vs girls, gap)
     - Pupil ranking against the class average
     - Head-to-head: any two pupils, subject by subject
     - Progress across the three terms (by gender and per pupil)
   Everything is READ from the app's own calculation functions (averageFor, grandTotalFor,
   subjectRowFor, classMembers ...), so the numbers always match the Class Report, Report Card
   and Broadsheet. Nothing is stored; nothing here changes any data. */

let analysisState = { term: "1", a: "", b: "" };

const AN_BOY = "#2f6feb", AN_GIRL = "#d6458a";
const AN_GRADE_COLORS = { A: "#1fa971", B: "#6bcf8e", C: "#f2c94c", D: "#f2994a", E: "#eb6b5a", F: "#c0392b" };
const AN_PASS = 50;      // average of 50 and above = pass (grade D and up)
const AN_STRONG = 70;    // grade A–B

function anInjectStyle() {
  if (document.getElementById("anStyle")) return;
  const st = document.createElement("style");
  st.id = "anStyle";
  st.textContent = `
    .an-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
    .an-tile{background:var(--brand-light);border-radius:12px;padding:10px 12px;min-width:0;}
    .an-tile b{display:block;font-size:20px;color:var(--navy);}
    .an-tile span{display:block;font-size:11px;color:var(--muted);}
    .an-tile small{display:block;font-size:11px;color:var(--text);margin-top:2px;overflow-wrap:anywhere;}
    .an-t{width:100%;border-collapse:collapse;font-size:13px;}
    .an-t th,.an-t td{padding:7px 6px;border-bottom:1px solid var(--border);text-align:center;}
    .an-t th:first-child,.an-t td:first-child{text-align:left;}
    .an-t th{font-size:11.5px;color:var(--muted);}
    .an-boy{color:${AN_BOY};} .an-girl{color:${AN_GIRL};}
    .an-win{font-weight:800;}
    .an-track{height:10px;background:#e9eef7;border-radius:6px;position:relative;}
    .an-fill{height:100%;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .an-mark{position:absolute;top:-3px;bottom:-3px;width:2px;background:#16233d;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .an-stack{display:flex;height:16px;border-radius:6px;overflow:hidden;background:#e9eef7;}
    .an-stack i{display:block;height:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .an-leg{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--muted);margin:6px 0 2px;}
    .an-leg span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;background:var(--c);vertical-align:-1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .an-rank{display:grid;grid-template-columns:28px minmax(0,1fr) 54px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px dashed var(--border);}
    .an-rank .n{font-weight:800;color:var(--muted);font-size:13px;text-align:center;}
    .an-rank .nm{font-size:13px;font-weight:700;margin-bottom:4px;overflow-wrap:anywhere;}
    .an-rank .v{text-align:right;font-size:13px;font-weight:800;}
    .an-rank .v small{display:block;font-size:10.5px;font-weight:700;}
    .an-up{color:#1fa971;} .an-down{color:#c0392b;}
    .an-ins{margin:0;padding-left:18px;font-size:13px;line-height:1.5;}
    .an-ins li{margin-bottom:5px;}
    .an-ins li,.an-rec .t{text-transform:none;}
    .an-rec{border-left:4px solid var(--c);background:var(--bg2);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:13px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .an-rec b{display:block;font-size:11px;letter-spacing:.3px;color:var(--c);margin-bottom:2px;}
    .an-rec.high{--c:#c0392b;--bg2:#fdecea;} .an-rec.med{--c:#d9822b;--bg2:#fff4e5;} .an-rec.info{--c:#2f6feb;--bg2:#e9f1fd;}
    .an-link{background:none;border:none;color:var(--brand);font-weight:800;padding:0;text-align:left;text-transform:inherit;font-size:inherit;}
    .an-lbl{display:flex;justify-content:space-between;font-size:12.5px;margin:8px 0 3px;font-weight:700;}
  `;
  document.head.appendChild(st);
}

/* ---------- small helpers ---------- */
function anR1(n) { return Math.round(n * 10) / 10; }
function anMean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function anGender(s) { return s && (s.gender === "M" || s.gender === "F") ? s.gender : ""; }
function anBar(pct, color) {
  return `<div class="an-track"><div class="an-fill" style="width:${Math.max(0, Math.min(100, pct))}%;background:${color};"></div></div>`;
}
function anSign(n) { const v = anR1(n); return (v > 0 ? "+" : "") + v.toFixed(1); }
function anClassName(classId) { const c = loadClasses().find((x) => x.id === classId); return c ? c.name : ""; }

/* ---------- calculations ---------- */
function anGroup(rows) {
  const g = { n: rows.length, avg: 0, max: 0, min: 0, pass: 0, strong: 0, grades: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }, top: null };
  if (!rows.length) return g;
  const avgs = rows.map((r) => r.avg);
  g.avg = anMean(avgs);
  g.max = Math.max.apply(null, avgs);
  g.min = Math.min.apply(null, avgs);
  g.pass = rows.filter((r) => r.avg >= AN_PASS).length / rows.length * 100;
  g.strong = rows.filter((r) => r.avg >= AN_STRONG).length / rows.length * 100;
  rows.forEach((r) => { g.grades[gradeFor(anR1(r.avg))]++; });
  g.top = rows.reduce((best, r) => (!best || r.avg > best.avg ? r : best), null);
  return g;
}

function anCollect(classId, term) {
  const students = classMembers(classId, term);
  const subjects = subjectsForClass(classId);
  const rows = [];
  students.forEach((s) => {
    const gt = grandTotalFor(classId, term, s.id, students);
    if (!gt.hasAny) return;
    rows.push({ student: s, gender: anGender(s), avg: averageFor(classId, term, s.id, students), position: gt.position, total: gt.total });
  });
  rows.sort((a, b) => b.avg - a.avg);
  const boys = rows.filter((r) => r.gender === "M");
  const girls = rows.filter((r) => r.gender === "F");
  const all = anGroup(rows);
  const classAvg = all.avg;
  rows.forEach((r) => { r.vs = r.avg - classAvg; });

  const subjectRows = subjects.map((subj) => {
    const v = { all: [], M: [], F: [] };
    students.forEach((s) => {
      const r = subjectRowFor(classId, term, subj, s.id, students);
      if (!r.hasAny) return;
      v.all.push(r.total);
      const g = anGender(s);
      if (g) v[g].push(r.total);
    });
    return {
      name: subj, n: v.all.length, allVals: v.all, mVals: v.M, fVals: v.F,
      avg: anMean(v.all),
      pass: v.all.length ? v.all.filter((x) => x >= AN_PASS).length / v.all.length * 100 : 0,
      nM: v.M.length, nF: v.F.length,
      m: v.M.length ? anMean(v.M) : null,
      f: v.F.length ? anMean(v.F) : null,
    };
  }).filter((r) => r.n > 0);

  const d = { classId: classId, term: term, students: students, rows: rows, all: all, boys: anGroup(boys), girls: anGroup(girls),
    noGender: rows.filter((r) => !r.gender).length, subjects: subjectRows };
  d.insights = anInsights(d);
  return d;
}

function anProgress(classId) {
  const base = studentsInClass(classId);
  const perTerm = TERMS.map((t) => {
    const mem = classMembers(classId, t);
    const m = {};
    mem.forEach((s) => {
      const gt = grandTotalFor(classId, t, s.id, mem);
      m[s.id] = gt.hasAny ? averageFor(classId, t, s.id, mem) : null;
    });
    return m;
  });
  const pupils = base.map((s) => {
    const v = perTerm.map((m) => (m[s.id] === undefined ? null : m[s.id]));
    const got = v.filter((x) => x !== null);
    return { student: s, gender: anGender(s), v: v, change: got.length >= 2 ? got[got.length - 1] - got[0] : null };
  });
  const trend = TERMS.map((t, i) => {
    const pick = (g) => pupils.filter((p) => (!g || p.gender === g) && p.v[i] !== null).map((p) => p.v[i]);
    const b = pick("M"), gl = pick("F"), all = pick("");
    return { term: t, m: b.length ? anMean(b) : null, f: gl.length ? anMean(gl) : null, all: all.length ? anMean(all) : null };
  });
  return { pupils: pupils, trend: trend };
}

function anInsights(d) {
  const out = [];
  if (!d.rows.length) return ["No scores have been entered for this view yet."];
  const M = d.boys, F = d.girls;
  if (M.n && F.n) {
    const gap = F.avg - M.avg;
    if (Math.abs(gap) < 1) out.push(`Boys and girls are doing about the same: ${M.avg.toFixed(1)} against ${F.avg.toFixed(1)} (less than 1 point apart).`);
    else out.push(`${gap > 0 ? "Girls" : "Boys"} lead on average by ${Math.abs(gap).toFixed(1)} points (girls ${F.avg.toFixed(1)}, boys ${M.avg.toFixed(1)}).`);
    out.push(`${Math.round(F.pass)}% of girls and ${Math.round(M.pass)}% of boys have an average of ${AN_PASS} or more.`);
    if (Math.min(M.n, F.n) < 5) out.push(`Only ${M.n} boy${M.n === 1 ? "" : "s"} and ${F.n} girl${F.n === 1 ? "" : "s"} have scores, so treat the difference with care. A few pupils can swing the average.`);
  } else {
    out.push("The boys-against-girls comparison needs scored pupils of both genders. Set each pupil's gender on the Students tab.");
  }
  if (d.noGender) out.push(`${d.noGender} scored pupil${d.noGender === 1 ? " has" : "s have"} no gender set and ${d.noGender === 1 ? "is" : "are"} left out of the boys and girls figures.`);
  const top = d.rows[0];
  out.push(`${top.student.name} leads the class with an average of ${top.avg.toFixed(1)}.`);
  if (d.subjects.length) {
    const best = d.subjects.reduce((a, b) => (b.avg > a.avg ? b : a));
    const worst = d.subjects.reduce((a, b) => (b.avg < a.avg ? b : a));
    if (best !== worst) out.push(`Strongest subject: ${best.name} (class average ${best.avg.toFixed(1)}). Weakest: ${worst.name} (${worst.avg.toFixed(1)}).`);
    const both = d.subjects.filter((s) => s.m !== null && s.f !== null);
    if (both.length) {
      const big = both.reduce((a, b) => (Math.abs(b.f - b.m) > Math.abs(a.f - a.m) ? b : a));
      const gp = big.f - big.m;
      if (Math.abs(gp) >= 1) out.push(`Biggest gender gap: ${big.name}, where ${gp > 0 ? "girls" : "boys"} are ahead by ${Math.abs(gp).toFixed(1)} points.`);
    }
  }
  return out;
}

/* ---------- sheets (used by Excel export and print) ---------- */
/* ---------- recommendations ----------
   Rule-based and read-only: each one is triggered by the numbers above and says WHY, so a teacher
   can judge it. They are prompts for follow-up, not verdicts. level: high | med | info */
function anNames(rows, n, fmt) {
  n = n || 6;
  const shown = rows.slice(0, n).map(fmt || ((r) => `${r.student.name} (${r.avg.toFixed(1)})`));
  return shown.join(", ") + (rows.length > n ? ` and ${rows.length - n} more` : "");
}
function anRecentChange(p, term) {
  // change since the previous term (Term 2/3), or first-to-latest for the Annual view
  if (term === "A") return p.change;
  const i = TERMS.indexOf(term);
  if (i < 1) return null;
  const now = p.v[i], before = p.v[i - 1];
  return now !== null && before !== null ? now - before : null;
}
function anRecommendations(d, prog) {
  const out = [];
  const add = (level, title, text) => out.push({ level: level, title: title, text: text });
  if (!d.rows.length) return out;
  const low = d.rows.filter((r) => r.avg < AN_PASS).slice().reverse();      // weakest first
  const veryLow = low.filter((r) => r.avg < 40);
  if (low.length) add("high", "Pupils below the pass mark",
    `${low.length} pupil${low.length === 1 ? " is" : "s are"} under ${AN_PASS}${veryLow.length ? `, ${veryLow.length} of them under 40` : ""}: ${anNames(low, 8)}. Consider extra lessons or a parent meeting, and check their scores were entered correctly.`);
  const near = d.rows.filter((r) => r.avg >= AN_PASS && r.avg < AN_PASS + 5).slice().reverse();
  if (near.length) add("med", "Close to the pass mark",
    `${near.length} pupil${near.length === 1 ? " is" : "s are"} within 5 points above the pass mark: ${anNames(near, 6)}. A small dip could take them under, so keep an eye on them.`);

  const chg = prog.pupils.map((p) => ({ p: p, c: anRecentChange(p, d.term) })).filter((x) => x.c !== null);
  const drops = chg.filter((x) => x.c <= -5).sort((a, b) => a.c - b.c);
  const gains = chg.filter((x) => x.c >= 5).sort((a, b) => b.c - a.c);
  const cName = (x) => `${x.p.student.name} (${anSign(x.c)})`;
  const basis = d.term === "A" ? "from their first to latest scored term" : "since the previous term";
  if (drops.length) add("med", "Pupils whose results dropped",
    `${drops.length} pupil${drops.length === 1 ? "" : "s"} fell by 5 points or more ${basis}: ${drops.slice(0, 6).map(cName).join(", ")}${drops.length > 6 ? ` and ${drops.length - 6} more` : ""}. Find out what changed (attendance, health, home, missed tests).`);
  if (gains.length) add("info", "Pupils who improved",
    `${gains.length} pupil${gains.length === 1 ? "" : "s"} rose by 5 points or more ${basis}: ${gains.slice(0, 6).map(cName).join(", ")}${gains.length > 6 ? ` and ${gains.length - 6} more` : ""}. Worth recognising.`);

  const weak = d.subjects.filter((s) => s.avg < AN_PASS || s.pass < 60).sort((a, b) => a.avg - b.avg);
  if (weak.length) add("high", "Subjects that need attention",
    weak.slice(0, 4).map((s) => `${s.name}: class average ${s.avg.toFixed(1)}, ${Math.round(s.pass)}% at ${AN_PASS}+`).join("; ") + ". Consider revision or remedial lessons, and look at whether the test or exam was too hard.");
  const gapSub = d.subjects.filter((s) => s.avg >= AN_PASS && s.pass >= 60 && s.avg < d.all.avg - 8);
  if (gapSub.length) add("med", "Well below the class's usual level",
    gapSub.map((s) => `${s.name} (${s.avg.toFixed(1)} against a class average of ${d.all.avg.toFixed(1)})`).join("; ") + ".");

  const M = d.boys, F = d.girls;
  if (M.n && F.n) {
    const gap = F.avg - M.avg, small = Math.min(M.n, F.n) < 5;
    if (Math.abs(gap) >= 5 && !small) add("med", "Gap between boys and girls",
      `${gap > 0 ? "Girls" : "Boys"} are ahead by ${Math.abs(gap).toFixed(1)} points overall. Check which subjects drive it (see Subject by Subject) and whether the ${gap > 0 ? "boys" : "girls"} need more encouragement or support in those subjects.`);
    else if (Math.abs(gap) >= 5) add("info", "Gap between boys and girls (small groups)",
      `${gap > 0 ? "Girls" : "Boys"} are ahead by ${Math.abs(gap).toFixed(1)} points, but with only ${M.n} boy${M.n === 1 ? "" : "s"} and ${F.n} girl${F.n === 1 ? "" : "s"} this may be chance. Watch it over more terms before acting.`);
    const sg = d.subjects.filter((s) => s.m !== null && s.f !== null && s.nM >= 3 && s.nF >= 3 && Math.abs(s.f - s.m) >= 7)
      .sort((a, b) => Math.abs(b.f - b.m) - Math.abs(a.f - a.m));
    if (sg.length) add("med", "Subjects with a large gender gap",
      sg.slice(0, 4).map((s) => `${s.name} (${s.f > s.m ? "girls" : "boys"} ahead by ${Math.abs(s.f - s.m).toFixed(1)})`).join("; ") + ". Mixed seating, group work or extra practice for the lower-scoring group may help.");
  }

  const unscored = d.students.filter((s) => !d.rows.some((r) => r.student.id === s.id));
  if (unscored.length) add("info", "Pupils with no scores",
    `${unscored.length} pupil${unscored.length === 1 ? " has" : "s have"} no scores for ${termLabel(d.term)}: ${unscored.slice(0, 8).map((s) => s.name).join(", ")}${unscored.length > 8 ? ` and ${unscored.length - 8} more` : ""}. They are left out of every figure here until scores are entered.`);
  const thin = d.subjects.filter((s) => s.n < d.rows.length * 0.8);
  if (thin.length) add("info", "Scores that may be missing",
    thin.slice(0, 5).map((s) => `${s.name} (${s.n} of ${d.rows.length} pupils scored)`).join("; ") + ". If everyone takes these, some entries are missing.");

  const top = d.rows.slice(0, 3);
  add("info", "Top performers", `${anNames(top, 3)}. Consider recognition and harder work to keep them stretched.`);
  return out;
}

function anRecsHtml(recs, title) {
  if (!recs.length) return "";
  const lab = { high: "High priority", med: "Keep an eye on", info: "For information" };
  return `<div class="card"><h2>${title || "Recommendations"}</h2>
    <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 8px;">Suggestions worked out from the scores. Use your own knowledge of the pupils to decide what to do.</p>
    ${recs.map((r) => `<div class="an-rec ${r.level}"><b>${lab[r.level]} — ${esc(r.title)}</b><span class="t">${esc(r.text)}</span></div>`).join("")}</div>`;
}

/* ---------- whole school (all classes) ---------- */
function anSchool(term) {
  const classes = (typeof sortedClasses === "function" ? sortedClasses() : loadClasses());
  const list = classes.map((c) => ({ cls: c, d: anCollect(c.id, term), prog: anProgress(c.id) }));
  const rows = [];
  list.forEach((x) => x.d.rows.forEach((r) => rows.push(Object.assign({}, r, { className: x.cls.name, classId: x.cls.id }))));
  rows.sort((a, b) => b.avg - a.avg);
  const pool = {};
  list.forEach((x) => x.d.subjects.forEach((s) => {
    const m = pool[s.name] || (pool[s.name] = { name: s.name, classes: 0, all: [], M: [], F: [] });
    m.classes++;
    s.allVals.forEach((v) => m.all.push(v)); s.mVals.forEach((v) => m.M.push(v)); s.fVals.forEach((v) => m.F.push(v));
  }));
  const subjects = Object.keys(pool).map((k) => {
    const m = pool[k];
    return { name: m.name, classes: m.classes, n: m.all.length, nM: m.M.length, nF: m.F.length, avg: anMean(m.all),
      pass: m.all.length ? m.all.filter((x) => x >= AN_PASS).length / m.all.length * 100 : 0,
      m: m.M.length ? anMean(m.M) : null, f: m.F.length ? anMean(m.F) : null };
  }).sort((a, b) => a.avg - b.avg);
  const sc = {
    term: term, list: list, rows: rows, subjects: subjects,
    all: anGroup(rows), boys: anGroup(rows.filter((r) => r.gender === "M")), girls: anGroup(rows.filter((r) => r.gender === "F")),
    onRoll: list.reduce((a, x) => a + x.d.students.length, 0),
    scoredClasses: list.filter((x) => x.d.rows.length),
  };
  sc.classRows = sc.scoredClasses.map((x) => ({ cls: x.cls, n: x.d.rows.length, avg: x.d.all.avg, pass: x.d.all.pass,
    m: x.d.boys.n ? x.d.boys.avg : null, f: x.d.girls.n ? x.d.girls.avg : null, nM: x.d.boys.n, nF: x.d.girls.n, top: x.d.all.top }))
    .sort((a, b) => b.avg - a.avg);
  sc.recs = anSchoolRecs(sc);
  return sc;
}

function anSchoolRecs(sc) {
  const out = [];
  const add = (level, title, text) => out.push({ level: level, title: title, text: text });
  if (!sc.rows.length) return out;
  const weakCls = sc.classRows.filter((c) => c.pass < 70 || c.avg < AN_PASS).sort((a, b) => a.avg - b.avg);
  if (weakCls.length) add("high", "Classes that need support",
    weakCls.slice(0, 5).map((c) => `${c.cls.name}: average ${c.avg.toFixed(1)}, ${Math.round(c.pass)}% at ${AN_PASS}+`).join("; ") + ". Open the class for the pupils and subjects behind it.");
  const low = sc.rows.filter((r) => r.avg < AN_PASS);
  if (low.length) {
    const by = {};
    low.forEach((r) => { by[r.className] = (by[r.className] || 0) + 1; });
    const parts = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 6).map((k) => `${k} (${by[k]})`);
    add("high", "Pupils below the pass mark",
      `${low.length} of ${sc.rows.length} scored pupils (${Math.round(low.length / sc.rows.length * 100)}%) are under ${AN_PASS}. Most: ${parts.join(", ")}. See Pupils Needing Support below.`);
  }
  const drops = [];
  sc.list.forEach((x) => x.prog.pupils.forEach((p) => { const c = anRecentChange(p, sc.term); if (c !== null && c <= -5) drops.push({ name: p.student.name, cls: x.cls.name, c: c }); }));
  drops.sort((a, b) => a.c - b.c);
  if (drops.length) add("med", "Pupils whose results dropped",
    `${drops.length} pupil${drops.length === 1 ? "" : "s"} fell by 5 points or more ${sc.term === "A" ? "from first to latest term" : "since the previous term"}. Largest: ${drops.slice(0, 5).map((x) => `${x.name} – ${x.cls} (${anSign(x.c)})`).join(", ")}.`);
  const weak = sc.subjects.filter((s) => s.n >= 5 && (s.avg < AN_PASS || s.pass < 60));
  if (weak.length) add("high", "Subjects weak across the school",
    weak.slice(0, 5).map((s) => `${s.name}: average ${s.avg.toFixed(1)}, ${Math.round(s.pass)}% at ${AN_PASS}+ (${s.classes} class${s.classes === 1 ? "" : "es"})`).join("; ") + ". Consider revision, teaching support or a review of how it is assessed.");
  const M = sc.boys, F = sc.girls;
  if (M.n && F.n) {
    const gap = F.avg - M.avg;
    if (Math.abs(gap) >= 3) add("med", "Boys and girls across the school",
      `${gap > 0 ? "Girls" : "Boys"} average ${Math.abs(gap).toFixed(1)} points higher (girls ${F.avg.toFixed(1)}, boys ${M.avg.toFixed(1)}; ${F.n} girls, ${M.n} boys scored).`);
    else add("info", "Boys and girls across the school", `Boys (${M.avg.toFixed(1)}) and girls (${F.avg.toFixed(1)}) are close, with a gap of ${Math.abs(gap).toFixed(1)} points.`);
    const cg = sc.classRows.filter((c) => c.m !== null && c.f !== null && c.nM >= 5 && c.nF >= 5 && Math.abs(c.f - c.m) >= 5);
    if (cg.length) add("med", "Classes with a clear gender gap",
      cg.map((c) => `${c.cls.name} (${c.f > c.m ? "girls" : "boys"} ahead by ${Math.abs(c.f - c.m).toFixed(1)})`).join("; ") + ".");
    const sg = sc.subjects.filter((s) => s.m !== null && s.f !== null && s.nM >= 10 && s.nF >= 10 && Math.abs(s.f - s.m) >= 5)
      .sort((a, b) => Math.abs(b.f - b.m) - Math.abs(a.f - a.m));
    if (sg.length) add("med", "Subjects with a gender gap",
      sg.slice(0, 5).map((s) => `${s.name} (${s.f > s.m ? "girls" : "boys"} ahead by ${Math.abs(s.f - s.m).toFixed(1)})`).join("; ") + ".");
  }
  const none = sc.list.filter((x) => !x.d.rows.length && x.d.students.length);
  if (none.length) add("info", "Classes with no scores yet", `${none.map((x) => x.cls.name).join(", ")} ${none.length === 1 ? "has" : "have"} no scores for ${termLabel(sc.term)}, so ${none.length === 1 ? "it is" : "they are"} not in these figures.`);
  if (sc.classRows.length) {
    const best = sc.classRows[0];
    add("info", "Strongest results", `${best.cls.name} has the highest class average (${best.avg.toFixed(1)}). Top pupils in the school: ${sc.rows.slice(0, 3).map((r) => `${r.student.name} – ${r.className} (${r.avg.toFixed(1)})`).join(", ")}.`);
  }
  return out;
}

/* ---------- sheets (used by Excel export and print) ---------- */
function anSheets(d, prog) {
  const M = d.boys, F = d.girls;
  const f1 = (n) => (n ? anR1(n) : 0);
  const topName = (g) => (g.top ? `${g.top.student.name} (${g.top.avg.toFixed(1)})` : "–");
  return {
    gender: { headers: ["Measure", "Boys", "Girls"], rows: anGenderRows(M, F) },
    subjects: { headers: ["Subject", "Pupils", "Class Avg", `Pass % (${AN_PASS}+)`, "Boys Avg", "Girls Avg", "Gap (Girls − Boys)"],
      rows: d.subjects.map((s) => [s.name, s.n, anR1(s.avg), Math.round(s.pass), s.m === null ? "–" : anR1(s.m), s.f === null ? "–" : anR1(s.f),
        s.m !== null && s.f !== null ? anSign(s.f - s.m) : "–"]) },
    pupils: { headers: ["Position", "Pupil", "Gender", "Average", "Grade", "Vs Class Avg"],
      rows: d.rows.map((r) => [r.position, r.student.name, r.gender || "–", anR1(r.avg), gradeFor(anR1(r.avg)), anSign(r.vs)]) },
    progress: { headers: ["Pupil", "Gender", "Term 1", "Term 2", "Term 3", "Change"],
      rows: prog.pupils.filter((p) => p.v.some((x) => x !== null)).map((p) => [p.student.name, p.gender || "–",
        ...p.v.map((x) => (x === null ? "–" : anR1(x))), p.change === null ? "–" : anSign(p.change)]) },
    recs: { headers: ["Priority", "Topic", "Recommendation"], rows: anRecommendations(d, prog).map((r) => [anLevelLabel(r.level), r.title, r.text]) },
  };
}
function anLevelLabel(l) { return { high: "High priority", med: "Keep an eye on", info: "For information" }[l]; }
function anGenderRows(M, F) {
  const f1 = (n) => (n ? anR1(n) : 0);
  const topName = (g) => (g.top ? `${g.top.student.name} (${g.top.avg.toFixed(1)})` : "–");
  return [
    ["Pupils scored", M.n, F.n],
    ["Average", f1(M.avg), f1(F.avg)],
    ["Highest average", f1(M.max), f1(F.max)],
    ["Lowest average", f1(M.min), f1(F.min)],
    [`Pass rate (average ${AN_PASS}+) %`, Math.round(M.pass), Math.round(F.pass)],
    [`Grade A–B (average ${AN_STRONG}+) %`, Math.round(M.strong), Math.round(F.strong)],
    ["Grade A", M.grades.A, F.grades.A], ["Grade B", M.grades.B, F.grades.B], ["Grade C", M.grades.C, F.grades.C],
    ["Grade D", M.grades.D, F.grades.D], ["Grade E", M.grades.E, F.grades.E], ["Grade F", M.grades.F, F.grades.F],
    ["Top pupil", topName(M), topName(F)],
  ];
}
function anSchoolSheets(sc) {
  return {
    classes: { headers: ["Class", "Pupils Scored", "Average", `Pass % (${AN_PASS}+)`, "Boys Avg", "Girls Avg", "Gap (Girls − Boys)", "Top Pupil"],
      rows: sc.classRows.map((c) => [c.cls.name, c.n, anR1(c.avg), Math.round(c.pass), c.m === null ? "–" : anR1(c.m), c.f === null ? "–" : anR1(c.f),
        c.m !== null && c.f !== null ? anSign(c.f - c.m) : "–", c.top ? `${c.top.student.name} (${c.top.avg.toFixed(1)})` : "–"]) },
    gender: { headers: ["Measure", "Boys", "Girls"], rows: anGenderRows(sc.boys, sc.girls) },
    top: { headers: ["#", "Pupil", "Class", "Gender", "Average"],
      rows: sc.rows.slice(0, 20).map((r, i) => [i + 1, r.student.name, r.className, r.gender || "–", anR1(r.avg)]) },
    support: { headers: ["Pupil", "Class", "Gender", "Average"],
      rows: sc.rows.filter((r) => r.avg < AN_PASS).slice().reverse().map((r) => [r.student.name, r.className, r.gender || "–", anR1(r.avg)]) },
    subjects: { headers: ["Subject", "Classes", "Pupils", "Average", `Pass % (${AN_PASS}+)`, "Boys Avg", "Girls Avg", "Gap (Girls − Boys)"],
      rows: sc.subjects.map((s) => [s.name, s.classes, s.n, anR1(s.avg), Math.round(s.pass), s.m === null ? "–" : anR1(s.m), s.f === null ? "–" : anR1(s.f),
        s.m !== null && s.f !== null ? anSign(s.f - s.m) : "–"]) },
    recs: { headers: ["Priority", "Topic", "Recommendation"], rows: sc.recs.map((r) => [anLevelLabel(r.level), r.title, r.text]) },
  };
}

/* ---------- shared card pieces ---------- */
function anGenderCardHtml(M, F, title) {
  const bothSexes = M.n > 0 && F.n > 0;
  const win = (a, b) => (a === b ? ["", ""] : (a > b ? ["an-win", ""] : ["", "an-win"]));
  const gRow = (label, a, b, fmt, plain) => {
    const w = bothSexes && !plain ? win(a, b) : ["", ""];
    return `<tr><td>${label}</td><td class="an-boy ${w[0]}">${fmt(a)}</td><td class="an-girl ${w[1]}">${fmt(b)}</td></tr>`;
  };
  const one = (n) => (n ? n.toFixed(1) : "–"), pc = (n) => Math.round(n) + "%", whole = (n) => String(n);
  const stack = (g) => g.n ? `<div class="an-stack">${["A", "B", "C", "D", "E", "F"].map((k) =>
    g.grades[k] ? `<i style="width:${g.grades[k] / g.n * 100}%;background:${AN_GRADE_COLORS[k]};" title="${k}: ${g.grades[k]}"></i>` : "").join("")}</div>` : `<div class="empty" style="padding:4px 0;">No pupils</div>`;
  const gradeLine = (g) => ["A", "B", "C", "D", "E", "F"].map((k) => `${k}:${g.grades[k]}`).join("  ");
  const topCell = (g, cls) => g.top ? `${esc(g.top.student.name)}${g.top.className ? "<br><small>" + esc(g.top.className) + "</small>" : ""}<br><small>${g.top.avg.toFixed(1)}</small>` : "–";
  return `<div class="card">
      <h2>${title}</h2>
      <div class="an-lbl"><span class="an-boy">Boys average (${M.n})</span><span>${M.n ? M.avg.toFixed(1) : "–"}</span></div>
      ${anBar(M.avg, AN_BOY)}
      <div class="an-lbl"><span class="an-girl">Girls average (${F.n})</span><span>${F.n ? F.avg.toFixed(1) : "–"}</span></div>
      ${anBar(F.avg, AN_GIRL)}
      <div style="height:10px;"></div>
      <div class="subtable-wrap"><table class="an-t">
        <thead><tr><th>Measure</th><th class="an-boy">Boys</th><th class="an-girl">Girls</th></tr></thead>
        <tbody>
          ${gRow("Pupils scored", M.n, F.n, whole, true)}
          ${gRow("Average", M.avg, F.avg, one)}
          ${gRow("Highest average", M.max, F.max, one)}
          ${gRow("Lowest average", M.min, F.min, one)}
          ${gRow(`Pass rate (${AN_PASS}+)`, M.pass, F.pass, pc)}
          ${gRow(`Grade A–B (${AN_STRONG}+)`, M.strong, F.strong, pc)}
          <tr><td>Top pupil</td><td class="an-boy">${topCell(M)}</td><td class="an-girl">${topCell(F)}</td></tr>
        </tbody>
      </table></div>
      <h2 style="margin-top:16px;font-size:13px;">Grade spread</h2>
      <div class="an-lbl"><span class="an-boy">Boys</span><span style="font-weight:500;font-size:11px;">${gradeLine(M)}</span></div>
      ${stack(M)}
      <div class="an-lbl"><span class="an-girl">Girls</span><span style="font-weight:500;font-size:11px;">${gradeLine(F)}</span></div>
      ${stack(F)}
      <div class="an-leg">${["A", "B", "C", "D", "E", "F"].map((k) => `<span style="--c:${AN_GRADE_COLORS[k]}">${k}</span>`).join("")}</div>
    </div>`;
}
function anTermOptions(sel) {
  return [["1", "TERM 1"], ["2", "TERM 2"], ["3", "TERM 3"], ["A", "ANNUAL"]]
    .map((o) => `<option value="${o[0]}" ${sel === o[0] ? "selected" : ""}>${o[1]}</option>`).join("");
}

/* ---------- ONE CLASS: used by the class Analysis tab and by Admin > Performance ---------- */
function renderAnalysis() {
  anInjectStyle();
  const el = document.getElementById("analysis");
  if (!el) return;
  const classId = getCurrentClassId();
  if (!classId) { el.innerHTML = NO_CLASSES_HTML; return; }
  if (guardClassLock(el, classId)) return;
  el.innerHTML = `
    <div class="card">
      <h2>Performance Analysis</h2>
      <label>Select Term / View</label>
      <select id="anTerm">${anTermOptions(analysisState.term)}</select>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:8px 0 0;">Worked out from the scores already entered, so it always matches the Class Report and Report Card. Pass mark: an average of ${AN_PASS} or more. The whole school, and pupil-to-pupil comparison, are in Admin &gt; Performance.</p>
    </div>
    <div id="anBody"></div>
  `;
  const body = document.getElementById("anBody");
  document.getElementById("anTerm").addEventListener("change", (e) => {
    analysisState.term = e.target.value;
    anRenderClass(body, classId, analysisState);
  });
  anRenderClass(body, classId, analysisState);
}

function anRenderClass(host, classId, st, opts) {
  opts = opts || {};
  const term = st.term;
  const d = anCollect(classId, term);
  const back = opts.onBack ? `<div class="card" style="padding:10px 12px;"><button class="btn small secondary" data-an="back">← All classes</button> <b style="margin-left:8px;">${esc(anClassName(classId))}</b></div>` : "";
  if (!d.rows.length) {
    host.innerHTML = back + `<div class="card"><div class="empty">No scores entered for ${esc(termLabel(term))} yet. Enter scores in Score Entry and the analysis appears here.</div></div>`;
    if (opts.onBack) host.querySelector('[data-an="back"]').addEventListener("click", opts.onBack);
    return;
  }
  const prog = anProgress(classId);
  const recs = anRecommendations(d, prog);
  const A = d.all, low = d.rows[d.rows.length - 1];

  host.innerHTML = back + `
    <div class="card">
      <h2>Snapshot — ${esc(termLabel(term))}</h2>
      <div class="an-tiles">
        <div class="an-tile"><b>${A.n} / ${d.students.length}</b><span>Pupils with scores</span></div>
        <div class="an-tile"><b>${A.avg.toFixed(1)}</b><span>Class average</span></div>
        <div class="an-tile"><b>${A.max.toFixed(1)}</b><span>Highest average</span><small>${esc(A.top.student.name)}</small></div>
        <div class="an-tile"><b>${A.min.toFixed(1)}</b><span>Lowest average</span><small>${esc(low.student.name)}</small></div>
        <div class="an-tile"><b>${Math.round(A.pass)}%</b><span>Pass rate (${AN_PASS}+)</span></div>
        <div class="an-tile"><b>${Math.round(A.strong)}%</b><span>Grade A–B (${AN_STRONG}+)</span></div>
      </div>
    </div>

    <div class="card">
      <h2>Key Findings</h2>
      <ul class="an-ins">${d.insights.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </div>

    ${anRecsHtml(recs)}

    ${anGenderCardHtml(d.boys, d.girls, "Boys vs Girls")}

    <div class="card">
      <h2>Subject by Subject</h2>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 8px;">Gap = girls minus boys. A plus sign means girls are ahead.</p>
      <div class="subtable-wrap"><table class="an-t">
        <thead><tr><th>Subject</th><th>Class</th><th>Pass</th><th class="an-boy">Boys</th><th class="an-girl">Girls</th><th>Gap</th></tr></thead>
        <tbody>${d.subjects.map((s) => {
          const both = s.m !== null && s.f !== null;
          const gp = both ? s.f - s.m : 0;
          return `<tr><td>${esc(s.name)}</td><td>${s.avg.toFixed(1)}</td><td>${Math.round(s.pass)}%</td>
            <td class="an-boy ${both && gp < 0 ? "an-win" : ""}">${s.m === null ? "–" : s.m.toFixed(1)}</td>
            <td class="an-girl ${both && gp > 0 ? "an-win" : ""}">${s.f === null ? "–" : s.f.toFixed(1)}</td>
            <td>${both ? anSign(gp) : "–"}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h2>Pupil Ranking</h2>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 4px;">Each bar is the pupil's average. The dark line marks the class average (${A.avg.toFixed(1)}). <span class="an-boy">Blue</span> = boy, <span class="an-girl">pink</span> = girl, grey = gender not set.</p>
      ${d.rows.map((r) => {
        const col = r.gender === "M" ? AN_BOY : (r.gender === "F" ? AN_GIRL : "#8a94a6");
        return `<div class="an-rank">
          <div class="n">${esc(r.position)}</div>
          <div><div class="nm">${esc(r.student.name)}</div>
            <div class="an-track"><div class="an-fill" style="width:${Math.max(0, Math.min(100, r.avg))}%;background:${col};"></div><div class="an-mark" style="left:${Math.max(0, Math.min(100, A.avg))}%;"></div></div></div>
          <div class="v">${r.avg.toFixed(1)}<small class="${r.vs >= 0 ? "an-up" : "an-down"}">${anSign(r.vs)}</small></div>
        </div>`;
      }).join("")}
    </div>

    ${opts.onBack ? '<div class="card" data-an="h2h"></div>' : ""}

    <div class="card">
      <h2>Progress Across Terms</h2>
      <div class="subtable-wrap"><table class="an-t">
        <thead><tr><th></th><th>Term 1</th><th>Term 2</th><th>Term 3</th></tr></thead>
        <tbody>
          <tr><td class="an-boy">Boys</td>${prog.trend.map((t) => `<td class="an-boy">${t.m === null ? "–" : t.m.toFixed(1)}</td>`).join("")}</tr>
          <tr><td class="an-girl">Girls</td>${prog.trend.map((t) => `<td class="an-girl">${t.f === null ? "–" : t.f.toFixed(1)}</td>`).join("")}</tr>
          <tr><td><b>Class</b></td>${prog.trend.map((t) => `<td><b>${t.all === null ? "–" : t.all.toFixed(1)}</b></td>`).join("")}</tr>
        </tbody>
      </table></div>
      ${anProgressTable(prog)}
    </div>

    <div class="card">
      <h2>Export Analysis</h2>
      <div class="row">
        <button class="btn secondary" data-an="print">🖨 Print / PDF</button>
        <button class="btn" data-an="excel">⬇ Excel</button>
      </div>
    </div>
  `;
  if (opts.onBack) anH2H(host, d, st); /* Compare Two Pupils is Admin-only */
  host.querySelector('[data-an="print"]').addEventListener("click", () => anPrint(d, prog));
  host.querySelector('[data-an="excel"]').addEventListener("click", () => anExcel(d, prog));
  if (opts.onBack) host.querySelector('[data-an="back"]').addEventListener("click", opts.onBack);
}

function anProgressTable(prog) {
  const list = prog.pupils.filter((p) => p.v.some((x) => x !== null));
  if (!list.length) return "";
  const sorted = list.slice().sort((a, b) => (b.change === null ? -1e9 : b.change) - (a.change === null ? -1e9 : a.change));
  return `<h2 style="margin-top:16px;font-size:13px;">Pupil progress (first to latest scored term)</h2>
    <div class="subtable-wrap"><table class="an-t">
      <thead><tr><th>Pupil</th><th>T1</th><th>T2</th><th>T3</th><th>Change</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr><td class="${p.gender === "M" ? "an-boy" : (p.gender === "F" ? "an-girl" : "")}">${esc(p.student.name)}</td>
        ${p.v.map((x) => `<td>${x === null ? "–" : x.toFixed(1)}</td>`).join("")}
        <td class="${p.change === null ? "" : (p.change >= 0 ? "an-up" : "an-down")}"><b>${p.change === null ? "–" : anSign(p.change)}</b></td></tr>`).join("")}</tbody>
    </table></div>`;
}

/* ---------- head-to-head ---------- */
function anH2H(host, d, st) {
  const box = host.querySelector('[data-an="h2h"]');
  if (!box) return;
  const rows = d.rows;
  if (rows.length < 2) { box.innerHTML = `<h2>Compare Two Pupils</h2><div class="empty">At least two pupils need scores to compare.</div>`; return; }
  const a = rows.find((r) => r.student.id === st.a) || rows[0];
  const b = rows.find((r) => r.student.id === st.b && r.student.id !== a.student.id) || rows.find((r) => r !== a);
  st.a = a.student.id; st.b = b.student.id;
  const opt = (sel) => rows.map((r) => `<option value="${esc(r.student.id)}" ${r.student.id === sel.student.id ? "selected" : ""}>${esc(r.position)}. ${esc(r.student.name)}${r.gender ? " (" + r.gender + ")" : ""}</option>`).join("");
  const col = (r) => (r.gender === "M" ? "an-boy" : (r.gender === "F" ? "an-girl" : ""));
  const subj = subjectsForClass(d.classId).map((s) => {
    const ra = subjectRowFor(d.classId, d.term, s, a.student.id, d.students);
    const rb = subjectRowFor(d.classId, d.term, s, b.student.id, d.students);
    return { s: s, a: ra.hasAny ? ra.total : null, b: rb.hasAny ? rb.total : null };
  }).filter((x) => x.a !== null || x.b !== null);
  let aWins = 0, bWins = 0;
  const bodyRows = subj.map((x) => {
    const both = x.a !== null && x.b !== null;
    const diff = both ? x.a - x.b : null;
    if (both && diff > 0) aWins++; else if (both && diff < 0) bWins++;
    return `<tr><td>${esc(x.s)}</td>
      <td class="${diff > 0 ? "an-win" : ""}">${x.a === null ? "–" : anR1(x.a)}</td>
      <td class="${diff < 0 ? "an-win" : ""}">${x.b === null ? "–" : anR1(x.b)}</td>
      <td class="${diff === null ? "" : (diff >= 0 ? "an-up" : "an-down")}">${diff === null ? "–" : anSign(diff)}</td></tr>`;
  }).join("");
  const gap = a.avg - b.avg;
  box.innerHTML = `
    <h2>Compare Two Pupils</h2>
    <label>Pupil 1</label><select data-an="pupA">${opt(a)}</select>
    <label style="margin-top:8px;display:block;">Pupil 2</label><select data-an="pupB">${opt(b)}</select>
    <p class="hint" style="font-size:13px;margin:10px 0 6px;">${esc(a.student.name)} averages ${a.avg.toFixed(1)} and ${esc(b.student.name)} averages ${b.avg.toFixed(1)}: ${Math.abs(gap) < 0.05 ? "level overall" : esc((gap > 0 ? a : b).student.name) + " is ahead by " + Math.abs(gap).toFixed(1) + " points"}. ${esc(a.student.name)} leads in ${aWins} subject${aWins === 1 ? "" : "s"}, ${esc(b.student.name)} in ${bWins}.</p>
    <div class="subtable-wrap"><table class="an-t">
      <thead><tr><th>Subject</th><th class="${col(a)}">${esc(a.student.name.split(" ")[0])}</th><th class="${col(b)}">${esc(b.student.name.split(" ")[0])}</th><th>Diff</th></tr></thead>
      <tbody>${bodyRows}
        <tr><td><b>Average</b></td><td><b>${a.avg.toFixed(1)}</b></td><td><b>${b.avg.toFixed(1)}</b></td><td><b>${anSign(gap)}</b></td></tr>
        <tr><td><b>Position</b></td><td><b>${esc(a.position)}</b></td><td><b>${esc(b.position)}</b></td><td></td></tr>
      </tbody>
    </table></div>`;
  box.querySelector('[data-an="pupA"]').addEventListener("change", (e) => { st.a = e.target.value; anH2H(host, d, st); });
  box.querySelector('[data-an="pupB"]').addEventListener("change", (e) => { st.b = e.target.value; anH2H(host, d, st); });
}

/* ---------- export (one class) ---------- */
function anPrintPage(title, sub, blocks) {
  const h = (t) => `<h2 style="font-size:14px;margin:18px 0 6px;">${t}</h2>`;
  return `
    <div class="export-page" style="padding:24px;font-family:-apple-system,Roboto,Segoe UI,Arial,sans-serif;">
      <h1 style="font-size:18px;margin:0;">St Stephen's School Otuoke — ${esc(title)}</h1>
      <p style="font-size:12px;margin:4px 0;">${esc(sub)}</p>
      <p style="font-size:11px;color:#666;margin:0 0 8px;">${esc(printStampText())}</p>
      ${blocks.map((b) => h(b.title) + b.html).join("")}
    </div>`;
}
function anRecsPrint(recs) {
  const col = { high: "#c0392b", med: "#d9822b", info: "#2f6feb" };
  return `<div>${recs.map((r) => `<div style="border-left:4px solid ${col[r.level]};padding:4px 8px;margin-bottom:5px;font-size:12px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact;"><b style="color:${col[r.level]};">${esc(anLevelLabel(r.level))} — ${esc(r.title)}</b><br>${esc(r.text)}</div>`).join("")}</div>`;
}
function anPrint(d, prog) {
  const sh = anSheets(d, prog);
  const page = anPrintPage("Performance Analysis", `${anClassName(d.classId)} · ${termLabel(d.term)}`, [
    { title: "Key findings", html: `<ul style="font-size:12px;line-height:1.5;margin:0;padding-left:18px;">${d.insights.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` },
    { title: "Recommendations", html: anRecsPrint(anRecommendations(d, prog)) },
    { title: "Boys vs Girls", html: htmlTableFrom(sh.gender) },
    { title: "Subject by subject", html: htmlTableFrom(sh.subjects) },
    { title: "Pupil ranking", html: htmlTableFrom(sh.pupils) },
    { title: "Progress across terms", html: htmlTableFrom(sh.progress) },
  ]);
  openPrintPreview([page], "portrait");
  toast("Choose \"Save as PDF\" in the print dialog to export");
}
function anStamp() { return new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ""); }
function anSafe(t) { return t.replace(/[\\/:*?"<>|]+/g, " ").trim(); }
function anExcel(d, prog) {
  if (typeof XLSX === "undefined") { toast("Excel library not loaded yet. Check your connection and try again."); return; }
  const sh = anSheets(d, prog);
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Info", ["Generated", "Class", "View"], [[printStampText(), anClassName(d.classId), termLabel(d.term)]]);
  addSheet(wb, "Insights", ["Finding"], d.insights.map((t) => [t]));
  addSheet(wb, "Recommendations", sh.recs.headers, sh.recs.rows);
  addSheet(wb, "Boys vs Girls", sh.gender.headers, sh.gender.rows);
  addSheet(wb, "Subjects", sh.subjects.headers, sh.subjects.rows);
  addSheet(wb, "Pupil Ranking", sh.pupils.headers, sh.pupils.rows);
  addSheet(wb, "Progress", sh.progress.headers, sh.progress.rows);
  XLSX.writeFile(wb, `St Stephens Analysis - ${anSafe(anClassName(d.classId) + " " + termLabel(d.term))} - ${anStamp()}.xlsx`);
  toast("Excel file downloaded");
}

/* ================= ADMIN > PERFORMANCE =================
   The whole school in one place: every class compared, boys against girls across the school, the
   strongest pupils, pupils who need support, subjects across classes, and recommendations. Pick a
   single class to get the full detailed analysis for it (the same one the class Analysis tab shows). */
let adminPerfState = { term: "1", scope: "ALL", a: "", b: "" };

function adminPerformanceHtml() {
  const classes = (typeof sortedClasses === "function" ? sortedClasses() : loadClasses());
  return `<div id="admPerfWrap">
    <div class="card">
      <h2>School Performance</h2>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 8px;">Compare classes, boys and girls and individual pupils, with recommendations. Pass mark: an average of ${AN_PASS} or more.</p>
      <label>Term / View</label>
      <select id="admPerfTerm">${anTermOptions(adminPerfState.term)}</select>
      <label style="display:block;margin-top:8px;">Show</label>
      <select id="admPerfScope">
        <option value="ALL" ${adminPerfState.scope === "ALL" ? "selected" : ""}>ALL CLASSES — SCHOOL OVERVIEW</option>
        ${classes.map((c) => `<option value="${esc(c.id)}" ${adminPerfState.scope === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
    </div>
    <div id="admPerfBody"></div>
  </div>`;
}
function wireAdminPerformance() {
  const t = document.getElementById("admPerfTerm"), s = document.getElementById("admPerfScope");
  if (!t || !s) return;
  anInjectStyle();
  t.addEventListener("change", () => { adminPerfState.term = t.value; drawAdminPerformance(); });
  s.addEventListener("change", () => { adminPerfState.scope = s.value; drawAdminPerformance(); });
  if (typeof adminSection !== "undefined" && adminSection === "perf") drawAdminPerformance();
}
function drawAdminPerformance() {
  const body = document.getElementById("admPerfBody");
  if (!body) return;
  anInjectStyle();
  const scopeSel = document.getElementById("admPerfScope");
  if (adminPerfState.scope !== "ALL" && !loadClasses().some((c) => c.id === adminPerfState.scope)) adminPerfState.scope = "ALL";
  if (scopeSel) scopeSel.value = adminPerfState.scope;
  if (adminPerfState.scope === "ALL") { anRenderSchool(body, adminPerfState.term); return; }
  anRenderClass(body, adminPerfState.scope, adminPerfState, { onBack: () => { adminPerfState.scope = "ALL"; drawAdminPerformance(); } });
}

function anRenderSchool(host, term) {
  const sc = anSchool(term);
  if (!sc.rows.length) {
    host.innerHTML = `<div class="card"><div class="empty">${sc.list.length ? `No scores entered in any class for ${esc(termLabel(term))} yet.` : "No classes yet."}</div></div>`;
    return;
  }
  const A = sc.all, M = sc.boys, F = sc.girls;
  const nameCls = (g) => (g === "M" ? "an-boy" : (g === "F" ? "an-girl" : ""));
  const support = sc.rows.filter((r) => r.avg < AN_PASS).slice().reverse();
  const classRowsHtml = sc.classRows.map((c) => {
    const both = c.m !== null && c.f !== null;
    const gp = both ? c.f - c.m : 0;
    return `<tr><td><button class="an-link" data-an-class="${esc(c.cls.id)}">${esc(c.cls.name)}</button></td><td>${c.n}</td><td><b>${c.avg.toFixed(1)}</b></td><td>${Math.round(c.pass)}%</td>
      <td class="an-boy">${c.m === null ? "–" : c.m.toFixed(1)}</td><td class="an-girl">${c.f === null ? "–" : c.f.toFixed(1)}</td><td>${both ? anSign(gp) : "–"}</td></tr>`;
  }).join("");

  host.innerHTML = `
    <div class="card">
      <h2>School Snapshot — ${esc(termLabel(term))}</h2>
      <div class="an-tiles">
        <div class="an-tile"><b>${A.n} / ${sc.onRoll}</b><span>Pupils with scores</span><small>${sc.scoredClasses.length} of ${sc.list.length} classes</small></div>
        <div class="an-tile"><b>${A.avg.toFixed(1)}</b><span>School average</span></div>
        <div class="an-tile"><b>${Math.round(A.pass)}%</b><span>Pass rate (${AN_PASS}+)</span></div>
        <div class="an-tile"><b>${Math.round(A.strong)}%</b><span>Grade A–B (${AN_STRONG}+)</span></div>
        <div class="an-tile"><b class="an-boy">${M.n ? M.avg.toFixed(1) : "–"}</b><span>Boys average (${M.n})</span></div>
        <div class="an-tile"><b class="an-girl">${F.n ? F.avg.toFixed(1) : "–"}</b><span>Girls average (${F.n})</span></div>
      </div>
    </div>

    ${anRecsHtml(sc.recs)}

    <div class="card">
      <h2>Class Comparison</h2>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 6px;">Ranked by class average. Tap a class name for its full analysis. Gap = girls minus boys.</p>
      ${sc.classRows.map((c) => `<div class="an-lbl"><button class="an-link" data-an-class="${esc(c.cls.id)}">${esc(c.cls.name)}</button><span>${c.avg.toFixed(1)}</span></div>${anBar(c.avg, "#2f6feb")}`).join("")}
      <div style="height:10px;"></div>
      <div class="subtable-wrap"><table class="an-t">
        <thead><tr><th>Class</th><th>Pupils</th><th>Avg</th><th>Pass</th><th class="an-boy">Boys</th><th class="an-girl">Girls</th><th>Gap</th></tr></thead>
        <tbody>${classRowsHtml}</tbody>
      </table></div>
    </div>

    ${anGenderCardHtml(Object.assign({}, M, { top: M.top && Object.assign({}, M.top) }), F, "Boys vs Girls — Whole School")}

    <div class="card">
      <h2>Top Performers</h2>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 4px;">Highest averages across the school. Classes take different subjects, so use this as a guide.</p>
      ${sc.rows.slice(0, 10).map((r, i) => `<div class="an-rank"><div class="n">${i + 1}</div>
        <div><div class="nm ${nameCls(r.gender)}">${esc(r.student.name)}</div><div style="font-size:11px;color:var(--muted);">${esc(r.className)} · position ${esc(r.position)} in class</div></div>
        <div class="v">${r.avg.toFixed(1)}</div></div>`).join("")}
    </div>

    <div class="card">
      <h2>Pupils Needing Support</h2>
      ${support.length ? `<p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 4px;">${support.length} pupil${support.length === 1 ? "" : "s"} under ${AN_PASS}${support.length > 15 ? ", lowest 15 shown (all are in the export)" : ""}.</p>
      ${support.slice(0, 15).map((r) => `<div class="an-rank"><div class="n">${esc(r.position)}</div>
        <div><div class="nm ${nameCls(r.gender)}">${esc(r.student.name)}</div><div style="font-size:11px;color:var(--muted);">${esc(r.className)}</div></div>
        <div class="v an-down">${r.avg.toFixed(1)}</div></div>`).join("")}` : `<div class="empty">Every scored pupil is at ${AN_PASS} or above.</div>`}
    </div>

    <div class="card">
      <h2>Subjects Across the School</h2>
      <p class="hint" style="font-size:12px;color:var(--muted);margin:0 0 8px;">Same-named subjects from every class are combined. Weakest first. Gap = girls minus boys.</p>
      <div class="subtable-wrap"><table class="an-t">
        <thead><tr><th>Subject</th><th>Cls</th><th>Avg</th><th>Pass</th><th class="an-boy">Boys</th><th class="an-girl">Girls</th><th>Gap</th></tr></thead>
        <tbody>${sc.subjects.map((s) => {
          const both = s.m !== null && s.f !== null;
          return `<tr><td>${esc(s.name)}</td><td>${s.classes}</td><td>${s.avg.toFixed(1)}</td><td>${Math.round(s.pass)}%</td>
            <td class="an-boy">${s.m === null ? "–" : s.m.toFixed(1)}</td><td class="an-girl">${s.f === null ? "–" : s.f.toFixed(1)}</td><td>${both ? anSign(s.f - s.m) : "–"}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h2>Export School Analysis</h2>
      <div class="row">
        <button class="btn secondary" data-an="sprint">🖨 Print / PDF</button>
        <button class="btn" data-an="sexcel">⬇ Excel</button>
      </div>
    </div>`;
  host.querySelectorAll("[data-an-class]").forEach((b) => b.addEventListener("click", () => {
    adminPerfState.scope = b.dataset.anClass; drawAdminPerformance(); window.scrollTo(0, 0);
  }));
  host.querySelector('[data-an="sprint"]').addEventListener("click", () => anSchoolPrint(sc));
  host.querySelector('[data-an="sexcel"]').addEventListener("click", () => anSchoolExcel(sc));
}

function anSchoolPrint(sc) {
  const sh = anSchoolSheets(sc);
  const page = anPrintPage("School Performance Analysis", `All classes · ${termLabel(sc.term)}`, [
    { title: "Recommendations", html: anRecsPrint(sc.recs) },
    { title: "Class comparison", html: htmlTableFrom(sh.classes) },
    { title: "Boys vs Girls — whole school", html: htmlTableFrom(sh.gender) },
    { title: "Top performers", html: htmlTableFrom(sh.top) },
    { title: "Pupils needing support", html: htmlTableFrom(sh.support) },
    { title: "Subjects across the school", html: htmlTableFrom(sh.subjects) },
  ]);
  openPrintPreview([page], "portrait");
  toast("Choose \"Save as PDF\" in the print dialog to export");
}
function anSchoolExcel(sc) {
  if (typeof XLSX === "undefined") { toast("Excel library not loaded yet. Check your connection and try again."); return; }
  const sh = anSchoolSheets(sc);
  const wb = XLSX.utils.book_new();
  addSheet(wb, "Info", ["Generated", "Scope", "View"], [[printStampText(), "All classes", termLabel(sc.term)]]);
  addSheet(wb, "Recommendations", sh.recs.headers, sh.recs.rows);
  addSheet(wb, "Class Comparison", sh.classes.headers, sh.classes.rows);
  addSheet(wb, "Boys vs Girls", sh.gender.headers, sh.gender.rows);
  addSheet(wb, "Top Pupils", sh.top.headers, sh.top.rows);
  addSheet(wb, "Needs Support", sh.support.headers, sh.support.rows);
  addSheet(wb, "Subjects", sh.subjects.headers, sh.subjects.rows);
  XLSX.writeFile(wb, `St Stephens School Analysis - ${anSafe(termLabel(sc.term))} - ${anStamp()}.xlsx`);
  toast("Excel file downloaded");
}
