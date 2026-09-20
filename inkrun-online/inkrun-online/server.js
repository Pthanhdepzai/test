'use strict';
// INKRUN online — server rất nhẹ: phát file index.html + chuyển tiếp dữ liệu giữa người chơi qua WebSocket.
// Sát thương do máy người bị bắn tự tính (đủ cho chơi với bạn bè, không chống hack).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = 8;
const COLORS = [0xff5c5c, 0x5cc8ff, 0x8cff5c, 0xffb35c, 0xd67cff, 0xffe14a, 0x5cffd0, 0xff8cd9];
const INDEX = path.join(__dirname, 'public', 'index.html');

// ---------------------------------------------------------------- HTTP
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url === '/' || url === '/index.html') {
    return fs.readFile(INDEX, (err, buf) => {
      if (err) { res.writeHead(500); return res.end('Không tìm thấy public/index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ---------------------------------------------------------------- helpers
const rooms = new Map(); // tên phòng -> { name, created, players: Map(id -> player) }
let nextId = 1;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const num3 = a => Array.isArray(a) && a.length === 3 && a.every(isNum);
const r2 = v => Math.round(v * 100) / 100;
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14);
const cleanRoom = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
  }
}
const rosterOf = room => [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths }));

function join(ws, m) {
  const roomName = cleanRoom(m.room) || 'main';
  let room = rooms.get(roomName);
  if (!room) { room = { name: roomName, created: Date.now(), players: new Map() }; rooms.set(roomName, room); }
  if (room.players.size >= MAX_PER_ROOM) { send(ws, { t: 'full' }); ws.close(); return null; }

  let name = cleanName(m.name) || 'Player';
  const names = new Set([...room.players.values()].map(p => p.name));
  if (names.has(name)) { let i = 2; while (names.has(`${name.slice(0, 11)} ${i}`)) i++; name = `${name.slice(0, 11)} ${i}`; }
  const used = new Set([...room.players.values()].map(p => p.color));
  const color = COLORS.find(c => !used.has(c)) ?? COLORS[0];

  const p = { id: nextId++, ws, name, color, room, kills: 0, deaths: 0, dead: false, state: null };
  const others = [...room.players.values()].map(o => ({ id: o.id, name: o.name, color: o.color, s: o.state }));
  room.players.set(p.id, p);

  send(ws, { t: 'welcome', id: p.id, room: room.name, age: Date.now() - room.created, players: others, roster: rosterOf(room) });
  broadcast(room, { t: 'join', id: p.id, name, color }, p.id);
  broadcast(room, { t: 'roster', list: rosterOf(room) });
  console.log(`[${room.name}] + ${name} (${room.players.size})`);
  return p;
}

function leave(p) {
  const room = p.room;
  room.players.delete(p.id);
  console.log(`[${room.name}] - ${p.name} (${room.players.size})`);
  if (room.players.size === 0) { rooms.delete(room.name); return; }
  broadcast(room, { t: 'leave', id: p.id });
  broadcast(room, { t: 'roster', list: rosterOf(room) });
}

function onMessage(p, m) {
  const room = p.room;
  switch (m.t) {
    case 's': { // trạng thái người chơi (~20 lần/giây)
      if (!num3(m.p) || !num3(m.v)) return;
      const s = { p: m.p.map(r2), v: m.v.map(r2), y: isNum(m.y) ? r2(m.y) : 0, pi: isNum(m.pi) ? r2(m.pi) : 0, w: (m.w | 0) & 3, sl: m.sl ? 1 : 0, d: m.d ? 1 : 0 };
      if (!s.d) p.dead = false;
      p.state = s;
      broadcast(room, Object.assign({ t: 's', id: p.id }, s), p.id);
      break;
    }
    case 'f': { // bắn (chỉ để vẽ tia đạn + âm thanh cho người khác)
      if (!Array.isArray(m.e) || m.e.length > 27 || m.e.length % 3 || !m.e.every(isNum)) return;
      broadcast(room, { t: 'f', id: p.id, w: (m.w | 0) & 3, e: m.e.map(r2) }, p.id);
      break;
    }
    case 'h': { // trúng đạn -> chuyển cho nạn nhân
      const target = room.players.get(m.to);
      if (!target || target === p || !isNum(m.dmg)) return;
      send(target.ws, { t: 'h', from: p.id, dmg: Math.min(250, Math.max(0, m.dmg)), head: m.head ? 1 : 0, w: (m.w | 0) & 3 });
      break;
    }
    case 'd': { // mình vừa chết
      if (p.dead) return;
      p.dead = true; p.deaths++;
      const killer = room.players.get(m.by);
      let killerId = null;
      if (killer && killer !== p) { killer.kills++; killerId = killer.id; }
      broadcast(room, { t: 'kill', killer: killerId, victim: p.id, w: (m.w | 0) & 3, head: m.head ? 1 : 0 });
      broadcast(room, { t: 'roster', list: rosterOf(room) });
      break;
    }
    case 'p': send(p.ws, { t: 'p', ts: m.ts }); break; // ping
  }
}

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let player = null, count = 0, winStart = Date.now();
  ws.on('message', data => {
    const now = Date.now();
    if (now - winStart > 1000) { winStart = now; count = 0; }
    if (++count > 200) { ws.close(); return; } // chống spam
    let m;
    try { m = JSON.parse(data); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!player) { if (m.t === 'join') player = join(ws, m); return; }
    onMessage(player, m);
  });
  ws.on('close', () => { if (player) { leave(player); player = null; } });
  ws.on('error', () => {});
});

// giữ kết nối sống + dọn kết nối chết
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => console.log(`INKRUN online chạy ở cổng ${PORT}`));
