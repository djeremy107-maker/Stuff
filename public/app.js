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
      else if (msg.actionResult && typeof msg.actionResult.success === "boolean") {
        if (msg.actionResult.success) { burstConfetti(); toast(`✨ Enhancement succeeded! Now +${msg.actionResult.newPlus}`); }
        else toast(`💨 Enhancement failed — materials lost, rod is safe.`);
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
  $("#stat-name").textContent = p.name;
  $("#stat-coins").textContent = `🪙 ${p.coins.toLocaleString()}`;
  const rod = p.equipped.rod;
  $("#stat-rod").textContent = rod ? `${iconFor(rod)} ${nameFor(rod)}` : "🖐️ Bare hands";
  updateBuffChips();
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
  for (const [id, icon, label] of [["collection", "📖", "Collection"], ["achievements", "🏆", "Achievements"], ["bank", "🏦", "Shared Bank"], ["boathouse", "🏠", "Boathouse"], ["shop", "🛒", "Shop"]]) {
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
  if (state.tab === "boathouse") return renderBoathouse(panel);
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
  panel.appendChild(el("div", "panel-head", `<h2>📖 Collection</h2><span class="lvl">${caught}/${totalFish} discovered</span>`));
  panel.appendChild(el("p", "panel-blurb", "Every species you two reel in gets logged here — with your personal record size."));
  for (const z of state.game.zones) {
    const wrap = el("div", "collection-zone");
    wrap.appendChild(el("h3", null, `${z.icon} ${z.name}`));
    const grid = el("div", "col-grid");
    for (const f of z.fish.slice().sort((a, b) => RARITY_ORDER.indexOf(rarityOf(a.item)) - RARITY_ORDER.indexOf(rarityOf(b.item)))) {
      const rec = p.bestiary[f.item];
      const worldRecord = state.records.find((r) => r.species === f.item);
      const trophyLine = worldRecord ? `<div class="ci-record">🏆 Record: ${escapeHtml(worldRecord.holder_name)} — ${worldRecord.size}cm</div>` : "";
      const item = el("div", "col-item" + (rec ? "" : " uncaught"));
      item.innerHTML = `
        <div class="ci-top"><span class="ci-icon">${rec ? iconFor(f.item) : "❔"}</span>
          <span class="ci-name ${rarityCls(f.item)}"><span class="rar-dot bg-${rarityOf(f.item)}"></span>${rec ? nameFor(f.item) : "???"}</span></div>
        <div class="ci-meta">${rec ? `Caught ${rec.count.toLocaleString()} · your best ${rec.max} cm` : `Not yet discovered`}</div>
        ${trophyLine}
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
    const item = el("div", "inv-item" + (equipped ? " equipped" : ""));
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
const MILESTONE_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
function highestMilestone(from, to) {
  let hit = null;
  for (const m of MILESTONE_LEVELS) if (m > from && m <= to) hit = m;
  return hit;
}

function handleSummary(summary) {
  if (!summary) return;
  const hasNews = summary.completions > 0 || (summary.levelUps || []).length || (summary.notableCatches || []).length || summary.guildLevelUp;
  if (state.pendingWelcome) {
    // First sync after connecting (may include a long offline catch-up) — fold
    // everything into one recap instead of firing a flurry of live celebrations.
    state.pendingWelcome = false;
    if (hasNews) showWelcome(summary);
    return;
  }
  // Live: celebrate each moment as it happens.
  for (const lv of summary.levelUps || []) celebrateLevelUp(lv);
  for (const c of summary.notableCatches || []) celebrateCatch(c);
  if (summary.guildLevelUp) celebrateGuildLevelUp(summary.guildLevelUp);
  for (const a of summary.newAchievements || []) toast(`🏆 ${a.icon} ${a.name} unlocked! +🪙${a.coins}`);
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
  const guildHtml = summary.guildLevelUp
    ? `<div class="wb-row">🏛️ <b>Anglers' Guild reached Level ${summary.guildLevelUp.to}!</b></div>`
    : "";
  overlay.innerHTML = `
    <div class="modal">
      <h2>🎣 While you were away…</h2>
      <div class="wb-row"><b>${summary.completions.toLocaleString()}</b> things happened${summary.bonus > 0 ? ` <span class="muted">(incl. ${summary.bonus.toLocaleString()} bonus from ⚡ efficiency)</span>` : ""}.</div>
      <div class="wb-row">${itemsHtml}</div>
      ${newSp}
      ${notableHtml}
      ${levelHtml}
      ${guildHtml}
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
  if (milestone) {
    burstConfetti();
    showFanfare(`🎉 ${label}${lv.to === 99 ? " Max level!" : ""}`, "milestone", 4200);
  } else {
    toast(`⬆️ ${label}`);
  }
}
function celebrateCatch(c) {
  const legendary = c.rarity === "legendary";
  if (legendary) burstConfetti();
  const tag = legendary ? "🌟 LEGENDARY CATCH" : "✨ Epic catch";
  showFanfare(`${tag}<br><span class="ff-sub">${iconFor(c.item)} ${nameFor(c.item)} — ${c.size}cm</span>`, `r-${c.rarity}`, legendary ? 4500 : 3200);
}
function celebrateGuildLevelUp(g) {
  showFanfare(`🏛️ Anglers' Guild — Level ${g.to}!<br><span class="ff-sub">Faster casts for both of you</span>`, "guild", 4000);
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
