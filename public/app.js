// Idyll — coop idle RPG client
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const state = {
  token: localStorage.getItem("idyll_token") || null,
  game: null, // gamedata
  player: null,
  presence: [],
  selectedSkill: "fishing",
  ws: null,
  anim: { refId: null, durationSec: 1, cycleStart: 0 },
};

// ---------------------------------------------------------------- Auth UI
let authMode = "login";
$("#tab-login").onclick = () => setAuthMode("login");
$("#tab-register").onclick = () => setAuthMode("register");
function setAuthMode(mode) {
  authMode = mode;
  $("#tab-login").classList.toggle("active", mode === "login");
  $("#tab-register").classList.toggle("active", mode === "register");
  $("#auth-submit").textContent = mode === "login" ? "Log in" : "Create character";
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
    if (!data.ok) {
      $("#auth-error").textContent = data.error || "Something went wrong.";
      return;
    }
    state.token = data.token;
    localStorage.setItem("idyll_token", data.token);
    await enterGame();
  } catch (err) {
    $("#auth-error").textContent = "Network error.";
  }
};

$("#logout-btn").onclick = async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token }),
    });
  } catch {}
  localStorage.removeItem("idyll_token");
  state.token = null;
  if (state.ws) state.ws.close();
  location.reload();
};

// ---------------------------------------------------------------- Bootstrap
async function boot() {
  state.game = await (await fetch("/api/gamedata")).json();
  if (state.token) {
    await enterGame();
  }
}
async function enterGame() {
  $("#auth").classList.add("hidden");
  $("#game").classList.remove("hidden");
  renderSkillNav();
  connectWs();
}

// ---------------------------------------------------------------- WebSocket
function connectWs() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(state.token)}`);
  state.ws = ws;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") {
      state.player = msg.player;
      onStateUpdate(msg.summary);
      if (msg.actionResult && !msg.actionResult.ok) toast(msg.actionResult.error);
    } else if (msg.type === "presence") {
      state.presence = msg.players;
      renderParty();
    } else if (msg.type === "chat_history") {
      $("#chat-log").innerHTML = "";
      msg.messages.forEach(addChatMsg);
      scrollChat();
    } else if (msg.type === "chat") {
      addChatMsg(msg.message);
      scrollChat();
    } else if (msg.type === "error") {
      if (msg.error === "Not authenticated.") {
        localStorage.removeItem("idyll_token");
        location.reload();
      }
    }
  };
  ws.onclose = () => {
    // Auto-reconnect while logged in.
    if (state.token) setTimeout(connectWs, 1500);
  };
}
function send(msg) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(msg));
}

// ---------------------------------------------------------------- State render
let lastSummarySig = "";
function onStateUpdate(summary) {
  renderTopbar();
  renderSkillNav();
  renderPanel();
  renderInventory();
  updateActionBanner();
  // Floating loot notice (dedupe rapid identical ticks)
  if (summary && summary.completions > 0) {
    const items = Object.entries(summary.itemsGained || {});
    if (items.length) {
      const sig = JSON.stringify(summary.itemsGained) + summary.completions;
      if (sig !== lastSummarySig) {
        lastSummarySig = sig;
      }
    }
  }
  if (summary && summary.stopped === "no_inputs") toast("Ran out of materials — stopped.");
  if (summary && summary.stopped === "no_food") toast("Out of food! Retreated from combat.");
}

function renderTopbar() {
  const p = state.player;
  if (!p) return;
  $("#stat-name").textContent = p.name;
  $("#stat-coins").textContent = `🪙 ${p.coins.toLocaleString()}`;
  $("#stat-combat").textContent = `⚔️ ${p.combatLevel}`;
  $("#hp-text").textContent = `${p.hp}/${p.maxHp}`;
  $("#hp-fill").style.width = `${(p.hp / p.maxHp) * 100}%`;
}

function iconFor(itemId) {
  return state.game.items[itemId]?.icon || "❓";
}
function nameFor(itemId) {
  return state.game.items[itemId]?.name || itemId;
}

// ---------------------------------------------------------------- Sidebar
function renderSkillNav() {
  const nav = $("#skill-nav");
  nav.innerHTML = "";
  for (const s of state.game.skills) {
    const lvl = state.player?.skills?.[s.id]?.level ?? 1;
    const item = el("div", "nav-item" + (state.selectedSkill === s.id ? " active" : ""));
    item.innerHTML = `<span class="nicon">${s.icon}</span><span>${s.name}</span><span class="nlvl">${lvl}</span>`;
    item.onclick = () => {
      state.selectedSkill = s.id;
      renderSkillNav();
      renderPanel();
    };
    nav.appendChild(item);
  }
}

// ---------------------------------------------------------------- Main panel
function renderPanel() {
  const panel = $("#panel");
  if (!state.player) return;
  const skill = state.game.skills.find((s) => s.id === state.selectedSkill);
  const sk = state.player.skills[skill.id];

  panel.innerHTML = "";
  const head = el("div", "panel-head");
  head.innerHTML = `<h2>${skill.icon} ${skill.name}</h2><span class="lvl">Level ${sk.level}</span>`;
  panel.appendChild(head);
  panel.appendChild(el("p", "panel-blurb", skill.blurb));

  const bar = el("div", "skill-xpbar");
  bar.appendChild(el("span", null)).style.width = `${(sk.pct * 100).toFixed(1)}%`;
  panel.appendChild(bar);

  const cards = el("div", "cards");
  if (skill.id === "combat") {
    for (const m of state.game.monsters) cards.appendChild(monsterCard(m));
  } else {
    for (const a of state.game.actions.filter((x) => x.skill === skill.id)) cards.appendChild(actionCard(a, skill));
  }
  panel.appendChild(cards);
}

function actionCard(a, skill) {
  const p = state.player;
  const lvl = p.skills[skill.id].level;
  const locked = lvl < a.levelReq;
  const active = p.action && p.action.refId === a.id;
  const card = el("div", "card" + (locked ? " locked" : "") + (active ? " active" : ""));

  const outIcons = a.outputs.map((o) => `<span class="tag-item">${iconFor(o.item)} ${nameFor(o.item)}${o.qty > 1 ? " ×" + o.qty : ""}${o.chance && o.chance < 1 ? ` (${Math.round(o.chance * 100)}%)` : ""}</span>`).join("");
  const inIcons = a.inputs.length
    ? `<div class="c-io">Needs: ${a.inputs.map((i) => `<span class="tag-item">${iconFor(i.item)} ${i.qty}× ${nameFor(i.item)} <b>(${p.inventory[i.item] || 0})</b></span>`).join("")}</div>`
    : "";

  card.innerHTML = `
    <div class="c-title">${a.name}</div>
    <div class="c-meta">Requires level ${a.levelReq} · ${a.durationSec}s · ${a.xp} xp</div>
    ${inIcons}
    <div class="c-io">Yields: ${outIcons}</div>
  `;
  const btn = el("button", "do", active ? "Stop" : locked ? `🔒 Level ${a.levelReq}` : "Start");
  btn.disabled = locked;
  btn.onclick = () => {
    if (active) send({ type: "stop" });
    else send({ type: "action", kind: "action", refId: a.id });
  };
  card.appendChild(btn);
  return card;
}

function monsterCard(m) {
  const p = state.player;
  const locked = p.combatLevel < m.combatLevelReq;
  const active = p.action && p.action.refId === m.id;
  const card = el("div", "card" + (locked ? " locked" : "") + (active ? " active" : ""));
  const loot = m.loot.map((l) => `<span class="tag-item">${iconFor(l.item)} ${nameFor(l.item)} (${Math.round(l.chance * 100)}%)</span>`).join("");
  card.innerHTML = `
    <div class="c-title">${m.icon} ${m.name}</div>
    <div class="c-meta">Combat level ${m.combatLevelReq} · ${m.hp} HP · hits ${m.damage} · ${m.xp} xp</div>
    <div class="c-io">🪙 ${m.coins.min}–${m.coins.max} · Drops: ${loot}</div>
  `;
  const btn = el("button", "do", active ? "Retreat" : locked ? `🔒 Combat ${m.combatLevelReq}` : "Fight");
  btn.disabled = locked;
  btn.onclick = () => {
    if (active) send({ type: "stop" });
    else send({ type: "action", kind: "combat", refId: m.id });
  };
  card.appendChild(btn);
  return card;
}

// ---------------------------------------------------------------- Inventory
function renderInventory() {
  const grid = $("#inventory-grid");
  const inv = state.player.inventory;
  const entries = Object.entries(inv).filter(([, q]) => q > 0);
  entries.sort((a, b) => nameFor(a[0]).localeCompare(nameFor(b[0])));
  grid.innerHTML = "";
  if (!entries.length) {
    grid.appendChild(el("p", "empty-note", "Empty. Start gathering to fill it up!"));
    return;
  }
  for (const [id, qty] of entries) {
    const item = el("div", "inv-item");
    item.title = nameFor(id);
    item.innerHTML = `<div class="ii-icon">${iconFor(id)}</div><div class="ii-qty">${qty.toLocaleString()}</div><span class="ii-name">${nameFor(id)}</span>`;
    grid.appendChild(item);
  }
}

// ---------------------------------------------------------------- Action banner + smooth progress
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
  const label = a.type === "combat" ? `Fighting ${a.name}` : a.name;
  const sub = a.type === "combat" ? "⚔️ Combat" : "";
  banner.innerHTML = `
    <div>
      <div class="ab-title">${a.icon ? a.icon + " " : ""}${label}</div>
      <div class="ab-sub">${sub}</div>
    </div>
    <div class="progress"><span id="ab-fill"></span></div>
    <button class="stop">Stop</button>
  `;
  banner.querySelector(".stop").onclick = () => send({ type: "stop" });
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

// ---------------------------------------------------------------- Party
function renderParty() {
  const list = $("#party-list");
  list.innerHTML = "";
  for (const pl of state.presence) {
    const c = el("div", "pcard");
    c.innerHTML = `
      <div class="prow"><span class="dot ${pl.online ? "on" : ""}"></span><span class="pname">${pl.name}</span></div>
      <div class="pmeta">⚔️ ${pl.combatLevel} · Total ${pl.totalLevel} · ${pl.online ? "online" : "offline"}</div>
      <div class="pact">${pl.activity || "💤 Resting"}</div>
      <div class="phpbar"><span style="width:${(pl.hp / pl.maxHp) * 100}%"></span></div>
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
