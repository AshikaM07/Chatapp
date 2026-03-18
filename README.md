# LiveChat v2

Real-time chat app built with Node.js, Socket.io, and Firebase Firestore.

## Features
- Register / login with passwords (bcrypt + JWT)
- Multiple chat rooms (create your own)
- Private direct messages (DMs)
- Emoji reactions on messages
- File & image sharing (drag & drop)
- Typing indicators
- Online user list
- Logout button
- Firebase Firestore persistence (falls back to in-memory if not configured)

---

## Local setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```

Open `.env` and fill in:
```
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
FIREBASE_SERVICE_ACCOUNT=<your minified service account JSON — see below>
```

### 3. Run
```bash
npm run dev     # development with auto-reload
npm start       # production
```

Open http://localhost:3000

> Without FIREBASE_SERVICE_ACCOUNT the app runs fine using in-memory storage.
> Data will reset on server restart until Firebase is connected.

---

## Firebase setup (for persistence)

1. Go to https://console.firebase.google.com → Add project
2. Firestore Database → Create database → Production mode → region: asia-south1 (Mumbai)
3. Project Settings (gear icon) → Service accounts → Generate new private key → download JSON
4. Minify the JSON at https://jsonformatter.org/json-minify (one line, no spaces)
5. Paste as FIREBASE_SERVICE_ACCOUNT in your .env

### Firestore indexes
Run the app, send a message, and check your terminal — Firebase will print a URL to auto-create each index. Click those URLs. Both indexes need to show "Enabled" in the Firebase console before message history loads correctly.

---

## Deploy to Railway

1. Push code to GitHub (`.env` is gitignored — never commit it)
2. Go to https://railway.app → New Project → Deploy from GitHub repo
3. In Railway dashboard → your service → Variables tab, add:
   - `JWT_SECRET` = your secret
   - `FIREBASE_SERVICE_ACCOUNT` = your minified JSON
4. Settings → Domains → Generate Domain → your app is live

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | YES | Long random string for signing tokens |
| `FIREBASE_SERVICE_ACCOUNT` | No | Minified service account JSON |
| `PORT` | No | Auto-set by Railway/Render |
| `CLIENT_URL` | No | CORS origin, default `*` |

## Project structure

```
chatapp-v2/
├── server.js          # Express + Socket.io + Firebase backend
├── package.json
├── .env.example       # Template — copy to .env
├── .gitignore
└── public/
    └── index.html     # Full frontend (single file)
```
