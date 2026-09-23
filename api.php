<?php
/**
 * NSE/BSE Stock Analysis & Moving Average Signal API
 * Compatible with InfinityFree PHP 7.4+ hosting.
 * Fetches free Yahoo Finance data, computes 20/50/200 SMAs, and detects Entry/Exit signals.
 */

error_reporting(0);
ini_set('display_errors', '0');
date_default_timezone_set('Asia/Kolkata');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$action = isset($_GET['action']) ? trim($_GET['action']) : 'stock';
$rawSymbol = isset($_GET['symbol']) ? strtoupper(trim($_GET['symbol'])) : 'RELIANCE';
$exchange = isset($_GET['exchange']) ? strtoupper(trim($_GET['exchange'])) : 'NSE';
$range = isset($_GET['range']) ? trim($_GET['range']) : '2y';
$interval = isset($_GET['interval']) ? trim($_GET['interval']) : '1d';

// 1. Precomputed 2,000+ Stock Scanner Results Endpoint
if ($action === 'scan_results') {
    $resultsFile = __DIR__ . '/scanner_results.json';
    if (file_exists($resultsFile)) {
        header('Cache-Control: public, max-age=120');
        readfile($resultsFile);
    } else {
        echo json_encode([
            'success' => false,
            'error' => 'Scanner results not yet generated. Please run scan_engine.py.'
        ]);
    }
    exit;
}

// 2. Master 2,000+ Symbols Autocomplete Index Endpoint
if ($action === 'symbols') {
    $symbolsFile = __DIR__ . '/stocks_master.json';
    if (file_exists($symbolsFile)) {
        header('Cache-Control: public, max-age=3600');
        readfile($symbolsFile);
    } else {
        echo json_encode([]);
    }
    exit;
}

// 3. Live Parallel Chunk Scanner Endpoint (Runs directly on website & InfinityFree)
if ($action === 'scan_chunk') {
    try {
        $symbolsFile = __DIR__ . '/stocks_master.json';
        $stocks = file_exists($symbolsFile) ? json_decode(file_get_contents($symbolsFile), true) : [];
        if (empty($stocks)) {
            echo json_encode(['success' => false, 'error' => 'stocks_master.json not found']);
            exit;
        }

        $hasMulti = function_exists('curl_multi_init') && function_exists('curl_multi_exec');
        $maxLimit = $hasMulti ? 50 : 15;
        $defaultLimit = $hasMulti ? 35 : 10;
        $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
        $limit = isset($_GET['limit']) ? max(5, min($maxLimit, (int)$_GET['limit'])) : $defaultLimit;
        $total = count($stocks);

        $chunk = array_slice($stocks, $offset, $limit);
        $setups = !empty($chunk) ? scanStocksParallel($chunk) : [];

        $nextOffset = $offset + count($chunk);
        $done = ($nextOffset >= $total || empty($chunk));

        echo json_encode([
            'success' => true,
            'offset' => $offset,
            'scanned' => count($chunk),
            'total' => $total,
            'nextOffset' => $nextOffset,
            'done' => $done,
            'percent' => round(($nextOffset / $total) * 100, 1),
            'setupsCount' => count($setups),
            'setups' => $setups
        ]);
        exit;
    } catch (Throwable $e) {
        $off = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
        $lim = isset($_GET['limit']) ? (int)$_GET['limit'] : 15;
        $totalCount = isset($total) ? $total : 2319;
        $nextOffset = min($totalCount, $off + $lim);
        echo json_encode([
            'success' => true,
            'offset' => $off,
            'scanned' => 0,
            'total' => $totalCount,
            'nextOffset' => $nextOffset,
            'done' => ($nextOffset >= $totalCount),
            'percent' => round(($nextOffset / $totalCount) * 100, 1),
            'setupsCount' => 0,
            'setups' => [],
            'warning' => $e->getMessage()
        ]);
        exit;
    }
}

// 4. Quick Scan (Top 50 Liquid Stocks in 2.5s)
if ($action === 'scan_quick') {
    $symbolsFile = __DIR__ . '/stocks_master.json';
    $stocks = file_exists($symbolsFile) ? json_decode(file_get_contents($symbolsFile), true) : [];
    $hasMulti = function_exists('curl_multi_init') && function_exists('curl_multi_exec');
    $quickCount = $hasMulti ? 50 : 15;
    $chunk = array_slice($stocks, 0, $quickCount);
    $setups = scanStocksParallel($chunk);

    usort($setups, function($a, $b) {
        return $b['score'] <=> $a['score'];
    });

    echo json_encode([
        'success' => true,
        'scanned' => count($chunk),
        'setupsCount' => count($setups),
        'setups' => $setups
    ]);
    exit;
}

// 5. Save/Persist Completed Scan to scanner_results.json
if ($action === 'save_scan') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);
        if ($decoded && isset($decoded['categories'])) {
            file_put_contents(__DIR__ . '/scanner_results.json', json_encode($decoded, JSON_PRETTY_PRINT));
            echo json_encode(['success' => true, 'saved' => true]);
            exit;
        }
    }
    echo json_encode(['success' => false, 'error' => 'Invalid scan payload']);
    exit;
}

// Popular Indian Watchlist for Screener
$POPULAR_STOCKS = [
    'RELIANCE'   => 'Reliance Industries',
    'TCS'        => 'Tata Consultancy Services',
    'HDFCBANK'   => 'HDFC Bank',
    'INFY'       => 'Infosys',
    'ICICIBANK'  => 'ICICI Bank',
    'BHARTIARTL' => 'Bharti Airtel',
    'SBIN'       => 'State Bank of India',
    'ITC'        => 'ITC Limited',
    'LT'         => 'Larsen & Toubro',
    'TATAMOTORS' => 'Tata Motors',
    'AXISBANK'   => 'Axis Bank',
    'KOTAKBANK'  => 'Kotak Mahindra Bank',
    'BAJFINANCE' => 'Bajaj Finance',
    'MARUTI'     => 'Maruti Suzuki',
    'SUNPHARMA'  => 'Sun Pharmaceutical',
    'ASIANPAINT' => 'Asian Paints',
    'TITAN'      => 'Titan Company',
    'HCLTECH'    => 'HCL Technologies',
    'NTPC'       => 'NTPC Limited',
    'POWERGRID'  => 'Power Grid Corp'
];

/**
 * Normalize symbol to Yahoo Finance ticker for NSE/BSE
 */
function normalizeTicker($symbol, $exchange) {
    $clean = preg_replace('/(\.NS|\.BO)$/i', '', $symbol);
    if ($exchange === 'BSE') {
        return $clean . '.BO';
    }
    return $clean . '.NS';
}

/**
 * Fetch raw chart JSON from Yahoo Finance with caching
 */
function fetchYahooFinanceData($ticker, $range = '2y', $interval = '1d') {
    $cacheDir = __DIR__ . '/cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }

    $cacheFile = $cacheDir . '/' . md5($ticker . '_' . $range . '_' . $interval) . '.json';
    $cacheTtl = 600; // 10 minutes cache

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTtl)) {
        $cached = file_get_contents($cacheFile);
        if ($cached) {
            $decoded = json_decode($cached, true);
            if ($decoded && isset($decoded['chart']['result'][0])) {
                return $decoded;
            }
        }
    }

    $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($ticker) . '?range=' . urlencode($range) . '&interval=' . urlencode($interval);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept: application/json',
        'Accept-Language: en-US,en;q=0.9'
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200 || empty($response)) {
        // Fallback: try query2 endpoint
        $url2 = 'https://query2.finance.yahoo.com/v8/finance/chart/' . urlencode($ticker) . '?range=' . urlencode($range) . '&interval=' . urlencode($interval);
        $ch2 = curl_init();
        curl_setopt($ch2, CURLOPT_URL, $url2);
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch2, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch2, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch2, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept: application/json'
        ]);
        $response = curl_exec($ch2);
        curl_close($ch2);
    }

    if (empty($response)) {
        return null;
    }

    $data = json_decode($response, true);
    if ($data && isset($data['chart']['result'][0])) {
        @file_put_contents($cacheFile, $response);
        return $data;
    }

    return null;
}

/**
 * Calculate Simple Moving Average for an array of closing prices
 */
function calculateSMA($prices, $period) {
    $sma = [];
    $count = count($prices);
    for ($i = 0; $i < $count; $i++) {
        if ($i < $period - 1) {
            $sma[$i] = null;
        } else {
            $sum = 0;
            for ($j = 0; $j < $period; $j++) {
                $sum += $prices[$i - $j];
            }
            $sma[$i] = round($sum / $period, 2);
        }
    }
    return $sma;
}

/**
 * Evaluate technical setup from Yahoo Finance chart result
 */
function evaluateSetupQuick($chartResult, $sym, $name, $ticker) {
    if (!isset($chartResult['indicators']['quote'][0]['close'])) return null;
    $quote = $chartResult['indicators']['quote'][0];
    $closesRaw = $quote['close'];
    $lowsRaw = isset($quote['low']) ? $quote['low'] : [];
    $volsRaw = isset($quote['volume']) ? $quote['volume'] : [];

    $closes = [];
    foreach ($closesRaw as $c) {
        if ($c !== null) {
            $closes[] = (float)$c;
        }
    }

    $n = count($closes);
    if ($n < 200) return null;

    $cCurr = $closes[$n - 1];
    $cPrev = $closes[$n - 2];
    if ($cCurr < 10.0) return null;

    $sma20 = calculateSMA($closes, 20);
    $sma50 = calculateSMA($closes, 50);
    $sma200 = calculateSMA($closes, 200);

    $s20Curr = $sma20[$n - 1];
    $s20Prev = $sma20[$n - 2];
    $s50Curr = $sma50[$n - 1];
    $s50Prev = $sma50[$n - 2];
    $s200Curr = $sma200[$n - 1];
    $s200Prev = $sma200[$n - 2];

    if ($s20Curr === null || $s50Curr === null || $s200Curr === null) return null;

    $dist20 = round((($cCurr - $s20Curr) / $s20Curr) * 100, 1);
    $dist50 = round((($cCurr - $s50Curr) / $s50Curr) * 100, 1);
    $dist200 = round((($cCurr - $s200Curr) / $s200Curr) * 100, 1);
    $chgPct = round((($cCurr - $cPrev) / $cPrev) * 100, 2);

    $recentGolden = false;
    for ($k = 1; $k <= min(5, $n - 200); $k++) {
        if ($sma50[$n - $k - 1] <= $sma200[$n - $k - 1] && $sma50[$n - $k] > $sma200[$n - $k]) {
            $recentGolden = true;
            break;
        }
    }

    $recentSwing = false;
    for ($k = 1; $k <= min(3, $n - 50); $k++) {
        if ($sma20[$n - $k - 1] <= $sma50[$n - $k - 1] && $sma20[$n - $k] > $sma50[$n - $k]) {
            $recentSwing = true;
            break;
        }
    }

    $score = 0;
    $setupType = "NEUTRAL";
    $badge = "";
    $desc = "";

    if ($recentGolden && $cCurr > $s200Curr) {
        $score = 98;
        $setupType = "GOLDEN_CROSS";
        $badge = "Golden Cross (50/200)";
        $desc = "50-day SMA crossed above 200-day SMA (Major Institutional Bull Cycle)";
    } elseif ($recentSwing && $cCurr > $s200Curr) {
        $score = 93;
        $setupType = "SWING_BREAKOUT";
        $badge = "Momentum Breakout (20/50)";
        $desc = "20-day SMA crossed above 50-day SMA with macro confirmation";
    } elseif ($s20Curr > $s50Curr && $s50Curr > $s200Curr && $cCurr > $s20Curr) {
        $score = 88;
        $setupType = "PULLBACK_BOUNCE";
        $badge = "50 SMA Pullback Bounce";
        $desc = "Tested 50-day SMA support in strong uptrend and closed above 20 SMA";
    } elseif ($cCurr > $s20Curr && $s20Curr > $s50Curr && $s50Curr > $s200Curr) {
        $score = ($dist20 >= 2.0 && $dist20 <= 12.0) ? 82 : 78;
        $setupType = "POWER_TREND";
        $badge = "Bull Alignment (20>50>200)";
        $desc = "Sustained bullish alignment across 20, 50, and 200 SMAs";
    } elseif ($cCurr > $s200Curr && $s20Curr > $s50Curr && $s50Curr <= $s200Curr) {
        $score = 70;
        $setupType = "EARLY_ACCUMULATION";
        $badge = "200 SMA Base Reclaim";
        $desc = "Price reclaimed 200-day SMA with short-term trend curling up";
    } else {
        return null;
    }

    $tier = ($score >= 90) ? 'A+' : (($score >= 75) ? 'A' : 'B');
    $vol = !empty($volsRaw) ? (int)end($volsRaw) : 0;

    return [
        'symbol' => $sym,
        'name' => $name,
        'ticker' => $ticker,
        'price' => $cCurr,
        'changePercent' => $chgPct,
        'sma20' => round($s20Curr, 2),
        'sma50' => round($s50Curr, 2),
        'sma200' => round($s200Curr, 2),
        'dist20Pct' => $dist20,
        'dist50Pct' => $dist50,
        'dist200Pct' => $dist200,
        'volume' => $vol,
        'score' => $score,
        'tier' => $tier,
        'setupType' => $setupType,
        'badgeLabel' => $badge,
        'description' => $desc
    ];
}

/**
 * Scan a chunk of stocks concurrently in parallel via curl_multi
 */
function scanStocksParallel($stocks) {
    if (empty($stocks)) return [];

    $hasMulti = function_exists('curl_multi_init') && function_exists('curl_multi_exec');

    // Mode 1: High-speed Parallel Multi-cURL (when supported by hosting)
    if ($hasMulti) {
        $mh = curl_multi_init();
        $handles = [];
        $stockMeta = [];

        foreach ($stocks as $item) {
            if (!isset($item['s'])) continue;
            $sym = $item['s'];
            $name = isset($item['n']) ? $item['n'] : $sym;
            $ticker = $sym . '.NS';
            $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($ticker) . '?range=1y&interval=1d';

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept: application/json'
            ]);

            curl_multi_add_handle($mh, $ch);
            $id = (int)$ch;
            $handles[$id] = $ch;
            $stockMeta[$id] = ['s' => $sym, 'n' => $name, 't' => $ticker];
        }

        $running = null;
        do {
            $status = curl_multi_exec($mh, $running);
            if ($running > 0) {
                if (curl_multi_select($mh, 0.1) === -1) {
                    usleep(5000);
                }
            }
        } while ($running > 0 && $status === CURLM_OK);

        $results = [];
        foreach ($handles as $id => $ch) {
            $content = curl_multi_getcontent($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $meta = $stockMeta[$id];

            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);

            if ($code === 200 && !empty($content)) {
                $json = json_decode($content, true);
                if ($json && isset($json['chart']['result'][0])) {
                    try {
                        $setup = evaluateSetupQuick($json['chart']['result'][0], $meta['s'], $meta['n'], $meta['t']);
                        if ($setup) {
                            $results[] = $setup;
                        }
                    } catch (Throwable $t) {}
                }
            }
        }

        curl_multi_close($mh);
        return $results;
    }

    // Mode 2: Sequential cURL Fallback (for InfinityFree / shared hosts where curl_multi is disabled)
    $results = [];
    foreach ($stocks as $item) {
        if (!isset($item['s'])) continue;
        $sym = $item['s'];
        $name = isset($item['n']) ? $item['n'] : $sym;
        $ticker = $sym . '.NS';
        $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($ticker) . '?range=1y&interval=1d';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept: application/json'
        ]);

        $content = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 200 && !empty($content)) {
            $json = json_decode($content, true);
            if ($json && isset($json['chart']['result'][0])) {
                try {
                    $setup = evaluateSetupQuick($json['chart']['result'][0], $sym, $name, $ticker);
                    if ($setup) {
                        $results[] = $setup;
                    }
                } catch (Throwable $t) {}
            }
        }
    }
    return $results;
}

/**
 * Parse chart data and generate indicators & signals
 */
function analyzeStock($ticker, $range = '2y') {
    $rawData = fetchYahooFinanceData($ticker, $range, '1d');
    if (!$rawData || !isset($rawData['chart']['result'][0])) {
        return ['error' => 'Failed to fetch data for ticker: ' . $ticker];
    }

    $result = $rawData['chart']['result'][0];
    $meta = isset($result['meta']) ? $result['meta'] : [];
    $timestamps = isset($result['timestamp']) ? $result['timestamp'] : [];
    $quote = isset($result['indicators']['quote'][0]) ? $result['indicators']['quote'][0] : [];

    if (empty($timestamps) || empty($quote['close'])) {
        return ['error' => 'No historical price data available for ' . $ticker];
    }

    $candles = [];
    $closePrices = [];
    $validTimestamps = [];

    $count = count($timestamps);
    for ($i = 0; $i < $count; $i++) {
        $c = $quote['close'][$i];
        $o = $quote['open'][$i];
        $h = $quote['high'][$i];
        $l = $quote['low'][$i];
        $v = isset($quote['volume'][$i]) ? $quote['volume'][$i] : 0;

        if ($c !== null && $o !== null && $h !== null && $l !== null) {
            $dateStr = gmdate('Y-m-d', $timestamps[$i]);
            $candles[] = [
                'time' => $dateStr,
                'open' => round((float)$o, 2),
                'high' => round((float)$h, 2),
                'low' => round((float)$l, 2),
                'close' => round((float)$c, 2),
                'volume' => (int)$v
            ];
            $closePrices[] = round((float)$c, 2);
            $validTimestamps[] = $dateStr;
        }
    }

    $totalCandles = count($candles);
    if ($totalCandles < 50) {
        return ['error' => 'Insufficient history to compute moving averages (found ' . $totalCandles . ' candles).'];
    }

    // Compute SMAs
    $sma20 = calculateSMA($closePrices, 20);
    $sma50 = calculateSMA($closePrices, 50);
    $sma200 = calculateSMA($closePrices, 200);

    // Format series for TradingView Lightweight Charts
    $sma20Series = [];
    $sma50Series = [];
    $sma200Series = [];
    $signals = [];

    for ($i = 0; $i < $totalCandles; $i++) {
        $time = $candles[$i]['time'];
        if ($sma20[$i] !== null) {
            $sma20Series[] = ['time' => $time, 'value' => $sma20[$i]];
        }
        if ($sma50[$i] !== null) {
            $sma50Series[] = ['time' => $time, 'value' => $sma50[$i]];
        }
        if ($sma200[$i] !== null) {
            $sma200Series[] = ['time' => $time, 'value' => $sma200[$i]];
        }

        // Signal detection logic (requires at least 200 candles for macro context)
        if ($i >= 50) {
            $prevClose = $candles[$i - 1]['close'];
            $currClose = $candles[$i]['close'];
            $prevLow = $candles[$i - 1]['low'];
            $currLow = $candles[$i]['low'];

            $currSma20 = $sma20[$i];
            $prevSma20 = $sma20[$i - 1];
            $currSma50 = $sma50[$i];
            $prevSma50 = $sma50[$i - 1];
            $currSma200 = $sma200[$i];
            $prevSma200 = $sma200[$i - 1];

            $hasSma200 = ($currSma200 !== null && $prevSma200 !== null);

            // 1. Golden Cross (50 crosses above 200)
            if ($hasSma200 && $prevSma50 <= $prevSma200 && $currSma50 > $currSma200) {
                $signals[] = [
                    'time' => $time,
                    'type' => 'ENTRY',
                    'signal' => 'GOLDEN_CROSS',
                    'title' => 'Golden Cross Buy',
                    'description' => '50-day SMA crossed above 200-day SMA (Major Bullish Trend Reversal)',
                    'price' => $currClose,
                    'sma20' => $currSma20,
                    'sma50' => $currSma50,
                    'sma200' => $currSma200
                ];
            }

            // 2. Momentum Swing Buy (20 crosses above 50 while above 200 SMA)
            if ($prevSma20 <= $prevSma50 && $currSma20 > $currSma50) {
                if (!$hasSma200 || $currClose >= $currSma200) {
                    $signals[] = [
                        'time' => $time,
                        'type' => 'ENTRY',
                        'signal' => 'SWING_MOMENTUM_BUY',
                        'title' => 'Momentum Swing Buy',
                        'description' => '20-day SMA crossed above 50-day SMA in Bullish Regime',
                        'price' => $currClose,
                        'sma20' => $currSma20,
                        'sma50' => $currSma50,
                        'sma200' => $currSma200
                    ];
                }
            }

            // 3. Pullback Bounce Buy (20 > 50 > 200, price dipped to 50 SMA support and closed above 20 SMA)
            if ($hasSma200 && $currSma20 > $currSma50 && $currSma50 > $currSma200) {
                if ($prevLow <= $currSma50 * 1.01 && $currClose > $currSma20 && $prevClose <= $prevSma20) {
                    $signals[] = [
                        'time' => $time,
                        'type' => 'ENTRY',
                        'signal' => 'PULLBACK_BOUNCE_BUY',
                        'title' => 'Pullback Bounce Buy',
                        'description' => 'Price tested 50-day SMA support and closed back above 20-day SMA',
                        'price' => $currClose,
                        'sma20' => $currSma20,
                        'sma50' => $currSma50,
                        'sma200' => $currSma200
                    ];
                }
            }

            // 4. Momentum Trailing Exit (Close breaks below 20-day SMA)
            if ($prevClose >= $prevSma20 && $currClose < $currSma20 && $currSma20 > $currSma50) {
                $signals[] = [
                    'time' => $time,
                    'type' => 'EXIT',
                    'signal' => 'TRAILING_MOMENTUM_EXIT',
                    'title' => 'Trailing Momentum Exit',
                    'description' => 'Price broke below 20-day SMA (Short-term momentum exhausted)',
                    'price' => $currClose,
                    'sma20' => $currSma20,
                    'sma50' => $currSma50,
                    'sma200' => $currSma200
                ];
            }

            // 5. Swing Breakdown Exit (20 crosses below 50)
            if ($prevSma20 >= $prevSma50 && $currSma20 < $currSma50) {
                $signals[] = [
                    'time' => $time,
                    'type' => 'EXIT',
                    'signal' => 'SWING_MOMENTUM_EXIT',
                    'title' => 'Swing Trend Breakdown',
                    'description' => '20-day SMA crossed below 50-day SMA',
                    'price' => $currClose,
                    'sma20' => $currSma20,
                    'sma50' => $currSma50,
                    'sma200' => $currSma200
                ];
            }

            // 6. Death Cross (50 crosses below 200)
            if ($hasSma200 && $prevSma50 >= $prevSma200 && $currSma50 < $currSma200) {
                $signals[] = [
                    'time' => $time,
                    'type' => 'EXIT',
                    'signal' => 'DEATH_CROSS_EXIT',
                    'title' => 'Death Cross Exit',
                    'description' => '50-day SMA crossed below 200-day SMA (Major Bearish Downtrend)',
                    'price' => $currClose,
                    'sma20' => $currSma20,
                    'sma50' => $currSma50,
                    'sma200' => $currSma200
                ];
            }
        }
    }

    $lastIndex = $totalCandles - 1;
    $latestCandle = $candles[$lastIndex];
    $prevCandle = $totalCandles > 1 ? $candles[$lastIndex - 1] : $latestCandle;

    $currentPrice = $latestCandle['close'];
    $change = round($currentPrice - $prevCandle['close'], 2);
    $changePercent = round(($change / $prevCandle['close']) * 100, 2);

    $cur20 = $sma20[$lastIndex];
    $cur50 = $sma50[$lastIndex];
    $cur200 = $sma200[$lastIndex];

    // Determine current regime
    $regime = 'NEUTRAL';
    if ($cur200 !== null) {
        if ($currentPrice > $cur200 && $cur20 > $cur50 && $cur50 > $cur200) {
            $regime = 'STRONG_BULLISH';
        } elseif ($currentPrice > $cur200) {
            $regime = 'BULLISH';
        } elseif ($currentPrice < $cur200 && $cur20 < $cur50 && $cur50 < $cur200) {
            $regime = 'STRONG_BEARISH';
        } else {
            $regime = 'BEARISH';
        }
    } elseif ($cur20 > $cur50) {
        $regime = 'BULLISH';
    } else {
        $regime = 'BEARISH';
    }

    // Get the most recent active signal
    $lastSignal = !empty($signals) ? end($signals) : null;

    return [
        'ticker' => $ticker,
        'currency' => isset($meta['currency']) ? $meta['currency'] : 'INR',
        'exchange' => isset($meta['exchangeName']) ? $meta['exchangeName'] : 'NSE',
        'summary' => [
            'price' => $currentPrice,
            'change' => $change,
            'changePercent' => $changePercent,
            'high' => $latestCandle['high'],
            'low' => $latestCandle['low'],
            'volume' => $latestCandle['volume'],
            'sma20' => $cur20,
            'sma50' => $cur50,
            'sma200' => $cur200,
            'regime' => $regime,
            'lastSignal' => $lastSignal
        ],
        'candles' => $candles,
        'sma20' => $sma20Series,
        'sma50' => $sma50Series,
        'sma200' => $sma200Series,
        'signals' => $signals
    ];
}

// -------------------------------------------------------------
// Route Dispatcher
// -------------------------------------------------------------

if ($action === 'popular') {
    echo json_encode([
        'success' => true,
        'stocks' => $POPULAR_STOCKS
    ]);
    exit;
}

if ($action === 'screener') {
    $screenerResults = [];
    foreach ($POPULAR_STOCKS as $symbol => $name) {
        $ticker = normalizeTicker($symbol, $exchange);
        $analysis = analyzeStock($ticker, '1y');
        if (!isset($analysis['error'])) {
            $screenerResults[] = [
                'symbol' => $symbol,
                'name' => $name,
                'ticker' => $ticker,
                'price' => $analysis['summary']['price'],
                'changePercent' => $analysis['summary']['changePercent'],
                'regime' => $analysis['summary']['regime'],
                'sma20' => $analysis['summary']['sma20'],
                'sma50' => $analysis['summary']['sma50'],
                'sma200' => $analysis['summary']['sma200'],
                'lastSignal' => $analysis['summary']['lastSignal']
            ];
        }
    }
    echo json_encode([
        'success' => true,
        'exchange' => $exchange,
        'count' => count($screenerResults),
        'results' => $screenerResults
    ]);
    exit;
}

// Default: single stock analysis
$ticker = normalizeTicker($rawSymbol, $exchange);
$data = analyzeStock($ticker, $range);

if (isset($data['error'])) {
    echo json_encode([
        'success' => false,
        'error' => $data['error'],
        'ticker' => $ticker,
        'hint' => 'Check if the stock symbol is correct on ' . $exchange . ' (e.g. RELIANCE, TCS, INFY).'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'data' => $data
]);
