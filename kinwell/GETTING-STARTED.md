# Getting started with Kinwell

How to run Kinwell on your own computer from the downloaded zip. It runs entirely on your machine: no Docker,
no database server and no accounts are needed. Everything in it is fictional demo data.

## 1. Install Node.js (once)

Download and install the **LTS** version from <https://nodejs.org> (version 20.9 or newer; 24 is recommended).
To check it's installed, open Terminal (Mac) or PowerShell (Windows) and run:

```bash
node -v
```

## 2. Unzip and install

Unzip `kinwell.zip`, then in Terminal go into the folder and install the packages (this takes a few minutes the
first time):

```bash
cd kinwell
npm install
```

## 3. Start it

```bash
npm run dev
```

Open <http://localhost:3000>. The first start creates the local database and fills it with demo data.

Sign in with the demo account shown on the sign-in page. To stop the app, press **Ctrl+C** in Terminal.

## Optional

- **AI answers and photo descriptions:** create a file named `.env.local` in the `kinwell` folder containing
  `ANTHROPIC_API_KEY=your-key`, then restart. Without a key, Kinwell uses its built-in guided answers. See
  `.env.example` for every setting.
- **Open it on your phone:** connect the phone to the same Wi-Fi, find your computer's local address
  (Mac: System Settings → Wi-Fi → Details; Windows: `ipconfig`), and open `http://that-address:3000`.
- **Start over with fresh demo data:** stop the app, run `npm run db:reset`, then `npm run dev` again.
- **Check everything works:** `npm run check` runs the type checks, lint and all tests.

## What the zip doesn't include

- Installed packages (`node_modules`) — `npm install` downloads them
- Your local database and uploaded files (`.data`) — created on first start
- Any keys or passwords (`.env*.local`) — add your own if you need them

## More

- `README.md` — full documentation: architecture, safety rules, database, deployment
- `docs/health-intelligence.md` — how symptom understanding, the body map and the safety checks work

Kinwell gives health information, not a diagnosis. All clinical rules and wording are demo content pending clinical
review.
