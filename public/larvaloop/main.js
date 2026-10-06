/* LarvaLoop — interactions (vanilla JS, no build step) */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Run fn at most once per animation frame */
  function rafThrottle(fn) {
    var queued = false, lastArgs;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn.apply(null, lastArgs); });
    };
  }

  /* 1. Split [data-letters] text into hoverable letters (wave effect) */
  document.querySelectorAll('[data-letters]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      var word = document.createElement('span');
      word.className = 'word';
      Array.from(w).forEach(function (ch) {
        var lt = document.createElement('span');
        lt.className = 'lt';
        lt.textContent = ch;
        word.appendChild(lt);
      });
      el.appendChild(word);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  /* 1b. Text generate: wrap each word so it fades in from a blur, one after another */
  if (!reduceMotion) {
    document.querySelectorAll('[data-generate]').forEach(function (el) {
      var words = el.textContent.trim().split(/\s+/);
      el.textContent = '';
      words.forEach(function (w, i) {
        var s = document.createElement('span');
        s.className = 'gen-word';
        s.style.animationDelay = (0.45 + i * 0.045).toFixed(3) + 's';
        s.textContent = w;
        el.appendChild(s);
        if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      });
    });
  }

  /* 1c. Floating navbar: show after the hero when scrolling up, hide when scrolling down */
  var floatNav = document.getElementById('floatNav');
  var heroEl = document.querySelector('.hero');
  if (floatNav && heroEl) {
    var lastY = window.scrollY;
    window.addEventListener('scroll', rafThrottle(function () {
      var y = window.scrollY;
      var pastHero = y > heroEl.offsetHeight * 0.6;
      floatNav.classList.toggle('show', pastHero && y < lastY);
      lastY = y;
    }), { passive: true });
  }

  /* 1d. Pointer highlight draws when "Landfill is." scrolls into view */
  var ph = document.getElementById('ph');
  if (ph) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { ph.classList.add('in'); io.disconnect(); } });
      }, { threshold: 0.8 });
      io.observe(ph);
    } else {
      ph.classList.add('in');
    }
  }

  /* 1e. Water ripples on the CTA block */
  var cta = document.getElementById('ctaBlock');
  var rippleBox = document.getElementById('ripples');
  if (cta && rippleBox && !reduceMotion) {
    var lastRx = -999, lastRy = -999;
    var spawn = function (x, y, size, big, delay) {
      var r = document.createElement('span');
      r.className = big ? 'ripple big' : 'ripple';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      r.style.setProperty('--s', size + 'px');
      if (delay) r.style.animationDelay = delay + 's';
      r.addEventListener('animationend', function () { r.remove(); });
      rippleBox.appendChild(r);
      while (rippleBox.children.length > 24) rippleBox.firstChild.remove();
    };
    cta.addEventListener('mousemove', rafThrottle(function (e) {
      var b = cta.getBoundingClientRect();
      var x = e.clientX - b.left, y = e.clientY - b.top;
      cta.style.setProperty('--cx', x + 'px');
      cta.style.setProperty('--cy', y + 'px');
      if (Math.hypot(x - lastRx, y - lastRy) > 46) {
        spawn(x, y, 220, false, 0);
        lastRx = x; lastRy = y;
      }
    }));
    cta.addEventListener('mouseleave', function () {
      cta.style.setProperty('--cx', '-999px');
      cta.style.setProperty('--cy', '-999px');
      lastRx = lastRy = -999;
    });
    cta.addEventListener('click', function (e) {
      var b = cta.getBoundingClientRect();
      var x = e.clientX - b.left, y = e.clientY - b.top;
      spawn(x, y, 520, true, 0);
      spawn(x, y, 520, true, 0.15);
      spawn(x, y, 520, true, 0.3);
    });
  }

  /* 1g. 100 kg flow: sweep the streams in when visible, highlight one on hover */
  var flowCard = document.getElementById('flowCard');
  var sankey = document.getElementById('sankey');
  if (flowCard && sankey) {
    if ('IntersectionObserver' in window && !reduceMotion) {
      var fio = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { flowCard.classList.add('in'); fio.disconnect(); }
      }, { threshold: 0.35 });
      fio.observe(flowCard);
    } else {
      flowCard.classList.add('in');
    }
    var parts = flowCard.querySelectorAll('[data-k]');
    var setActive = function (k) {
      if (k) sankey.setAttribute('data-active', k); else sankey.removeAttribute('data-active');
      parts.forEach(function (p) { p.classList.toggle('on', !!k && p.dataset.k === k); });
    };
    parts.forEach(function (p) {
      p.addEventListener('mouseenter', function () { setActive(p.dataset.k); });
      p.addEventListener('mouseleave', function () { setActive(null); });
      p.addEventListener('focus', function () { setActive(p.dataset.k); });
      p.addEventListener('blur', function () { setActive(null); });
    });
  }

  /* 1f. Container scroll: the dashboard flattens as its section scrolls into view */
  var dashScroll = document.getElementById('dashScroll');
  if (dashScroll && !reduceMotion) {
    var updateDash = rafThrottle(function () {
      var r = dashScroll.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      var p = Math.min(1, Math.max(0, (r.top - vh * 0.25) / (vh * 0.55)));
      dashScroll.style.setProperty('--p', p.toFixed(3));
    });
    window.addEventListener('scroll', updateDash, { passive: true });
    window.addEventListener('resize', updateDash);
    updateDash();
  }

  /* 2. Fireflies in the hero */
  var flyBox = document.getElementById('fireflies');
  if (flyBox) {
    for (var i = 0; i < 22; i++) {
      var f = document.createElement('span');
      f.className = 'fly';
      var size = 4 + (i % 4);
      var delay = -((i * 1.3) % 9);
      f.style.left = ((i * 37 + 11) % 100) + '%';
      f.style.top = ((i * 53 + 7) % 92) + '%';
      f.style.width = f.style.height = size + 'px';
      f.style.animationDuration = (7 + (i % 5) * 2) + 's, ' + (2 + (i % 3)) + 's';
      f.style.animationDelay = delay + 's, ' + delay + 's';
      flyBox.appendChild(f);
    }
  }

  /* 3. Hero: cursor glow + parallax (CSS variables) */
  var hero = document.querySelector('.hero');
  if (hero && !reduceMotion) {
    hero.addEventListener('mousemove', rafThrottle(function (e) {
      var r = hero.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      hero.style.setProperty('--mx', x + 'px');
      hero.style.setProperty('--my', y + 'px');
      hero.style.setProperty('--nx', (x / r.width - 0.5).toFixed(3));
      hero.style.setProperty('--ny', (y / r.height - 0.5).toFixed(3));
    }));
    hero.addEventListener('mouseleave', function () {
      hero.style.setProperty('--mx', '-999px');
      hero.style.setProperty('--my', '-999px');
      hero.style.setProperty('--nx', 0);
      hero.style.setProperty('--ny', 0);
    });
  }

  /* 4. Interactive loop */
  var STEPS = [
    { num: '01', title: 'Log', text: 'Tenants log what they prep and what they bin.' },
    { num: '02', title: 'Insight', text: 'The log shows where kitchens over-prep.' },
    { num: '03', title: 'Supply', text: 'The BSF processor gets predictable volumes.' },
    { num: '04', title: 'Value', text: 'Insect protein, bio-fertiliser, carbon offsets.' }
  ];
  var arc = document.getElementById('arc');
  var idle = document.getElementById('loopIdle');
  var info = document.getElementById('loopInfo');
  var nodes = document.querySelectorAll('.node');

  function showStep(btn) {
    var i = Number(btn.dataset.step);
    var s = STEPS[i];
    nodes.forEach(function (n) { n.classList.toggle('active', n === btn); });
    document.getElementById('loopNum').textContent = s.num;
    document.getElementById('loopTitle').textContent = s.title;
    document.getElementById('loopText').textContent = s.text;
    idle.classList.add('hide');
    info.classList.remove('show'); void info.offsetWidth; info.classList.add('show');
    arc.style.opacity = 1;
    arc.style.transform = 'rotate(' + (Number(btn.dataset.angle) - 39) + 'deg)';
  }
  function clearStep() {
    nodes.forEach(function (n) { n.classList.remove('active'); });
    idle.classList.remove('hide');
    info.classList.remove('show');
    arc.style.opacity = 0;
  }
  nodes.forEach(function (n) {
    n.addEventListener('mouseenter', function () { showStep(n); });
    n.addEventListener('focus', function () { showStep(n); });
    n.addEventListener('click', function () { showStep(n); });
    n.addEventListener('mouseleave', clearStep);
    n.addEventListener('blur', clearStep);
  });

  if (reduceMotion) return; /* everything below is pointer motion only */

  /* 5. Magnetic buttons */
  document.querySelectorAll('.magnetic').forEach(function (zone) {
    var inner = zone.querySelector('.mag');
    zone.addEventListener('mousemove', rafThrottle(function (e) {
      var r = zone.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) * 0.3;
      var dy = (e.clientY - (r.top + r.height / 2)) * 0.4;
      inner.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    }));
    zone.addEventListener('mouseleave', function () { inner.style.transform = ''; });
  });

  /* 6. Tilt cards with glare */
  document.querySelectorAll('.tilt').forEach(function (card) {
    var inner = card.querySelector('.tilt-inner');
    card.addEventListener('mousemove', rafThrottle(function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.classList.add('on');
      inner.style.transform = 'rotateX(' + ((0.5 - py) * 14).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 16).toFixed(2) + 'deg) scale(1.03)';
      inner.style.setProperty('--px', (px * 100).toFixed(0) + '%');
      inner.style.setProperty('--py', (py * 100).toFixed(0) + '%');
    }));
    card.addEventListener('mouseleave', function () {
      card.classList.remove('on');
      inner.style.transform = '';
    });
  });

  /* 7. Spotlight cards */
  document.querySelectorAll('.spot').forEach(function (card) {
    card.addEventListener('mousemove', rafThrottle(function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--sx', Math.round(e.clientX - r.left) + 'px');
      card.style.setProperty('--sy', Math.round(e.clientY - r.top) + 'px');
    }));
    card.addEventListener('mouseleave', function () {
      card.style.setProperty('--sx', '-999px');
      card.style.setProperty('--sy', '-999px');
    });
  });

  /* 8. 3D dashboard follows the cursor across the data section */
  var dataSection = document.getElementById('data');
  var dash = document.getElementById('dash');
  if (dataSection && dash) {
    dataSection.addEventListener('mousemove', rafThrottle(function (e) {
      var r = dataSection.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      dash.style.setProperty('--rx', (-dy * 10).toFixed(2) + 'deg');
      dash.style.setProperty('--ry', (dx * 14).toFixed(2) + 'deg');
    }));
    dataSection.addEventListener('mouseleave', function () {
      dash.style.setProperty('--rx', '0deg');
      dash.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------- prep vs sales chart ---------- */
  var prepCard = document.getElementById('prepCard');
  var prepSvg = document.getElementById('prepSvg');
  if (prepCard && prepSvg) {
    var W = 1000, H = 260, TOP = 12, MAXV = 110;
    var PH = [
      { k: 'a1', name: 'Average', cls: 'avg', a: 0, b: 0.31 },
      { k: 'pk', name: 'Peak', cls: 'peak', a: 0.31, b: 0.53 },
      { k: 'a2', name: 'Average', cls: 'avg', a: 0.53, b: 0.85 },
      { k: 'op', name: 'Off-peak', cls: 'off', a: 0.85, b: 1 }
    ];
    var sig = function (t, c, w) { return 1 / (1 + Math.exp(-(t - c) / w)); };
    // Prep follows demand, but late: it lags sales up into the peak and down out of it.
    var prepared = function (t) {
      return 72 + 30 * sig(t, 0.335, 0.012) - 31 * sig(t, 0.575, 0.018) - 58 * sig(t, 0.905, 0.016)
        + 1.2 * Math.sin(t * 40) + 0.8 * Math.sin(t * 97);
    };
    var sold = function (t) {
      return 63 + 37 * sig(t, 0.315, 0.008) - 39 * sig(t, 0.538, 0.006) - 54 * sig(t, 0.868, 0.006)
        + 0.9 * Math.sin(t * 53 + 1) + 0.6 * Math.sin(t * 131);
    };
    var N = 240, P = [], S = [];
    for (var i = 0; i <= N; i++) { var t = i / N; P.push(prepared(t)); S.push(sold(t)); }
    var X = function (i) { return (i / N) * W; };
    var Y = function (v) { return TOP + (1 - v / MAXV) * (H - TOP - 8); };
    var line = function (arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(''); };
    var band = function (upper, lower) {
      var d = upper.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
      for (var j = lower.length - 1; j >= 0; j--) d += 'L' + X(j).toFixed(1) + ' ' + Y(lower[j]).toFixed(1);
      return d + 'Z';
    };
    var lo = P.map(function (v, i) { return Math.min(v, S[i]); });
    var ns = 'http://www.w3.org/2000/svg';
    var mk = function (tag, attrs) { var el = document.createElementNS(ns, tag); for (var a in attrs) el.setAttribute(a, attrs[a]); prepSvg.appendChild(el); return el; };
    PH.forEach(function (ph) { mk('rect', { class: 'pband', 'data-k': ph.k, x: ph.a * W, y: 0, width: (ph.b - ph.a) * W, height: H }); });
    PH.slice(1).forEach(function (ph) { mk('line', { class: 'div', x1: ph.a * W, x2: ph.a * W, y1: 0, y2: H }); });
    mk('path', { class: 'area', d: band(P, lo), fill: '#CFE89A' });
    mk('path', { class: 'area', d: band(S, lo), fill: '#F6CBA8' });
    var g = mk('g', { class: 'draw' });
    var lp = document.createElementNS(ns, 'path'); lp.setAttribute('class', 'ln-p'); lp.setAttribute('d', line(P)); g.appendChild(lp);
    var ls = document.createElementNS(ns, 'path'); ls.setAttribute('class', 'ln-s'); ls.setAttribute('d', line(S)); g.appendChild(ls);
    // annotation: point into the post-peak gap
    var ai = Math.round(0.565 * N), ay = (P[ai] + S[ai]) / 2;
    var noteX = 0.69, noteY = 0.62;
    mk('line', { class: 'lead', x1: X(ai), y1: Y(ay), x2: noteX * W, y2: noteY * H });
    var note = document.getElementById('prepNote');
    note.style.left = (noteX * 100) + '%';
    note.style.top = (noteY * 100) + '%';

    var phasesEl = document.getElementById('prepPhases');
    var bands = prepSvg.querySelectorAll('.pband');
    var setBand = function (k) {
      bands.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === k); });
      phasesEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); });
    };
    PH.forEach(function (ph) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = ph.cls; b.textContent = ph.name; b.dataset.k = ph.k;
      b.style.flex = String(ph.b - ph.a);
      b.addEventListener('mouseenter', function () { setBand(ph.k); });
      b.addEventListener('mouseleave', function () { setBand(null); });
      b.addEventListener('focus', function () { setBand(ph.k); });
      b.addEventListener('blur', function () { setBand(null); });
      phasesEl.appendChild(b);
    });

    var chart = document.getElementById('prepChart');
    var guide = document.getElementById('prepGuide'), dP = document.getElementById('prepDotP'), dS = document.getElementById('prepDotS'), tip = document.getElementById('prepTip');
    var show = function (t) {
      t = Math.max(0, Math.min(1, t));
      var i = Math.round(t * N), ph = PH.filter(function (p) { return t >= p.a && t <= p.b; })[0] || PH[3];
      var pv = P[i], sv = S[i], diff = Math.round(pv - sv);
      var pct = (t * 100) + '%';
      guide.style.left = pct; dP.style.left = pct; dS.style.left = pct;
      dP.style.top = (Y(pv) / H * 100) + '%'; dS.style.top = (Y(sv) / H * 100) + '%';
      tip.innerHTML = '<b>' + ph.name + '</b><br>Prepared ' + Math.round(pv) + ' · Sold ' + Math.round(sv) + '<br>' +
        (diff > 0 ? '<span class="w">Over-prep +' + diff + ' portions</span>' : diff < 0 ? '<span class="u">Sold out: ' + (-diff) + ' short</span>' : 'On target');
      var w = chart.clientWidth, x = t * w, tw = tip.offsetWidth || 170;
      tip.style.left = (x + 16 + tw > w ? Math.max(0, x - 16 - tw) : x + 16) + 'px';
      setBand(ph.k);
      chart.classList.add('hover');
    };
    var hide = function () { chart.classList.remove('hover'); setBand(null); };
    chart.addEventListener('mousemove', rafThrottle(function (e) {
      var r = chart.getBoundingClientRect(); show((e.clientX - r.left) / r.width);
    }));
    chart.addEventListener('mouseleave', hide);
    chart.addEventListener('touchmove', function (e) {
      var r = chart.getBoundingClientRect(); show((e.touches[0].clientX - r.left) / r.width);
    }, { passive: true });
    chart.addEventListener('touchend', hide);
    var kt = 0.57;
    chart.addEventListener('focus', function () { show(kt); });
    chart.addEventListener('blur', hide);
    chart.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { kt = Math.min(1, kt + 0.02); show(kt); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { kt = Math.max(0, kt - 0.02); show(kt); e.preventDefault(); }
    });

    if ('IntersectionObserver' in window && !reduceMotion) {
      var pio = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { prepCard.classList.add('in'); pio.disconnect(); }
      }, { threshold: 0.35 });
      pio.observe(prepCard);
    } else {
      prepCard.classList.add('in');
    }
  }

  /* ---------- glow cards: mouse-follow light ---------- */
  document.querySelectorAll('.glow-card').forEach(function (card) {
    card.addEventListener('mousemove', rafThrottle(function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--gx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--gy', (e.clientY - r.top) + 'px');
    }));
  });

  /* ---------- count-up numbers ---------- */
  var counters = document.querySelectorAll('.impact-num, .stat-big');
  var runCount = function (el) {
    var txt = el.textContent, m = txt.match(/[\d,.]+/);
    if (!m) return;
    var raw = m[0], target = parseFloat(raw.replace(/,/g, '')), comma = raw.indexOf(',') > -1;
    var pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length);
    var t0 = null, dur = 1400;
    var fmt = function (v) { v = Math.round(v); return comma ? v.toLocaleString('en-US') : String(v); };
    var step = function (ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + fmt(target * e) + post;
      if (k < 1) requestAnimationFrame(step); else el.textContent = txt;
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window && !reduceMotion) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { runCount(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- roadmap reveal ---------- */
  var roadmap = document.getElementById('roadmap');
  if (roadmap) {
    if ('IntersectionObserver' in window && !reduceMotion) {
      var rio = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { roadmap.classList.add('in'); rio.disconnect(); }
      }, { threshold: 0.3 });
      rio.observe(roadmap);
    } else { roadmap.classList.add('in'); }
  }
})();
