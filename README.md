# 💬 LiveChat v2

A full-featured real-time chat application built with **Node.js**, **Socket.io**, and **Firebase Firestore**.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black) ![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

- 🔐 **Auth** — Register & login with passwords (bcrypt + JWT)
- 💬 **Rooms** — Multiple chat rooms, create your own
- 📩 **Direct Messages** — Private DMs between users
- 😀 **Reactions** — Emoji reactions on messages, live for everyone
- 📎 **File sharing** — Drag & drop images and files, inline preview
- ⌨️ **Typing indicators** — See who's typing in real time
- 👥 **Online users** — Live presence list
- 🔔 **Notifications** — Unread DM badge counts
- 📱 **Responsive** — Works on desktop, tablet, and mobile
- 🔒 **Persistent** — Firebase Firestore saves all data

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Real-time | Socket.io 4.x |
| Database | Firebase Firestore |
| Auth | bcryptjs + JWT |
| File uploads | Multer 2.x |
| Frontend | Vanilla HTML/CSS/JS (single file) |

---

## 📁 Project Structure

```
chatapp-v2/
├── server.js              # Express + Socket.io backend
├── package.json
├── Dockerfile             # For Docker/Fly.io deployment
├── .dockerignore
├── .env.example           # Environment variable template
├── .gitignore
└── public/
    ├── index.html         # Full frontend (single file, no build step)
    └── uploads/           # Uploaded files (auto-created)
```

---

## 🚀 Local Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/livechat.git
cd livechat
npm install
```

### 2. Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
JWT_SECRET=your-long-random-secret
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
```

### 3. Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Run

```bash
npm run dev    # development with auto-reload
npm start      # production
```

Open https://chatapp-9e3j.onrender.com/

> **Tip:** To test with two users, open a second window in incognito mode.

---

## 🔥 Firebase Setup

Firebase is **optional** — without it the app uses in-memory storage (data resets on restart).

### 1. Create a project
- Go to [console.firebase.google.com](https://console.firebase.google.com)
- Add project → Firestore Database → Create database → Production mode
- Region: `asia-south1` (Mumbai) for India

### 2. Get service account key
- Project Settings (⚙️) → Service accounts → **Generate new private key**
- Download the JSON file
- Minify it at [jsonformatter.org/json-minify](https://jsonformatter.org/json-minify)
- Paste as `FIREBASE_SERVICE_ACCOUNT` in your `.env`

### 3. Create Firestore indexes
Run the app, send a message, and check your terminal. Firebase will print direct URLs to create the required indexes automatically. Click each URL and wait for both to show **Enabled**.

Required indexes:
- Collection `messages` → fields: `roomId` (Asc), `timestamp` (Asc)
- Collection `dms` → fields: `dmId` (Asc), `timestamp` (Asc)

---

## ☁️ Deployment

### Render (recommended — no credit card)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service → connect repo
3. Set: Region: Singapore, Build: `npm install`, Start: `npm start`, Plan: Free
4. Add environment variables: `JWT_SECRET` and `FIREBASE_SERVICE_ACCOUNT`
5. Click **Create Web Service** → get your public URL

> **Note:** Render free tier sleeps after 15 min of inactivity. Use [UptimeRobot](https://uptimerobot.com) (free) to ping your app every 5 minutes and keep it awake.

### Railway

1. Push to GitHub → [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Add `JWT_SECRET` and `FIREBASE_SERVICE_ACCOUNT` in Variables tab
3. Settings → Domains → Generate Domain

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ Yes | Long random string for signing auth tokens |
| `FIREBASE_SERVICE_ACCOUNT` | No | Minified service account JSON. Uses memory if omitted. |
| `PORT` | No | Server port (default 3000, auto-set by platforms) |
| `CLIENT_URL` | No | CORS origin (default `*`). Set to your domain in production. |

---

## 📡 Socket.io Events

| Event | Direction | Description |
|---|---|---|
| `room:join` | Client → Server | Join a room |
| `room:create` | Client → Server | Create a new room |
| `message:room` | Both | Send / receive room message |
| `dm:open` | Client → Server | Open a DM conversation |
| `message:dm` | Both | Send / receive DM |
| `dm:incoming` | Server → Client | New DM notification |
| `reaction:toggle` | Client → Server | Add or remove emoji reaction |
| `reaction:update` | Server → Client | Live reaction update |
| `typing:start/stop` | Client → Server | Typing indicator |
| `typing:update` | Server → Client | Who is currently typing |
| `users:online` | Server → Client | Updated online user list |

---

## 📝 Production Notes

- **Data** — Always connect Firebase for production. In-memory data resets on every restart.
- **Files** — Uploaded files go to `public/uploads/`. Consider Cloudinary or S3 for persistent file storage across deployments.
- **Security** — Never commit your `.env` file. Use a strong `JWT_SECRET` (48+ random bytes).
- **CORS** — Set `CLIENT_URL` to your exact deployed domain in production.
- **Sleeping** — Render free tier drops socket connections when sleeping. Use UptimeRobot to prevent this.

---

## 📄 License

MIT
