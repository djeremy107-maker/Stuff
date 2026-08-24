// Idyll — coop fishing game client
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const state = {
  token: localStorage.getItem("idyll_token") || null,
  game: null,
  player: null,
  presence: [],
  guild: null,
  bank: {},
  boathouse: null,
  records: [],
  noticeBoard: null,
  event: null,
  world: null,
  firsts: [],
  pendingWelcome: false,
  queueQty: 50, // 0 = infinite
  tab: "fishing", // skill id, or "collection" / "shop" / "bank" / "achievements"
  ws: null,
  anim: { refId: null, durationSec: 1, cycleStart: 0 },
};

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

state.soundOn = localStorage.getItem("idyll_sound") !== "off"; // default on
state.notifyOn = localStorage.getItem("idyll_notify") === "on"; // default off — needs explicit opt-in

// ---------------------------------------------------------------- Sound (procedural — no external audio files)
let audioCtx = null;
function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}
function tone(freq, startDelay, duration, { type = "sine", gain = 0.14 } = {}) {
  if (!state.soundOn) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = ctx.currentTime + startDelay;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch {}
}
function sfxCatch(rarity) {
  if (rarity === "legendary") { tone(523, 0, .16); tone(659, .09, .16); tone(784, .18, .16); tone(1047, .27, .35, { gain: .18 }); }
  else { tone(523, 0, .14); tone(698, .09, .14); tone(880, .18, .28, { gain: .16 }); }
}
function sfxLevelUp(milestone) {
  if (milestone) { tone(392, 0, .14); tone(523, .11, .14); tone(659, .22, .14); tone(784, .33, .4, { gain: .16 }); }
  else { tone(523, 0, .1, { gain: .1 }); tone(659, .08, .16, { gain: .1 }); }
}
function sfxAchievement() { tone(587, 0, .1, { gain: .12 }); tone(880, .09, .22, { gain: .14 }); }
function sfxGuild() { tone(440, 0, .14); tone(554, .1, .14); tone(659, .2, .14); tone(880, .3, .4, { gain: .16 }); }
function sfxShiny() {
  tone(660, 0, .1, { type: "triangle", gain: .1 });
  tone(880, .06, .1, { type: "triangle", gain: .11 });
  tone(1100, .12, .1, { type: "triangle", gain: .12 });
  tone(1320, .18, .1, { type: "triangle", gain: .13 });
  tone(1760, .26, .35, { type: "sine", gain: .15 });
}
function sfxNotify() { tone(700, 0, .08, { type: "triangle", gain: .08 }); tone(900, .05, .1, { type: "triangle", gain: .07 }); }
function sfxPrestige() {
  tone(330, 0, .18, { gain: .13 }); tone(415, .12, .18, { gain: .13 }); tone(494, .24, .18, { gain: .13 });
  tone(660, .36, .5, { gain: .17 }); tone(880, .5, .7, { type: "triangle", gain: .16 });
}
function sfxError() { tone(300, 0, .12, { type: "triangle", gain: .09 }); tone(220, .08, .16, { type: "triangle", gain: .09 }); }

// A one-time "unlock" nudge — browsers block audio until a user gesture.
document.addEventListener("click", () => getAudioCtx(), { once: true });

// ---------------------------------------------------------------- Browser notifications
function notify(title, body, tag) {
  if (!state.notifyOn) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return; // they're already looking — no need to interrupt
  try {
    new Notification(title, { body, tag, silent: true });
  } catch {}
}
async function requestNotifyPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}

// ---------------------------------------------------------------- Settings popover
$("#settings-btn").onclick = () => {
  const overlay = el("div", "modal-overlay");
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const notifyStatusTxt = permission === "unsupported" ? "not supported in this browser"
    : permission === "denied" ? "blocked — enable it in your browser's site settings"
    : permission === "granted" ? (state.notifyOn ? "on" : "off (allowed, but toggled off)")
    : "not yet enabled";
  overlay.innerHTML = `
    <div class="modal">
      <h2>⚙️ Settings</h2>
      <label class="lacquer-ctl"><input type="checkbox" id="sound-toggle" ${state.soundOn ? "checked" : ""}/> 🔊 Sound effects</label>
      <label class="lacquer-ctl"><input type="checkbox" id="notify-toggle" ${state.notifyOn ? "checked" : ""} ${permission === "unsupported" ? "disabled" : ""}/> 🔔 Browser notifications <span class="muted">(${notifyStatusTxt})</span></label>
      <p class="wb-row muted">Notifications only fire while this tab is in the background — level-ups, rare catches, and your partner's big moments.</p>
      <button class="wb-close cancel-btn">Close</button>
    </div>`;
  overlay.querySelector(".wb-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector("#sound-toggle").onchange = (e) => {
    state.soundOn = e.target.checked;
    localStorage.setItem("idyll_sound", state.soundOn ? "on" : "off");
    if (state.soundOn) sfxNotify();
  };
  overlay.querySelector("#notify-toggle").onchange = async (e) => {
    if (e.target.checked) {
      const result = await requestNotifyPermission();
      if (result !== "granted") { e.target.checked = false; toast(result === "denied" ? "Notifications are blocked in your browser." : "Notifications aren't supported here."); return; }
    }
    state.notifyOn = e.target.checked;
    localStorage.setItem("idyll_notify", state.notifyOn ? "on" : "off");
  };
  document.body.appendChild(overlay);
};

// ---------------------------------------------------------------- Legend (rarity / sky / badges key)
function openLegendModal() {
  const overlay = el("div", "modal-overlay");
  const rarityRows = RARITY_ORDER
    .map((r) => `<div class="legend-row"><span class="rar-dot bg-${r}"></span> <span class="r-${r}">${r[0].toUpperCase()}${r.slice(1)}</span></div>`)
    .join("");
  const timeRows = Object.entries(TIME_ICON)
    .map(([id, icon]) => `<div class="legend-row">${icon} ${TIME_LABEL[id]}</div>`)
    .join("");
  const weatherRows = Object.entries(WEATHER_ICON)
    .map(([id, icon]) => `<div class="legend-row">${icon} ${WEATHER_LABEL[id]}</div>`)
    .join("");
  overlay.innerHTML = `
    <div class="modal">
      <h2>❔ Legend</h2>
      <h3 class="legend-h">Rarity</h3>
      <div class="legend-grid">${rarityRows}</div>
      <h3 class="legend-h">Sky — time of day &amp; weather</h3>
      <p class="wb-row muted">Some fish only bite when the shared sky (topbar) matches their condition — a dimmed tag on a zone card means it's not biting right now.</p>
      <div class="legend-grid">${timeRows}${weatherRows}</div>
      <h3 class="legend-h">Special catches</h3>
      <div class="legend-row">${ciChip("ci-chip-record", "🏆 42cm")} Trophy Hall record — the biggest of that species either of you has caught.</div>
      <div class="legend-row">${ciChip("ci-chip-first", "🥇 First")} You were the first to ever catch that shiny or exclusive species.</div>
      <div class="legend-row">${ciChip("ci-chip-shiny", "💫 ×2")} A shiny catch — a ~1-in-450 chase variant, worth far more.</div>
      <div class="legend-row"><span class="glow-legendary" style="display:inline-block;width:14px;height:14px;border-radius:4px;border:1px solid;vertical-align:middle;"></span> Glowing border — epic/legendary rarity, or a shiny catch.</div>
      <button class="wb-close cancel-btn">Close</button>
    </div>`;
  overlay.querySelector(".wb-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}
function legendButton() {
  const btn = el("button", "ghost icon-btn legend-btn", "❔");
  btn.title = "What do the colors and badges mean?";
  btn.onclick = openLegendModal;
  return btn;
}

// ---------------------------------------------------------------- Auth UI
let authMode = "login";
$("#tab-login").onclick = () => setAuthMode("login");
$("#tab-register").onclick = () => setAuthMode("register");
function setAuthMode(mode) {
  authMode = mode;
  $("#tab-login").classList.toggle("active", mode === "login");
  $("#tab-register").classList.toggle("active", mode === "register");
  $("#auth-submit").textContent = mode === "login" ? "Log in" : "Start fishing";
}
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault();
  const username = $("#auth-username").value;
  const password = $("#auth-password").value;
  $("#auth-error").textContent = "";
  try {
    const res = await fetch(`/api/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!data.ok) return void ($("#auth-error").textContent = data.error || "Something went wrong.");
    state.token = data.token;
    localStorage.setItem("idyll_token", data.token);
    await enterGame();
  } catch {
    $("#auth-error").textContent = "Network error.";
  }
};
$("#logout-btn").onclick = async () => {
  try {
    await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: state.token }) });
  } catch {}
  localStorage.removeItem("idyll_token");
  state.token = null;
  if (state.ws) state.ws.close();
  location.reload();
};

// ---------------------------------------------------------------- Bootstrap
async function boot() {
  state.game = await (await fetch("/api/gamedata")).json();
  if (state.token) await enterGame();
}
async function enterGame() {
  $("#auth").classList.add("hidden");
  $("#game").classList.remove("hidden");
  renderNav();
  connectWs();
}

// ---------------------------------------------------------------- WebSocket
function connectWs() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(state.token)}`);
  state.ws = ws;
  state.pendingWelcome = true;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") {
      state.player = msg.player;
      onStateUpdate(msg.summary);
      handleSummary(msg.summary);
      if (msg.actionResult && !msg.actionResult.ok) { sfxError(); toast(msg.actionResult.error); }
      else if (msg.actionResult && typeof msg.actionResult.success === "boolean") {
        if (msg.actionResult.success) { sfxAchievement(); burstConfetti(); toast(`✨ Enhancement succeeded! Now +${msg.actionResult.newPlus}`); }
        else { sfxError(); toast(`💨 Enhancement failed — materials lost, rod is safe.`); }
      } else if (msg.actionResult && msg.actionResult.completed) {
        sfxAchievement();
        toast(`📦 Order fulfilled! +🪙${msg.actionResult.coins?.toLocaleString() ?? 0} · 🎖️ +${msg.actionResult.marks}`);
      }
    } else if (msg.type === "event") {
      state.event = msg.event;
      renderEventRibbon();
      if (state.tab === "fishing") renderPanel();
    } else if (msg.type === "presence") {
      state.presence = msg.players;
      state.guild = msg.guild;
      renderParty();
      renderGuild();
    } else if (msg.type === "bank") {
      state.bank = msg.items || {};
      if (state.tab === "bank") renderPanel();
    } else if (msg.type === "boathouse") {
      state.boathouse = msg;
      if (state.tab === "boathouse") renderPanel();
    } else if (msg.type === "records") {
      state.records = msg.records || [];
      if (state.tab === "collection") renderPanel();
    } else if (msg.type === "notice_board") {
      state.noticeBoard = msg;
      if (state.tab === "notice_board") renderPanel();
    } else if (msg.type === "world") {
      state.world = msg;
      renderWorldStat();
      if (state.tab === "fishing") renderPanel();
    } else if (msg.type === "firsts") {
      state.firsts = msg.firsts || [];
      if (state.tab === "collection") renderPanel();
    } else if (msg.type === "celebration") {
      // A shared moment (Guild level-up / milestone / a partner's prestige) —
      // everyone sees the same fanfare at once, including the person who
      // triggered it (so it's not also handled off the local actionResult).
      if (msg.kind === "guildLevelUp") celebrateGuildLevelUp(msg.data);
      else if (msg.kind === "guildMilestone") celebrateGuildMilestone(msg.data);
      else if (msg.kind === "prestige") celebratePrestige(msg.data);
    } else if (msg.type === "chat_history") {
      $("#chat-log").innerHTML = "";
      msg.messages.forEach(addChatMsg);
      scrollChat();
    } else if (msg.type === "chat") {
      addChatMsg(msg.message);
      scrollChat();
      const isMine = state.player && msg.message.user_id === state.player.userId;
      if (!isMine) {
        if (msg.message.kind === "system") {
          sfxNotify();
          notify("Idyll", msg.message.text, "partner-update");
        } else if (document.hidden) {
          notify(msg.message.name, msg.message.text, "chat");
        }
      }
    } else if (msg.type === "error" && msg.error === "Not authenticated.") {
      localStorage.removeItem("idyll_token");
      location.reload();
    }
  };
  ws.onclose = () => { if (state.token) setTimeout(connectWs, 1500); };
}
function send(msg) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(msg));
}

// ---------------------------------------------------------------- Helpers
const itemDef = (id) => state.game.items[id] || {};
const iconFor = (id) => itemDef(id).icon || "❓";
const nameFor = (id) => itemDef(id).name || id;
const valueFor = (id) => itemDef(id).value;
const rarityOf = (id) => itemDef(id).rarity || "common";
const rarityCls = (id) => `r-${rarityOf(id)}`;
// A small pill for a card's tertiary badges (record/first/shiny/title) — keeps
// flex-bragging info compact and separated from the primary name/meta.
function ciChip(cls, html, title) {
  return `<span class="ci-chip ${cls}"${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</span>`;
}

// Client-side mirror of the engine's efficiency formula, for display.
function effInfo(skillId, levelReq) {
  const lvl = state.player?.skills?.[skillId]?.level ?? 1;
  const above = Math.max(0, lvl - levelReq);
  const guildEff = state.guild?.efficiencyBonus || 0;
  const drink = state.player?.drinkBuff;
  const drinkEff = drink ? drink.efficiencyBonus : 0;
  return { above, pct: Math.round((0.01 * above + guildEff + drinkEff) * 100) };
}

// ---------------------------------------------------------------- State render
function onStateUpdate() {
  renderTopbar();
  renderNav();
  renderPanel();
  renderInventory();
  updateActionBanner();
  renderQueueBar();
}
function renderTopbar() {
  const p = state.player;
  if (!p) return;
  const nameEl = $("#stat-name");
  const totalLevel = Object.values(p.skills).reduce((sum, s) => sum + s.level, 0);
  nameEl.className = "stat" + frameClass(totalLevel);
  nameEl.innerHTML = titleBadgeHtml(p.equipped.title) + escapeHtml(p.name) + prestigeBadgeHtml(p.prestige.level);
  nameEl.title = `Total level ${totalLevel}`;
  $("#stat-coins").textContent = `🪙 ${p.coins.toLocaleString()}`;
  const rod = p.equipped.rod;
  $("#stat-rod").textContent = rod ? `${iconFor(rod)} ${nameFor(rod)}` : "🖐️ Bare hands";
  updateBuffChips();
  renderWorldStat();
}

// ---------------------------------------------------------------- Titles & total-level frames
// A cosmetic flex layer: a total-level "frame" tier (from 4 skills, max 396)
// and an optional title earned from — and worn alongside — an achievement.
function frameClass(totalLevel) {
  if (totalLevel >= 396) return " frame-diamond";
  if (totalLevel >= 300) return " frame-gold";
  if (totalLevel >= 200) return " frame-silver";
  if (totalLevel >= 100) return " frame-bronze";
  return "";
}
function titleTextFor(achievementId) {
  if (!achievementId) return null;
  return state.game.achievements.find((a) => a.id === achievementId)?.title ?? null;
}
function titleBadgeHtml(achievementId) {
  const t = titleTextFor(achievementId);
  return t ? `<span class="title-badge">${escapeHtml(t)}</span> ` : "";
}
function prestigeBadgeHtml(level) {
  return level > 0 ? ` <span class="prestige-stars" title="Prestige ${level}">${"⭐".repeat(Math.min(level, 5))}</span>` : "";
}

// ---------------------------------------------------------------- Shared world clock
const TIME_ICON = { dawn: "🌅", day: "☀️", dusk: "🌆", night: "🌙" };
const TIME_LABEL = { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };
const WEATHER_ICON = { clear: "🌤️", rain: "🌧️", storm: "🌩️", fog: "🌫️" };
const WEATHER_LABEL = { clear: "Clear", rain: "Rain", storm: "Storm", fog: "Fog" };
function worldMatches(condition) {
  if (!condition || !state.world) return true;
  if (condition.time && !condition.time.includes(state.world.time)) return false;
  if (condition.weather && !condition.weather.includes(state.world.weather)) return false;
  return true;
}
function conditionBadge(condition) {
  const parts = [];
  for (const t of condition.time || []) parts.push(TIME_ICON[t]);
  for (const w of condition.weather || []) parts.push(WEATHER_ICON[w]);
  return `<span class="cond-badge">${parts.join("")}</span>`;
}
function renderWorldStat() {
  const chip = $("#stat-world");
  const w = state.world;
  if (!w) return void chip.classList.add("hidden");
  chip.classList.remove("hidden");
  const weatherPart = w.weather !== "clear" ? ` ${WEATHER_ICON[w.weather]} ${WEATHER_LABEL[w.weather]}` : "";
  chip.textContent = `${TIME_ICON[w.time]} ${TIME_LABEL[w.time]}${weatherPart}`;
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function renderBuffChip(chip, b, statsFn) {
  if (!b) return void chip.classList.add("hidden");
  const remaining = (b.expiresAt - Date.now()) / 1000;
  if (remaining <= 0) return void chip.classList.add("hidden");
  chip.classList.remove("hidden");
  chip.innerHTML = `${b.icon} <b>${b.name}</b> <span class="muted">${statsFn(b)}</span> ${fmtTime(remaining)}`;
}
function updateBuffChips() {
  renderBuffChip($("#stat-food-buff"), state.player?.foodBuff, (b) => `+${Math.round((1 - b.speedMult) * 100)}%⚡ +${Math.round(b.rareBonus * 100)}%✨`);
  renderBuffChip($("#stat-drink-buff"), state.player?.drinkBuff, (b) => b.xpMult > 1 ? `+${Math.round((b.xpMult - 1) * 100)}% xp` : `+${Math.round(b.efficiencyBonus * 100)}%⚡eff`);
}
setInterval(updateBuffChips, 1000);

// ---------------------------------------------------------------- Nav
function renderNav() {
  const nav = $("#skill-nav");
  nav.innerHTML = "";
  for (const s of state.game.skills) {
    const lvl = state.player?.skills?.[s.id]?.level ?? 1;
    const item = el("div", "nav-item" + (state.tab === s.id ? " active" : ""));
    item.innerHTML = `<span class="nicon">${s.icon}</span><span>${s.name}</span><span class="nlvl">${lvl}</span>`;
    item.onclick = () => selectTab(s.id);
    nav.appendChild(item);
  }
  const extra = $("#extra-nav");
  extra.innerHTML = "";
  for (const [id, icon, label] of [["collection", "📖", "Collection"], ["achievements", "🏆", "Achievements"], ["prestige", "✨", "Prestige"], ["notice_board", "📋", "Merchant's Dock"], ["bank", "🏦", "Shared Bank"], ["boathouse", "🏠", "Boathouse"], ["shop", "🛒", "Shop"]]) {
    const item = el("div", "nav-item" + (state.tab === id ? " active" : ""));
    item.innerHTML = `<span class="nicon">${icon}</span><span>${label}</span>`;
    item.onclick = () => selectTab(id);
    extra.appendChild(item);
  }
}
function selectTab(tab) {
  state.tab = tab;
  renderNav();
  renderPanel();
}

// ---------------------------------------------------------------- Panels
function renderPanel() {
  if (!state.player) return;
  const panel = $("#panel");
  panel.innerHTML = "";
  if (state.tab === "collection") return renderCollection(panel);
  if (state.tab === "achievements") return renderAchievements(panel);
  if (state.tab === "prestige") return renderPrestige(panel);
  if (state.tab === "shop") return renderShop(panel);
  if (state.tab === "bank") return renderBank(panel);
  if (state.tab === "boathouse") return renderBoathouse(panel);
  if (state.tab === "notice_board") return renderNoticeBoard(panel);
  if (state.tab === "fishing") return renderFishing(panel);
  return renderSkill(panel, state.tab);
}

function skillHeader(panel, skill) {
  const sk = state.player.skills[skill.id];
  const head = el("div", "panel-head");
  head.innerHTML = `<h2>${skill.icon} ${skill.name}</h2><span class="lvl">Level ${sk.level}</span>`;
  head.appendChild(legendButton());
  panel.appendChild(head);
  panel.appendChild(el("p", "panel-blurb", skill.blurb));
  const bar = el("div", "skill-xpbar");
  bar.appendChild(el("span", null)).style.width = `${(sk.pct * 100).toFixed(1)}%`;
  panel.appendChild(bar);
}

// Quantity picker used by the "+ Queue" buttons.
function queueControls(panel) {
  const row = el("div", "queue-qty");
  const opts = [
    ["10", 10], ["50", 50], ["200", 200], ["1000", 1000], ["∞", 0],
  ];
  const label = el("span", "muted", "Queue amount:");
  row.appendChild(label);
  for (const [txt, val] of opts) {
    const b = el("button", "qty-btn" + (state.queueQty === val ? " on" : ""), txt);
    b.onclick = () => { state.queueQty = val; renderPanel(); };
    row.appendChild(b);
  }
  row.appendChild(el("span", "muted qhint", "· “Start” fishes forever; “+ Queue” lines up this many, then moves on."));
  panel.appendChild(row);
}

// ---- Fishing ----
function renderFishing(panel) {
  const p = state.player;
  const skill = state.game.skills.find((s) => s.id === "fishing");
  skillHeader(panel, skill);

  // Controls: rod, reel, line, lure, and provisions — all equipped/set from your Inventory below.
  const controls = el("div", "fish-controls");
  const rod = p.equipped.rod;
  const rs = p.rodStats;
  const plusTxt = rs && rs.plus > 0 ? ` <span class="plus-badge">+${rs.plus}</span>` : "";
  const rodTxt = rod
    ? `${iconFor(rod)} <b>${nameFor(rod)}</b>${plusTxt} <span class="muted">(−${Math.round((1 - (rs?.speedMult ?? 1)) * 100)}% time, +${Math.round((rs?.rareBonus ?? 0) * 100)}% rare)</span>`
    : `<span class="muted">No rod — fishing bare-handed. Craft or buy a rod!</span>`;
  const reel = p.equipped.reel;
  const reelTxt = reel
    ? `${iconFor(reel)} <b>${nameFor(reel)}</b> <span class="muted">(+${Math.round((itemDef(reel).reelEfficiency || 0) * 100)}% efficiency)</span>`
    : `<span class="muted">No reel equipped.</span>`;
  const line = p.equipped.line;
  const lineTxt = line
    ? `${iconFor(line)} <b>${nameFor(line)}</b> <span class="muted">(${Math.round((itemDef(line).lineBaitSave || 0) * 100)}% chance to save your lure)</span>`
    : `<span class="muted">No line equipped.</span>`;
  const lure = p.equipped.lure;
  const lureQty = lure ? (p.inventory[lure] || 0) : 0;
  const lureTxt = lure
    ? lureQty > 0
      ? `${iconFor(lure)} <b>${nameFor(lure)}</b> ×${lureQty} <span class="muted">(+${Math.round(itemDef(lure).baitRareBonus * 100)}% rare per cast)</span>`
      : `${iconFor(lure)} <b>${nameFor(lure)}</b> <span class="muted">— out of stock</span>`
    : `<span class="muted">No lure equipped — equip bait from your Inventory below.</span>`;
  const food = p.loadout.food;
  const foodTxt = food
    ? `${iconFor(food)} <b>${nameFor(food)}</b> ×${p.inventory[food] || 0} left`
    : `<span class="muted">Not set — pick a dish in Inventory to auto-eat while fishing.</span>`;
  const drink = p.loadout.drink;
  const drinkTxt = drink
    ? `${iconFor(drink)} <b>${nameFor(drink)}</b> ×${p.inventory[drink] || 0} left`
    : `<span class="muted">Not set — brew a drink for efficiency/XP.</span>`;
  controls.innerHTML = `
    <div class="ctl">🎣 Rod: ${rodTxt}</div>
    <div class="ctl">🎡 Reel: ${reelTxt}</div>
    <div class="ctl">🧶 Line: ${lineTxt}</div>
    <div class="ctl">🪝 Lure: ${lureTxt}</div>
    <div class="ctl">🍽️ Food: ${foodTxt}</div>
    <div class="ctl">🧉 Drink: ${drinkTxt}</div>
  `;
  panel.appendChild(controls);

  queueControls(panel);
  const cards = el("div", "cards");
  for (const z of state.game.zones) cards.appendChild(zoneCard(z));
  panel.appendChild(cards);
}

function zoneCard(z) {
  const p = state.player;
  const lvl = p.skills.fishing.level;
  const locked = lvl < z.levelReq;
  const active = p.action && p.action.type === "fish" && p.action.refId === z.id;
  const hot = state.event && state.event.zoneId === z.id;
  const card = el("div", "card" + (locked ? " locked" : "") + (active ? " active" : "") + (hot ? " hotspot" : ""));
  const fishTags = z.fish
    .slice()
    .sort((a, b) => RARITY_ORDER.indexOf(rarityOf(a.item)) - RARITY_ORDER.indexOf(rarityOf(b.item)))
    .map((f) => {
      if (!f.condition) return `<span class="tag-item ${rarityCls(f.item)}">${iconFor(f.item)} ${nameFor(f.item)}</span>`;
      const badge = conditionBadge(f.condition);
      const cls = worldMatches(f.condition) ? "exclusive-on" : "exclusive-off";
      const title = worldMatches(f.condition) ? "Biting right now!" : "Not biting right now — check the sky in the topbar.";
      return `<span class="tag-item ${rarityCls(f.item)} ${cls}" title="${title}">${iconFor(f.item)} ${nameFor(f.item)} ${badge}</span>`;
    })
    .join("");
  const eff = effInfo("fishing", z.levelReq);
  const effLine = !locked && eff.pct > 0 ? `<div class="c-meta eff">⚡ ${eff.pct}% efficiency <span class="muted">(bonus catches from your level)</span></div>` : "";
  card.innerHTML = `
    <div class="c-title">${z.icon} ${z.name}${hot ? ` <span class="hot-badge">🔥 HOTSPOT</span>` : ""}</div>
    <div class="c-meta">${z.blurb}</div>
    <div class="c-meta">Requires Fishing ${z.levelReq} · ~${z.baseTimeSec}s/cast · ${z.xpMult}× XP</div>
    ${effLine}
    <div class="c-io">Catches: <div class="zone-fish">${fishTags}</div></div>
  `;
  card.appendChild(cardButtons(active, locked, `🔒 Fishing ${z.levelReq}`, "Fish here", "fish", z.id));
  return card;
}

// Build the Start / +Queue (or Stop) button row shared by zone & action cards.
function cardButtons(active, locked, lockedLabel, startLabel, kind, refId) {
  const wrap = el("div", "card-btns");
  if (active) {
    const stop = el("button", "do", "Stop");
    stop.onclick = () => send({ type: "stop" });
    wrap.appendChild(stop);
    return wrap;
  }
  const start = el("button", "do", locked ? lockedLabel : startLabel);
  start.disabled = locked;
  start.onclick = () => send({ type: "action", kind, refId });
  wrap.appendChild(start);
  if (!locked) {
    const q = state.queueQty;
    const add = el("button", "do queue-btn", q === 0 ? "+ Queue ∞" : `+ Queue ${q}`);
    add.onclick = () => send({ type: "queue", kind, refId, target: q });
    wrap.appendChild(add);
  }
  return wrap;
}

// ---- Foraging / Crafting / Cooking ----
const TOOL_SLOT_BY_SKILL = { foraging: "toolForaging", crafting: "toolCrafting", cooking: "toolCooking" };
function renderSkill(panel, skillId) {
  const skill = state.game.skills.find((s) => s.id === skillId);
  skillHeader(panel, skill);

  const slot = TOOL_SLOT_BY_SKILL[skillId];
  if (slot) {
    const p = state.player;
    const tool = p.equipped[slot];
    const toolTxt = tool
      ? `${iconFor(tool)} <b>${nameFor(tool)}</b> <span class="muted">(−${Math.round((1 - (itemDef(tool).toolSpeedMult || 1)) * 100)}% time${itemDef(tool).toolEfficiency ? `, +${Math.round(itemDef(tool).toolEfficiency * 100)}% efficiency` : ""})</span>`
      : `<span class="muted">No tool equipped — craft or buy one, then equip it from Inventory.</span>`;
    const controls = el("div", "fish-controls");
    controls.innerHTML = `<div class="ctl">🛠️ Tool: ${toolTxt}</div>`;
    panel.appendChild(controls);
  }

  queueControls(panel);
  const cards = el("div", "cards");
  for (const a of state.game.actions.filter((x) => x.skill === skillId)) cards.appendChild(actionCard(a, skill));
  panel.appendChild(cards);
}
function actionCard(a, skill) {
  const p = state.player;
  const lvl = p.skills[skill.id].level;
  const locked = lvl < a.levelReq;
  const active = p.action && p.action.refId === a.id;
  const card = el("div", "card" + (locked ? " locked" : "") + (active ? " active" : ""));
  const outIcons = a.outputs
    .map((o) => `<span class="tag-item ${rarityCls(o.item)}">${iconFor(o.item)} ${nameFor(o.item)}${o.qty > 1 ? " ×" + o.qty : ""}${o.chance && o.chance < 1 ? ` (${Math.round(o.chance * 100)}%)` : ""}</span>`)
    .join("");
  const inIcons = a.inputs.length
    ? `<div class="c-io">Needs: ${a.inputs.map((i) => `<span class="tag-item">${iconFor(i.item)} ${i.qty}× ${nameFor(i.item)} <b>(${p.inventory[i.item] || 0})</b></span>`).join("")}</div>`
    : "";
  const eff = effInfo(skill.id, a.levelReq);
  const effLine = !locked && eff.pct > 0 ? `<div class="c-meta eff">⚡ ${eff.pct}% efficiency <span class="muted">(bonus output from your level)</span></div>` : "";
  card.innerHTML = `
    <div class="c-title">${a.name}</div>
    <div class="c-meta">Requires level ${a.levelReq} · ${a.durationSec}s · ${a.xp} xp</div>
    ${inIcons}
    <div class="c-io">Makes: ${outIcons}</div>
    ${effLine}
  `;
  card.appendChild(cardButtons(active, locked, `🔒 Level ${a.levelReq}`, "Start", "action", a.id));
  return card;
}

// ---- Collection (bestiary) ----
function renderCollection(panel) {
  const p = state.player;
  const caught = Object.keys(p.bestiary).length;
  const totalFish = state.game.zones.reduce((n, z) => n + z.fish.length, 0);
  const collHead = el("div", "panel-head", `<h2>📖 Collection</h2><span class="lvl">${caught}/${totalFish} discovered</span>`);
  collHead.appendChild(legendButton());
  panel.appendChild(collHead);
  panel.appendChild(el("p", "panel-blurb", "Every species you two reel in gets logged here — with your personal record size."));
  for (const z of state.game.zones) {
    const wrap = el("div", "collection-zone");
    wrap.appendChild(el("h3", null, `${z.icon} ${z.name}`));
    const grid = el("div", "col-grid");
    for (const f of z.fish.slice().sort((a, b) => RARITY_ORDER.indexOf(rarityOf(a.item)) - RARITY_ORDER.indexOf(rarityOf(b.item)))) {
      const rec = p.bestiary[f.item];
      const worldRecord = state.records.find((r) => r.species === f.item);
      const trophyChip = worldRecord ? ciChip("ci-chip-record", `🏆 ${worldRecord.size}cm`, `Trophy Hall record — ${worldRecord.holder_name}`) : "";
      const first = state.firsts.find((r) => r.species === f.item);
      const firstChip = first ? ciChip("ci-chip-first", "🥇 First", `First ever caught by ${first.holder_name}`) : "";
      const shinyId = `shiny_${f.item}`;
      const shinyRec = p.bestiary[shinyId];
      const shinyChip = shinyRec
        ? ciChip("ci-chip-shiny", `💫 ×${shinyRec.count.toLocaleString()}`, `Shiny caught — best ${shinyRec.max}cm`)
        : "";
      const badges = trophyChip + firstChip + shinyChip;
      const badgeRow = badges ? `<div class="ci-badges">${badges}</div>` : "";
      const rarity = rarityOf(f.item);
      const condBadge = f.condition ? ` ${conditionBadge(f.condition)}` : "";
      const glowCls = (rec && (rarity === "epic" || rarity === "legendary") ? ` glow-${rarity}` : "") + (shinyRec ? " glow-shiny" : "");
      const item = el("div", "col-item" + (rec ? "" : " uncaught") + glowCls);
      item.innerHTML = `
        <div class="ci-top"><span class="ci-icon">${rec ? iconFor(f.item) : "❔"}</span>
          <span class="ci-name ${rarityCls(f.item)}"><span class="rar-dot bg-${rarityOf(f.item)}"></span>${rec ? nameFor(f.item) : "???"}${condBadge}</span></div>
        <div class="ci-meta">${rec ? `Caught ${rec.count.toLocaleString()} · your best ${rec.max} cm` : `Not yet discovered`}</div>
        ${badgeRow}
      `;
      grid.appendChild(item);
    }
    wrap.appendChild(grid);
    panel.appendChild(wrap);
  }
}

// ---- Prestige (the "Master Angler" rebirth) ----
function renderPrestige(panel) {
  const pr = state.player.prestige;
  const head = el("div", "panel-head", `<h2>✨ Prestige</h2><span class="lvl">Level ${pr.level}</span>`);
  head.appendChild(legendButton());
  panel.appendChild(head);
  panel.appendChild(el("p", "panel-blurb",
    `Rebirth once all four skills hit level ${pr.requirement}: every skill resets to level 1, and in exchange you keep a permanent +${Math.round(PRESTIGE_PCT)}% efficiency bonus — forever, stacking with every future prestige. Nothing else changes: coins, gear, achievements, titles, your Collection, and every shared system (Guild, Boathouse, Bank) are completely untouched.`));

  const bonusBox = el("div", "prestige-box");
  bonusBox.innerHTML = `
    <div class="prestige-stat"><span class="prestige-num">+${Math.round(pr.bonus * 100)}%</span><span class="muted">efficiency, account-wide, right now</span></div>
    <div class="prestige-stat"><span class="prestige-num">+${Math.round(pr.nextBonus * 100)}%</span><span class="muted">efficiency after your next prestige</span></div>
  `;
  panel.appendChild(bonusBox);

  panel.appendChild(el("h3", "bank-sub", "Requirements"));
  const grid = el("div", "col-grid");
  for (const s of pr.skills) {
    const pct = Math.min(1, s.level / pr.requirement);
    const item = el("div", "col-item" + (s.level >= pr.requirement ? " glow-shiny" : ""));
    item.innerHTML = `
      <div class="ci-top"><span class="ci-icon">${s.icon}</span><span class="ci-name">${s.name}</span></div>
      <div class="ci-meta">Level ${s.level} / ${pr.requirement}${s.level >= pr.requirement ? " · ✅ ready" : ""}</div>
      <div class="skill-xpbar"><span style="width:${(pct * 100).toFixed(1)}%"></span></div>
    `;
    grid.appendChild(item);
  }
  panel.appendChild(grid);

  const btn = el("button", "primary prestige-btn" + (pr.ready ? "" : " disabled"), pr.ready ? "🌟 Prestige now" : `🔒 Reach level ${pr.requirement} in every skill`);
  if (pr.ready) btn.onclick = openPrestigeConfirm;
  else btn.disabled = true;
  panel.appendChild(btn);
}
const PRESTIGE_PCT = 3; // keep in sync with engine.ts PRESTIGE_EFFICIENCY_PER_LEVEL (0.03)
function openPrestigeConfirm() {
  const pr = state.player.prestige;
  const overlay = el("div", "modal-overlay");
  overlay.innerHTML = `
    <div class="modal">
      <h2>🌟 Confirm rebirth</h2>
      <p class="wb-row">This will reset <b>Fishing, Foraging, Tackle Crafting, and Cooking back to level 1</b> — right now, for good.</p>
      <p class="wb-row">You'll keep everything else: coins, inventory, gear, achievements, titles, your Collection, and every shared system (Guild, Boathouse, Bank, records). Your permanent efficiency bonus goes from +${Math.round(pr.bonus * 100)}% to <b>+${Math.round(pr.nextBonus * 100)}%</b>, forever.</p>
      <p class="wb-row muted">This can't be undone.</p>
      <button class="primary wb-confirm">Yes, prestige now</button>
      <button class="cancel-btn wb-close">Never mind</button>
    </div>`;
  overlay.querySelector(".wb-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector(".wb-confirm").onclick = () => {
    send({ type: "prestige" });
    overlay.remove();
  };
  document.body.appendChild(overlay);
}

// ---- Shop ----
function renderShop(panel) {
  panel.appendChild(el("div", "panel-head", `<h2>🛒 Bait & Tackle Shop</h2><span class="lvl">🪙 ${state.player.coins.toLocaleString()}</span>`));
  panel.appendChild(el("p", "panel-blurb", "Sell your catch from the inventory below. Spend coins here on essentials."));
  for (const entry of state.game.shop) {
    const line = el("div", "shop-line");
    line.innerHTML = `<span>${iconFor(entry.item)}</span><span class="s-name">${nameFor(entry.item)}</span><span class="s-price">🪙 ${entry.price}</span>`;
    const b1 = el("button", null, "Buy 1");
    b1.onclick = () => send({ type: "buy", item: entry.item, qty: 1 });
    const b10 = el("button", null, "Buy 10");
    b10.onclick = () => send({ type: "buy", item: entry.item, qty: 10 });
    line.appendChild(b1);
    line.appendChild(b10);
    panel.appendChild(line);
  }

  const marks = state.guild?.marks ?? 0;
  panel.appendChild(el("div", "panel-head marks-head", `<h2>🎖️ Guild Marks Shop</h2><span class="lvl">🎖️ ${marks.toLocaleString()}</span>`));
  panel.appendChild(el("p", "panel-blurb", "Earned from Merchant's Dock orders and shared Guild milestones — spend them here."));
  for (const entry of state.game.marksShop) {
    const line = el("div", "shop-line");
    line.innerHTML = `<span>${iconFor(entry.item)}</span><span class="s-name">${nameFor(entry.item)}</span><span class="s-price marks-price">🎖️ ${entry.price}</span>`;
    const b1 = el("button", null, "Buy 1");
    b1.onclick = () => send({ type: "buy_marks", item: entry.item, qty: 1 });
    line.appendChild(b1);
    panel.appendChild(line);
  }
}

// ---- Shared Bank ----
function renderBank(panel) {
  const p = state.player;
  panel.appendChild(el("div", "panel-head", `<h2>🏦 Shared Bank</h2><span class="lvl">for both anglers</span>`));
  panel.appendChild(el("p", "panel-blurb", "A stash you both share. Deposit fish and materials here so either of you can grab them — no matter who's online."));

  // Bank contents (withdraw)
  panel.appendChild(el("h3", "bank-sub", "🏦 In the bank"));
  const bankEntries = Object.entries(state.bank).filter(([, q]) => q > 0).sort((a, b) => nameFor(a[0]).localeCompare(nameFor(b[0])));
  const bankGrid = el("div", "inv-grid");
  if (!bankEntries.length) bankGrid.appendChild(el("p", "empty-note", "The bank is empty. Deposit something below!"));
  for (const [id, qty] of bankEntries) {
    const item = el("div", "inv-item");
    item.title = nameFor(id);
    item.innerHTML = `<div class="ii-icon">${iconFor(id)}</div><div class="ii-qty">${qty.toLocaleString()}</div><span class="ii-name ${rarityCls(id)}">${nameFor(id)}</span>`;
    const act = el("div", "ii-actions");
    const w1 = el("button", null, "Take 1");
    w1.onclick = () => send({ type: "withdraw", item: id, qty: 1 });
    const wa = el("button", null, "All");
    wa.onclick = () => send({ type: "withdraw", item: id, qty });
    act.appendChild(w1);
    act.appendChild(wa);
    item.appendChild(act);
    bankGrid.appendChild(item);
  }
  panel.appendChild(bankGrid);

  // Your bag (deposit)
  panel.appendChild(el("h3", "bank-sub", "🎒 Your bag — deposit"));
  const bagEntries = Object.entries(p.inventory).filter(([, q]) => q > 0).sort((a, b) => nameFor(a[0]).localeCompare(nameFor(b[0])));
  const bagGrid = el("div", "inv-grid");
  if (!bagEntries.length) bagGrid.appendChild(el("p", "empty-note", "Nothing to deposit."));
  for (const [id, qty] of bagEntries) {
    const equipped = p.equipped.rod === id;
    const item = el("div", "inv-item" + (equipped ? " equipped" : ""));
    item.title = nameFor(id);
    item.innerHTML = `<div class="ii-icon">${iconFor(id)}</div><div class="ii-qty">${qty.toLocaleString()}</div><span class="ii-name ${rarityCls(id)}">${nameFor(id)}</span>`;
    const act = el("div", "ii-actions");
    const d1 = el("button", null, "Bank 1");
    d1.onclick = () => send({ type: "deposit", item: id, qty: 1 });
    const da = el("button", null, "All");
    da.onclick = () => send({ type: "deposit", item: id, qty });
    act.appendChild(d1);
    act.appendChild(da);
    item.appendChild(act);
    bagGrid.appendChild(item);
  }
  panel.appendChild(bagGrid);
}

// ---- The Boathouse ----
function costLine(cost) {
  const mats = cost.materials.map((m) => {
    const have = state.bank[m.item] || 0;
    const short = have < m.qty;
    return `<span class="tag-item${short ? " short" : ""}">${iconFor(m.item)} ${m.qty.toLocaleString()} ${nameFor(m.item)} <b>(bank: ${have.toLocaleString()})</b></span>`;
  }).join(" ");
  const purseShort = (state.boathouse?.purseCoins || 0) < cost.coins;
  return `<div class="c-io">Costs: <span class="tag-item${purseShort ? " short" : ""}">🪙 ${cost.coins.toLocaleString()} <b>(purse: ${(state.boathouse?.purseCoins || 0).toLocaleString()})</b></span> ${mats}</div>`;
}
function renderBoathouse(panel) {
  const bh = state.boathouse;
  panel.appendChild(el("div", "panel-head", `<h2>🏠 The Boathouse</h2><span class="lvl">🪙 ${(bh?.purseCoins || 0).toLocaleString()} in the shared purse</span>`));
  panel.appendChild(el("p", "panel-blurb", "A shared home you build together. Upgrades draw materials from the Shared Bank and coins from the Shared Purse — deposit some of each, then either of you can spend it."));

  const purseRow = el("div", "fish-controls");
  purseRow.innerHTML = `
    <div class="ctl">🪙 Your coins: <b>${state.player.coins.toLocaleString()}</b></div>
    <div class="ctl purse-contrib">
      <input type="number" id="purse-amount" min="1" placeholder="Amount" style="width:110px" />
      <button class="do" id="purse-contribute-btn">Contribute to Purse</button>
    </div>
  `;
  panel.appendChild(purseRow);
  purseRow.querySelector("#purse-contribute-btn").onclick = () => {
    const amount = Math.floor(Number(purseRow.querySelector("#purse-amount").value));
    if (amount > 0) send({ type: "purse_contribute", amount });
  };

  if (!bh) return void panel.appendChild(el("p", "empty-note", "Loading…"));
  const cards = el("div", "cards");
  for (const room of bh.rooms) {
    const card = el("div", "card" + (room.level >= room.maxLevel ? " maxed" : ""));
    const levelDots = Array.from({ length: room.maxLevel }, (_, i) => `<span class="room-dot${i < room.level ? " on" : ""}"></span>`).join("");
    card.innerHTML = `
      <div class="c-title">${room.icon} ${room.name} <span class="muted">Lv ${room.level}/${room.maxLevel}</span></div>
      <div class="room-dots">${levelDots}</div>
      <div class="c-meta">${room.desc}</div>
      ${room.nextCost ? costLine(room.nextCost) : `<div class="c-meta eff">✅ Maxed out!</div>`}
    `;
    if (room.nextCost) {
      const btn = el("button", "do", `Upgrade to Lv ${room.level + 1}`);
      btn.onclick = () => send({ type: "boathouse_upgrade", room: room.id });
      card.appendChild(btn);
    }
    cards.appendChild(card);
  }
  panel.appendChild(cards);
}

// ---------------------------------------------------------------- Notice Board (Merchant's Dock)
function fmtHoursMin(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function renderNoticeBoard(panel) {
  const nb = state.noticeBoard;
  const marks = state.guild?.marks ?? 0;
  panel.appendChild(el("div", "panel-head", `<h2>📋 Merchant's Dock</h2><span class="lvl">🎖️ ${marks.toLocaleString()} Guild Marks</span>`));
  panel.appendChild(el("p", "panel-blurb", "Daily buy-orders at premium prices — a reason to pick tonight's target. The Coop Order needs a bigger haul; either (or both) of you can chip in."));
  if (!nb) return void panel.appendChild(el("p", "empty-note", "Loading…"));
  panel.appendChild(el("p", "muted small-note", `New orders in ${fmtHoursMin(nb.nextRefreshAt - Date.now())}.`));

  const cards = el("div", "cards");
  for (const order of nb.orders) {
    const have = state.player.inventory[order.item] || 0;
    const remainingQty = order.qty - order.delivered;
    const pct = Math.min(100, (order.delivered / order.qty) * 100);
    const card = el("div", "card" + (order.completed ? " maxed" : "") + (order.coop ? " coop-order" : ""));
    card.innerHTML = `
      <div class="c-title">${order.coop ? "🤝 Coop Order" : "📦 Order"} <span class="muted">${iconFor(order.item)} ${nameFor(order.item)}</span></div>
      <div class="c-meta">Deliver ${order.qty.toLocaleString()}× for ${order.multiplier}× value each · 🎖️ ${order.marksReward} on completion</div>
      <div class="order-bar"><span style="width:${pct}%"></span></div>
      <div class="c-meta">${order.completed ? "✅ Fulfilled today!" : `${order.delivered.toLocaleString()}/${order.qty.toLocaleString()} delivered · you have ${have.toLocaleString()}`}</div>
    `;
    if (!order.completed) {
      const giveQty = Math.min(have, remainingQty);
      const btn = el("button", "do", giveQty > 0 ? `Deliver ${giveQty.toLocaleString()}` : "Nothing to deliver");
      btn.disabled = giveQty < 1;
      btn.onclick = () => send({ type: "deliver_order", orderId: order.id, qty: giveQty });
      card.appendChild(btn);
    }
    cards.appendChild(card);
  }
  panel.appendChild(cards);
}

// ---------------------------------------------------------------- Inventory
function renderInventory() {
  const grid = $("#inventory-grid");
  const p = state.player;
  const entries = Object.entries(p.inventory).filter(([, q]) => q > 0);
  entries.sort((a, b) => nameFor(a[0]).localeCompare(nameFor(b[0])));
  grid.innerHTML = "";
  if (!entries.length) return void grid.appendChild(el("p", "empty-note", "Empty. Cast a line to fill it up!"));
  for (const [id, qty] of entries) {
    const d = itemDef(id);
    const isRod = d.category === "rod";
    const isBait = d.category === "bait";
    const isReel = d.category === "reel";
    const isLine = d.category === "line";
    const isTool = d.category === "tool";
    const toolSlot = isTool ? TOOL_SLOT_BY_SKILL[d.toolSkill] : null;
    const isFood = d.category === "dish" && d.buffDurationSec != null;
    const isDrink = d.category === "drink" && d.buffDurationSec != null;
    const equipped = (isRod && p.equipped.rod === id) || (isBait && p.equipped.lure === id) ||
      (isReel && p.equipped.reel === id) || (isLine && p.equipped.line === id) ||
      (isTool && p.equipped[toolSlot] === id) ||
      (isFood && p.loadout.food === id) || (isDrink && p.loadout.drink === id);
    const rarity = rarityOf(id);
    const glowCls = (rarity === "epic" || rarity === "legendary" ? ` glow-${rarity}` : "") + (d.shiny ? " glow-shiny" : "");
    const item = el("div", "inv-item" + (equipped ? " equipped" : "") + glowCls);
    item.title = valueFor(id) != null ? `${nameFor(id)} — sells for 🪙${valueFor(id)}` : nameFor(id);
    const plus = isRod ? (p.enhancements[id] || 0) : 0;
    const plusBadge = plus > 0 ? ` <span class="plus-badge">+${plus}</span>` : "";
    item.innerHTML = `<div class="ii-icon">${iconFor(id)}</div><div class="ii-qty">${qty.toLocaleString()}</div><span class="ii-name ${rarityCls(id)}">${nameFor(id)}${plusBadge}</span>`;
    const act = el("div", "ii-actions");
    if (isRod) {
      const eq = el("button", null, equipped ? "Unequip" : "Equip");
      eq.onclick = () => send(equipped ? { type: "unequip", slot: "rod" } : { type: "equip", slot: "rod", item: id });
      act.appendChild(eq);
      const enh = el("button", null, "Enhance");
      enh.onclick = () => openEnhanceModal(id);
      act.appendChild(enh);
    }
    if (isBait) {
      const eq = el("button", null, equipped ? "Unequip" : "Equip as Lure");
      eq.title = `+${Math.round((d.baitRareBonus || 0) * 100)}% rare per cast while equipped`;
      eq.onclick = () => send(equipped ? { type: "unequip", slot: "lure" } : { type: "equip", slot: "lure", item: id });
      act.appendChild(eq);
    }
    if (isReel) {
      const eq = el("button", null, equipped ? "Unequip" : "Equip");
      eq.onclick = () => send(equipped ? { type: "unequip", slot: "reel" } : { type: "equip", slot: "reel", item: id });
      act.appendChild(eq);
    }
    if (isLine) {
      const eq = el("button", null, equipped ? "Unequip" : "Equip");
      eq.onclick = () => send(equipped ? { type: "unequip", slot: "line" } : { type: "equip", slot: "line", item: id });
      act.appendChild(eq);
    }
    if (isTool) {
      const eq = el("button", null, equipped ? "Unequip" : "Equip");
      eq.onclick = () => send(equipped ? { type: "unequip", slot: toolSlot } : { type: "equip", slot: toolSlot, item: id });
      act.appendChild(eq);
    }
    if (isFood) {
      const btn = el("button", null, equipped ? "Clear" : "Set as Food");
      btn.title = `+${Math.round((1 - d.buffSpeedMult) * 100)}% cast speed, +${Math.round(d.buffRareBonus * 100)}% rare — auto-eaten while fishing (${Math.round(d.buffDurationSec / 60)} min per dish)`;
      btn.onclick = () => send({ type: "loadout", kind: "food", item: equipped ? null : id });
      act.appendChild(btn);
    }
    if (isDrink) {
      const btn = el("button", null, equipped ? "Clear" : "Set as Drink");
      const bonusTxt = d.buffXpMult ? `+${Math.round((d.buffXpMult - 1) * 100)}% xp` : `+${Math.round((d.buffEfficiencyBonus || 0) * 100)}% efficiency`;
      btn.title = `${bonusTxt} — auto-drunk while playing (${Math.round(d.buffDurationSec / 60)} min per drink)`;
      btn.onclick = () => send({ type: "loadout", kind: "drink", item: equipped ? null : id });
      act.appendChild(btn);
    }
    if (valueFor(id) != null) {
      const s1 = el("button", null, "Sell 1");
      s1.onclick = () => send({ type: "sell", item: id, qty: 1 });
      const sa = el("button", null, "All");
      sa.onclick = () => send({ type: "sell", item: id, qty: qty });
      act.appendChild(s1);
      act.appendChild(sa);
    }
    if (act.children.length) item.appendChild(act);
    grid.appendChild(item);
  }
}

// ---- Rod enhancement modal ----
const ENHANCE_SUCCESS = [0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25];
function enhanceCostClient(target) {
  return { driftwood: target, fishing_line: target, pearl: Math.ceil(target / 3), coins: 25 * target * target };
}
function workshopEnhanceBonus() {
  const w = state.boathouse?.rooms?.find((r) => r.id === "workshop");
  return (w?.level || 0) * 0.01;
}
function openEnhanceModal(rodId) {
  const p = state.player;
  const plus = p.enhancements[rodId] || 0;
  const overlay = el("div", "modal-overlay");
  if (plus >= 10) {
    overlay.innerHTML = `<div class="modal"><h2>${iconFor(rodId)} ${nameFor(rodId)}</h2><p class="wb-row">Already at max enhancement (+10)! 🏆</p><button class="primary wb-close">Close</button></div>`;
  } else {
    const target = plus + 1;
    const cost = enhanceCostClient(target);
    const chance = Math.min(1, ENHANCE_SUCCESS[target] + workshopEnhanceBonus());
    const haveLacquer = (p.inventory.blessed_lacquer || 0) > 0;
    const short = (need, have) => (have < need ? " short" : "");
    overlay.innerHTML = `
      <div class="modal">
        <h2>${iconFor(rodId)} ${nameFor(rodId)}${plus > 0 ? ` <span class="plus-badge">+${plus}</span>` : ""}</h2>
        <p class="wb-row">Attempt <b>+${target}</b> — success chance <b>${Math.round(chance * 100)}%</b></p>
        <div class="wb-row">
          <span class="tag-item${short(cost.driftwood, p.inventory.driftwood || 0)}">🪵 ${cost.driftwood} Driftwood <span class="muted">(have ${p.inventory.driftwood || 0})</span></span>
          <span class="tag-item${short(cost.fishing_line, p.inventory.fishing_line || 0)}">🧵 ${cost.fishing_line} Fishing Line <span class="muted">(have ${p.inventory.fishing_line || 0})</span></span>
          <span class="tag-item${short(cost.pearl, p.inventory.pearl || 0)}">🫧 ${cost.pearl} Pearl <span class="muted">(have ${p.inventory.pearl || 0})</span></span>
          <span class="tag-item${short(cost.coins, p.coins)}">🪙 ${cost.coins.toLocaleString()} <span class="muted">(have ${p.coins.toLocaleString()})</span></span>
        </div>
        ${haveLacquer
          ? `<label class="ctl lacquer-ctl"><input type="checkbox" id="use-lacquer"/> Use Blessed Lacquer (+15pp, you have ${p.inventory.blessed_lacquer})</label>`
          : `<p class="wb-row muted">No Blessed Lacquer — craft one at Crafting 40 for +15pp success.</p>`}
        <p class="wb-row muted">Failed attempts only cost the materials — your rod is never damaged or destroyed.</p>
        <button class="primary" id="enhance-attempt-btn">Attempt Enhance</button>
        <button class="wb-close cancel-btn">Cancel</button>
      </div>`;
  }
  overlay.querySelector(".wb-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const attemptBtn = overlay.querySelector("#enhance-attempt-btn");
  if (attemptBtn) {
    attemptBtn.onclick = () => {
      const useProtection = !!overlay.querySelector("#use-lacquer")?.checked;
      send({ type: "enhance", rodId, useProtection });
      overlay.remove();
    };
  }
  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------- Action banner
function updateActionBanner() {
  const banner = $("#action-banner");
  const a = state.player?.action;
  if (!a) {
    banner.classList.add("hidden");
    state.anim.refId = null;
    return;
  }
  banner.classList.remove("hidden");
  if (state.anim.refId !== a.refId) {
    state.anim.refId = a.refId;
    state.anim.durationSec = a.durationSec;
    state.anim.cycleStart = performance.now() - a.pct * a.durationSec * 1000;
  } else {
    state.anim.durationSec = a.durationSec;
  }
  const targetTxt = a.target > 0 ? ` · ${a.done}/${a.target}` : " · ∞";
  const hasQueue = (state.player.queue || []).length > 0;
  banner.innerHTML = `
    <div>
      <div class="ab-title">${a.icon ? a.icon + " " : ""}${a.name}</div>
      <div class="ab-sub">${a.type === "fish" ? "🎣 Casting…" : "⏳ Working…"}${targetTxt}</div>
    </div>
    <div class="progress"><span id="ab-fill"></span></div>
    ${hasQueue || a.target > 0 ? `<button class="skip" title="Finish this now and move to the next queued task">⏭ Skip</button>` : ""}
    <button class="stop">Stop all</button>
  `;
  banner.querySelector(".stop").onclick = () => send({ type: "stop" });
  const skipBtn = banner.querySelector(".skip");
  if (skipBtn) skipBtn.onclick = () => send({ type: "skip" });
}

function renderQueueBar() {
  const bar = $("#queue-bar");
  const q = state.player?.queue || [];
  if (!q.length) return void bar.classList.add("hidden");
  bar.classList.remove("hidden");
  bar.innerHTML = `<span class="qb-label">Up next:</span>`;
  q.forEach((entry, i) => {
    const chip = el("span", "qchip");
    chip.innerHTML = `${entry.icon} ${entry.name.replace("Fishing — ", "")} <b>${entry.target > 0 ? "×" + entry.target : "∞"}</b> <span class="qx" title="Remove">✕</span>`;
    chip.querySelector(".qx").onclick = () => send({ type: "dequeue", index: i });
    bar.appendChild(chip);
  });
}
function animate() {
  const a = state.player?.action;
  const fill = document.getElementById("ab-fill");
  if (a && fill) {
    const dur = state.anim.durationSec * 1000;
    const elapsed = (performance.now() - state.anim.cycleStart) % dur;
    fill.style.width = `${(elapsed / dur) * 100}%`;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---------------------------------------------------------------- Guild
function renderGuild() {
  const g = state.guild;
  if (!g) return;
  const box = $("#guild-box");
  const pct = g.needed > 0 ? (g.into / g.needed) * 100 : 100;
  box.innerHTML = `
    <div class="g-level">Guild Level ${g.level}${g.level >= g.maxLevel ? " (max)" : ""}</div>
    <div class="g-sub">${g.total.toLocaleString()} fish caught together · 🎖️ ${g.marks.toLocaleString()} Guild Marks</div>
    <div class="g-bar"><span style="width:${pct}%"></span></div>
    <div class="g-perk">🎣 +${Math.round(g.speedBonus * 100)}% faster casts for both${g.efficiencyBonus > 0 ? ` · ⚡ +${Math.round(g.efficiencyBonus * 100)}% efficiency` : ""}${g.needed > 0 ? ` · ${(g.needed - g.into).toLocaleString()} to next level` : ""}</div>
  `;
}

// ---------------------------------------------------------------- Party
function renderParty() {
  const list = $("#party-list");
  list.innerHTML = "";
  for (const pl of state.presence) {
    const c = el("div", "pcard");
    const maxedSkills = state.game.skills.filter((s) => (pl.skillLevels?.[s.id] ?? 0) >= 99);
    const crowns = maxedSkills.length
      ? `<span class="skill-crowns" title="${maxedSkills.map((s) => s.name).join(", ")} maxed">${maxedSkills.map((s) => `👑${s.icon}`).join("")}</span>`
      : "";
    const titleHtml = pl.title ? `<span class="title-badge">${escapeHtml(pl.title)}</span> ` : "";
    c.innerHTML = `
      <div class="prow"><span class="dot ${pl.online ? "on" : ""}"></span><span class="pname${frameClass(pl.totalLevel)}">${titleHtml}${escapeHtml(pl.name)}${prestigeBadgeHtml(pl.prestige)}</span></div>
      <div class="pmeta">🎣 ${pl.fishingLevel} · Total ${pl.totalLevel} · 📖 ${pl.speciesCaught} · ${pl.online ? "online" : "offline"} ${crowns}</div>
      <div class="pact">${pl.activity || "💤 Resting"}</div>
    `;
    list.appendChild(c);
  }
}

// ---------------------------------------------------------------- Chat
$("#chat-form").onsubmit = (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  send({ type: "chat", text });
  input.value = "";
};
function addChatMsg(m) {
  const isSystem = m.kind === "system";
  const rarityTint = isSystem && m.rarity ? ` r-${m.rarity}` : "";
  const row = el("div", "msg" + (isSystem ? " system" + rarityTint : ""));
  row.innerHTML = `<span class="cname">${escapeHtml(m.name)}</span><span class="ctext">${escapeHtml(m.text)}</span>`;
  $("#chat-log").appendChild(row);
}
function scrollChat() {
  const log = $("#chat-log");
  log.scrollTop = log.scrollHeight;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------- Achievements
function renderAchievements(panel) {
  const p = state.player;
  const unlocked = new Set(p.achievements || []);
  const equippedTitle = p.equipped.title;
  const achHead = el("div", "panel-head", `<h2>🏆 Achievements</h2><span class="lvl">${unlocked.size}/${state.game.achievements.length}</span>`);
  achHead.appendChild(legendButton());
  panel.appendChild(achHead);
  panel.appendChild(el("p", "panel-blurb", "Goals to chase while you fish. Each one pays out coins when you earn it — some also unlock a title you can wear next to your name."));
  const grid = el("div", "col-grid");
  for (const a of state.game.achievements) {
    const got = unlocked.has(a.id);
    const equipped = equippedTitle === a.id;
    const item = el("div", "col-item" + (got ? "" : " uncaught") + (equipped ? " glow-shiny" : ""));
    const titleChip = a.title ? `<div class="ci-badges">${ciChip("ci-chip-title", `🎖️ “${a.title}”`, "Equippable title")}</div>` : "";
    item.innerHTML = `
      <div class="ci-top"><span class="ci-icon">${got ? a.icon : "🔒"}</span><span class="ci-name">${a.name}</span></div>
      <div class="ci-meta">${a.desc}<br/><span style="color:var(--accent-2)">🪙 ${a.coins}</span> ${got ? "· ✅ earned" : ""}</div>
      ${titleChip}
    `;
    if (got && a.title) {
      const btn = el("button", "title-btn", equipped ? "★ Equipped — click to unequip" : "Equip title");
      btn.onclick = () => send(equipped ? { type: "unequip_title" } : { type: "equip_title", achievementId: a.id });
      item.appendChild(btn);
    }
    grid.appendChild(item);
  }
  panel.appendChild(grid);
}

// ---------------------------------------------------------------- Event ribbon
function renderEventRibbon() {
  const ribbon = $("#event-ribbon");
  const e = state.event;
  if (!e || Date.now() >= e.endsAt) return void ribbon.classList.add("hidden");
  ribbon.classList.remove("hidden");
  updateEventRibbon();
}
function updateEventRibbon() {
  const ribbon = $("#event-ribbon");
  const e = state.event;
  if (!e) return;
  const remaining = (e.endsAt - Date.now()) / 1000;
  if (remaining <= 0) {
    ribbon.classList.add("hidden");
    return;
  }
  ribbon.innerHTML = `🔥 <b>Hotspot: ${e.icon} ${e.zoneName}</b> — +${Math.round(e.rareBonus * 100)}% rare & faster casts here · <b>${fmtTime(remaining)}</b> left`;
}
setInterval(() => {
  updateEventRibbon();
  // When an event ends, refresh the fishing panel so the badge clears.
  if (state.event && Date.now() >= state.event.endsAt) {
    state.event = null;
    renderEventRibbon();
    if (state.tab === "fishing") renderPanel();
  }
}, 1000);

// ---------------------------------------------------------------- Summary handling
const MILESTONE_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
function highestMilestone(from, to) {
  let hit = null;
  for (const m of MILESTONE_LEVELS) if (m > from && m <= to) hit = m;
  return hit;
}

function handleSummary(summary) {
  if (!summary) return;
  const hasNews = summary.completions > 0 || (summary.levelUps || []).length || (summary.notableCatches || []).length ||
    (summary.shinyCatches || []).length || (summary.firsts || []).length || summary.guildLevelUp || (summary.guildMilestones || []).length;
  if (state.pendingWelcome) {
    // First sync after connecting (may include a long offline catch-up) — fold
    // everything into one recap instead of firing a flurry of live celebrations.
    state.pendingWelcome = false;
    if (hasNews) showWelcome(summary);
    return;
  }
  // Live: celebrate each moment as it happens. Guild-level events (shared
  // with your partner) arrive separately via the "celebration" broadcast, so
  // both of you see the exact same fanfare at the same time — not handled here.
  for (const lv of summary.levelUps || []) celebrateLevelUp(lv);
  for (const c of summary.notableCatches || []) celebrateCatch(c);
  for (const s of summary.shinyCatches || []) celebrateShiny(s);
  for (const f of summary.firsts || []) celebrateFirst(f);
  for (const a of summary.newAchievements || []) {
    sfxAchievement();
    toast(`🏆 ${a.icon} ${a.name} unlocked! +🪙${a.coins}`);
    notify("Achievement unlocked! 🏆", `${a.icon} ${a.name}`, "achievement");
  }
}

function showWelcome(summary) {
  const items = Object.entries(summary.itemsGained || {}).sort((a, b) => nameFor(a[0]).localeCompare(nameFor(b[0])));
  const xp = Object.entries(summary.xpGained || {});
  const overlay = el("div", "modal-overlay");
  const itemsHtml = items.length
    ? items.map(([id, q]) => `<span class="tag-item ${rarityCls(id)}">${iconFor(id)} ${nameFor(id)} ×${q.toLocaleString()}</span>`).join(" ")
    : "<span class='muted'>nothing this time</span>";
  const xpHtml = xp.length ? xp.map(([s, v]) => `${skillIcon(s)} +${v.toLocaleString()} xp`).join(" · ") : "—";
  const newSp = (summary.newSpecies || []).length
    ? `<div class="wb-row"><b>New species!</b> ${summary.newSpecies.map((id) => `<span class="tag-item ${rarityCls(id)}">${iconFor(id)} ${nameFor(id)}</span>`).join(" ")}</div>`
    : "";
  const levelUps = (summary.levelUps || [])
    .map((lv) => {
      const m = highestMilestone(lv.from, lv.to);
      return `<span class="tag-item${m ? " r-legendary" : ""}">${skillIcon(lv.skill)} ${lv.skill} ${lv.from}→<b>${lv.to}</b>${m ? " 🎉" : ""}</span>`;
    })
    .join(" ");
  const levelHtml = levelUps ? `<div class="wb-row"><b>Level ups!</b> ${levelUps}</div>` : "";
  const notable = (summary.notableCatches || [])
    .map((c) => `<span class="tag-item r-${c.rarity}">${iconFor(c.item)} ${nameFor(c.item)} (${c.size}cm)</span>`)
    .join(" ");
  const notableHtml = notable ? `<div class="wb-row"><b>✨ Notable catches!</b> ${notable}</div>` : "";
  const shinies = (summary.shinyCatches || [])
    .map((c) => `<span class="tag-item r-legendary">💫 ${nameFor(c.item)} (${c.size}cm)</span>`)
    .join(" ");
  const shinyHtml = shinies ? `<div class="wb-row"><b>💫 Shiny catches!</b> ${shinies}</div>` : "";
  const firsts = (summary.firsts || [])
    .map((f) => `<span class="tag-item">🥇 ${nameFor(f.item)}</span>`)
    .join(" ");
  const firstsHtml = firsts ? `<div class="wb-row"><b>🥇 First to catch!</b> ${firsts}</div>` : "";
  const guildHtml = summary.guildLevelUp
    ? `<div class="wb-row">🏛️ <b>Anglers' Guild reached Level ${summary.guildLevelUp.to}!</b></div>`
    : "";
  const milestones = (summary.guildMilestones || [])
    .map((m) => `<span class="tag-item r-legendary">${m.icon} ${m.name} · 🎖️ +${m.marks}</span>`)
    .join(" ");
  const milestoneHtml = milestones ? `<div class="wb-row"><b>🎖️ Guild milestone!</b> ${milestones}</div>` : "";
  overlay.innerHTML = `
    <div class="modal">
      <h2>🎣 While you were away…</h2>
      <div class="wb-row"><b>${summary.completions.toLocaleString()}</b> things happened${summary.bonus > 0 ? ` <span class="muted">(incl. ${summary.bonus.toLocaleString()} bonus from ⚡ efficiency)</span>` : ""}.</div>
      <div class="wb-row">${itemsHtml}</div>
      ${newSp}
      ${notableHtml}
      ${shinyHtml}
      ${firstsHtml}
      ${levelHtml}
      ${guildHtml}
      ${milestoneHtml}
      <div class="wb-row muted">${xpHtml}${summary.coinsGained ? ` · 🪙 +${summary.coinsGained.toLocaleString()}` : ""}</div>
      <button class="primary wb-close">Nice!</button>
    </div>`;
  overlay.querySelector(".wb-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}
function skillIcon(id) {
  return state.game.skills.find((s) => s.id === id)?.icon || "✨";
}
function skillName(id) {
  return state.game.skills.find((s) => s.id === id)?.name || id;
}

// ---------------------------------------------------------------- Celebrations
function celebrateLevelUp(lv) {
  const milestone = highestMilestone(lv.from, lv.to);
  const label = `${skillIcon(lv.skill)} ${skillName(lv.skill)} — Level ${lv.to}!`;
  sfxLevelUp(!!milestone);
  if (milestone) {
    burstConfetti();
    showFanfare(`🎉 ${label}${lv.to === 99 ? " Max level!" : ""}`, "milestone", 4200);
    notify("Level up! 🎉", label, "levelup");
  } else {
    toast(`⬆️ ${label}`);
  }
}
function celebrateCatch(c) {
  const legendary = c.rarity === "legendary";
  sfxCatch(c.rarity);
  if (legendary) burstConfetti();
  const tag = legendary ? "🌟 LEGENDARY CATCH" : "✨ Epic catch";
  showFanfare(`${tag}<br><span class="ff-sub">${iconFor(c.item)} ${nameFor(c.item)} — ${c.size}cm</span>`, `r-${c.rarity}`, legendary ? 4500 : 3200);
  notify(tag, `${nameFor(c.item)} — ${c.size}cm`, "catch");
}
function celebrateShiny(c) {
  sfxShiny();
  burstConfetti();
  showFanfare(`💫 SHINY CATCH!<br><span class="ff-sub">${iconFor(c.item)} ${nameFor(c.item)} — ${c.size}cm</span>`, "shiny", 4800);
  notify("💫 Shiny catch!", `${nameFor(c.item)} — ${c.size}cm`, "shiny");
}
function celebrateFirst(f) {
  toast(`🥇 First ever to catch ${iconFor(f.item)} ${nameFor(f.item)}!`);
  notify("🥇 First catch!", `You're the first to land ${nameFor(f.item)}.`, "first");
}
function celebratePrestige(data) {
  sfxPrestige();
  burstConfetti();
  showFanfare(`🌟 PRESTIGE ${data.prestige}!<br><span class="ff-sub">${escapeHtml(data.name)} was reborn — permanently faster</span>`, "prestige", 5000);
  notify("🌟 Prestige!", `${data.name} reached Prestige ${data.prestige}`, "prestige");
}
function celebrateGuildLevelUp(g) {
  sfxGuild();
  showFanfare(`🏛️ Anglers' Guild — Level ${g.to}!<br><span class="ff-sub">Faster casts for both of you</span>`, "guild", 4000);
  notify("Guild Level Up! 🏛️", `The Anglers' Guild reached Level ${g.to}.`, "guild");
}
function celebrateGuildMilestone(m) {
  sfxGuild();
  burstConfetti();
  showFanfare(`${m.icon} ${m.name}!<br><span class="ff-sub">+${m.marks} Guild Marks for both of you</span>`, "guild", 4500);
  notify("Guild Milestone! 🎖️", `${m.name} — +${m.marks} Guild Marks`, "guild");
}

function showFanfare(html, cls, durationMs) {
  const el2 = el("div", `fanfare ${cls}`, html);
  document.body.appendChild(el2);
  requestAnimationFrame(() => el2.classList.add("show"));
  setTimeout(() => {
    el2.classList.remove("show");
    setTimeout(() => el2.remove(), 400);
  }, durationMs);
}

function burstConfetti() {
  const colors = ["#6cc9a0", "#f0b866", "#6c9ce0", "#b98cf0", "#e7e9ef"];
  const wrap = el("div", "confetti-wrap");
  for (let i = 0; i < 36; i++) {
    const piece = el("div", "confetti-piece");
    const x = 50 + (Math.random() - 0.5) * 70;
    const rot = Math.random() * 360;
    const delay = Math.random() * 0.2;
    const dur = 1.4 + Math.random() * 0.8;
    piece.style.left = `${x}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${dur}s`;
    piece.style.transform = `rotate(${rot}deg)`;
    wrap.appendChild(piece);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2600);
}

// ---------------------------------------------------------------- Toasts
let toastWrap;
function toast(text) {
  if (!toastWrap) {
    toastWrap = el("div", "toast-wrap");
    document.body.appendChild(toastWrap);
  }
  const t = el("div", "toast", text);
  toastWrap.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

boot();
