require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ── Config ────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('ERROR: JWT_SECRET not set'); process.exit(1); }
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || '*';

// ── Firebase init ─────────────────────────────────────────────────────────
let firestore = null;

function initFirebase() {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!key) {
    console.warn('⚠  No FIREBASE_SERVICE_ACCOUNT set — using in-memory storage');
    return false;
  }
  try {
    const serviceAccount = JSON.parse(key);
    initializeApp({ credential: cert(serviceAccount) });
    firestore = getFirestore();
    console.log('✅ Firebase connected');
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e.message);
    return false;
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────
const DEFAULT_ROOMS = {
  general: { id: 'general', name: 'general', description: 'Welcome to the chat!' },
  random:  { id: 'random',  name: 'random',  description: 'Off-topic anything' },
  tech:    { id: 'tech',    name: 'tech',     description: 'Tech talk' },
};
const mem = {
  users: {},
  rooms: JSON.parse(JSON.stringify(DEFAULT_ROOMS)),
  messages: {},
  dms: {},
};

// ── Store abstraction ─────────────────────────────────────────────────────
const store = {
  // Users
  async getUser(username) {
    if (firestore) {
      const doc = await firestore.collection('users').doc(username).get();
      return doc.exists ? doc.data() : null;
    }
    return mem.users[username] || null;
  },
  async createUser(username, data) {
    if (firestore) return firestore.collection('users').doc(username).set(data);
    mem.users[username] = data;
  },
  async updateUser(username, data) {
    if (firestore) return firestore.collection('users').doc(username).update(data);
    Object.assign(mem.users[username] || {}, data);
    if (!mem.users[username]) mem.users[username] = data;
  },

  // Rooms
  async getRooms() {
    if (firestore) {
      const snap = await firestore.collection('rooms').get();
      if (snap.empty) {
        // seed defaults
        const batch = firestore.batch();
        Object.values(DEFAULT_ROOMS).forEach(r =>
          batch.set(firestore.collection('rooms').doc(r.id), r));
        await batch.commit();
        return Object.values(DEFAULT_ROOMS);
      }
      return snap.docs.map(d => d.data());
    }
    return Object.values(mem.rooms);
  },
  async createRoom(room) {
    if (firestore) return firestore.collection('rooms').doc(room.id).set(room);
    mem.rooms[room.id] = room;
  },
  async roomExists(id) {
    if (firestore) return (await firestore.collection('rooms').doc(id).get()).exists;
    return !!mem.rooms[id];
  },

  // Room messages
  async getRoomMessages(roomId, limit = 60) {
    if (firestore) {
      const snap = await firestore.collection('messages')
        .where('roomId', '==', roomId)
        .orderBy('timestamp', 'asc')
        .limitToLast(limit)
        .get();
      return snap.docs.map(d => d.data());
    }
    return (mem.messages[roomId] || []).slice(-limit);
  },
  async saveRoomMessage(msg) {
    if (firestore) return firestore.collection('messages').doc(msg.id).set(msg);
    if (!mem.messages[msg.roomId]) mem.messages[msg.roomId] = [];
    mem.messages[msg.roomId].push(msg);
    if (mem.messages[msg.roomId].length > 200) mem.messages[msg.roomId].shift();
  },

  // DM messages
  async getDmMessages(dmId, limit = 60) {
    if (firestore) {
      const snap = await firestore.collection('dms')
        .where('dmId', '==', dmId)
        .orderBy('timestamp', 'asc')
        .limitToLast(limit)
        .get();
      return snap.docs.map(d => d.data());
    }
    return (mem.dms[dmId]?.messages || []).slice(-limit);
  },
  async saveDmMessage(msg) {
    if (firestore) return firestore.collection('dms').doc(msg.id).set(msg);
    if (!mem.dms[msg.dmId]) mem.dms[msg.dmId] = { messages: [] };
    mem.dms[msg.dmId].messages.push(msg);
    if (mem.dms[msg.dmId].messages.length > 200) mem.dms[msg.dmId].messages.shift();
  },

  // Reactions
  async findAndUpdateReactions(msgId, username, emoji, roomId, dmId) {
    if (firestore) {
      const col = roomId ? 'messages' : 'dms';
      const ref = firestore.collection(col).doc(msgId);
      const doc = await ref.get();
      if (!doc.exists) return null;
      const data = doc.data();
      const reactions = data.reactions || {};
      if (!reactions[emoji]) reactions[emoji] = [];
      const idx = reactions[emoji].indexOf(username);
      if (idx === -1) reactions[emoji].push(username);
      else reactions[emoji].splice(idx, 1);
      if (!reactions[emoji].length) delete reactions[emoji];
      await ref.update({ reactions });
      return reactions;
    }
    // in-memory
    let msg;
    if (roomId) msg = (mem.messages[roomId] || []).find(m => m.id === msgId);
    else if (dmId) msg = (mem.dms[dmId]?.messages || []).find(m => m.id === msgId);
    if (!msg) return null;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(username);
    if (idx === -1) msg.reactions[emoji].push(username);
    else msg.reactions[emoji].splice(idx, 1);
    if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    return msg.reactions;
  },
};

// ── Express + Socket.io ───────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10e6,
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── File uploads ──────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /jpeg|jpg|png|gif|webp|pdf|txt/.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────
function makeMessage(username, text, type = 'text', extra = {}) {
  return { id: uuidv4(), username, text, type, timestamp: new Date().toISOString(), reactions: {}, ...extra };
}
function getDmId(u1, u2) { return [u1, u2].sort().join('__'); }
function getOnlineUsernames() { return [...new Set(Object.values(onlineSockets).map(s => s.username))]; }
function verifyToken(t) { try { return jwt.verify(t, JWT_SECRET); } catch { return null; } }
async function userProfile(username) {
  const u = await store.getUser(username);
  if (!u) return null;
  return { username, color: u.color, bio: u.bio || '' };
}
const onlineSockets = {};

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', firebase: !!firestore, uptime: process.uptime() }));

// ── Register ──────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'Username must be 2-20 chars' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Letters, numbers, underscore only' });
  if (await store.getUser(username)) return res.status(409).json({ error: 'Username taken' });
  const colors = ['#7fff6e','#6ebaff','#ff9f6e','#d46eff','#ff6eaa','#6effd4','#ffdc6e'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  await store.createUser(username, { passwordHash: await bcrypt.hash(password, 10), color, bio: '' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { username, color, bio: '' } });
});

// ── Login ─────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await store.getUser(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { username, color: user.color, bio: user.bio } });
});

// ── Profile ───────────────────────────────────────────────────────────────
app.post('/api/profile', async (req, res) => {
  const payload = verifyToken(req.headers.authorization?.split(' ')[1]);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  await store.updateUser(payload.username, { bio: req.body.bio?.slice(0, 120) || '' });
  res.json({ ok: true });
});

// ── Upload ────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!verifyToken(req.headers.authorization?.split(' ')[1]))
    return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(req.file.filename);
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, isImage });
});

// ── Socket auth ───────────────────────────────────────────────────────────
io.use((socket, next) => {
  const payload = verifyToken(socket.handshake.auth.token);
  if (!payload) return next(new Error('Unauthorized'));
  socket.username = payload.username;
  next();
});

// ── Socket events ─────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  const username = socket.username;
  onlineSockets[socket.id] = { username, currentRoom: null };

  const [roomList, profile] = await Promise.all([store.getRooms(), userProfile(username)]);
  socket.emit('init', {
    rooms: roomList.map(r => ({ id: r.id, name: r.name, description: r.description })),
    user: profile,
    onlineUsers: getOnlineUsernames(),
  });
  io.emit('users:online', getOnlineUsernames());

  socket.on('room:join', async (roomId) => {
    if (!(await store.roomExists(roomId))) return;
    const prev = onlineSockets[socket.id].currentRoom;
    if (prev) socket.leave(prev);
    socket.join(roomId);
    onlineSockets[socket.id].currentRoom = roomId;
    const messages = await store.getRoomMessages(roomId, 60);
    socket.emit('room:history', { roomId, messages });
    socket.to(roomId).emit('system', { roomId, text: `${username} joined #${roomId}` });
  });

  socket.on('room:create', async ({ name, description }) => {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (await store.roomExists(id)) return socket.emit('error:room', 'Room already exists');
    await store.createRoom({ id, name: id, description: description || '' });
    const roomList = await store.getRooms();
    io.emit('rooms:update', roomList.map(r => ({ id: r.id, name: r.name, description: r.description })));
    socket.emit('room:created', id);
  });

  socket.on('message:room', async ({ roomId, text, file }) => {
    if (!(await store.roomExists(roomId))) return;
    const msg = makeMessage(username, text,
      file ? (file.isImage ? 'image' : 'file') : 'text',
      file ? { file, roomId } : { roomId });
    await store.saveRoomMessage(msg);
    io.to(roomId).emit('message:room', { roomId, message: msg });
  });

  socket.on('dm:open', async (targetUsername) => {
    if (!(await store.getUser(targetUsername))) return;
    const dmId = getDmId(username, targetUsername);
    socket.join(`dm:${dmId}`);
    const [messages, profile] = await Promise.all([
      store.getDmMessages(dmId, 60),
      userProfile(targetUsername),
    ]);
    socket.emit('dm:history', { dmId, target: profile, messages });
  });

  socket.on('message:dm', async ({ dmId, text, file }) => {
    const parts = dmId.split('__');
    if (!parts.includes(username)) return;
    const target = parts.find(p => p !== username);
    if (!(await store.getUser(target))) return;
    const msg = makeMessage(username, text,
      file ? (file.isImage ? 'image' : 'file') : 'text',
      file ? { file, dmId } : { dmId });
    await store.saveDmMessage(msg);
    io.to(`dm:${dmId}`).emit('message:dm', { dmId, message: msg });
    Object.entries(onlineSockets).forEach(([sid, s]) => {
      if (s.username === target) {
        const ts = io.sockets.sockets.get(sid);
        if (ts) {
          ts.join(`dm:${dmId}`);
          ts.emit('dm:incoming', { dmId, from: { username }, message: msg });
        }
      }
    });
  });

  socket.on('reaction:toggle', async ({ roomId, dmId, messageId, emoji }) => {
    const reactions = await store.findAndUpdateReactions(messageId, username, emoji, roomId, dmId);
    if (reactions === null) return;
    io.to(roomId || `dm:${dmId}`).emit('reaction:update', { roomId, dmId, messageId, reactions });
  });

  let typingTimeout;
  socket.on('typing:start', ({ roomId, dmId }) => {
    clearTimeout(typingTimeout);
    const ch = roomId || `dm:${dmId}`;
    socket.to(ch).emit('typing:update', { username, typing: true, roomId, dmId });
    typingTimeout = setTimeout(() =>
      socket.to(ch).emit('typing:update', { username, typing: false, roomId, dmId }), 2000);
  });

  socket.on('profile:get', async (targetUsername, cb) => cb(await userProfile(targetUsername)));

  socket.on('disconnect', () => {
    delete onlineSockets[socket.id];
    io.emit('users:online', getOnlineUsernames());
  });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));

// ── Start ─────────────────────────────────────────────────────────────────
initFirebase();
server.listen(PORT, () => console.log(`LiveChat v2 running on port ${PORT}`));
