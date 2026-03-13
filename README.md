# NutriTrack — Deploy Guide

## What you're deploying
A Progressive Web App (PWA) that:
- Works on iPhone (Safari) and Android (Chrome)
- Installs to your home screen like a native app
- Real barcode scanning via camera (looks up Open Food Facts database)
- AI nutrition search powered by Claude
- Data saved locally on each device (separate for you and your wife)

---

## Step 1 — Upload to StackBlitz (no installs needed)

1. Go to **https://stackblitz.com**
2. Click **"Sign in"** → sign in with GitHub (create a free GitHub account if needed)
3. Click **"Create project"** → choose **"Vite + React"**
4. Delete all the default files StackBlitz creates
5. Upload the files from this folder, maintaining the same folder structure:
   ```
   package.json
   vite.config.js
   index.html
   src/
     main.jsx
     App.jsx
     utils/constants.js
     hooks/useLocalStorage.js
     components/BarcodeScanner.jsx
   ```

---

## Step 2 — Add your Anthropic API key

In StackBlitz, open the **Environment Variables** panel (left sidebar → lock icon).

Add:
```
VITE_ANTHROPIC_API_KEY=your_api_key_here
```

Then in `src/App.jsx`, find this line in the `analyse` function:
```js
headers: { 'Content-Type': 'application/json' },
```
Change it to:
```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-idb': 'true',
},
```

---

## Step 3 — Deploy to Vercel (free)

1. In StackBlitz, click **"Deploy"** in the top bar → **"Deploy to Vercel"**
2. Sign up / log in to Vercel with your GitHub account (free)
3. Follow the prompts — Vercel auto-detects it's a Vite app
4. Add the environment variable in Vercel too:
   - Go to your project → **Settings** → **Environment Variables**
   - Add `VITE_ANTHROPIC_API_KEY` = your API key
5. Redeploy once after adding the key

Your app will be live at a URL like: `https://nutritrack-yourname.vercel.app`

---

## Step 4 — Install on iPhone

1. Open Safari on your iPhone
2. Go to your Vercel URL
3. Tap the **Share** button (box with arrow) at the bottom
4. Tap **"Add to Home Screen"**
5. Name it "NutriTrack" → tap **Add**

It will appear as a full-screen app on your home screen.

---

## Step 5 — Install on Android

1. Open Chrome on the Android phone
2. Go to your Vercel URL
3. Tap the **three dots menu** (top right)
4. Tap **"Add to Home Screen"** or **"Install app"**
5. Tap **Add**

---

## Important notes

### Barcode scanning
- On iPhone: Safari will ask for camera permission the first time — tap **Allow**
- On Android: Chrome will ask for camera permission — tap **Allow**
- Barcodes are looked up from Open Food Facts (free, no key needed)
- If a product isn't in the database, you can enter the barcode number manually

### Data backup
Your data is stored in the browser's localStorage on each device.
**To avoid losing data:**
- Don't clear site data / browser cache for the Vercel URL
- On iPhone: Go to Settings → Safari → Advanced → Website Data → find your URL → don't delete it
- On Android: Chrome doesn't clear individual site data unless you explicitly do it

### If you want to back up data manually
In the app, you can open browser DevTools (desktop) and run:
```js
JSON.stringify(localStorage.getItem('nutritrack-data'))
```
Copy the output and save it somewhere safe.

---

## Updating the app later
Any changes pushed to the StackBlitz project and redeployed on Vercel will update automatically on both phones the next time you open the app.
