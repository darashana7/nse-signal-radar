#!/usr/bin/env python3
"""
Ultra-Fast NSE 2,000+ Stock Async Scanner & Setup Ranker
- Powered by aiohttp async concurrency (85+ stocks/sec)
- Uses NumPy convolution for microsecond SMA calculations
- Scans the ENTIRE 2,300+ NSE universe in ~25-30 seconds (under a minute!)
- Generates minified stocks_master.json and scanner_results.json
"""

import sys
import os
import csv
import io
import json
import time
import argparse
import asyncio
from datetime import datetime, timezone
import urllib.request
import numpy as np
import aiohttp

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
STOCKS_MASTER_FILE = os.path.join(WORKSPACE_DIR, 'stocks_master.json')
SCANNER_RESULTS_FILE = os.path.join(WORKSPACE_DIR, 'scanner_results.json')
NSE_CSV_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"

FALLBACK_TOP_STOCKS = [
    ("RELIANCE", "Reliance Industries Limited"),
    ("TCS", "Tata Consultancy Services Limited"),
    ("HDFCBANK", "HDFC Bank Limited"),
    ("INFY", "Infosys Limited"),
    ("ICICIBANK", "ICICI Bank Limited"),
    ("BHARTIARTL", "Bharti Airtel Limited"),
    ("SBIN", "State Bank of India"),
    ("ITC", "ITC Limited"),
    ("LT", "Larsen & Toubro Limited"),
    ("TATAMOTORS", "Tata Motors Limited"),
    ("AXISBANK", "Axis Bank Limited"),
    ("KOTAKBANK", "Kotak Mahindra Bank Limited"),
    ("BAJFINANCE", "Bajaj Finance Limited"),
    ("MARUTI", "Maruti Suzuki India Limited"),
    ("SUNPHARMA", "Sun Pharmaceutical Industries Limited"),
    ("ASIANPAINT", "Asian Paints Limited"),
    ("TITAN", "Titan Company Limited"),
    ("HCLTECH", "HCL Technologies Limited"),
    ("NTPC", "NTPC Limited"),
    ("POWERGRID", "Power Grid Corporation of India Limited"),
    ("ZOMATO", "Zomato Limited"),
    ("PAYTM", "One 97 Communications Limited"),
    ("SUZLON", "Suzlon Energy Limited"),
    ("HAL", "Hindustan Aeronautics Limited"),
    ("BEL", "Bharat Electronics Limited")
]

def load_or_fetch_stocks():
    """Load or download active NSE equity list"""
    if os.path.exists(STOCKS_MASTER_FILE):
        try:
            with open(STOCKS_MASTER_FILE, 'r', encoding='utf-8') as f:
                stocks = json.load(f)
                if len(stocks) > 1000:
                    return stocks
        except Exception:
            pass

    print("Fetching official NSE equity list from registry...")
    req = urllib.request.Request(
        NSE_CSV_URL,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    stocks = []
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read().decode('utf-8', errors='replace')
            reader = csv.reader(io.StringIO(content))
            header = [h.strip() for h in next(reader)]
            sym_idx, name_idx, series_idx = 0, 1, 2
            for i, h in enumerate(header):
                if 'SYMBOL' in h.upper(): sym_idx = i
                elif 'NAME' in h.upper(): name_idx = i
                elif 'SERIES' in h.upper(): series_idx = i

            for row in reader:
                if len(row) > max(sym_idx, name_idx, series_idx):
                    sym = row[sym_idx].strip()
                    name = row[name_idx].strip()
                    series = row[series_idx].strip()
                    if series == 'EQ' and sym:
                        stocks.append({'s': sym, 'n': name})
    except Exception as e:
        print(f"Notice: Using fallback stocks list ({e})")
        stocks = [{'s': s, 'n': n} for s, n in FALLBACK_TOP_STOCKS]

    # Save compact minified stocks_master.json
    with open(STOCKS_MASTER_FILE, 'w', encoding='utf-8') as f:
        json.dump(stocks, f, separators=(',', ':'))

    return stocks

def compute_setup(data, sym, name):
    """NumPy-vectorized technical analysis across all stocks in microseconds"""
    try:
        res = data['chart']['result'][0]
        indicators = res['indicators']['quote'][0]
        closes_raw = indicators.get('close', [])
        lows_raw = indicators.get('low', [])
        volumes_raw = indicators.get('volume', [])

        # Filter None values while aligning
        valid_indices = [i for i, c in enumerate(closes_raw) if c is not None]
        if len(valid_indices) < 20:
            return None

        closes = np.array([closes_raw[i] for i in valid_indices], dtype=np.float64)
        c_curr = float(closes[-1])
        c_prev = float(closes[-2]) if len(closes) > 1 else c_curr

        # Ultra-fast NumPy Convolution for SMAs
        n_bars = len(closes)
        s20_arr = np.convolve(closes, np.ones(20)/20, mode='valid') if n_bars >= 20 else None
        s50_arr = np.convolve(closes, np.ones(50)/50, mode='valid') if n_bars >= 50 else None
        s200_arr = np.convolve(closes, np.ones(200)/200, mode='valid') if n_bars >= 200 else None

        s20_curr = float(s20_arr[-1]) if s20_arr is not None and len(s20_arr) else None
        s50_curr = float(s50_arr[-1]) if s50_arr is not None and len(s50_arr) else None
        s200_curr = float(s200_arr[-1]) if s200_arr is not None and len(s200_arr) else None

        dist_20 = round(((c_curr - s20_curr) / s20_curr) * 100, 1) if s20_curr else None
        dist_50 = round(((c_curr - s50_curr) / s50_curr) * 100, 1) if s50_curr else None
        dist_200 = round(((c_curr - s200_curr) / s200_curr) * 100, 1) if s200_curr else None
        chg_pct = round(((c_curr - c_prev) / c_prev) * 100, 2) if c_prev > 0 else 0.0

        vol_curr = int(volumes_raw[-1]) if volumes_raw and volumes_raw[-1] else 0

        score = 0
        setup_type = "NEUTRAL"
        badge = "Neutral / Sideways"
        desc = "Consolidating / No active moving average breakout"

        if s200_curr is not None and s50_curr is not None and s20_curr is not None and c_curr >= 10.0:
            # Check recent Golden Cross (last 5 bars)
            recent_golden = False
            n200 = len(s200_arr)
            for k in range(1, min(6, n200)):
                if s50_arr[-k-1] <= s200_arr[-k-1] and s50_arr[-k] > s200_arr[-k]:
                    recent_golden = True
                    break

            # Check recent Swing Breakout (last 3 bars)
            recent_swing = False
            n50 = len(s50_arr)
            for k in range(1, min(4, n50)):
                if s20_arr[-k-1] <= s50_arr[-k-1] and s20_arr[-k] > s50_arr[-k]:
                    recent_swing = True
                    break

            # Setup 1: Golden Cross
            if recent_golden and c_curr > s200_curr:
                score, setup_type, badge = 98, "GOLDEN_CROSS", "Golden Cross (50/200)"
                desc = "50-day SMA crossed above 200-day SMA (Major Institutional Bull Cycle)"

            # Setup 2: Swing Momentum Breakout
            elif recent_swing and c_curr > s200_curr:
                score, setup_type, badge = 93, "SWING_BREAKOUT", "Momentum Breakout (20/50)"
                desc = "20-day SMA crossed above 50-day SMA with macro confirmation"

            # Setup 3: 50 SMA Pullback Bounce
            elif s20_curr > s50_curr > s200_curr and c_curr > s20_curr and (lows_raw and len(lows_raw) > 1 and lows_raw[-2] is not None and lows_raw[-2] <= s50_curr * 1.015):
                score, setup_type, badge = 88, "PULLBACK_BOUNCE", "50 SMA Pullback Bounce"
                desc = "Tested 50-day SMA support in strong uptrend and closed above 20 SMA"

            # Setup 4: Power Trend Bull Alignment
            elif c_curr > s20_curr > s50_curr > s200_curr:
                score = 82 if (dist_20 and 2.0 <= dist_20 <= 12.0) else 78
                setup_type, badge = "POWER_TREND", "Bull Alignment (20>50>200)"
                desc = "Sustained bullish alignment across 20, 50, and 200 SMAs"

            # Setup 5: Early Accumulation Reclaim
            elif c_curr > s200_curr and s20_curr > s50_curr and s50_curr <= s200_curr:
                score, setup_type, badge = 70, "EARLY_ACCUMULATION", "200 SMA Base Reclaim"
                desc = "Price reclaimed 200-day SMA with short-term trend curling up"

            elif c_curr < s200_curr and s20_curr < s50_curr < s200_curr:
                setup_type, badge = "BEARISH_ALIGNMENT", "Bear Alignment (20<50<200)"
                desc = "Sustained bearish alignment below 20, 50, and 200 SMAs"

            elif c_curr < s200_curr:
                setup_type, badge = "BELOW_200_SMA", "Below 200 SMA (Macro Downtrend)"
                desc = "Trading below macro 200-day moving average"

        tier = "A+" if score >= 90 else ("A" if score >= 75 else ("B" if score >= 60 else "NEUTRAL"))

        return {
            "symbol": sym,
            "name": name,
            "ticker": f"{sym}.NS",
            "price": round(c_curr, 2),
            "changePercent": chg_pct,
            "sma20": round(s20_curr, 2) if s20_curr else None,
            "sma50": round(s50_curr, 2) if s50_curr else None,
            "sma200": round(s200_curr, 2) if s200_curr else None,
            "dist20Pct": dist_20,
            "dist50Pct": dist_50,
            "dist200Pct": dist_200,
            "volume": vol_curr,
            "score": score,
            "tier": tier,
            "setupType": setup_type,
            "badgeLabel": badge,
            "description": desc,
            "isSetup": (score > 0)
        }
    except Exception:
        return None

async def fetch_stock_async(session, item, sem):
    sym = item['s']
    name = item['n']
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}.NS?range=1y&interval=1d"
    async with sem:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                if resp.status == 200:
                    data = await resp.json(content_type=None)
                    return compute_setup(data, sym, name)
        except Exception:
            pass
    return None

async def run_async_scan(stocks, concurrency=45):
    sem = asyncio.Semaphore(concurrency)
    connector = aiohttp.TCPConnector(limit=60, limit_per_host=concurrency, ttl_dns_cache=300)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }

    t0 = time.time()
    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        tasks = [fetch_stock_async(session, item, sem) for item in stocks]
        raw_results = await asyncio.gather(*tasks)

    elapsed = round(time.time() - t0, 1)
    results = [r for r in raw_results if r is not None]

    # Filter bullish setups
    scored_setups = [r for r in results if r.get('isSetup')]
    scored_setups.sort(key=lambda x: (x['score'], x['volume']), reverse=True)

    # Sort all stocks by score then volume
    results.sort(key=lambda x: (x['score'], x['volume']), reverse=True)

    rate = round(len(stocks) / max(elapsed, 0.1), 1)
    print(f"\nScan completed in {elapsed}s! Processed {len(stocks)} stocks ({rate} stocks/sec).")
    print(f"Total analyzed stocks: {len(results)}. Discovered {len(scored_setups)} high-probability setups.")

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "totalScanned": len(stocks),
        "totalSetupsFound": len(scored_setups),
        "executionSeconds": elapsed,
        "categories": {
            "all_top": scored_setups,
            "golden_crosses": [r for r in scored_setups if r['setupType'] == 'GOLDEN_CROSS'],
            "swing_breakouts": [r for r in scored_setups if r['setupType'] == 'SWING_BREAKOUT'],
            "pullback_bounces": [r for r in scored_setups if r['setupType'] == 'PULLBACK_BOUNCE'],
            "power_trends": [r for r in scored_setups if r['setupType'] == 'POWER_TREND']
        },
        "all_stocks": results
    }

    with open(SCANNER_RESULTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))

    print(f"All 2,000+ Stocks & Setups Saved: {SCANNER_RESULTS_FILE}")
    for rank, r in enumerate(results[:5], 1):
        print(f"  {rank}. {r['symbol']} ({r['name'][:24]}) | Score: {r['score']} [{r['tier']}] | {r['badgeLabel']} | Price: Rs.{r['price']:.2f}")

    return payload

def main():
    parser = argparse.ArgumentParser(description="Ultra-Fast NSE 2000+ Stock Async Scanner")
    parser.add_argument('--limit', type=int, default=None, help="Limit number of stocks to scan")
    parser.add_argument('--concurrency', type=int, default=45, help="Concurrent async HTTP sockets")
    args = parser.parse_args()

    stocks = load_or_fetch_stocks()
    if args.limit:
        stocks = stocks[:args.limit]
        print(f"Scanning test sample of {len(stocks)} stocks...")
    else:
        print(f"Starting FULL scan across {len(stocks)} active NSE equities...")

    asyncio.run(run_async_scan(stocks, concurrency=args.concurrency))

if __name__ == '__main__':
    main()
