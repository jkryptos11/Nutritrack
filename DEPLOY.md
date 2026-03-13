# NutriTrack — Deploy Guide

## One-time setup (~20 minutes)

### Step 1 — Install Node.js
Go to https://nodejs.org and download the "LTS" version. Install it like any app.

### Step 2 — Create free accounts
- GitHub: https://github.com (Sign up free)
- Vercel: https://vercel.com (Sign up with GitHub)

### Step 3 — Put this folder on GitHub
1. Open GitHub, click "New repository", name it `nutritrack`, click "Create"
2. Open Terminal (Mac) or Command Prompt (Windows)
3. Navigate to this folder:
   cd path/to/nutritrack
4. Run these commands one by one:
   git init
   git add .
   git commit -m "NutriTrack v1"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/nutritrack.git
   git push -u origin main

### Step 4 — Deploy on Vercel
1. Go to https://vercel.com/dashboard
2. Click "Add New Project"
3. Import your `nutritrack` GitHub repo
4. Click "Deploy" — done!

You'll get a URL like: https://nutritrack-xyz.vercel.app

### Step 5 — Install on your phones
**iPhone (Safari):**
1. Open the URL in Safari
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Tap "Add"

**Android (Chrome):**
1. Open the URL in Chrome
2. Tap the 3-dot menu
3. Tap "Add to Home Screen" or "Install App"
4. Tap "Add"

The app will appear on your home screen and open full-screen like a native app!

## Barcode scanning
Real camera barcode scanning works on both iPhone and Android.
- iPhone: Use Safari (not Chrome) for camera access
- Android: Use Chrome

## Data
All data is saved locally on each phone. Your data and your wife's data are separate.
Data persists across app restarts. Only cleared if you explicitly clear browser/site data.

## Updates
To push an update: make changes, then run:
   git add . && git commit -m "update" && git push
Vercel auto-deploys within 30 seconds.
