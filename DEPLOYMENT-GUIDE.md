# 🚀 Deploy Opportunity Scout — free permanent hosting

**What you'll get:** a permanent public link (like `https://opportunity-scout.onrender.com`) that anyone can open on their phone — no experience needed for them, or for you.

**What you need:** a laptop (a phone can work but is harder), a browser, ~15 minutes, and two free accounts (GitHub + Render). **No coding.**

---

## Part A — Get the app files (1 minute)

1. Download `opportunity-scout.zip` from this workspace (it's sitting next to this guide).
2. Unzip it anywhere on your laptop (double-click usually does it).

You should see: `server.js`, `package.json`, `package-lock.json`, `README.md`, `.gitignore`, a `lib` folder, and a `public` folder. (You will **not** see `node_modules` — that's correct, do not add it.)

---

## Part B — Put the files on GitHub (5 minutes)

GitHub is like Google Drive for code. Render will read your app from here.

1. Go to **github.com** → **Sign up** (free) and confirm your email.
2. Once logged in, click the **＋** (top right) → **New repository**.
3. Fill in:
   - **Repository name:** `opportunity-scout`
   - **Public** (selected by default — fine)
   - Leave everything else unchecked
4. Click **Create repository**.
5. On the next page, click the link that says **“uploading an existing file”** (it's in the middle of the page, next to “creating a new file or”).
6. Now you're on the upload page. There's a big dashed box that says
   *“Drag files here to add them to your repository”* with a
   **“choose your files”** link inside it. You have two ways to add the files:

   **Method 1 — Click (easiest, also works on a phone) 📱**
   - Click **“choose your files”** → a file picker opens
   - Navigate into your unzipped `opportunity-scout` folder
   - Select **all 11 files** at once:
     - Windows: press **Ctrl + A**
     - Mac: press **Cmd + A**
     - Phone: tap and multi-select the files
   - Click **Open** / **Choose**

   **Method 2 — Drag and drop 🖱️**
   - Open your File Explorer (Windows) or Finder (Mac) to the unzipped folder
   - Make the window smaller so you can see both it and the browser side by side
   - Press **Ctrl + A** (or **Cmd + A**) to select all files
   - **Hold the left mouse button** on any selected file, drag it over into the
     dashed box in the browser, then **release**

7. Watch each file get a green ✅ progress bar — wait until **all 11 are done**.
   - ✅ Include all of: `.gitignore`, `README.md`, `package.json`, `package-lock.json`, `server.js`, `sources.js`, `classify.js`, `index.html`, `style.css`, `app.js`, `DEPLOYMENT-GUIDE.md`
   - ❌ Do NOT upload `node_modules` (it isn't in the zip anyway) or the `.zip` itself
8. **Important:** scroll down and click the green **Commit changes** button —
   the files are not saved until you do!
9. You'll land back on your repository page and should see all 11 files listed. ✅

Done — your code now lives on GitHub. 🎉

---

## Part C — Put it online with Render (5–8 minutes)

1. Go to **render.com** → **Get Started** → choose **Sign up with GitHub** (easiest — it connects automatically) and approve the authorization.
2. On the Render dashboard, click **New ＋** → **Web Service**.
3. Choose **“Build and deploy from a Git repository”** → **Next**.
4. Under your connected GitHub account, find **`opportunity-scout`** → click **Connect**.
   - If you don't see it: click **Configure account** and give Render access to the repository.
5. Fill in the settings page:
   - **Name:** `opportunity-scout` (this becomes your URL — if taken, try `opp-scout-` + your name)
   - **Region:** **Frankfurt** (closest to Nigeria 🇳🇬)
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
6. Click **Create Web Service**.
7. Watch the logs scroll — after 2–4 minutes you'll see **“Your service is live”** 🟢
8. Your URL is at the very top of the page: `https://something.onrender.com`. Open it, wait for the first scan (~30 seconds for the first load), and… it's alive! 🎉

---

## Part D — Share it & things to know

- **Share the URL** on WhatsApp/status/anywhere — it works on any phone or laptop, no install.
- **Free apps “sleep”** after ~15 minutes with no visitors. The next visitor just waits up to ~1 minute while it wakes up (the page loads, then the first scan runs).
- **Optional — keep it awake 24/7:** create a free account at **uptimerobot.com**, add your URL as a monitor with a 5-minute interval. It'll ping the app so it never sleeps.
- **To update the app later:** upload the changed files in your GitHub repo (drag over the old ones → Commit changes) — Render redeploys automatically in a few minutes.

---

### 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| Render build failed | Check Build Command is exactly `npm install` and Start Command `npm start` |
| Page loads but “Could not load opportunities” | Wait ~1 minute and tap ↻ Refresh — the free scan sources occasionally hiccup; the app self-heals on the next scan |
| URL shows “render.com error” on first open | Service is waking up — reload after 30–60 seconds |
| Can't find your repo in Render | Render dashboard → **New ＋** → **Web Service** → **Configure account** → grant access to the `opportunity-scout` repo |

**You're done!** Your non-technical friends just open the link, tap the ❓ button for the built-in guide, and start hunting opportunities. 🏹
