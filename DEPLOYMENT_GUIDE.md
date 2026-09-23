# Deploying NSE/BSE Signal Radar on InfinityFree (Free Hosting)

This guide walks you through deploying the **NSE/BSE Moving Average Signal Radar** on [InfinityFree](https://www.infinityfree.com/) free PHP hosting.

---

## 1. Project Files to Deploy

Your repository contains everything ready for InfinityFree:

| File | Destination in InfinityFree | Purpose |
| :--- | :--- | :--- |
| `index.html` | `/htdocs/index.html` | Modern responsive dark-mode dashboard UI with TradingView charts |
| `stocks.html` | `/htdocs/stocks.html` | Dedicated master directory & screener page for all 2,300+ NSE stocks |
| `styles.css` | `/htdocs/styles.css` | Financial terminal theme, glassmorphism, responsive grid |
| `app.js` | `/htdocs/app.js` | Chart rendering, indicator calculations, autocomplete & scanner |
| `api.php` | `/htdocs/api.php` | Backend PHP script: handles on-demand charts, symbols, and scan results |
| `scanner_results.json` | `/htdocs/scanner_results.json` | Precomputed scan of 2,300+ NSE stocks (ranked best setups) |
| `stocks_master.json` | `/htdocs/stocks_master.json` | Search autocomplete index of 2,300+ active NSE equities |

> [!NOTE]
> You **do not** need Python, Node.js, or Docker on InfinityFree. InfinityFree provides native PHP 7.4/8.x which runs `api.php` out-of-the-box.
> 
> **How Live Scanning Works on InfinityFree Without Timeouts**:
> - InfinityFree disables multi-threaded cURL (`curl_multi_exec`) and kills scripts that run longer than 20 seconds.
> - `api.php` automatically detects this and switches to **Safe Sequential cURL in lightweight batches (10 stocks per chunk)** taking only **~1.5 - 2.0s per chunk**.
> - The browser coordinates the chunks sequentially and shows a live progress bar.
> - If any chunk experiences a network timeout, `app.js` automatically retries 3 times with exponential backoff and gracefully skips ahead without crashing the scan.
> - **Result**: Full compatibility with InfinityFree's free tier with zero fatal errors or timeouts!

---

## 2. Step-by-Step Deployment Instructions

### Method A: Uploading via InfinityFree File Manager (Quickest - 3 minutes)

1. **Log in to InfinityFree**:
   - Go to [dash.infinityfree.com](https://dash.infinityfree.com/) and log into your account.
   - Click on your active hosting account (e.g. `epiz_xxxxxxx`).

2. **Open the Online File Manager**:
   - In your account dashboard, click the **"File Manager"** button (or navigate to Monsta FTP).

3. **Navigate to the `htdocs` directory**:
   - Double-click the `htdocs` folder. *(All public website files must live inside `htdocs`)*.
   - If there is a default `index2.html` or placeholder file created by InfinityFree, you can safely delete it.

4. **Upload the core files**:
   - Click the **Upload** icon (arrow pointing up) in the toolbar.
   - Select and upload:
     - `index.html`
     - `styles.css`
     - `app.js`
     - `api.php`
     - `scanner_results.json`
     - `stocks_master.json`

5. **Create the `cache` folder (Optional but recommended)**:
   - Inside `htdocs`, click **"New Folder"** and name it `cache`.
   - Right-click the `cache` folder, select **Permissions**, and set it to `755` (or `777`) so `api.php` can save 10-minute price caches to speed up loading.
   *(If you skip this, `api.php` will attempt to auto-create it)*.

---

### Method B: Uploading via FTP (FileZilla or WinSCP)

If you prefer uploading via an FTP client:

1. In your InfinityFree dashboard, find your **FTP Details**:
   - **FTP Host**: `ftpupload.net`
   - **FTP Username**: `epiz_xxxxxxx`
   - **FTP Password**: Your account password (click "Show" in control panel)
   - **Port**: `21`
2. Connect FileZilla / WinSCP with these credentials.
3. Open the `htdocs/` folder on the remote side.
4. Drag and drop `index.html`, `styles.css`, `app.js`, and `api.php` from `d:\NANI\` into `htdocs/`.

---

## 3. Verifying Your Live Deployment

### Step 1: Verify the API
Open your browser and visit:
```text
https://your-subdomain.infinityfreeapp.com/api.php?action=stock&symbol=RELIANCE&exchange=NSE
```
You should see a clean JSON response containing `candles`, `sma20`, `sma50`, `sma200`, and `signals`.

### Step 2: Open Your Dashboard
Open:
```text
https://your-subdomain.infinityfreeapp.com/
```

- **Stock Search**: Search for any Indian stock (e.g., `TCS`, `INFY`, `TATAMOTORS`).
- **Exchange Toggle**: Switch between **NSE** and **BSE**.
- **Interactive Chart**: Drag, zoom, and inspect TradingView candlesticks with 20 (Cyan), 50 (Gold), and 200 (Magenta) SMA lines.
- **Signals**: View active Entry (`SWING_MOMENTUM_BUY`, `GOLDEN_CROSS_BUY`, `PULLBACK_BOUNCE_BUY`) or Exit (`TRAILING_MOMENTUM_EXIT`, `TREND_BREAKDOWN_EXIT`, `DEATH_CROSS_EXIT`) markers.
- **Screener Tab**: Click the "Nifty 50 Screener" tab to see quick signals across the top 20 Indian blue chips.

---

## 4. Built-in Resilience: Client-Side Fallback

Free hosting providers sometimes experience temporary outbound network blocks or rate limits.

**How this app protects your uptime**:
- If InfinityFree's `api.php` ever encounters an outbound curl timeout or Yahoo blocking, `app.js` **automatically detects the failure and switches to a client-side CORS proxy**.
- The browser fetches the Yahoo Finance feed directly and calculates the 20, 50, and 200 SMAs inside JavaScript.
- **Result**: Your users will never experience a blank screen or broken chart.

---

## 5. Local Testing (Before Uploading)

You can run the full app locally on Windows without installing PHP:

1. Open PowerShell in `d:\NANI`:
   ```powershell
   python server.py
   ```
2. Open your browser to:
   ```text
   http://localhost:8080/index.html
   ```
   `server.py` automatically bridges the Yahoo Finance feed and serves `api.php` endpoints locally with zero external dependencies.
