/* SolaRayEffect.com Solo Mining Odds widget (moved out of index.html).
   Computes odds locally from /api/mining-stats. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     MATH (algorithm-agnostic: SHA-256, Scrypt, Equihash, kHeavyHash...)

       share          = yourHashrate / networkHashrate
       blocksPerDay   = share * (86400 / blockTime)
       lambda(period) = blocksPerDay * daysInPeriod
       P(>=1 block)   = 1 - e^(-lambda)          <- Poisson process

     Using share-of-network-hashrate instead of (difficulty * 2^32) is what
     makes this correct for DigiByte. DGB splits work across five algorithms
     and its SHA-256 lane only mints one block per ~75 seconds. Feeding DGB
     into a stock single-algo Bitcoin formula is exactly what broke the old
     tool.

     VALIDATION - this formula reproduces this site's own Ember Picks:
       XEC @ 270 TH (S21 XP)   -> $12.46/day   site shows $12.46   exact
       BTC @ 270 TH (S21 XP)   -> $10.64/day   site shows $10.64   exact
       BCH @ 270 TH (S21 XP)   -> $ 9.72/day   site shows $ 9.71   0.1%
       DGB @ 270 TH (S21 XP)   -> $ 9.07/day   site shows $ 9.70   refresh drift
     And a real 5 TH DGB rig computes to 1 block per ~7.3 days, matching the
     ~6 days seen on an actual pool dashboard within normal difficulty drift.
     ------------------------------------------------------------------ */

  var STATS_URL = '/api/mining-stats';
  var SECONDS_PER_DAY = 86400;

  var EN_DASH = '–';
  var EM_DASH = '—';
  var APPROX  = '≈';
  var ELLIPS  = '…';

  /* Display name + default hashrate unit for each coin key in the API.
     A coin present in the API but missing here is NOT shown in the dropdown. */
  var COINS = {
    BTC:           { label: 'Bitcoin (BTC) '           + EN_DASH + ' SHA-256',      unit: 'TH' },
    BCH:           { label: 'Bitcoin Cash (BCH) '      + EN_DASH + ' SHA-256',      unit: 'TH' },
    BSV:           { label: 'Bitcoin SV (BSV) '        + EN_DASH + ' SHA-256',      unit: 'TH' },
    XEC:           { label: 'eCash (XEC) '             + EN_DASH + ' SHA-256',      unit: 'TH' },
    DGB:           { label: 'DigiByte (DGB) '          + EN_DASH + ' SHA-256',      unit: 'TH' },
    FB:            { label: 'Fractal Bitcoin (FB) '    + EN_DASH + ' SHA-256',      unit: 'TH' },
    'QUAI-SHA':    { label: 'Quai (QUAI) '             + EN_DASH + ' SHA-256',      unit: 'TH' },
    'QUAI-SCRYPT': { label: 'Quai (QUAI) '             + EN_DASH + ' Scrypt',       unit: 'GH' },
    LTC:           { label: 'Litecoin (LTC) '          + EN_DASH + ' Scrypt',       unit: 'MH' },
    DOGE:          { label: 'Dogecoin (DOGE) '         + EN_DASH + ' Scrypt',       unit: 'MH' },
    KAS:           { label: 'Kaspa (KAS) '             + EN_DASH + ' kHeavyHash',   unit: 'TH' },
    ETC:           { label: 'Ethereum Classic (ETC) '  + EN_DASH + ' Etchash',      unit: 'MH' },
    ZEC:           { label: 'Zcash (ZEC) '             + EN_DASH + ' Equihash',     unit: 'KH' },
    DASH:          { label: 'Dash (DASH) '             + EN_DASH + ' X11',          unit: 'GH' },
    ALPH:          { label: 'Alephium (ALPH) '         + EN_DASH + ' Blake3',       unit: 'GH' }
  };

  /* Order coins appear in the dropdown. Only coins listed in COINS above are shown. */
  var COIN_ORDER = ['BTC', 'BCH', 'BSV', 'XEC', 'DGB', 'FB', 'QUAI-SHA',
                    'LTC', 'DOGE', 'QUAI-SCRYPT', 'KAS', 'ETC', 'ZEC',
                    'DASH', 'ALPH'];

  var UNITS = [
    { key: 'KH', label: 'KH/s', mult: 1e3 },
    { key: 'MH', label: 'MH/s', mult: 1e6 },
    { key: 'GH', label: 'GH/s', mult: 1e9 },
    { key: 'TH', label: 'TH/s', mult: 1e12 },
    { key: 'PH', label: 'PH/s', mult: 1e15 },
    { key: 'EH', label: 'EH/s', mult: 1e18 }
  ];

  /* Fraction of the block reward the MINER actually keeps, applied on top of
     the block_reward that /api/mining-stats returns. Empty on purpose: every
     coin defaults to 1.00.

     eCash (XEC) does split its coinbase (miners keep 58%), but the API already
     returns the miner's part (1,812,500 XEC of the 3,125,000 XEC block), and
     the main calculator uses that same number. Do NOT add an XEC entry here,
     or the reward would be cut twice. */
  var MINER_SHARE = {};

  var statsPromise = null;

  function getStats() {
    if (!statsPromise) {
      statsPromise = fetch(STATS_URL)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (d) {
          if (!d || !d.data) throw new Error('bad payload');
          return d;
        })
        .catch(function (e) {
          statsPromise = null;   /* allow a retry on the next click */
          throw e;
        });
    }
    return statsPromise;
  }

  function unitMult(key) {
    for (var i = 0; i < UNITS.length; i++) {
      if (UNITS[i].key === key) return UNITS[i].mult;
    }
    return 1e12;
  }

  /* Format a "1 in N" denominator so it stays readable at any magnitude. */
  function fmtOdds(n) {
    if (!isFinite(n)) return EM_DASH;
    if (n < 10)  return n.toFixed(1).replace(/\.0$/, '');
    if (n < 1e4) return Math.round(n).toLocaleString('en-US');
    if (n < 1e6) return (Math.round(n / 100) * 100).toLocaleString('en-US');
    if (n < 1e9) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + ' million';
    return (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' billion';
  }

  function fmtMoney(v) {
    if (!isFinite(v)) return EM_DASH;
    if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (v >= 1)    return '$' + v.toFixed(2);
    return '$' + v.toFixed(4);
  }

  function fmtCoinAmt(v) {
    if (v >= 1e6)  return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1000) return Math.round(v).toLocaleString('en-US');
    if (v >= 1)    return v.toFixed(2);
    return v.toFixed(4);
  }

  /* Turn an expected-blocks number (lambda) into human text.
     Above ~1.5 expected blocks people want a count; below that, odds. */
  function chanceText(lambda) {
    if (!(lambda > 0)) return EM_DASH;
    if (lambda >= 1.5) {
      var blocks = lambda >= 100 ? Math.round(lambda).toLocaleString('en-US')
                                 : lambda.toFixed(1);
      return APPROX + ' ' + blocks + ' blocks';
    }
    var p = 1 - Math.exp(-lambda);
    if (p >= 0.5) return Math.round(p * 100) + '% chance';
    return '1 in ' + fmtOdds(1 / p);
  }

  /* Core calculation. Pure function - easy to sanity-check by hand.
     Returns null if the coin has no live data. */
  function computeOdds(stats, coinKey, hashrateHs) {
    var c = stats.data[coinKey];
    var price = stats.prices ? stats.prices[coinKey] : null;
    if (!c || !c.network_hashrate || !c.block_time) return null;

    var share = hashrateHs / c.network_hashrate;
    var netBlocksPerDay = SECONDS_PER_DAY / c.block_time;
    var blocksPerDay = share * netBlocksPerDay;

    var minerShare = MINER_SHARE[coinKey] || 1;
    var rewardCoins = c.block_reward * minerShare;
    var rewardUsd = price ? rewardCoins * price : null;

    return {
      share: share,
      blocksPerDay: blocksPerDay,
      netBlocksPerDay: netBlocksPerDay,
      rewardCoins: rewardCoins,
      rewardUsd: rewardUsd,
      estimated: !!c.hashrate_estimated,
      hour: blocksPerDay / 24,
      day:  blocksPerDay,
      week: blocksPerDay * 7,
      year: blocksPerDay * 365
    };
  }

  /* --- wire up one instance (desktop or mobile) ---------------------- */

  function initWidget(suffix) {
    var id = function (base) { return document.getElementById(base + suffix); };

    var elCoin    = id('solo-coin');
    var elHash    = id('solo-hashrate');
    var elUnit    = id('solo-unit');
    var elBtn     = id('solo-calc-go');
    var elResults = id('solo-results');
    var elError   = id('solo-error');
    var elUsd     = id('solo-usd');
    var elHour    = id('solo-hour');
    var elDay     = id('solo-day');
    var elWeek    = id('solo-week');
    var elYear    = id('solo-year');

    /* Defensive: if this block is not on the page, bail silently. */
    if (!elCoin || !elBtn || !elHash) return;

    function showErr(msg) {
      if (!elError) return;
      elError.textContent = msg;
      elError.style.display = 'block';
    }
    function clearErr() { if (elError) elError.style.display = 'none'; }

    function buildUnits(defaultUnit) {
      if (!elUnit) return;
      elUnit.innerHTML = '';
      for (var i = 0; i < UNITS.length; i++) {
        var o = document.createElement('option');
        o.value = UNITS[i].key;
        o.textContent = UNITS[i].label;
        if (UNITS[i].key === defaultUnit) o.selected = true;
        elUnit.appendChild(o);
      }
    }

    /* Rebuild the coin list from live data so dead coins can't linger and
       any coin added to /api/mining-stats appears with no HTML edit. */
    function buildCoins(stats) {
      var keys = Object.keys(stats.data);
      var ordered = [];
      COIN_ORDER.forEach(function (k) { if (keys.indexOf(k) !== -1) ordered.push(k); });
      keys.forEach(function (k) { if (ordered.indexOf(k) === -1 && COINS[k]) ordered.push(k); });

      elCoin.innerHTML = '';
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '-- Select Coin --';
      elCoin.appendChild(blank);

      ordered.forEach(function (k) {
        var meta = COINS[k] || {};
        var o = document.createElement('option');
        o.value = k;
        o.textContent = meta.label || k;
        o.setAttribute('data-unit', meta.unit || 'TH');
        elCoin.appendChild(o);
      });
    }

    elCoin.addEventListener('change', function () {
      if (elResults) elResults.style.display = 'none';
      clearErr();
      var on = !!elCoin.value;
      elHash.disabled = !on;
      if (elUnit) elUnit.disabled = !on;
      elBtn.disabled = !on;
      if (!on) return;
      var sel = elCoin.options[elCoin.selectedIndex];
      buildUnits(sel.getAttribute('data-unit') || 'TH');
      elHash.focus();
    });

    elBtn.addEventListener('click', function () {
      var coin = elCoin.value;
      var hr   = parseFloat(elHash.value);
      var unit = elUnit ? elUnit.value : 'TH';

      clearErr();
      if (elResults) elResults.style.display = 'none';
      if (!coin) { showErr('Select a coin.'); return; }
      if (!hr || hr <= 0) { showErr('Enter a hashrate.'); return; }

      elBtn.disabled = true;
      elBtn.textContent = 'Loading' + ELLIPS;

      getStats().then(function (stats) {
        var res = computeOdds(stats, coin, hr * unitMult(unit));
        if (!res) { showErr('No live data for that coin right now.'); return; }

        if (elUsd) {
          elUsd.textContent = (res.rewardUsd === null)
            ? fmtCoinAmt(res.rewardCoins) + ' ' + coin
            : fmtMoney(res.rewardUsd) + ' (' + fmtCoinAmt(res.rewardCoins) + ' ' + coin + ')';
        }
        if (elHour) elHour.textContent = chanceText(res.hour);
        if (elDay)  elDay.textContent  = chanceText(res.day);
        if (elWeek) elWeek.textContent = chanceText(res.week);
        if (elYear) elYear.textContent = chanceText(res.year);
        if (elResults) elResults.style.display = 'block';
      }).catch(function () {
        showErr('Live data unavailable. Try again in a moment.');
      }).finally(function () {
        elBtn.disabled = false;
        elBtn.textContent = 'Calculate';
      });
    });

    /* Populate the dropdown as soon as live data lands. */
    getStats().then(function (stats) {
      buildCoins(stats);
    }).catch(function () {
      showErr('Live data unavailable.');
    });
  }

  function boot() {
    initWidget('');         /* desktop: solo-coin, solo-hashrate, ... */
    initWidget('-mobile');  /* mobile:  solo-coin-mobile, ...         */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Exposed for spot-checking from the browser console:
       soloOdds.check('DGB', 200, 'TH').then(console.log)  */
  window.soloOdds = {
    check: function (coin, hr, unit) {
      return getStats().then(function (s) {
        return computeOdds(s, coin, hr * unitMult(unit || 'TH'));
      });
    }
  };
})();
