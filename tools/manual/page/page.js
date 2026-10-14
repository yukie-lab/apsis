// Script of the user manual (build.mjs puts this file into manual/index.html): language switch, subtitles of the videos,
// marks of the pictures, full pictures and the contents. The page uses no network.
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'apsis-manual-lang';
  var all = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  // Subtitles: the cues come from the page (a file:// page cannot read a file with <track>). The language of the page
  // selects the track that shows. The menu of the video player can select the other track.
  var cues = JSON.parse(document.getElementById('subs').textContent);
  var players = all('video[data-video]').map(function (v) {
    var tracks = {};
    [['ja', '日本語'], ['en', 'English']].forEach(function (t) {
      var track = v.addTextTrack('subtitles', t[1], t[0]);
      track.mode = 'hidden';
      cues[v.getAttribute('data-video')][t[0]].forEach(function (c) { track.addCue(new VTTCue(c[0], c[1], c[2])); });
      tracks[t[0]] = track;
    });
    return { video: v, tracks: tracks };
  });

  function setLang(lang, save) {
    root.setAttribute('data-lang', lang);
    root.lang = lang;
    document.title = root.getAttribute('data-title-' + lang);
    all('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang)); });
    all('[data-alt-en]').forEach(function (el) { el.alt = el.getAttribute('data-alt-' + lang); });
    all('[data-label-en]').forEach(function (el) { el.setAttribute('aria-label', el.getAttribute('data-label-' + lang)); });
    players.forEach(function (p) {
      p.tracks.en.mode = lang === 'en' ? 'showing' : 'hidden';
      p.tracks.ja.mode = lang === 'ja' ? 'showing' : 'hidden';
    });
    if (!save) return;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* no storage: the page keeps the language until it closes */ }
    try {
      if (new URLSearchParams(location.search).has('lang')) history.replaceState(null, '', location.pathname + location.hash);
    } catch (e) { /* some browsers do not let a file:// page change its address */ }
  }
  setLang(root.getAttribute('data-lang') === 'ja' ? 'ja' : 'en', false);
  all('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang'), true); });
  });

  // Only one video plays at a time.
  players.forEach(function (p) {
    p.video.addEventListener('play', function () { players.forEach(function (q) { if (q !== p) q.video.pause(); }); });
  });
  // Times in the text of the narration.
  all('button.ts').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = document.querySelector('video[data-video="' + b.getAttribute('data-v') + '"]');
      v.currentTime = parseFloat(b.getAttribute('data-t'));
      var played = v.play();
      if (played && played.catch) played.catch(function () { /* the browser can stop the play; the time is set */ });
      v.scrollIntoView({ block: 'nearest' });
    });
  });

  // Marks of a picture: a pointer on a number or on a line of the list shows the part of the screen.
  all('.shot').forEach(function (fig) {
    function show(n) {
      fig.classList.toggle('focus', n !== null);
      all('[data-mark]', fig).forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-mark') === n); });
    }
    all('.legend li, .badge', fig).forEach(function (el) {
      el.addEventListener('mouseenter', function () { show(el.getAttribute('data-mark')); });
      el.addEventListener('mouseleave', function () { show(null); });
    });
  });

  // Marks that cover each other (small pictures, for example on a phone): move them apart a little, in the picture.
  function spread(wrap) {
    var marks = all('.badge', wrap);
    marks.forEach(function (m) { m.style.translate = ''; });
    var w = wrap.getBoundingClientRect();
    if (!w.width) return;
    var p = marks.map(function (m) {
      var r = m.getBoundingClientRect();
      return { m: m, x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width, dx: 0, dy: 0 };
    });
    for (var it = 0; it < 30; it++) {
      var moved = false;
      for (var i = 0; i < p.length; i++) {
        for (var j = i + 1; j < p.length; j++) {
          var a = p[i], c = p[j];
          var vx = c.x + c.dx - a.x - a.dx, vy = c.y + c.dy - a.y - a.dy;
          var d = Math.sqrt(vx * vx + vy * vy), min = (a.s + c.s) / 2 + 2;
          if (d >= min - 0.1) continue;
          if (d < 0.01) { vx = 0; vy = 1; d = 1; }
          var push = (min - d) / 2 + 0.1;
          a.dx -= (vx / d) * push; a.dy -= (vy / d) * push;
          c.dx += (vx / d) * push; c.dy += (vy / d) * push;
          moved = true;
        }
      }
      p.forEach(function (q) {
        var h = q.s / 2;
        q.dx = Math.min(Math.max(q.x + q.dx, w.left + h), w.right - h) - q.x;
        q.dy = Math.min(Math.max(q.y + q.dy, w.top + h), w.bottom - h) - q.y;
      });
      if (!moved) break;
    }
    p.forEach(function (q) { if (q.dx || q.dy) q.m.style.translate = q.dx.toFixed(1) + 'px ' + q.dy.toFixed(1) + 'px'; });
  }
  var wraps = all('.shot .shotwrap');
  wraps.forEach(spread);
  var again = 0;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(again);
    again = requestAnimationFrame(function () { all('.shotwrap').forEach(spread); });
  });

  // Full picture.
  var dialog = document.getElementById('zoom');
  var zbody = dialog.querySelector('.zbody');
  var ztitle = dialog.querySelector('.ztitle');
  all('button.pic').forEach(function (b) {
    b.addEventListener('click', function () {
      if (typeof dialog.showModal !== 'function') { window.open(b.querySelector('img').getAttribute('src')); return; }
      var wrap = b.parentNode.cloneNode(true);
      var copy = wrap.querySelector('button.pic');
      copy.parentNode.replaceChild(copy.querySelector('img'), copy);
      wrap.querySelector('img').removeAttribute('loading');
      zbody.replaceChildren(wrap);
      ztitle.innerHTML = b.closest('.shot').querySelector('figcaption').innerHTML;
      all('.zbtn', ztitle).forEach(function (z) { z.remove(); });
      dialog.showModal();
      zbody.scrollTop = 0;
      spread(wrap);
    });
  });
  all('button.zbtn').forEach(function (z) {
    z.addEventListener('click', function () { z.closest('.shot').querySelector('button.pic').click(); });
  });
  dialog.querySelector('.zclose').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  // Figures wider than the screen (phones): the side with more of the figure fades.
  function edges(w) {
    var max = w.scrollWidth - w.clientWidth;
    w.classList.toggle('more-l', w.scrollLeft > 2);
    w.classList.toggle('more-r', max > 2 && w.scrollLeft < max - 2);
  }
  all('.figwrap').forEach(function (w) {
    edges(w);
    w.addEventListener('scroll', function () { edges(w); }, { passive: true });
  });
  window.addEventListener('resize', function () { all('.figwrap').forEach(edges); });

  // Contents: closed at the start on a small screen, always open on a large screen.
  var tocBox = document.querySelector('.toc details');
  var small = window.matchMedia('(max-width: 980px)');
  if (small.matches) tocBox.open = false;
  var onSize = function (e) { if (!e.matches) tocBox.open = true; };
  if (small.addEventListener) small.addEventListener('change', onSize); else small.addListener(onSize);
  tocBox.querySelector('summary').addEventListener('click', function (e) { if (!small.matches) e.preventDefault(); });

  // Contents: the section on the screen.
  var links = {};
  all('.toc a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); });
        if (links[e.target.id]) links[e.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    all('main > section').forEach(function (s) { observer.observe(s); });
  }
})();
