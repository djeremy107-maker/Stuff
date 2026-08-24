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
  event: null,
  pendingWelcome: false,
  queueQty: 50, // 0 = infinite
  tab: "fishing", // skill id, or "collection" / "shop" / "bank" / "achievements"
  ws: null,
  anim: { refId: null, durationSec: 1, cycleStart: 0 },
};

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

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
      if (msg.actionResult && !msg.actionResult.ok) toast(msg.actionResult.error);
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
    } else if (msg.type === "chat_history") {
      $("#chat-log").innerHTML = "";
      msg.messages.forEach(addChatMsg);
      scrollChat();
    } else if (msg.type === "chat") {
      addChatMsg(msg.message);
      scrollChat();
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

// Client-side mirror of the engine's efficiency formula, for display.
function effInfo(skillId, levelReq) {
  const lvl = state.player?.skills?.[skillId]?.level ?? 1;
  const above = Math.max(0, lvl - levelReq);
  const guildEff = state.guild?.efficiencyBonus || 0;
  return { above, pct: Math.round((0.01 * above + guildEff) * 100) };
}

function bestBaitInBag() {
  let best = null;
  for (const [id, qty] of Object.entries(state.player.inventory)) {
    if (qty <= 0) continue;
    const d = itemDef(id);
    if (d.baitRareBonus && (!best || d.baitRareBonus > best.bonus)) best = { id, bonus: d.baitRareBonus, qty };
  }
  return best;
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
  $("#stat-name").textContent = p.name;
  $("#stat-coins").textContent = `🪙 ${p.coins.toLocaleString()}`;
  const rod = p.equipped.rod;
  $("#stat-rod").textContent = rod ? `${iconFor(rod)} ${nameFor(rod)}` : "🖐️ Bare hands";
  updateBuffChip();
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function updateBuffChip() {
  const chip = $("#stat-buff");
  const b = state.player?.buff;
  if (!b) return void chip.classList.add("hidden");
  const remaining = (b.expiresAt - Date.now()) / 1000;
  if (remaining <= 0) return void chip.classList.add("hidden");
  chip.classList.remove("hidden");
  chip.innerHTML = `${b.icon} <b>${b.name}</b> <span class="muted">+${Math.round((1 - b.speedMult) * 100)}%⚡ +${Math.round(b.rareBonus * 100)}%✨</span> ${fmtTime(remaining)}`;
}
setInterval(updateBuffChip, 1000);

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
  for (const [id, icon, label] of [["collection", "📖", "Collection"], ["achievements", "🏆", "Achievements"], ["bank", "🏦", "Shared Bank"], ["shop", "🛒", "Shop"]]) {
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
  if (state.tab === "shop") return renderShop(panel);
  if (state.tab === "bank") return renderBank(panel);
  if (state.tab === "fishing") return renderFishing(panel);
  return renderSkill(panel, state.tab);
}

function skillHeader(panel, skill) {
  const sk = state.player.skills[skill.id];
  const head = el("div", "panel-head");
  head.innerHTML = `<h2>${skill.icon} ${skill.name}</h2><span class="lvl">Level ${sk.level}</span>`;
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

  // Controls: rod + bait
  const controls = el("div", "fish-controls");
  const rod = p.equipped.rod;
  const rodTxt = rod
    ? `${iconFor(rod)} <b>${nameFor(rod)}</b> <span class="muted">(−${Math.round((1 - itemDef(rod).rodSpeedMult) * 100)}% time, +${Math.round(itemDef(rod).rodRareBonus * 100)}% rare)</span>`
    : `<span class="muted">No rod — fishing bare-handed. Craft or buy a rod!</span>`;
  const bait = bestBaitInBag();
  const baitTxt = bait ? `${iconFor(bait.id)} ${nameFor(bait.id)} ×${bait.qty} (+${Math.round(bait.bonus * 100)}% rare)` : "no bait in bag";
  controls.innerHTML = `
    <div class="ctl">🎣 Rod: ${rodTxt}</div>
    <label class="switch ctl">
      <input type="checkbox" id="bait-toggle" ${p.baitActive ? "checked" : ""}/>
      <span class="track"></span>
      <span>Use bait <span class="muted">— ${baitTxt}</span></span>
    </label>
  `;
  panel.appendChild(controls);
  $("#bait-toggle").onchange = (e) => send({ type: "bait", active: e.target.checked });

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
    .map((f) => `<span class="tag-item ${rarityCls(f.item)}">${iconFor(f.item)} ${nameFor(f.item)}</span>`)
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
function renderSkill(panel, skillId) {
  const skill = state.game.skills.find((s) => s.id === skillId);
  skillHeader(panel, skill);
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
  panel.appendChild(el("div", "panel-head", `<h2>📖 Collection</h2><span class="lvl">${caught}/${totalFish} discovered</span>`));
  panel.appendChild(el("p", "panel-blurb", "Every species you two reel in gets logged here — with your personal record size."));
  for (const z of state.game.zones) {
    const wrap = el("div", "collection-zone");
    wrap.appendChild(el("h3", null, `${z.icon} ${z.name}`));
    const grid = el("div", "col-grid");
    for (const f of z.fish.slice().sort((a, b) => RARITY_ORDER.indexOf(rarityOf(a.item)) - RARITY_ORDER.indexOf(rarityOf(b.item)))) {
      const rec = p.bestiary[f.item];
      const item = el("div", "col-item" + (rec ? "" : " uncaught"));
      item.innerHTML = `
        <div class="ci-top"><span class="ci-icon">${rec ? iconFor(f.item) : "❔"}</span>
          <span class="ci-name ${rarityCls(f.item)}"><span class="rar-dot bg-${rarityOf(f.item)}"></span>${rec ? nameFor(f.item) : "???"}</span></div>
        <div class="ci-meta">${rec ? `Caught ${rec.count.toLocaleString()} · biggest ${rec.max} cm` : `Not yet discovered`}</div>
      `;
      grid.appendChild(item);
    }
    wrap.appendChild(grid);
    panel.appendChild(wrap);
  }
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
    const equipped = isRod && p.equipped.rod === id;
    const item = el("div", "inv-item" + (equipped ? " equipped" : ""));
    item.title = valueFor(id) != null ? `${nameFor(id)} — sells for 🪙${valueFor(id)}` : nameFor(id);
    let actions = "";
    item.innerHTML = `<div class="ii-icon">${iconFor(id)}</div><div class="ii-qty">${qty.toLocaleString()}</div><span class="ii-name ${rarityCls(id)}">${nameFor(id)}</span>`;
    const act = el("div", "ii-actions");
    if (isRod) {
      const eq = el("button", null, equipped ? "Unequip" : "Equip");
      eq.onclick = () => send(equipped ? { type: "unequip" } : { type: "equip", item: id });
      act.appendChild(eq);
    }
    if (d.category === "dish" && d.buffDurationSec) {
      const eat = el("button", null, "Eat");
      eat.title = `+${Math.round((1 - d.buffSpeedMult) * 100)}% cast speed, +${Math.round(d.buffRareBonus * 100)}% rare for ${Math.round(d.buffDurationSec / 60)} min`;
      eat.onclick = () => send({ type: "eat", item: id });
      act.appendChild(eat);
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
    <div class="g-sub">${g.total.toLocaleString()} fish caught together</div>
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
    c.innerHTML = `
      <div class="prow"><span class="dot ${pl.online ? "on" : ""}"></span><span class="pname">${escapeHtml(pl.name)}</span></div>
      <div class="pmeta">🎣 ${pl.fishingLevel} · Total ${pl.totalLevel} · 📖 ${pl.speciesCaught} · ${pl.online ? "online" : "offline"}</div>
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
  const row = el("div", "msg");
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
  panel.appendChild(el("div", "panel-head", `<h2>🏆 Achievements</h2><span class="lvl">${unlocked.size}/${state.game.achievements.length}</span>`));
  panel.appendChild(el("p", "panel-blurb", "Goals to chase while you fish. Each one pays out coins when you earn it."));
  const grid = el("div", "col-grid");
  for (const a of state.game.achievements) {
    const got = unlocked.has(a.id);
    const item = el("div", "col-item" + (got ? "" : " uncaught"));
    item.innerHTML = `
      <div class="ci-top"><span class="ci-icon">${got ? a.icon : "🔒"}</span><span class="ci-name">${a.name}</span></div>
      <div class="ci-meta">${a.desc}<br/><span style="color:var(--accent-2)">🪙 ${a.coins}</span> ${got ? "· ✅ earned" : ""}</div>
    `;
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
function handleSummary(summary) {
  if (!summary) return;
  for (const a of summary.newAchievements || []) toast(`🏆 ${a.icon} ${a.name} unlocked! +🪙${a.coins}`);
  if (state.pendingWelcome) {
    state.pendingWelcome = false;
    if (summary.completions > 0) showWelcome(summary);
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
  overlay.innerHTML = `
    <div class="modal">
      <h2>🎣 While you were away…</h2>
      <div class="wb-row"><b>${summary.completions.toLocaleString()}</b> things happened${summary.bonus > 0 ? ` <span class="muted">(incl. ${summary.bonus.toLocaleString()} bonus from ⚡ efficiency)</span>` : ""}.</div>
      <div class="wb-row">${itemsHtml}</div>
      ${newSp}
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
