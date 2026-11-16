/* Class Backup (v3.15.0) — a teacher's own safety copy of ONE class.
   DOWNLOAD: any teacher who can open the class can save its pupils, subjects, scores and attendance.
             The class access code is never put in the file, and no other class is in it.
   RESTORE:  deliberately narrow, because a restore counts as a fresh edit and wins when devices sync:
             - only into the SAME class (the file's class id must match);
             - SCORES only, for ONE term at a time (pupils, subjects and attendance are never touched);
             - only for pupils and subjects that exist in the class right now (nobody deleted or promoted
               comes back);
             - "Fill empty boxes only" (default) never overwrites a score; "Replace" does;
             - a preview is shown first, and the term's scores are copied aside so Undo is one tap. */

const CB_UNDO_KEY = "classRestoreUndo";   // this device only: not synced, not in the full backup
const cbState = { term: "1", mode: "fill", backup: null, fileName: "" };
let cbPlan = null;

function cbClass(classId) { return loadClasses().find((c) => c.id === classId) || null; }

/* ---------- DOWNLOAD ---------- */
function cbBuild(classId) {
  const cls = cbClass(classId);
  const cleanCls = cls ? { id: cls.id, name: cls.name } : { id: classId, name: "" };   // no accessCode
  const students = DB.peek("students", []).filter((s) => s.classId === classId ||
    (Array.isArray(s.moves) && s.moves.some((m) => m.classId === classId)));
  const allScores = DB.peek("scores", {});
  const att = DB.peek("attendance", {});
  return {
    app: "ststephens-classbackup", version: APP_VERSION, exportedAt: new Date().toISOString(),
    classId: classId, className: cleanCls.name, class: cleanCls,
    students: JSON.parse(JSON.stringify(students)),
    subjects: subjectsForClass(classId).slice(),
    scores: JSON.parse(JSON.stringify(allScores[classId] || {})),
    attendance: JSON.parse(JSON.stringify(att[classId] || {})),
  };
}
function cbDownload(classId) {
  const b = cbBuild(classId);
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = String(b.className || "class").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "class";
  a.href = url; a.download = `class-backup-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Class backup downloaded");
}

/* ---------- RESTORE: work out what would change (changes nothing) ---------- */
function cbPlanRestore(classId, backup, term, mode) {
  const plan = { ok: false, message: "", added: 0, changed: 0, same: 0, kept: 0, skippedPupils: 0, skippedSubjects: 0, invalid: 0, edits: [] };
  if (!backup || backup.app !== "ststephens-classbackup" || !backup.scores) { plan.message = "This is not a class backup file."; return plan; }
  if (backup.classId !== classId) {
    plan.message = "This backup is for " + (backup.className || "another class") + ". It can only be restored into the class it came from.";
    return plan;
  }
  const bt = backup.scores[term];
  if (!bt || typeof bt !== "object" || !Object.keys(bt).length) { plan.message = "This backup has no scores for " + termLabel(term) + "."; return plan; }
  const members = new Set(classMembers(classId, term).map((s) => s.id));
  const subjects = new Set(subjectsForClass(classId));
  const cur = (DB.peek("scores", {})[classId] || {})[term] || {};
  const skippedP = new Set(), skippedS = new Set();
  Object.keys(bt).forEach((subj) => {
    if (!subjects.has(subj)) { skippedS.add(subj); return; }
    const rows = bt[subj] || {};
    Object.keys(rows).forEach((sid) => {
      if (!members.has(sid)) { skippedP.add(sid); return; }
      const rec = rows[sid] || {};
      const now = (cur[subj] && cur[subj][sid]) || {};
      ["test1", "test2", "exam"].forEach((field) => {
        if (!isEntered(rec[field])) return;
        const other = field === "test1" ? "test2" : field === "test2" ? "test1" : null;
        const chk = checkScoreEntry(field, rec[field], other ? (isEntered(rec[other]) ? rec[other] : now[other]) : undefined);
        if (!chk.ok) { plan.invalid++; return; }
        const had = isEntered(now[field]);
        if (!had) { plan.added++; plan.edits.push({ subj: subj, sid: sid, field: field, value: chk.value }); }
        else if (Number(now[field]) === chk.value) plan.same++;
        else if (mode === "replace") { plan.changed++; plan.edits.push({ subj: subj, sid: sid, field: field, value: chk.value }); }
        else plan.kept++;
      });
    });
  });
  plan.skippedPupils = skippedP.size; plan.skippedSubjects = skippedS.size;
  plan.ok = true;
  return plan;
}

/* ---------- RESTORE: apply, with a copy of the term's scores kept for Undo ---------- */
function cbApply(classId, term, plan) {
  const all = loadScores();
  const before = JSON.parse(JSON.stringify((all[classId] && all[classId][term]) || {}));
  const undo = { classId: classId, term: term, at: Date.now(), before: before, touched: plan.edits.map((e) => [e.subj, e.sid, e.field]) };
  DB.set(CB_UNDO_KEY, undo);   // saved first: if the phone is full this throws and nothing is changed
  all[classId] = all[classId] || {};
  all[classId][term] = all[classId][term] || {};
  plan.edits.forEach((e) => {
    const t = all[classId][term];
    t[e.subj] = t[e.subj] || {};
    t[e.subj][e.sid] = t[e.subj][e.sid] || {};
    t[e.subj][e.sid][e.field] = e.value;
  });
  saveScores(all);
}
function cbUndo() {
  const u = DB.get(CB_UNDO_KEY, null);
  if (!u) return false;
  const all = loadScores();
  all[u.classId] = all[u.classId] || {};
  all[u.classId][u.term] = all[u.classId][u.term] || {};
  const t = all[u.classId][u.term];
  u.touched.forEach((k) => {
    const subj = k[0], sid = k[1], field = k[2];
    const old = u.before && u.before[subj] && u.before[subj][sid] ? u.before[subj][sid][field] : undefined;
    t[subj] = t[subj] || {}; t[subj][sid] = t[subj][sid] || {};
    t[subj][sid][field] = isEntered(old) ? old : undefined;   // a box that was blank goes back to blank
  });
  saveScores(all);
  DB.set(CB_UNDO_KEY, undefined);
  return true;
}

/* ---------- SCREEN ---------- */
function cbWhen(ms) { try { return new Date(ms).toLocaleString(); } catch (e) { return ""; } }
function renderClassBackup() {
  const el = document.getElementById("classbackup");
  if (!el) return;
  const classId = getCurrentClassId();
  if (!classId) { el.innerHTML = NO_CLASSES_HTML; return; }
  if (guardClassLock(el, classId)) return;
  const cls = cbClass(classId);
  const undo = DB.get(CB_UNDO_KEY, null);
  const canUndo = !!(undo && undo.classId === classId);
  const termOpts = TERMS.map((t) => `<option value="${t}" ${cbState.term === t ? "selected" : ""}>${termLabel(t)}</option>`).join("");
  el.innerHTML = `
    <div class="card">
      <h2>Class Backup — ${esc(cls ? cls.name : "")}</h2>
      <p style="font-size:12.5px;color:var(--muted);">Save a copy of this class only (pupils, subjects, scores and attendance). The class access code is not included. Keep the file somewhere safe, for example by emailing it to yourself.</p>
      <div class="row"><button class="btn" id="cbDownload">⬇ Download Class Backup</button></div>
    </div>
    <div class="card">
      <h2>Restore Scores</h2>
      <p style="font-size:12.5px;color:var(--muted);">Brings back <b>scores for one term</b> from a backup of this same class. Pupils, subjects and attendance are never changed, and pupils who were removed or promoted are not brought back.</p>
      <label>Term to restore</label>
      <select id="cbTerm">${termOpts}</select>
      <label style="margin-top:8px;display:block;">How to restore</label>
      <select id="cbMode">
        <option value="fill" ${cbState.mode === "fill" ? "selected" : ""}>Fill empty boxes only (safest)</option>
        <option value="replace" ${cbState.mode === "replace" ? "selected" : ""}>Replace with the backup's scores</option>
      </select>
      <div class="row" style="margin-top:10px;"><button class="btn secondary" id="cbPick">📂 Choose Backup File</button></div>
      <input type="file" id="cbFile" accept="application/json" style="display:none;">
      <div id="cbPreview"></div>
    </div>
    ${canUndo ? `<div class="card">
      <h2>Undo Last Restore</h2>
      <p style="font-size:12.5px;color:var(--muted);">Last restore: ${esc(termLabel(undo.term))}, ${esc(cbWhen(undo.at))}. Undo puts back the scores it changed.</p>
      <div class="row"><button class="btn secondary" id="cbUndo">↩ Undo Last Restore</button></div>
    </div>` : ""}`;
  el.querySelector("#cbDownload").addEventListener("click", () => cbDownload(classId));
  el.querySelector("#cbTerm").addEventListener("change", (e) => { cbState.term = e.target.value; cbRefreshPreview(classId); });
  el.querySelector("#cbMode").addEventListener("change", (e) => { cbState.mode = e.target.value; cbRefreshPreview(classId); });
  const fileInput = el.querySelector("#cbFile");
  el.querySelector("#cbPick").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { cbState.backup = JSON.parse(reader.result); cbState.fileName = f.name; }
      catch (err) { cbState.backup = null; toast("Couldn't read that file"); }
      cbRefreshPreview(classId);
    };
    reader.onerror = () => toast("Couldn't read that file");
    reader.readAsText(f);
  });
  const u = el.querySelector("#cbUndo");
  if (u) u.addEventListener("click", () => {
    if (!confirm("Undo the last restore? The scores it changed go back to what they were.")) return;
    try { cbUndo(); toast("Restore undone"); } catch (e) { toast("Couldn't undo: " + e.message); }
    renderAll();
  });
  cbRefreshPreview(classId);
}
function cbRefreshPreview(classId) {
  const box = document.getElementById("cbPreview");
  if (!box) return;
  if (!cbState.backup) { box.innerHTML = ""; cbPlan = null; return; }
  const b = cbState.backup;
  const plan = cbPlan = cbPlanRestore(classId, b, cbState.term, cbState.mode);
  const head = `<p style="font-size:12.5px;margin:12px 0 4px;"><b>${esc(cbState.fileName)}</b><br>Class: ${esc(b.className || "?")} · saved ${esc(cbWhen(Date.parse(b.exportedAt)))}</p>`;
  if (!plan.ok) { box.innerHTML = head + `<p style="color:#c62828;font-size:13px;">${esc(plan.message)}</p>`; return; }
  const n = plan.edits.length;
  const line = (label, v) => `<tr><td>${label}</td><td style="text-align:right;"><b>${v}</b></td></tr>`;
  box.innerHTML = head + `
    <table class="an-t" style="width:100%;font-size:13px;">
      ${line("Empty boxes that will be filled", plan.added)}
      ${cbState.mode === "replace" ? line("Scores that will be replaced", plan.changed) : line("Different scores left as they are", plan.kept)}
      ${line("Already the same", plan.same)}
      ${plan.skippedPupils ? line("Pupils in the backup no longer in this class (skipped)", plan.skippedPupils) : ""}
      ${plan.skippedSubjects ? line("Subjects no longer in this class (skipped)", plan.skippedSubjects) : ""}
      ${plan.invalid ? line("Scores outside the allowed range (skipped)", plan.invalid) : ""}
    </table>
    <div class="row" style="margin-top:10px;"><button class="btn" id="cbApply" ${n ? "" : "disabled"}>${n ? "Restore " + n + " score" + (n === 1 ? "" : "s") + " to " + esc(termLabel(cbState.term)) : "Nothing to restore"}</button></div>`;
  const ap = box.querySelector("#cbApply");
  if (ap) ap.addEventListener("click", () => {
    const p = cbPlanRestore(classId, cbState.backup, cbState.term, cbState.mode);   // re-checked against the data as it is now
    if (!p.ok || !p.edits.length) { toast(p.message || "Nothing to restore"); return; }
    if (!confirm("Restore " + p.edits.length + " score(s) into " + termLabel(cbState.term) + "? You can undo this afterwards.")) return;
    try { cbApply(classId, cbState.term, p); toast("Restored " + p.edits.length + " score(s)"); }
    catch (e) { toast("Couldn't restore: " + e.message); return; }
    cbState.backup = null; cbState.fileName = "";
    renderAll();
  });
}
