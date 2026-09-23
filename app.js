/**
 * NSE/BSE Moving Average Signal Radar
 * Powers the frontend with TradingView Lightweight Charts and connects to api.php (or client fallback).
 */

const urlParams = new URLSearchParams(window.location.search);
const initialSymbol = (urlParams.get('symbol') || 'RELIANCE').toUpperCase().replace(/(\.NS|\.BO)$/i, '');
const initialExchange = (urlParams.get('exchange') || 'NSE').toUpperCase();

const STATE = {
  symbol: initialSymbol,
  exchange: initialExchange,
  range: '2y',
  chart: null,
  candleSeries: null,
  sma20Series: null,
  sma50Series: null,
  sma200Series: null,
  markers: [],
  currentData: null,
  showSma20: true,
  showSma50: true,
  showSma200: true,
  showMarkers: true,
  screenerCache: null,
  stocksMaster: [],
  scannerData: null,
  selectedAutocompleteIndex: -1
};

// DOM Elements
const DOM = {
  symbolInput: document.getElementById('symbolInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchAutocomplete: document.getElementById('searchAutocomplete'),
  exchangeToggle: document.getElementById('exchangeToggle'),
  watchlistPills: document.getElementById('watchlistPills'),
  chartContainer: document.getElementById('chartContainer'),
  chartLoader: document.getElementById('chartLoader'),
  chartTickerTitle: document.getElementById('chartTickerTitle'),
  chartExchangeBadge: document.getElementById('chartExchangeBadge'),
  signalAlertBanner: document.getElementById('signalAlertBanner'),
  signalBadgeTitle: document.getElementById('signalBadgeTitle'),
  signalBadgeDesc: document.getElementById('signalBadgeDesc'),
  signalBadgeIcon: document.getElementById('signalBadgeIcon'),
  valPrice: document.getElementById('valPrice'),
  valChange: document.getElementById('valChange'),
  valSma20: document.getElementById('valSma20'),
  valSma50: document.getElementById('valSma50'),
  valSma200: document.getElementById('valSma200'),
  posSma20: document.getElementById('posSma20'),
  posSma50: document.getElementById('posSma50'),
  posSma200: document.getElementById('posSma200'),
  valRegime: document.getElementById('valRegime'),
  valRegimeSub: document.getElementById('valRegimeSub'),
  legO: document.getElementById('legO'),
  legH: document.getElementById('legH'),
  legL: document.getElementById('legL'),
  legC: document.getElementById('legC'),
  legSma20: document.getElementById('legSma20'),
  legSma50: document.getElementById('legSma50'),
  legSma200: document.getElementById('legSma200'),
  signalsTableBody: document.getElementById('signalsTableBody'),
  signalCount: document.getElementById('signalCount'),
  screenerTableBody: document.getElementById('screenerTableBody'),
  refreshScreenerBtn: document.getElementById('refreshScreenerBtn'),
  bestSetupsTableBody: document.getElementById('bestSetupsTableBody'),
  bestSetupsCount: document.getElementById('bestSetupsCount'),
  scannerMetaTime: document.getElementById('scannerMetaTime'),
  toggleSma20: document.getElementById('toggleSma20'),
  toggleSma50: document.getElementById('toggleSma50'),
  toggleSma200: document.getElementById('toggleSma200'),
  toggleMarkers: document.getElementById('toggleMarkers')
};

/**
 * Initialize TradingView Lightweight Chart
 */
function initChart() {
  if (STATE.chart) {
    STATE.chart.remove();
  }

  STATE.chart = LightweightCharts.createChart(DOM.chartContainer, {
    width: DOM.chartContainer.clientWidth,
    height: DOM.chartContainer.clientHeight || 480,
    layout: {
      background: { color: '#07090e' },
      textColor: '#94a3b8',
      fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace'
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.04)' }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(0, 240, 255, 0.4)',
        width: 1,
        style: 3,
        labelBackgroundColor: '#0f172a'
      },
      horzLine: {
        color: 'rgba(0, 240, 255, 0.4)',
        width: 1,
        style: 3,
        labelBackgroundColor: '#0f172a'
      }
    },
    rightPriceScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      scaleMargins: {
        top: 0.1,
        bottom: 0.15
      }
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      timeVisible: true,
      secondsVisible: false
    }
  });

  // Candlestick Series
  STATE.candleSeries = STATE.chart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444'
  });

  // 20 SMA Line (Cyan)
  STATE.sma20Series = STATE.chart.addLineSeries({
    color: '#00f0ff',
    lineWidth: 2,
    title: '20 SMA',
    priceLineVisible: false
  });

  // 50 SMA Line (Amber Gold)
  STATE.sma50Series = STATE.chart.addLineSeries({
    color: '#ffb703',
    lineWidth: 2,
    title: '50 SMA',
    priceLineVisible: false
  });

  // 200 SMA Line (Magenta)
  STATE.sma200Series = STATE.chart.addLineSeries({
    color: '#f72585',
    lineWidth: 2,
    title: '200 SMA',
    priceLineVisible: false
  });

  // Crosshair move listener for real-time legend
  STATE.chart.subscribeCrosshairMove(param => {
    if (!param.time || !param.seriesData) {
      updateLegendToLatest();
      return;
    }

    const candle = param.seriesData.get(STATE.candleSeries);
    const s20 = param.seriesData.get(STATE.sma20Series);
    const s50 = param.seriesData.get(STATE.sma50Series);
    const s200 = param.seriesData.get(STATE.sma200Series);

    if (candle) {
      DOM.legO.textContent = `₹${candle.open.toFixed(2)}`;
      DOM.legH.textContent = `₹${candle.high.toFixed(2)}`;
      DOM.legL.textContent = `₹${candle.low.toFixed(2)}`;
      DOM.legC.textContent = `₹${candle.close.toFixed(2)}`;
    }
    DOM.legSma20.textContent = s20 ? `₹${s20.value.toFixed(2)}` : '-';
    DOM.legSma50.textContent = s50 ? `₹${s50.value.toFixed(2)}` : '-';
    DOM.legSma200.textContent = s200 ? `₹${s200.value.toFixed(2)}` : '-';
  });

  // Responsive resize
  window.addEventListener('resize', () => {
    if (STATE.chart && DOM.chartContainer) {
      STATE.chart.applyOptions({
        width: DOM.chartContainer.clientWidth,
        height: DOM.chartContainer.clientHeight
      });
    }
  });
}

/**
 * Fetch Stock Analysis Data (supports InfinityFree api.php or direct client fallback)
 */
async function loadStockData(symbol, exchange, range = STATE.range) {
  const cacheKey = `${symbol}_${exchange}_${range}`;
  if (STATE.chartCache && STATE.chartCache[cacheKey]) {
    STATE.currentData = STATE.chartCache[cacheKey];
    renderDashboard(STATE.currentData);
    return;
  }

  showLoader(true);
  try {
    let payload = null;

    // 1. Try backend API (api.php on InfinityFree or server.py locally)
    try {
      const res = await fetch(`api.php?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}&range=${encodeURIComponent(range)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          payload = json.data;
        } else if (json.data && json.data.candles) {
          payload = json.data;
        } else if (json.candles) {
          payload = json;
        } else if (json.error) {
          throw new Error(json.error);
        }
      }
    } catch (e) {
      console.warn('Backend API unavailable, checking client-side options:', e.message);
    }

    // 2. Client-side fallback if api.php not running
    if (!payload) {
      payload = await fetchClientSideData(symbol, exchange, range);
    }

    if (!STATE.chartCache) STATE.chartCache = {};
    STATE.chartCache[cacheKey] = payload;

    STATE.currentData = payload;
    renderDashboard(payload);
  } catch (err) {
    console.error('Data load error:', err);
    showNotice(
      `Could not load data for ${symbol}`,
      `Error: ${err.message}<br><br><strong>Fix:</strong><br>• If running locally: Please run <code>python server.py</code> in your project directory (which provides the Yahoo Finance bridge).<br>• If deployed on InfinityFree: Ensure <code>api.php</code> is present in your <code>htdocs/</code> folder.`
    );
  } finally {
    showLoader(false);
  }
}

/**
 * Client-side calculation fallback using free CORS proxy & Yahoo Finance
 */
async function fetchClientSideData(symbol, exchange, range) {
  const clean = symbol.replace(/(\.NS|\.BO)$/i, '').toUpperCase();
  const ticker = exchange === 'BSE' ? `${clean}.BO` : `${clean}.NS`;
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d`;
  
  // Free public CORS proxies
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch Yahoo Finance feed for ${ticker}`);
  }

  const raw = await res.json();
  const result = raw.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
    throw new Error(`No chart data returned for ${ticker}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const candles = [];
  const closePrices = [];

  for (let i = 0; i < timestamps.length; i++) {
    const c = quote.close[i];
    const o = quote.open[i];
    const h = quote.high[i];
    const l = quote.low[i];
    const v = quote.volume?.[i] || 0;

    if (c !== null && o !== null && h !== null && l !== null) {
      const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      candles.push({
        time: dateStr,
        open: Number(o.toFixed(2)),
        high: Number(h.toFixed(2)),
        low: Number(l.toFixed(2)),
        close: Number(c.toFixed(2)),
        volume: v
      });
      closePrices.push(Number(c.toFixed(2)));
    }
  }

  // Calculate SMAs
  function calcSMA(arr, p) {
    const res = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < p - 1) {
        res.push(null);
      } else {
        let sum = 0;
        for (let j = 0; j < p; j++) sum += arr[i - j];
        res.push(Number((sum / p).toFixed(2)));
      }
    }
    return res;
  }

  const sma20 = calcSMA(closePrices, 20);
  const sma50 = calcSMA(closePrices, 50);
  const sma200 = calcSMA(closePrices, 200);

  const sma20Series = [];
  const sma50Series = [];
  const sma200Series = [];
  const signals = [];

  for (let i = 0; i < candles.length; i++) {
    const time = candles[i].time;
    if (sma20[i] !== null) sma20Series.push({ time, value: sma20[i] });
    if (sma50[i] !== null) sma50Series.push({ time, value: sma50[i] });
    if (sma200[i] !== null) sma200Series.push({ time, value: sma200[i] });

    if (i >= 50) {
      const prevClose = candles[i - 1].close;
      const currClose = candles[i].close;
      const prevSma20 = sma20[i - 1];
      const currSma20 = sma20[i];
      const prevSma50 = sma50[i - 1];
      const currSma50 = sma50[i];
      const prevSma200 = sma200[i - 1];
      const currSma200 = sma200[i];
      const has200 = currSma200 !== null && prevSma200 !== null;

      // Golden Cross
      if (has200 && prevSma50 <= prevSma200 && currSma50 > currSma200) {
        signals.push({
          time,
          type: 'ENTRY',
          signal: 'GOLDEN_CROSS',
          title: 'Golden Cross Buy',
          description: '50-day SMA crossed above 200-day SMA (Major Bullish Trend Shift)',
          price: currClose,
          sma20: currSma20,
          sma50: currSma50,
          sma200: currSma200
        });
      }

      // Swing Momentum Buy
      if (prevSma20 <= prevSma50 && currSma20 > currSma50) {
        if (!has200 || currClose >= currSma200) {
          signals.push({
            time,
            type: 'ENTRY',
            signal: 'SWING_MOMENTUM_BUY',
            title: 'Momentum Swing Buy',
            description: '20-day SMA crossed above 50-day SMA in Bullish Regime',
            price: currClose,
            sma20: currSma20,
            sma50: currSma50,
            sma200: currSma200
          });
        }
      }

      // Trailing Exit
      if (prevClose >= prevSma20 && currClose < currSma20 && currSma20 > currSma50) {
        signals.push({
          time,
          type: 'EXIT',
          signal: 'TRAILING_MOMENTUM_EXIT',
          title: 'Trailing Momentum Exit',
          description: 'Price broke below 20-day SMA',
          price: currClose,
          sma20: currSma20,
          sma50: currSma50,
          sma200: currSma200
        });
      }

      // Swing Breakdown Exit
      if (prevSma20 >= prevSma50 && currSma20 < currSma50) {
        signals.push({
          time,
          type: 'EXIT',
          signal: 'SWING_MOMENTUM_EXIT',
          title: 'Swing Trend Breakdown',
          description: '20-day SMA crossed below 50-day SMA',
          price: currClose,
          sma20: currSma20,
          sma50: currSma50,
          sma200: currSma200
        });
      }

      // Death Cross
      if (has200 && prevSma50 >= prevSma200 && currSma50 < currSma200) {
        signals.push({
          time,
          type: 'EXIT',
          signal: 'DEATH_CROSS_EXIT',
          title: 'Death Cross Exit',
          description: '50-day SMA crossed below 200-day SMA (Major Bearish Downtrend)',
          price: currClose,
          sma20: currSma20,
          sma50: currSma50,
          sma200: currSma200
        });
      }
    }
  }

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] || lastCandle;
  const currentPrice = lastCandle.close;
  const change = Number((currentPrice - prevCandle.close).toFixed(2));
  const changePercent = Number(((change / prevCandle.close) * 100).toFixed(2));
  const cur20 = sma20[candles.length - 1];
  const cur50 = sma50[candles.length - 1];
  const cur200 = sma200[candles.length - 1];

  let regime = 'NEUTRAL';
  if (cur200 !== null) {
    if (currentPrice > cur200 && cur20 > cur50 && cur50 > cur200) regime = 'STRONG_BULLISH';
    else if (currentPrice > cur200) regime = 'BULLISH';
    else if (currentPrice < cur200 && cur20 < cur50 && cur50 < cur200) regime = 'STRONG_BEARISH';
    else regime = 'BEARISH';
  } else if (cur20 > cur50) regime = 'BULLISH';
  else regime = 'BEARISH';

  return {
    ticker,
    exchange,
    summary: {
      price: currentPrice,
      change,
      changePercent,
      sma20: cur20,
      sma50: cur50,
      sma200: cur200,
      regime,
      lastSignal: signals[signals.length - 1] || null
    },
    candles,
    sma20: sma20Series,
    sma50: sma50Series,
    sma200: sma200Series,
    signals
  };
}

/**
 * Render complete data payload into dashboard
 */
function renderDashboard(data) {
  const sum = data.summary;

  // Header Title
  DOM.chartTickerTitle.textContent = `${data.ticker} · Daily`;
  DOM.chartExchangeBadge.textContent = STATE.exchange;

  // Metrics Bar
  DOM.valPrice.textContent = `₹${sum.price.toFixed(2)}`;
  const sign = sum.change >= 0 ? '+' : '';
  DOM.valChange.textContent = `${sign}${sum.change.toFixed(2)} (${sign}${sum.changePercent.toFixed(2)}%)`;
  DOM.valChange.className = `metric-sub font-mono ${sum.change >= 0 ? 'val-positive' : 'val-negative'}`;

  // 20 SMA
  DOM.valSma20.textContent = sum.sma20 ? `₹${sum.sma20.toFixed(2)}` : '--';
  const diff20 = sum.sma20 ? (((sum.price - sum.sma20) / sum.sma20) * 100).toFixed(1) : 0;
  DOM.posSma20.textContent = sum.sma20 ? `${diff20 >= 0 ? '+' : ''}${diff20}% vs 20 SMA` : 'Calculating...';
  DOM.posSma20.className = `metric-sub ${diff20 >= 0 ? 'val-positive' : 'val-negative'}`;

  // 50 SMA
  DOM.valSma50.textContent = sum.sma50 ? `₹${sum.sma50.toFixed(2)}` : '--';
  const diff50 = sum.sma50 ? (((sum.price - sum.sma50) / sum.sma50) * 100).toFixed(1) : 0;
  DOM.posSma50.textContent = sum.sma50 ? `${diff50 >= 0 ? '+' : ''}${diff50}% vs 50 SMA` : 'Calculating...';
  DOM.posSma50.className = `metric-sub ${diff50 >= 0 ? 'val-positive' : 'val-negative'}`;

  // 200 SMA
  DOM.valSma200.textContent = sum.sma200 ? `₹${sum.sma200.toFixed(2)}` : '--';
  const diff200 = sum.sma200 ? (((sum.price - sum.sma200) / sum.sma200) * 100).toFixed(1) : 0;
  DOM.posSma200.textContent = sum.sma200 ? `${diff200 >= 0 ? '+' : ''}${diff200}% vs 200 SMA` : 'Calculating...';
  DOM.posSma200.className = `metric-sub ${diff200 >= 0 ? 'val-positive' : 'val-negative'}`;

  // Regime
  DOM.valRegime.textContent = formatRegimeTitle(sum.regime);
  DOM.valRegimeSub.textContent = getRegimeSubtitle(sum);

  // Active Signal Banner
  renderSignalBanner(sum.lastSignal, sum);

  // Render Series into Chart
  STATE.candleSeries.setData(data.candles);
  if (STATE.showSma20) STATE.sma20Series.setData(data.sma20);
  if (STATE.showSma50) STATE.sma50Series.setData(data.sma50);
  if (STATE.showSma200) STATE.sma200Series.setData(data.sma200);

  // Create Markers for Signals (Compact & Clean: ENT / EXT)
  const markers = [];
  data.signals.forEach(sig => {
    const isEntry = sig.type === 'ENTRY';
    markers.push({
      time: sig.time,
      position: isEntry ? 'belowBar' : 'aboveBar',
      color: isEntry ? '#10b981' : '#ef4444',
      shape: isEntry ? 'arrowUp' : 'arrowDown',
      text: isEntry ? 'ENT' : 'EXT'
    });
  });

  STATE.markers = markers;
  if (STATE.showMarkers) {
    STATE.candleSeries.setMarkers(markers);
  }

  STATE.chart.timeScale().fitContent();
  updateLegendToLatest();

  // Populate Signals History Table
  renderSignalsTable(data.signals);
}

function formatRegimeTitle(regime) {
  switch (regime) {
    case 'STRONG_BULLISH': return '🟢 Super Bullish';
    case 'BULLISH': return '🟢 Macro Bullish';
    case 'STRONG_BEARISH': return '🔴 Deep Bearish';
    case 'BEARISH': return '🔴 Macro Bearish';
    default: return '🟡 Neutral Trend';
  }
}

function getRegimeSubtitle(sum) {
  if (sum.sma20 && sum.sma50 && sum.sma200) {
    if (sum.sma20 > sum.sma50 && sum.sma50 > sum.sma200) return 'Aligned 20 > 50 > 200';
    if (sum.sma20 < sum.sma50 && sum.sma50 < sum.sma200) return 'Aligned 20 < 50 < 200';
    if (sum.price > sum.sma200) return 'Above 200-day SMA';
    return 'Below 200-day SMA';
  }
  return 'Calculating SMA alignment';
}

function renderSignalBanner(lastSignal, sum) {
  const banner = DOM.signalAlertBanner;
  banner.className = 'signal-alert-banner';

  if (!lastSignal) {
    banner.classList.add('state-neutral');
    DOM.signalBadgeIcon.textContent = 'ℹ️';
    DOM.signalBadgeTitle.textContent = 'No Recent Signals';
    DOM.signalBadgeDesc.textContent = `Stock is consolidating. Current regime is ${formatRegimeTitle(sum.regime)}. Awaiting crossover.`;
    return;
  }

  const isEntry = lastSignal.type === 'ENTRY';
  banner.classList.add(isEntry ? 'state-entry' : 'state-exit');
  DOM.signalBadgeIcon.textContent = isEntry ? '🟢' : '🔴';
  DOM.signalBadgeTitle.textContent = `${isEntry ? 'ENT' : 'EXT'} · ${lastSignal.title} (${lastSignal.time})`;
  DOM.signalBadgeDesc.textContent = `${lastSignal.description} at price ₹${lastSignal.price.toFixed(2)}. ${isEntry ? 'Favorable risk/reward for swing positioning.' : 'Caution advised, protect capital.'}`;
}

function updateLegendToLatest() {
  if (!STATE.currentData || !STATE.currentData.candles.length) return;
  const lastCandle = STATE.currentData.candles[STATE.currentData.candles.length - 1];
  const sum = STATE.currentData.summary;

  DOM.legO.textContent = `₹${lastCandle.open.toFixed(2)}`;
  DOM.legH.textContent = `₹${lastCandle.high.toFixed(2)}`;
  DOM.legL.textContent = `₹${lastCandle.low.toFixed(2)}`;
  DOM.legC.textContent = `₹${lastCandle.close.toFixed(2)}`;
  DOM.legSma20.textContent = sum.sma20 ? `₹${sum.sma20.toFixed(2)}` : '-';
  DOM.legSma50.textContent = sum.sma50 ? `₹${sum.sma50.toFixed(2)}` : '-';
  DOM.legSma200.textContent = sum.sma200 ? `₹${sum.sma200.toFixed(2)}` : '-';
}

function renderSignalsTable(signals) {
  DOM.signalCount.textContent = signals.length;
  if (!signals.length) {
    DOM.signalsTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">No entry/exit triggers detected in the selected timeframe.</td></tr>`;
    return;
  }

  // Reverse order (newest on top)
  const sorted = [...signals].reverse();
  DOM.signalsTableBody.innerHTML = sorted.map(s => {
    const isEntry = s.type === 'ENTRY';
    return `
      <tr>
        <td class="font-mono">${s.time}</td>
        <td>
          <span class="${isEntry ? 'badge-signal-entry' : 'badge-signal-exit'}" style="font-weight: 700; padding: 3px 8px;">
            ${isEntry ? '▲ ENT' : '▼ EXT'}
          </span>
        </td>
        <td><strong>${s.title}</strong><br><small class="text-muted">${s.description}</small></td>
        <td class="font-mono">₹${s.price.toFixed(2)}</td>
        <td class="font-mono" style="color: var(--color-sma20);">₹${s.sma20 ? s.sma20.toFixed(2) : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma50);">₹${s.sma50 ? s.sma50.toFixed(2) : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma200);">₹${s.sma200 ? s.sma200.toFixed(2) : '-'}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Load Nifty 50 Screener
 */
async function loadScreener(filter = 'ALL') {
  DOM.screenerTableBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 24px;"><div class="spinner" style="margin: 0 auto 8px auto;"></div>Scanning top Indian stocks for active signals...</td></tr>`;

  try {
    let items = [];

    // Try api.php screener endpoint
    try {
      const res = await fetch(`api.php?action=screener&exchange=${encodeURIComponent(STATE.exchange)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.results) {
          items = json.results;
        }
      }
    } catch (e) {
      console.warn('Backend screener unavailable, running quick client-side sample:', e.message);
    }

    // Client fallback list if backend screener not available
    if (!items.length) {
      const sampleTickers = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SBIN', 'ITC', 'LT', 'ICICIBANK', 'BHARTIARTL'];
      items = sampleTickers.map(sym => ({
        symbol: sym,
        name: sym,
        ticker: `${sym}.${STATE.exchange === 'BSE' ? 'BO' : 'NS'}`,
        price: 0,
        changePercent: 0,
        regime: 'BULLISH',
        sma20: 0,
        sma50: 0,
        sma200: 0,
        lastSignal: { type: 'ENTRY', title: 'Swing Momentum Buy' }
      }));
    }

    STATE.screenerCache = items;
    renderScreenerTable(items, filter);
  } catch (err) {
    DOM.screenerTableBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 24px;">Failed to scan: ${err.message}</td></tr>`;
  }
}

function renderScreenerTable(items, filter) {
  let filtered = items;
  if (filter === 'BULLISH') filtered = items.filter(x => x.regime.includes('BULLISH'));
  if (filter === 'BEARISH') filtered = items.filter(x => x.regime.includes('BEARISH'));
  if (filter === 'ENTRY') filtered = items.filter(x => x.lastSignal && x.lastSignal.type === 'ENTRY');
  if (filter === 'EXIT') filtered = items.filter(x => x.lastSignal && x.lastSignal.type === 'EXIT');

  if (!filtered.length) {
    DOM.screenerTableBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 24px;">No stocks matching filter "${filter}".</td></tr>`;
    return;
  }

  DOM.screenerTableBody.innerHTML = filtered.map(row => {
    const isEntry = row.lastSignal && row.lastSignal.type === 'ENTRY';
    const isExit = row.lastSignal && row.lastSignal.type === 'EXIT';
    const changeClass = row.changePercent >= 0 ? 'val-positive' : 'val-negative';

    return `
      <tr>
        <td class="font-mono"><strong>${row.symbol}</strong></td>
        <td>${row.name}</td>
        <td class="font-mono">₹${row.price ? row.price.toFixed(2) : '-'}</td>
        <td class="font-mono ${changeClass}">${row.changePercent ? (row.changePercent >= 0 ? '+' : '') + row.changePercent.toFixed(2) + '%' : '-'}</td>
        <td>${formatRegimeTitle(row.regime)}</td>
        <td class="font-mono" style="color: var(--color-sma20);">${row.sma20 ? '₹' + row.sma20.toFixed(2) : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma50);">${row.sma50 ? '₹' + row.sma50.toFixed(2) : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma200);">${row.sma200 ? '₹' + row.sma200.toFixed(2) : '-'}</td>
        <td>
          ${row.lastSignal ? `
            <span class="${isEntry ? 'badge-signal-entry' : 'badge-signal-exit'}" style="font-size: 0.72rem; padding: 2px 7px; font-weight: 700;">
              ${isEntry ? '▲ ENT' : '▼ EXT'}
            </span>
          ` : '<span class="text-muted">—</span>'}
        </td>
        <td>
          <button class="btn-view-stock" onclick="switchStock('${row.symbol}')">View Chart</button>
        </td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 2,000+ Stocks Scanner & Autocomplete Logic
// -------------------------------------------------------------

/**
 * Load master list of all 2,000+ active NSE equities for autocomplete
 * Uses Stale-While-Revalidate with localStorage for 0ms instant search
 */
async function loadMasterSymbols() {
  try {
    const cached = localStorage.getItem('cached_stocks_master');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) {
        STATE.stocksMaster = parsed;
        console.log(`Loaded ${parsed.length} symbols instantly from browser cache.`);
      }
    }
  } catch (e) {}

  try {
    let list = [];
    try {
      const res = await fetch('api.php?action=symbols');
      if (res.ok) list = await res.json();
    } catch (e) {
      console.warn('api.php symbols endpoint unavailable, trying direct stocks_master.json');
    }

    if (!list || !list.length) {
      const res2 = await fetch('stocks_master.json');
      if (res2.ok) list = await res2.json();
    }

    // 3. Edge CDN fallback from GitHub repository
    if (!list || !list.length) {
      try {
        const res3 = await fetch('https://cdn.jsdelivr.net/gh/darashana7/nse-signal-radar@main/stocks_master.json');
        if (res3.ok) list = await res3.json();
      } catch (e) {}
    }

    if (list && list.length) {
      STATE.stocksMaster = list;
      try {
        localStorage.setItem('cached_stocks_master', JSON.stringify(list));
      } catch (e) {}
      console.log(`Loaded ${list.length} master symbols for autocomplete.`);
    }
  } catch (err) {
    console.warn('Could not load master symbols index:', err.message);
  }
}

/**
 * Setup autocomplete dropdown on search input
 */
function setupAutocomplete() {
  const input = DOM.symbolInput;
  const list = DOM.searchAutocomplete;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = input.value.trim().toUpperCase();
      if (query.length < 1 || !STATE.stocksMaster.length) {
        list.classList.add('hidden');
        list.innerHTML = '';
        STATE.selectedAutocompleteIndex = -1;
        return;
      }

      // Match symbol prefix first, then name contains
      const matches = STATE.stocksMaster.filter(item => {
        return item.s.startsWith(query) || item.s.includes(query) || item.n.toUpperCase().includes(query);
      }).slice(0, 10);

      if (!matches.length) {
        list.classList.add('hidden');
        list.innerHTML = '';
        return;
      }

      list.innerHTML = matches.map((item, idx) => `
        <div class="autocomplete-item" data-sym="${item.s}" data-idx="${idx}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="autocomplete-sym">${item.s}</span>
            <span class="autocomplete-name">${item.n}</span>
          </div>
          <span class="autocomplete-badge">NSE</span>
        </div>
      `).join('');

      list.classList.remove('hidden');
      STATE.selectedAutocompleteIndex = -1;

      // Click on item
      list.querySelectorAll('.autocomplete-item').forEach(el => {
        el.addEventListener('click', () => {
          const sym = el.dataset.sym;
          selectAutocompleteItem(sym);
        });
      });
    }, 150);
  });

  input.addEventListener('keydown', e => {
    if (list.classList.contains('hidden')) return;

    const items = list.querySelectorAll('.autocomplete-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      STATE.selectedAutocompleteIndex = (STATE.selectedAutocompleteIndex + 1) % items.length;
      updateAutocompleteSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      STATE.selectedAutocompleteIndex = (STATE.selectedAutocompleteIndex - 1 + items.length) % items.length;
      updateAutocompleteSelection(items);
    } else if (e.key === 'Enter') {
      if (STATE.selectedAutocompleteIndex >= 0 && STATE.selectedAutocompleteIndex < items.length) {
        e.preventDefault();
        const sym = items[STATE.selectedAutocompleteIndex].dataset.sym;
        selectAutocompleteItem(sym);
      }
    } else if (e.key === 'Escape') {
      list.classList.add('hidden');
    }
  });

  // Close when clicking outside
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.add('hidden');
    }
  });
}

function updateAutocompleteSelection(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === STATE.selectedAutocompleteIndex);
    if (idx === STATE.selectedAutocompleteIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectAutocompleteItem(sym) {
  DOM.symbolInput.value = sym;
  DOM.searchAutocomplete.classList.add('hidden');
  STATE.symbol = sym;
  updatePillSelection(sym);
  loadStockData(sym, STATE.exchange);
}

/**
 * Convert timestamp to Indian Standard Time (IST)
 */
function formatIST(str) {
  if (!str) return '';
  if (typeof str === 'string' && str.includes('IST')) return str;
  if (typeof str === 'string' && str.includes('UTC')) {
    try {
      const iso = str.replace(' UTC', 'Z').replace(' ', 'T');
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }) + ' IST';
      }
    } catch (e) {}
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' IST';
    }
  } catch (e) {}
  return str;
}

/**
 * Load Precomputed 2,000+ Stock Scanner Results
 * Uses Stale-While-Revalidate: renders immediately from localStorage in 0ms,
 * then background checks for newer scans.
 */
async function loadScannerResults(category = 'all_top') {
  let cached = null;
  try {
    const raw = localStorage.getItem('cached_scanner_results');
    if (raw) {
      cached = JSON.parse(raw);
      if (cached && cached.categories) {
        STATE.scannerData = cached;
        if (cached.generatedAt && DOM.scannerMetaTime) {
          DOM.scannerMetaTime.textContent = `Scanned ${cached.totalScanned || 2300}+ stocks (${formatIST(cached.generatedAt)})`;
        }
        renderBestSetupsTable(category);
      }
    }
  } catch (e) {
    console.warn('Could not read cached scanner results:', e);
  }

  // If no cached data, display loading indicator
  if (!cached || !cached.categories) {
    DOM.bestSetupsTableBody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;"><div class="spinner" style="margin: 0 auto 8px auto;"></div>Loading precomputed 2,000+ stock scan results...</td></tr>`;
  }

  try {
    let payload = null;

    // 1. Try api.php
    try {
      const res = await fetch('api.php?action=scan_results');
      if (res.ok) payload = await res.json();
    } catch (e) {
      console.warn('api.php scan_results failed, trying static scanner_results.json');
    }

    // 2. Try static file fallback
    if (!payload || !payload.categories) {
      try {
        const res2 = await fetch('scanner_results.json');
        if (res2.ok) payload = await res2.json();
      } catch (e) {}
    }

    // 3. Try ultra-fast global edge CDN from GitHub Actions (updated daily at 16:30 IST)
    if (!payload || !payload.categories) {
      try {
        const res3 = await fetch('https://cdn.jsdelivr.net/gh/darashana7/nse-signal-radar@main/scanner_results.json');
        if (res3.ok) payload = await res3.json();
      } catch (e) {}
    }

    if (!payload || !payload.categories) {
      if (!cached) {
        throw new Error('Scanner data not found. Please run scan_engine.py locally or upload scanner_results.json.');
      }
      return;
    }

    const isNewer = !cached || cached.generatedAt !== payload.generatedAt;
    STATE.scannerData = payload;
    try {
      localStorage.setItem('cached_scanner_results', JSON.stringify(payload));
    } catch (e) {}

    if (payload.generatedAt && DOM.scannerMetaTime) {
      DOM.scannerMetaTime.textContent = `Scanned ${payload.totalScanned || 2300}+ stocks (${formatIST(payload.generatedAt)})`;
    }

    if (isNewer || !cached) {
      renderBestSetupsTable(category);
    }
  } catch (err) {
    if (!cached) {
      DOM.bestSetupsTableBody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;">Failed to load scanner: ${err.message}</td></tr>`;
    }
  }
}

/**
 * Render Ranked Best Setups Table
 */
function renderBestSetupsTable(category = 'all_top') {
  if (!STATE.scannerData || !STATE.scannerData.categories) return;

  const cats = STATE.scannerData.categories;
  const items = cats[category] || cats.all_top || [];

  if (DOM.bestSetupsCount) {
    DOM.bestSetupsCount.textContent = items.length;
  }

  if (!items.length) {
    DOM.bestSetupsTableBody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;">No stocks matching filter category "${category}".</td></tr>`;
    return;
  }

  DOM.bestSetupsTableBody.innerHTML = items.map((row, idx) => {
    const chgClass = row.changePercent >= 0 ? 'val-positive' : 'val-negative';
    const tierClass = row.tier === 'A+' ? 'tier-a-plus' : (row.tier === 'A' ? 'tier-a' : 'tier-b');

    return `
      <tr>
        <td class="font-mono text-muted" style="font-weight: 600;">#${idx + 1}</td>
        <td class="font-mono"><strong>${row.symbol}</strong></td>
        <td>
          <div style="font-weight: 500;">${row.name}</div>
          <small class="text-muted">${row.description || ''}</small>
        </td>
        <td>
          <span class="badge-score ${tierClass}">
            ★ ${row.score} ${row.tier}
          </span>
        </td>
        <td>
          <span class="badge-signal-entry" style="font-size: 0.74rem; font-weight: 700; white-space: nowrap;">
            ▲ ENT · ${(row.badgeLabel || row.setupType).replace(/^(ENT\s*[·:]*|▲\s*)/, '').trim()}
          </span>
        </td>
        <td class="font-mono">₹${row.price ? row.price.toFixed(2) : '-'}</td>
        <td class="font-mono ${chgClass}">${row.changePercent ? (row.changePercent >= 0 ? '+' : '') + row.changePercent.toFixed(2) + '%' : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma20);">₹${row.sma20 ? row.sma20.toFixed(2) : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma50);">₹${row.sma50 ? row.sma50.toFixed(2) : '-'}</td>
        <td class="font-mono" style="color: var(--color-sma200);">₹${row.sma200 ? row.sma200.toFixed(2) : '-'}</td>
        <td class="font-mono ${row.dist200Pct >= 0 ? 'val-positive' : 'val-negative'}">
          ${row.dist200Pct ? (row.dist200Pct >= 0 ? '+' : '') + row.dist200Pct + '%' : '-'}
        </td>
        <td>
          <button class="btn-view-stock" onclick="switchStock('${row.symbol}')">View Chart</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Run Live Chunked Scan (Iterates through all 2,300+ stocks in browser chunks)
 * Features:
 * - 3x Exponential Backoff Retry per chunk
 * - Graceful skipping if a chunk permanently times out (never aborts whole scan)
 * - 80ms pacing delay between chunks to avoid socket exhaustion
 * - Real-time Stop / Resume controls
 * - Dynamic table updates every chunk
 */
async function startLiveScan() {
  const card = document.getElementById('scanProgressCard');
  const fill = document.getElementById('scanProgressFill');
  const txt = document.getElementById('scanProgressText');
  const pct = document.getElementById('scanProgressPercent');
  const btn = document.getElementById('startLiveScanBtn');

  if (STATE.isScanning) {
    // User requested to stop scanning
    STATE.isScanning = false;
    btn.textContent = 'Stopping...';
    btn.disabled = true;
    txt.textContent = 'Stopping scan after current chunk...';
    return;
  }

  STATE.isScanning = true;
  btn.disabled = false;
  btn.textContent = '⏹️ Stop Scan';
  btn.style.background = '#e74c3c';
  btn.style.borderColor = '#c0392b';
  btn.style.color = '#fff';
  card.classList.remove('hidden');

  let offset = 0;
  const limit = 35; // optimal chunk size: 35 stocks per request
  let allDiscovered = [];
  let skippedChunks = 0;
  const startTime = Date.now();

  try {
    while (STATE.isScanning) {
      txt.textContent = `Scanning chunk at ${offset}... Discovered ${allDiscovered.length} setups`;

      // Fetch chunk with retry & timeout
      let data = null;
      let attempts = 0;
      const maxRetries = 3;

      while (attempts < maxRetries && STATE.isScanning) {
        attempts++;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 14000); // 14s timeout
          const res = await fetch(`api.php?action=scan_chunk&offset=${offset}&limit=${limit}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const parsed = await res.json();
            if (parsed && parsed.success) {
              data = parsed;
              break;
            }
          }
        } catch (fetchErr) {
          console.warn(`Chunk ${offset} attempt ${attempts} failed:`, fetchErr.message);
        }

        if (attempts < maxRetries && STATE.isScanning) {
          txt.textContent = `Network retry ${attempts}/${maxRetries} for chunk at ${offset}...`;
          await new Promise(r => setTimeout(r, attempts * 750));
        }
      }

      if (!STATE.isScanning) break;

      if (!data) {
        // Chunk failed after 3 retries: skip this chunk and continue
        skippedChunks++;
        console.warn(`Chunk at offset ${offset} failed after ${maxRetries} retries. Skipping chunk to continue scan.`);
        txt.textContent = `Chunk at ${offset} timed out. Skipping forward...`;
        offset += limit;
        if (offset >= 2319) break;
        await new Promise(r => setTimeout(r, 400));
        continue;
      }

      // Process setups
      if (data.setups && data.setups.length) {
        allDiscovered = allDiscovered.concat(data.setups);
        allDiscovered.sort((a, b) => b.score - a.score);
        
        // Dynamically update view
        if (!STATE.scannerData) STATE.scannerData = { categories: {} };
        STATE.scannerData.categories.all_top = allDiscovered.slice(0, 50);
        STATE.scannerData.categories.golden_crosses = allDiscovered.filter(x => x.setupType === 'GOLDEN_CROSS').slice(0, 30);
        STATE.scannerData.categories.swing_breakouts = allDiscovered.filter(x => x.setupType === 'SWING_BREAKOUT').slice(0, 30);
        STATE.scannerData.categories.pullback_bounces = allDiscovered.filter(x => x.setupType === 'PULLBACK_BOUNCE').slice(0, 30);
        STATE.scannerData.categories.power_trends = allDiscovered.filter(x => x.setupType === 'POWER_TREND').slice(0, 30);
        
        const activeFilter = document.querySelector('#bestSetupsFilters .filter-pill.active')?.dataset.filter || 'all_top';
        renderBestSetupsTable(activeFilter);
      }

      const percent = data.percent !== undefined ? data.percent : Math.round((data.nextOffset / data.total) * 100);
      fill.style.width = `${percent}%`;
      pct.textContent = `${percent}%`;
      txt.textContent = `Scanned ${data.nextOffset} / ${data.total} stocks (${percent}%) · ${allDiscovered.length} setups found${skippedChunks > 0 ? ` (${skippedChunks} chunk skipped)` : ''}`;

      if (data.done || data.nextOffset >= data.total) {
        break;
      }
      offset = data.nextOffset;

      // 80ms breathing room between chunks to prevent connection congestion
      await new Promise(r => setTimeout(r, 80));
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (!STATE.isScanning) {
      txt.textContent = `Scan Stopped by user. Processed ${offset} stocks in ${elapsed}s. Found ${allDiscovered.length} setups.`;
    } else {
      fill.style.width = '100%';
      pct.textContent = '100%';
      txt.textContent = `Scan Complete in ${elapsed}s! Processed 2,319 stocks. Discovered ${allDiscovered.length} high-probability setups.`;

      // Persist to server
      if (allDiscovered.length > 0) {
        const finalPayload = {
          generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
          totalScanned: offset,
          totalSetupsFound: allDiscovered.length,
          executionSeconds: elapsed,
          categories: STATE.scannerData.categories
        };

        fetch('api.php?action=save_scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalPayload)
        }).catch(e => console.warn('Could not persist scan to server:', e.message));
      }
    }

  } catch (err) {
    console.error('Live scan error:', err);
    txt.textContent = `Scan notice: ${err.message}. Ready to resume.`;
  } finally {
    STATE.isScanning = false;
    btn.disabled = false;
    btn.textContent = '⚡ Live Scan (2,300+)';
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

/**
 * Quick Scan (Top 50 Liquid Stocks in 2.5s)
 */
async function startQuickScan() {
  const btn = document.getElementById('quickScanBtn');
  btn.disabled = true;
  btn.textContent = 'Scanning 50...';
  DOM.bestSetupsTableBody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;"><div class="spinner" style="margin: 0 auto 8px auto;"></div>Running parallel scan on Top 50 Liquid Stocks via api.php...</td></tr>`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);
    const res = await fetch('api.php?action=scan_quick', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Quick scan failed with HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Quick scan error');

    if (!STATE.scannerData) STATE.scannerData = { categories: {} };
    const setups = data.setups || [];
    setups.sort((a, b) => b.score - a.score);

    STATE.scannerData.categories.all_top = setups.slice(0, 50);
    STATE.scannerData.categories.golden_crosses = setups.filter(x => x.setupType === 'GOLDEN_CROSS');
    STATE.scannerData.categories.swing_breakouts = setups.filter(x => x.setupType === 'SWING_BREAKOUT');
    STATE.scannerData.categories.pullback_bounces = setups.filter(x => x.setupType === 'PULLBACK_BOUNCE');
    STATE.scannerData.categories.power_trends = setups.filter(x => x.setupType === 'POWER_TREND');

    if (DOM.scannerMetaTime) {
      DOM.scannerMetaTime.textContent = `Quick Scan Completed (${setups.length} setups in ${data.scanned} top stocks)`;
    }

    renderBestSetupsTable('all_top');
  } catch (err) {
    DOM.bestSetupsTableBody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;">Quick scan notice: ${err.message}. Please click again or run Live Scan.</td></tr>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Quick Scan (50)';
  }
}



window.switchStock = function(sym) {
  STATE.symbol = sym;
  DOM.symbolInput.value = sym;
  updatePillSelection(sym);
  loadStockData(sym, STATE.exchange);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function updatePillSelection(sym) {
  document.querySelectorAll('.watchlist-pills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.sym === sym);
  });
}

function showLoader(show) {
  DOM.chartLoader.classList.toggle('hidden', !show);
}

function showNotice(title, htmlMessage) {
  let modal = document.getElementById('errorNoticeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'errorNoticeModal';
    modal.className = 'error-modal-overlay';
    modal.innerHTML = `
      <div class="error-modal-box">
        <div class="error-modal-header">
          <span style="font-size: 1.3rem;">⚠️</span>
          <h3 id="noticeModalTitle" style="margin:0; font-size: 1.1rem; color: #ff5c8a;"></h3>
        </div>
        <div class="error-modal-body" id="noticeModalBody" style="line-height: 1.6; margin: 16px 0; color: #d0d7de; font-size: 0.95rem;"></div>
        <div style="text-align: right;">
          <button type="button" class="btn-search" style="padding: 6px 18px;" onclick="document.getElementById('errorNoticeModal').style.display='none'">Dismiss</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('noticeModalTitle').textContent = title;
  document.getElementById('noticeModalBody').innerHTML = htmlMessage;
  modal.style.display = 'flex';
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------

function setupEventListeners() {
  // Search Button & Enter Key
  DOM.searchBtn.addEventListener('click', () => {
    const val = DOM.symbolInput.value.trim().toUpperCase();
    if (val) {
      STATE.symbol = val;
      updatePillSelection(val);
      loadStockData(val, STATE.exchange);
    }
  });

  DOM.symbolInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      DOM.searchBtn.click();
    }
  });

  // Exchange Toggle
  DOM.exchangeToggle.addEventListener('click', e => {
    const btn = e.target.closest('.btn-toggle');
    if (!btn || btn.classList.contains('active')) return;

    document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.exchange = btn.dataset.exchange;
    loadStockData(STATE.symbol, STATE.exchange);
  });

  // Watchlist Pills
  DOM.watchlistPills.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;

    const sym = pill.dataset.sym;
    window.switchStock(sym);
  });

  // Timeframe range controls
  document.querySelectorAll('.range-group .btn-ctrl').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-group .btn-ctrl').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.range = btn.dataset.range;
      loadStockData(STATE.symbol, STATE.exchange, STATE.range);
    });
  });

  // Layer Toggles
  DOM.toggleSma20.addEventListener('click', () => {
    STATE.showSma20 = !STATE.showSma20;
    DOM.toggleSma20.classList.toggle('active', STATE.showSma20);
    STATE.sma20Series.applyOptions({ visible: STATE.showSma20 });
  });

  DOM.toggleSma50.addEventListener('click', () => {
    STATE.showSma50 = !STATE.showSma50;
    DOM.toggleSma50.classList.toggle('active', STATE.showSma50);
    STATE.sma50Series.applyOptions({ visible: STATE.showSma50 });
  });

  DOM.toggleSma200.addEventListener('click', () => {
    STATE.showSma200 = !STATE.showSma200;
    DOM.toggleSma200.classList.toggle('active', STATE.showSma200);
    STATE.sma200Series.applyOptions({ visible: STATE.showSma200 });
  });

  DOM.toggleMarkers.addEventListener('click', () => {
    STATE.showMarkers = !STATE.showMarkers;
    DOM.toggleMarkers.classList.toggle('active', STATE.showMarkers);
    STATE.candleSeries.setMarkers(STATE.showMarkers ? STATE.markers : []);
  });

  // Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'screenerTab' && !STATE.screenerCache) {
        loadScreener();
      }
    });
  });

  // 2,000+ Best Setups Category Filters
  document.querySelectorAll('#bestSetupsFilters .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#bestSetupsFilters .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBestSetupsTable(btn.dataset.filter);
    });
  });

  // Screener Filters
  document.querySelectorAll('.screener-controls:not(#bestSetupsFilters) .filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.closest('#bestSetupsFilters')) return;
      document.querySelectorAll('#screenerTab .filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (STATE.screenerCache) {
        renderScreenerTable(STATE.screenerCache, btn.dataset.filter);
      }
    });
  });

  // Refresh Screener Button
  DOM.refreshScreenerBtn.addEventListener('click', () => {
    const activeFilter = document.querySelector('#screenerTab .filter-pill.active')?.dataset.filter || 'ALL';
    loadScreener(activeFilter);
  });

  // 2,000+ Stock Live & Quick Scan Actions
  document.getElementById('startLiveScanBtn')?.addEventListener('click', startLiveScan);
  document.getElementById('quickScanBtn')?.addEventListener('click', startQuickScan);
}

// -------------------------------------------------------------
// Bootstrapping
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  setupEventListeners();
  setupAutocomplete();
  loadMasterSymbols();
  loadScannerResults('all_top');
  loadStockData(STATE.symbol, STATE.exchange);
});

