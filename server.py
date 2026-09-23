#!/usr/bin/env python3
"""
NSE/BSE Signal Radar - Local Development Server
Provides static file serving + server-side Yahoo Finance proxy & indicator calculations.
Mimics api.php for local development without needing PHP installed.
Zero external dependencies (uses standard library only).
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys
from datetime import datetime, timezone

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

POPULAR_STOCKS = {
    'RELIANCE': 'Reliance Industries',
    'TCS': 'Tata Consultancy Services',
    'HDFCBANK': 'HDFC Bank',
    'INFY': 'Infosys',
    'ICICIBANK': 'ICICI Bank',
    'BHARTIARTL': 'Bharti Airtel',
    'SBIN': 'State Bank of India',
    'ITC': 'ITC Limited',
    'LT': 'Larsen & Toubro',
    'TATAMOTORS': 'Tata Motors'
}

def fetch_yahoo_chart(ticker, range_str='2y', interval='1d'):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?range={range_str}&interval={interval}"
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                return data
    except Exception as e:
        print(f"Error fetching {ticker}: {e}", file=sys.stderr)
    return None

def calculate_sma(prices, period):
    sma = []
    for i in range(len(prices)):
        if i < period - 1:
            sma.append(None)
        else:
            window = prices[i - period + 1 : i + 1]
            sma.append(round(sum(window) / period, 2))
    return sma

def analyze_stock(symbol, exchange, range_str='2y'):
    clean = symbol.replace('.NS', '').replace('.BO', '').upper()
    ticker = f"{clean}.BO" if exchange == 'BSE' else f"{clean}.NS"
    
    raw = fetch_yahoo_chart(ticker, range_str)
    if not raw or 'chart' not in raw or not raw['chart'].get('result'):
        return {'error': f"Failed to fetch market data for {ticker}"}
        
    result = raw['chart']['result'][0]
    timestamps = result.get('timestamp', [])
    quote = result.get('indicators', {}).get('quote', [{}])[0]
    
    closes_raw = quote.get('close', [])
    opens_raw = quote.get('open', [])
    highs_raw = quote.get('high', [])
    lows_raw = quote.get('low', [])
    volumes_raw = quote.get('volume', [])
    
    candles = []
    close_prices = []
    
    for i in range(len(timestamps)):
        c = closes_raw[i] if i < len(closes_raw) else None
        o = opens_raw[i] if i < len(opens_raw) else None
        h = highs_raw[i] if i < len(highs_raw) else None
        l = lows_raw[i] if i < len(lows_raw) else None
        v = volumes_raw[i] if (volumes_raw and i < len(volumes_raw)) else 0
        
        if c is not None and o is not None and h is not None and l is not None:
            dt = datetime.fromtimestamp(timestamps[i], timezone.utc).strftime('%Y-%m-%d')
            c_val = round(float(c), 2)
            candles.append({
                'time': dt,
                'open': round(float(o), 2),
                'high': round(float(h), 2),
                'low': round(float(l), 2),
                'close': c_val,
                'volume': int(v or 0)
            })
            close_prices.append(c_val)
            
    if len(candles) < 20:
        return {'error': f"Insufficient trading history for {ticker}"}
        
    sma20 = calculate_sma(close_prices, 20)
    sma50 = calculate_sma(close_prices, 50)
    sma200 = calculate_sma(close_prices, 200)
    
    sma20_series = []
    sma50_series = []
    sma200_series = []
    signals = []
    
    for i in range(len(candles)):
        t = candles[i]['time']
        c_price = candles[i]['close']
        s20 = sma20[i]
        s50 = sma50[i]
        s200 = sma200[i]
        
        if s20 is not None:
            sma20_series.append({'time': t, 'value': s20})
        if s50 is not None:
            sma50_series.append({'time': t, 'value': s50})
        if s200 is not None:
            sma200_series.append({'time': t, 'value': s200})
            
        if i >= 1:
            p_s20 = sma20[i - 1]
            p_s50 = sma50[i - 1]
            p_s200 = sma200[i - 1]
            p_close = candles[i - 1]['close']
            
            # 1. Swing Momentum Entry (20 SMA crosses 50 SMA above 200 SMA)
            if s200 is not None and p_s20 is not None and p_s50 is not None and s20 is not None and s50 is not None:
                if c_price > s200 and p_s20 <= p_s50 and s20 > s50:
                    signals.append({
                        'time': t,
                        'type': 'ENTRY',
                        'signal': 'SWING_MOMENTUM_BUY',
                        'title': 'ENT · Momentum',
                        'description': '20 SMA crossed above 50 SMA while above 200 SMA',
                        'price': c_price,
                        'sma20': s20,
                        'sma50': s50,
                        'sma200': s200
                    })
                    
            # 2. Golden Cross Entry (50 SMA crosses 200 SMA)
            if p_s50 is not None and p_s200 is not None and s50 is not None and s200 is not None:
                if p_s50 <= p_s200 and s50 > s200:
                    signals.append({
                        'time': t,
                        'type': 'ENTRY',
                        'signal': 'GOLDEN_CROSS_BUY',
                        'title': 'ENT · Golden Cross',
                        'description': '50-day SMA crossed above 200-day SMA',
                        'price': c_price,
                        'sma20': s20,
                        'sma50': s50,
                        'sma200': s200
                    })
                    
            # 3. Pullback Bounce Entry
            if s200 is not None and s20 is not None and s50 is not None:
                if s20 > s50 and s50 > s200:
                    if p_close <= p_s50 and c_price > s20:
                        signals.append({
                            'time': t,
                            'type': 'ENTRY',
                            'signal': 'PULLBACK_BOUNCE_BUY',
                            'title': 'ENT · 50 SMA Bounce',
                            'description': 'Tested 50 SMA support and bounced above 20 SMA',
                            'price': c_price,
                            'sma20': s20,
                            'sma50': s50,
                            'sma200': s200
                        })
                        
            # 4. Trailing Momentum Exit (Close breaks below 20 SMA)
            if p_s20 is not None and s20 is not None:
                if p_close >= p_s20 and c_price < s20:
                    signals.append({
                        'time': t,
                        'type': 'EXIT',
                        'signal': 'TRAILING_MOMENTUM_EXIT',
                        'title': 'EXT · 20 SMA',
                        'description': 'Price closed below 20-day SMA',
                        'price': c_price,
                        'sma20': s20,
                        'sma50': s50,
                        'sma200': s200
                    })
                    
            # 5. Trend Breakdown Exit (20 SMA crosses below 50 SMA)
            if p_s20 is not None and p_s50 is not None and s20 is not None and s50 is not None:
                if p_s20 >= p_s50 and s20 < s50:
                    signals.append({
                        'time': t,
                        'type': 'EXIT',
                        'signal': 'TREND_BREAKDOWN_EXIT',
                        'title': 'EXT · 50 SMA',
                        'description': '20-day SMA crossed below 50-day SMA',
                        'price': c_price,
                        'sma20': s20,
                        'sma50': s50,
                        'sma200': s200
                    })
                    
            # 6. Death Cross Exit (50 SMA crosses below 200 SMA)
            if p_s50 is not None and p_s200 is not None and s50 is not None and s200 is not None:
                if p_s50 >= p_s200 and s50 < s200:
                    signals.append({
                        'time': t,
                        'type': 'EXIT',
                        'signal': 'DEATH_CROSS_EXIT',
                        'title': 'EXT · Death Cross',
                        'description': '50-day SMA crossed below 200-day SMA',
                        'price': c_price,
                        'sma20': s20,
                        'sma50': s50,
                        'sma200': s200
                    })

    last_candle = candles[-1]
    prev_candle = candles[-2] if len(candles) > 1 else last_candle
    current_price = last_candle['close']
    change = round(current_price - prev_candle['close'], 2)
    change_pct = round((change / prev_candle['close']) * 100, 2)
    
    cur20 = sma20[-1]
    cur50 = sma50[-1]
    cur200 = sma200[-1]
    
    regime = 'NEUTRAL'
    if cur200 is not None:
        if current_price > cur200 and cur20 is not None and cur50 is not None and cur20 > cur50 > cur200:
            regime = 'STRONG_BULLISH'
        elif current_price > cur200:
            regime = 'BULLISH'
        elif current_price < cur200 and cur20 is not None and cur50 is not None and cur20 < cur50 < cur200:
            regime = 'STRONG_BEARISH'
        else:
            regime = 'BEARISH'
    elif cur20 is not None and cur50 is not None:
        regime = 'BULLISH' if cur20 > cur50 else 'BEARISH'
        
    return {
        'ticker': ticker,
        'exchange': exchange,
        'summary': {
            'price': current_price,
            'change': change,
            'changePercent': change_pct,
            'sma20': cur20,
            'sma50': cur50,
            'sma200': cur200,
            'regime': regime,
            'lastSignal': signals[-1] if signals else None
        },
        'candles': candles,
        'sma20': sma20_series,
        'sma50': sma50_series,
        'sma200': sma200_series,
        'signals': signals
    }

class RadarRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # Intercept api.php calls and fulfill locally
        if parsed.path == '/api.php' or parsed.path == '/api':
            query = urllib.parse.parse_qs(parsed.query)
            action = query.get('action', ['stock'])[0]
            symbol = query.get('symbol', ['RELIANCE'])[0]
            exchange = query.get('exchange', ['NSE'])[0]
            range_val = query.get('range', ['2y'])[0]
            
            if action == 'scan_results':
                res_path = os.path.join(DIRECTORY, 'scanner_results.json')
                if os.path.exists(res_path):
                    with open(res_path, 'rb') as f:
                        body = f.read()
                else:
                    body = json.dumps({'error': 'scanner_results.json not found'}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if action == 'symbols':
                sym_path = os.path.join(DIRECTORY, 'stocks_master.json')
                if os.path.exists(sym_path):
                    with open(sym_path, 'rb') as f:
                        body = f.read()
                else:
                    body = json.dumps([]).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if action == 'scan_chunk':
                try:
                    import scan_engine
                    import asyncio
                    import aiohttp
                    sym_path = os.path.join(DIRECTORY, 'stocks_master.json')
                    with open(sym_path, 'r', encoding='utf-8') as f:
                        stocks = json.load(f)
                    offset = int(query.get('offset', [0])[0])
                    limit = min(50, int(query.get('limit', [35])[0]))
                    total = len(stocks)
                    chunk = stocks[offset : offset + limit]

                    if not chunk:
                        payload = {
                            'success': True,
                            'offset': offset,
                            'scanned': 0,
                            'total': total,
                            'nextOffset': total,
                            'done': True,
                            'percent': 100.0,
                            'setupsCount': 0,
                            'setups': []
                        }
                    else:
                        async def run_chunk():
                            sem = asyncio.Semaphore(min(len(chunk), 25))
                            connector = aiohttp.TCPConnector(limit=30, ssl=False)
                            async with aiohttp.ClientSession(connector=connector, headers={'User-Agent': 'Mozilla/5.0'}) as session:
                                tasks = [scan_engine.fetch_stock_async(session, item, sem) for item in chunk]
                                raw = await asyncio.gather(*tasks, return_exceptions=True)
                                return [r for r in raw if isinstance(r, dict)]

                        setups = asyncio.run(run_chunk())
                        next_offset = offset + len(chunk)
                        payload = {
                            'success': True,
                            'offset': offset,
                            'scanned': len(chunk),
                            'total': total,
                            'nextOffset': next_offset,
                            'done': (next_offset >= total),
                            'percent': round((next_offset / total) * 100, 1),
                            'setupsCount': len(setups),
                            'setups': setups
                        }
                except Exception as e:
                    print(f"Notice: scan_chunk offset {query.get('offset', [0])[0]} warning: {e}")
                    off = int(query.get('offset', [0])[0])
                    lim = int(query.get('limit', [35])[0])
                    total_count = len(stocks) if 'stocks' in locals() else 2319
                    next_offset = min(total_count, off + lim)
                    payload = {
                        'success': True,
                        'offset': off,
                        'scanned': 0,
                        'total': total_count,
                        'nextOffset': next_offset,
                        'done': (next_offset >= total_count),
                        'percent': round((next_offset / total_count) * 100, 1),
                        'setupsCount': 0,
                        'setups': [],
                        'warning': str(e)
                    }

                body = json.dumps(payload).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if action == 'scan_quick':
                try:
                    import scan_engine
                    import asyncio
                    import aiohttp
                    sym_path = os.path.join(DIRECTORY, 'stocks_master.json')
                    with open(sym_path, 'r', encoding='utf-8') as f:
                        stocks = json.load(f)
                    chunk = stocks[:50]

                    async def run_quick():
                        sem = asyncio.Semaphore(min(len(chunk), 30))
                        connector = aiohttp.TCPConnector(limit=30, ssl=False)
                        async with aiohttp.ClientSession(connector=connector, headers={'User-Agent': 'Mozilla/5.0'}) as session:
                            tasks = [scan_engine.fetch_stock_async(session, item, sem) for item in chunk]
                            raw = await asyncio.gather(*tasks, return_exceptions=True)
                            return [r for r in raw if isinstance(r, dict)]

                    setups = asyncio.run(run_quick())
                    setups.sort(key=lambda x: x['score'], reverse=True)
                    payload = {
                        'success': True,
                        'scanned': len(chunk),
                        'setupsCount': len(setups),
                        'setups': setups
                    }
                except Exception as e:
                    payload = {'success': False, 'error': str(e)}

                body = json.dumps(payload).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            if action == 'screener':
                items = []
                for sym, name in POPULAR_STOCKS.items():
                    analysis = analyze_stock(sym, exchange, '1y')
                    if 'error' not in analysis:
                        sum_data = analysis['summary']
                        items.append({
                            'symbol': sym,
                            'name': name,
                            'price': sum_data['price'],
                            'changePercent': sum_data['changePercent'],
                            'regime': sum_data['regime'],
                            'sma20': sum_data['sma20'],
                            'sma50': sum_data['sma50'],
                            'sma200': sum_data['sma200'],
                            'lastSignal': sum_data['lastSignal']
                        })
                payload = {'success': True, 'exchange': exchange, 'count': len(items), 'results': items}
            else:
                analysis = analyze_stock(symbol, exchange, range_val)
                if 'error' in analysis:
                    payload = {'success': False, 'error': analysis['error']}
                else:
                    payload = {'success': True, 'data': analysis}
                
            body = json.dumps(payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
            
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api.php' or parsed.path == '/api':
            query = urllib.parse.parse_qs(parsed.query)
            action = query.get('action', [''])[0]
            if action == 'save_scan':
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length > 0 else b'{}'
                with open(os.path.join(DIRECTORY, 'scanner_results.json'), 'wb') as f:
                    f.write(body)
                resp = json.dumps({'success': True, 'saved': True}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp)
                return
        return super().do_GET()

class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

def run_server(port=PORT):
    with ThreadingServer(("", port), RadarRequestHandler) as httpd:
        print(f"==================================================")
        print(f" NSE/BSE Signal Radar Local Server Running (Multi-threaded)")
        print(f" URL: http://localhost:{port}/index.html")
        print(f" API: http://localhost:{port}/api.php?symbol=SBIN&exchange=NSE")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == '__main__':
    run_server(PORT)
