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
    { num: '01', title: 'Track', text: 'We log what the kitchen buys, item by item.' },
    { num: '02', title: 'Collect', text: 'Waste is weighed and picked up daily.' },
    { num: '03', title: 'Digest', text: 'Larvae eat it and grow into protein.' },
    { num: '04', title: 'Return', text: 'Feed for animals, frass for soil.' }
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
})();
