/* ================= LOGIN GATE =================
   A full-screen "front door" shown before any class's data is visible:
   pick a class, then (if that class has an access code) enter it. Admin
   is a quiet link on the picker screen that skips straight to the Admin
   tab's own PIN prompt (admin.js) — nothing about that prompt changes.

   Session state only — everything here resets on reload, same as
   unlockedClassIds and adminUnlocked already do:
     hasEnteredApp   — the gate always shows once per fresh load, even for
                       a class with no code, so opening the app always
                       means picking a class first.
     gateForcedOpen  — set by the "Switch Class" link to bring the gate
                       back on demand, overriding hasEnteredApp.
     gateStep / gatePendingClassId — which screen is showing, and for
                       which class, while mid-flow.
     gateRenderedKey — what's currently drawn. renderAll() calls
                       renderLoginGate() on every redraw (sync polling
                       included), so this key stops a background refresh
                       from wiping out a code the person is mid-typing. */
let hasEnteredApp = false;
let gateForcedOpen = false;
let gateStep = "picking";       // "picking" | "code" | "admin"
let gatePendingClassId = null;
let gateRenderedKey = null;

function shouldShowGate() {
  if (gateForcedOpen) return true;
  // The Admin tab gates itself with its own PIN (admin.js) — it isn't tied
  // to any particular class, so it must never be blocked by this gate.
  // Without this check, getCurrentClassId() silently defaulting to the
  // first class (even though nobody picked one) could make a still-locked
  // "current" class re-trigger this gate right after switching to Admin,
  // instantly bouncing back and making the Admin link look unresponsive.
  const activeTab = document.querySelector(".tab.active");
  if (activeTab && activeTab.id === "admintab") return false;
  if (!hasEnteredApp) return true;
  const classId = getCurrentClassId();
  return classId ? !isClassUnlocked(classId) : true;
}

function enterApp() {
  hasEnteredApp = true;
  gateForcedOpen = false;
  gateStep = "picking";
  gatePendingClassId = null;
  gateRenderedKey = null;
  const el = document.getElementById("loginGate");
  if (el) el.style.display = "none";
  activateTab("students");
}

function openGateAtPicker() {
  gateForcedOpen = true;
  gateStep = "picking";
  gatePendingClassId = null;
  gateRenderedKey = null;
  renderLoginGate();
}

function renderLoginGate() {
  const el = document.getElementById("loginGate");
  if (!el) return;
  if (!shouldShowGate()) {
    if (el.style.display !== "none") {
      el.style.display = "none"; gateRenderedKey = null;
      stopGateAdminKeys();
      removeGateMarquee();
    }
    return;
  }
  el.style.display = "flex";
  updateGateMarquee();

  const classes = sortedClasses();
  let key;
  if (gateStep !== "admin") stopGateAdminKeys();
  if (gateStep === "admin") {
    key = "admin";
  } else if (gateStep === "code" && gatePendingClassId && classes.some((c) => c.id === gatePendingClassId) && classNeedsCode(gatePendingClassId)) {
    key = "code:" + gatePendingClassId;
  } else {
    gateStep = "picking";
    gatePendingClassId = null;
    key = "picking:" + classes.map((c) => c.id + (classNeedsCode(c.id) ? "1" : "0")).join(",");
  }
  if (key === gateRenderedKey) return; // already showing exactly this — don't reset a mid-typed code
  gateRenderedKey = key;

  updateGateMarquee();
  if (gateStep === "code") renderGateCodeStep(el, gatePendingClassId);
  else if (gateStep === "admin") renderGateAdminStep(el);
  else renderGatePickerStep(el, classes);
}

/* Scrolling notice — shown ONLY on the first (class-select) screen, never on
   the access-code screen or once a teacher is inside the app. Text comes from
   Admin > School Announcement and is synced like everything else. */
function removeGateMarquee() {
  const mq = document.getElementById("gateMarquee");
  if (mq) mq.remove();
}
function updateGateMarquee() {
  const text = (typeof loadGateAnnouncement === "function" ? loadGateAnnouncement() : "").trim();
  if (gateStep !== "picking" || !text) { removeGateMarquee(); return; }
  let mq = document.getElementById("gateMarquee");
  if (!mq) {
    mq = document.createElement("div");
    mq.id = "gateMarquee";
    mq.className = "gate-marquee no-caps";
    mq.innerHTML = "<span></span>";
    document.body.appendChild(mq);
  }
  const span = mq.querySelector("span");
  const gap = "\u00A0".repeat(20);
  const shown = text + gap + text; // repeats once so the gap after the first copy still crosses the screen
  if (span.dataset.text !== text) {
    span.dataset.text = text;
    span.textContent = shown;
    // Slower for longer text, so it never feels rushed; ~90ms per character, floor 18s.
    span.style.animationDuration = Math.max(18, shown.length * 0.09) + "s";
  }
}


/* ---------- Class card look (icon + colour) ----------
   Purely visual. Keyed by the short class label (CRECHE, PRY 3, JSS 1 ...)
   so it follows shortClassName() and never touches class ids or data.
   Every class has its own icon. Icons are drawn white inside a coloured badge. */
const GI = (inner) => '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const GATE_ICONS = {
  bottle:  GI('<path d="M21 5h6M20 9h8v4H20z"/><rect x="14" y="13" width="20" height="30" rx="7"/><path d="M14 25h8M14 32h8"/>'),
  baby:    GI('<circle cx="24" cy="26" r="16"/><path d="M20 9c0-3 7-3 7 1"/><circle cx="18.5" cy="24" r="1.6" fill="currentColor"/><circle cx="29.5" cy="24" r="1.6" fill="currentColor"/><path d="M18.5 31c3 3 8 3 11 0"/>'),
  blocks:  GI('<rect x="5" y="5" width="19" height="19" rx="3"/><rect x="5" y="27" width="16" height="16" rx="3"/><rect x="24" y="27" width="19" height="16" rx="3"/><path d="M10 19l4.5-9 4.5 9M11.5 16h6"/>'),
  crayon:  GI('<g transform="rotate(35 24 24)"><rect x="18" y="3" width="12" height="30" rx="2"/><path d="M18 33l6 11 6-11z"/><path d="M18 11h12"/></g>'),
  palette: GI('<path d="M24 5C13 5 5 13 5 24s8 19 18 19c4 0 5-3 3-6s0-6 4-6h5c5 0 8-3 8-7C43 13 35 5 24 5z"/><circle cx="14" cy="23" r="2" fill="currentColor"/><circle cx="21" cy="14" r="2" fill="currentColor"/><circle cx="32" cy="15" r="2" fill="currentColor"/>'),
  bag:     GI('<path d="M18 11a6 6 0 0112 0"/><rect x="8" y="11" width="32" height="32" rx="10"/><rect x="15" y="26" width="18" height="11" rx="3.5"/><path d="M24 17v4"/>'),
  book:    GI('<path d="M24 12c-4-3-10-4-18-4v28c8 0 14 1 18 4 4-3 10-4 18-4V8c-8 0-14 1-18 4z"/><path d="M24 12v28"/>'),
  pencil:  GI('<path d="M7 41l3-10L32 9l7 7-22 22-10 3z"/><path d="M28 13l7 7M10 31l7 7"/>'),
  globe:   GI('<circle cx="24" cy="24" r="18"/><ellipse cx="24" cy="24" rx="7.5" ry="18"/><path d="M6 24h36M9 14h30M9 34h30"/>'),
  bulb:    GI('<path d="M24 4a13 13 0 00-7 24v5h14v-5A13 13 0 0024 4z"/><path d="M18 38h12M20 43h8"/>'),
  flask:   GI('<path d="M19 5h10M21 5v14L8 38c-1.6 3.2.4 5 3 5h26c2.6 0 4.6-1.8 3-5L27 19V5"/><path d="M13 31h22"/>'),
  atom:    GI('<circle cx="24" cy="24" r="3" fill="currentColor"/><ellipse cx="24" cy="24" rx="19" ry="7.5"/><ellipse cx="24" cy="24" rx="19" ry="7.5" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="19" ry="7.5" transform="rotate(120 24 24)"/>'),
  rocket:  GI('<path d="M24 4c8 5 11 14 9 27H15C13 18 16 9 24 4z"/><circle cx="24" cy="19" r="3.5"/><path d="M15 25l-7 8 8-1M33 25l7 8-8-1M20 36l4 8 4-8"/>'),
  calc:    GI('<rect x="9" y="4" width="30" height="40" rx="4"/><rect x="14" y="9" width="20" height="9" rx="1.5"/><circle cx="16" cy="26" r="1.6" fill="currentColor"/><circle cx="24" cy="26" r="1.6" fill="currentColor"/><circle cx="32" cy="26" r="1.6" fill="currentColor"/><circle cx="16" cy="33" r="1.6" fill="currentColor"/><circle cx="24" cy="33" r="1.6" fill="currentColor"/><circle cx="32" cy="33" r="1.6" fill="currentColor"/><circle cx="16" cy="39" r="1.6" fill="currentColor"/><circle cx="24" cy="39" r="1.6" fill="currentColor"/>'),
  laptop:  GI('<rect x="8" y="10" width="32" height="22" rx="3"/><path d="M3 39h42l-3 3H6z"/>'),
  cap:     GI('<path d="M24 8L4 18l20 10 20-10L24 8z"/><path d="M12 24v10c0 3 6 6 12 6s12-3 12-6V24"/><path d="M44 18v12"/>'),
  cap2:    GI('<path d="M24 8L4 18l20 10 20-10L24 8z"/><path d="M12 24v10c0 3 6 6 12 6s12-3 12-6V24"/><path d="M44 18v12"/>'),
  gear:    GI('<circle cx="24" cy="24" r="6"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/>')
};
const GATE_CARD_STYLE = {
  "CRECHE":  { icon: "bottle",  c1: "#ee3a95", c2: "#b3166f" },
  "PRE-NUR": { icon: "baby",    c1: "#9a4ae8", c2: "#6a2bc0" },
  "NUR 1":   { icon: "blocks",  c1: "#3c8cf0", c2: "#1e5bd0" },
  "NUR 2":   { icon: "crayon",  c1: "#2fbf72", c2: "#16934f" },
  "NUR 3":   { icon: "palette", c1: "#ffa21f", c2: "#ee7d08" },
  "PRY 1":   { icon: "bag",     c1: "#12b8b0", c2: "#0a8c8e" },
  "PRY 2":   { icon: "book",    c1: "#ff5a4f", c2: "#e03a3a" },
  "PRY 3":   { icon: "pencil",  c1: "#5a52d8", c2: "#3a34b0" },
  "PRY 4":   { icon: "globe",   c1: "#a24ae0", c2: "#7a2cb8" },
  "PRY 5":   { icon: "bulb",    c1: "#13b5ae", c2: "#0b8a96" },
  "JSS 1":   { icon: "flask",   c1: "#2f7fe8", c2: "#1a50c0" },
  "JSS 2":   { icon: "atom",    c1: "#32b866", c2: "#1a8e4c" },
  "JSS 3":   { icon: "rocket",  c1: "#e0268f", c2: "#b01470" },
  "SS 1":    { icon: "calc",    c1: "#f5a623", c2: "#e07a10" },
  "SS 2":    { icon: "laptop",  c1: "#ef4e5e", c2: "#c52a44" },
  "SS 3":    { icon: "cap",     c1: "#3f4fd0", c2: "#232a96" }
};
function gateCardStyle(label) {
  return GATE_CARD_STYLE[label] || { icon: "book", c1: "#3b5bdb", c2: "#1c2f7a" };
}

function renderGatePickerStep(el, classes) {
  el.innerHTML = `
    <div class="gate-card gate-card-wide">
      <img src="icons/logo.png" alt="" class="gate-logo">
      <h1 class="gate-title no-caps">ST. STEPHEN'S SCHOOL OTUOKE</h1>
      <div class="gate-pick-head">
        <div class="gate-pick-cap">${GI('<path d="M24 8L4 18l20 10 20-10L24 8z"/><path d="M12 24v10c0 3 6 6 12 6s12-3 12-6V24"/><path d="M44 18v12"/>')}</div>
        <div class="gate-pick-title">Choose your class to continue</div>
      </div>
      ${classes.length ? `
        <div class="gate-class-list">
          ${classes.map((c, i) => {
            const label = shortClassName(c.name);
            const st = gateCardStyle(label);
            return `
            <button type="button" class="gate-class-btn" data-class="${esc(c.id)}" title="${esc(c.name)}" style="--c1:${st.c1};--c2:${st.c2};animation-delay:${(i * 1.5 / classes.length).toFixed(2)}s">
              <span class="gate-ico">${GATE_ICONS[st.icon]}</span>
              <span class="gate-cname">${esc(label)}</span>
              <span class="gate-chev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              ${classNeedsCode(c.id) ? '<span class="gate-lock" title="Code required">\uD83D\uDD12</span>' : ""}
            </button>`;
          }).join("")}
        </div>
      ` : `<div class="empty">No classes yet — ask an admin to add one.</div>`}
      <button type="button" class="gate-admin-link" id="gateAdminBtn"><span class="gate-admin-gear">${GATE_ICONS.gear}</span><span class="gate-admin-sep"></span><span class="gate-admin-txt">ADMIN</span><span class="gate-admin-chev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>
    </div>
  `;
  el.querySelectorAll(".gate-class-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (el.querySelector(".gate-class-btn.selected")) return; // already responding to a tap
      const classId = btn.dataset.class;
      btn.classList.add("selected"); // visible response: the chosen class changes colour for a moment
      setTimeout(() => {
        setCurrentClassId(classId);
        if (classNeedsCode(classId) && !isClassUnlocked(classId)) {
          gateStep = "code";
          gatePendingClassId = classId;
          gateRenderedKey = null;
          renderLoginGate();
        } else {
          enterApp();
        }
      }, 300);
    });
  });
  const adminBtn = document.getElementById("gateAdminBtn");
  if (adminBtn) {
    adminBtn.addEventListener("click", () => {
      // Full-screen admin lock: only the keyboard, and an exit button back to this picker.
      gateStep = "admin";
      gatePendingClassId = null;
      gateForcedOpen = true;
      gateRenderedKey = null;
      renderLoginGate();
    });
  }
}

/* ---------- Admin lock screen ----------
   Full screen, nothing but a keyboard. The admin PIN can hold letters and symbols
   (default "@Admin"), so this is a small on-screen keyboard rather than a number pad.
   ❎ goes back to the class picker. A wrong PIN just clears and shakes. */
let gateAdminKeyHandler = null;
function stopGateAdminKeys() {
  if (gateAdminKeyHandler) { document.removeEventListener("keydown", gateAdminKeyHandler, true); gateAdminKeyHandler = null; }
}
function exitGateAdminLock() {
  stopGateAdminKeys();
  gateStep = "picking";
  gatePendingClassId = null;
  gateForcedOpen = true;
  gateRenderedKey = null;
  renderLoginGate();
}
function renderGateAdminStep(el) {
  stopGateAdminKeys();
  removeGateMarquee();
  const ROWS = [
    "1234567890".split(""),
    "qwertyuiop".split(""),
    "asdfghjkl".split(""),
    ["SHIFT"].concat("zxcvbnm".split("")).concat(["BACK"]),
    "@#$%&*!._-".split("")
  ];
  let pin = "";
  let shift = false;
  el.innerHTML = `
    <div class="gate-card gate-admin-lock">
      <button type="button" class="gate-admin-exit" id="gateAdminExit" aria-label="Exit to class picker" title="Exit">\u274E</button>
      <div class="gate-admin-lockico" aria-hidden="true">\uD83D\uDD10</div>
      <h1 class="gate-title">Admin Access</h1>
      <div class="gate-admin-dots" id="gateAdminDots" aria-live="polite"></div>
      <div class="gate-kb" id="gateKb">
        ${ROWS.map((row) => `<div class="gate-kb-row">${row.map((k) => {
          if (k === "SHIFT") return `<button type="button" class="gate-key gate-key-fn" data-k="SHIFT" id="gateKeyShift" aria-label="Shift">\u21E7</button>`;
          if (k === "BACK") return `<button type="button" class="gate-key gate-key-fn" data-k="BACK" aria-label="Backspace">\u232B</button>`;
          return `<button type="button" class="gate-key" data-k="${k}">${k}</button>`;
        }).join("")}</div>`).join("")}
        <div class="gate-kb-row"><button type="button" class="gate-key gate-key-go" data-k="GO">Unlock</button></div>
      </div>
    </div>`;
  const dots = document.getElementById("gateAdminDots");
  const card = el.querySelector(".gate-admin-lock");
  function paint() {
    dots.textContent = pin ? "\u25CF".repeat(Math.min(pin.length, 24)) : "\u00A0";
    el.querySelectorAll(".gate-key[data-k]").forEach((b) => {
      const k = b.dataset.k;
      if (k.length === 1 && /[a-z]/.test(k)) b.textContent = shift ? k.toUpperCase() : k;
    });
    const sb = document.getElementById("gateKeyShift");
    if (sb) sb.classList.toggle("on", shift);
  }
  function submit() {
    if (!pin) return;
    if (pin === getAdminPin()) {
      stopGateAdminKeys();
      adminUnlocked = true;
      adminGridOpen = true;
      hasEnteredApp = true;
      gateForcedOpen = false;
      gateStep = "picking";
      gatePendingClassId = null;
      gateRenderedKey = null;
      el.style.display = "none";
      removeGateMarquee();
      toast("Admin unlocked");
      activateTab("admintab");
      renderAll();
    } else {
      pin = ""; shift = false; paint();
      toast("Incorrect PIN");
      card.classList.remove("gate-shake"); void card.offsetWidth; card.classList.add("gate-shake");
    }
  }
  function press(k) {
    if (k === "SHIFT") { shift = !shift; }
    else if (k === "BACK") { pin = pin.slice(0, -1); }
    else if (k === "GO") { submit(); return; }
    else if (pin.length < 32) { pin += (shift && /[a-z]/.test(k)) ? k.toUpperCase() : k; shift = false; }
    paint();
  }
  el.querySelectorAll(".gate-key[data-k]").forEach((b) => b.addEventListener("click", () => press(b.dataset.k)));
  document.getElementById("gateAdminExit").addEventListener("click", exitGateAdminLock);
  // A real keyboard works too (desktop / tablets with a keyboard attached).
  gateAdminKeyHandler = (e) => {
    if (gateStep !== "admin" || el.style.display === "none") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Backspace") { e.preventDefault(); press("BACK"); }
    else if (e.key === "Escape") { e.preventDefault(); exitGateAdminLock(); }
    else if (e.key.length === 1) { e.preventDefault(); if (pin.length < 32) { pin += e.key; shift = false; paint(); } }
  };
  document.addEventListener("keydown", gateAdminKeyHandler, true);
  paint();
}

function renderGateCodeStep(el, classId) {
  const cls = loadClasses().find((c) => c.id === classId);
  const codeLen = cls && cls.accessCode ? cls.accessCode.length : 4;
  el.innerHTML = `
    <div class="gate-card">
      <img src="icons/logo.png" alt="" class="gate-logo">
      <h1 class="gate-title">${esc(cls ? cls.name : "This class")}</h1>
      <div id="gateFace" style="font-size:34px;line-height:1;height:40px;margin:2px 0 -2px;">&nbsp;</div>
      <p class="gate-sub">Enter the access code</p>
      <div class="gate-pin-row" id="gatePinRow">
        ${Array.from({ length: codeLen }).map((_, i) =>
          `<input type="password" inputmode="text" maxlength="1" autocomplete="off" class="gate-pin-box" data-i="${i}">`
        ).join("")}
      </div>
      <button type="button" class="btn" id="gateUnlockBtn" style="margin-top:16px;">Unlock</button>
      <button type="button" class="gate-back-link" id="gateBackBtn">‹ Choose a different class</button>
    </div>
  `;
  const boxes = Array.from(el.querySelectorAll(".gate-pin-box"));
  if (boxes[0]) boxes[0].focus();

  const face = document.getElementById("gateFace");
  const tryUnlock = () => {
    const code = boxes.map((b) => b.value).join("");
    if (unlockClassWithCode(classId, code)) {
      if (face) face.textContent = "\uD83D\uDE0A"; // 😊 happy face — correct password
      toast("Class unlocked");
      setTimeout(enterApp, 350); // let the happy face show briefly before entering
    } else {
      if (face) face.textContent = "\uD83D\uDE1F"; // 🙁 frowning face — wrong password
      toast("Incorrect code");
      boxes.forEach((b) => { b.value = ""; });
      if (boxes[0]) boxes[0].focus();
    }
  };

  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.slice(-1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (boxes.every((b) => b.value)) tryUnlock();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) { boxes[i - 1].value = ""; boxes[i - 1].focus(); }
      if (e.key === "Enter") tryUnlock();
    });
    box.addEventListener("paste", (e) => {
      const cd = e.clipboardData || window.clipboardData;
      const text = cd ? cd.getData("text") : "";
      if (!text) return;
      e.preventDefault();
      const chars = text.split("");
      boxes.forEach((b, idx) => { b.value = chars[idx] || ""; });
      const lastFilled = Math.min(chars.length, boxes.length) - 1;
      if (boxes[lastFilled]) boxes[lastFilled].focus();
      if (boxes.every((b) => b.value)) tryUnlock();
    });
  });

  document.getElementById("gateUnlockBtn").addEventListener("click", tryUnlock);
  document.getElementById("gateBackBtn").addEventListener("click", () => {
    gateStep = "picking";
    gatePendingClassId = null;
    gateRenderedKey = null;
    renderLoginGate();
  });
}
