/* ===== Golden Hour - ui.js =====
   Visual enhancements only. Never reads or writes case data, never calls the network,
   and never changes what app.js does. Everything here degrades gracefully: if this
   file fails to load, the app works exactly as before (just less animated). */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var $ = function (sel, scope) { return (scope || doc).querySelector(sel); };
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- theme toggle ---------- */
  var THEME_KEY = 'goldenHour_theme';
  var THEME_COLOR = { dark: '#0B1120', light: '#F2F5FA' };
  var toggle = $('#themeToggle');
  var meta = $('#metaTheme');

  function currentTheme() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

  function syncThemeUi() {
    var t = currentTheme();
    if (meta) meta.setAttribute('content', THEME_COLOR[t]);
    if (toggle) toggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function setTheme(t) {
    if (!mqReduce.matches) {
      root.classList.add('theme-fade');
      setTimeout(function () { root.classList.remove('theme-fade'); }, 450);
    }
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* storage unavailable: theme just won't persist */ }
    syncThemeUi();
  }

  syncThemeUi();
  if (toggle) toggle.addEventListener('click', function () { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });

  /* ---------- header: scrolled state + reading progress ---------- */
  var header = $('.top');
  var progress = $('.scroll-progress');
  var scrollQueued = false;

  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      var y = window.scrollY || root.scrollTop || 0;
      if (header) header.classList.toggle('is-scrolled', y > 8);
      if (progress) {
        var max = root.scrollHeight - window.innerHeight;
        progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max).toFixed(4) : 0) + ')';
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ---------- pointer effects: card spotlight, button sheen, background parallax ---------- */
  if (mqFine.matches && !mqReduce.matches) {
    var layers = $('.bg-layers');
    var lastMove = null;
    var moveQueued = false;

    doc.addEventListener('pointermove', function (e) {
      lastMove = e;
      if (moveQueued) return;
      moveQueued = true;
      requestAnimationFrame(function () {
        moveQueued = false;
        var ev = lastMove;
        if (layers) {
          layers.style.setProperty('--px', (ev.clientX / window.innerWidth - 0.5).toFixed(3));
          layers.style.setProperty('--py', (ev.clientY / window.innerHeight - 0.5).toFixed(3));
        }
        var target = ev.target && ev.target.closest ? ev.target.closest('.btn, .card, .clock-card, .step') : null;
        if (target) {
          var r = target.getBoundingClientRect();
          target.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
          target.style.setProperty('--my', (ev.clientY - r.top) + 'px');
        }
      });
    }, { passive: true });
  }

  /* ---------- scroll reveal ---------- */
  var revealItems = doc.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !mqReduce.matches && revealItems.length) {
    root.classList.add('reveal-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealItems.forEach(function (el) { io.observe(el); });
  }

  /* ---------- tabs: sliding active indicator ---------- */
  var tabs = $('.tabs');
  if (tabs) {
    var indicator = doc.createElement('span');
    indicator.className = 'tab-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    tabs.prepend(indicator);
    var placed = false;

    var placeIndicator = function () {
      var active = tabs.querySelector('[role="tab"][aria-selected="true"]');
      if (!active || !active.offsetWidth) return; // dashboard still hidden: try again when it shows
      if (!placed) indicator.style.transition = 'none';
      indicator.style.width = active.offsetWidth + 'px';
      indicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
      tabs.classList.add('has-indicator');
      if (!placed) {
        void indicator.offsetWidth; // flush so the first placement does not animate from 0
        indicator.style.transition = '';
        placed = true;
      }
    };

    new MutationObserver(placeIndicator).observe(tabs, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
    var dash = $('#dashboard');
    if (dash) new MutationObserver(function () { requestAnimationFrame(placeIndicator); }).observe(dash, { attributes: true, attributeFilter: ['hidden'] });
    if ('ResizeObserver' in window) new ResizeObserver(placeIndicator).observe(tabs);
    window.addEventListener('resize', placeIndicator);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(placeIndicator);
    placeIndicator();
  }

  /* ---------- steps: replay the entrance only when the list first appears ---------- */
  var stepsList = $('#stepsList');
  var dashboard = $('#dashboard');
  if (stepsList) {
    var rendered = stepsList.children.length > 0;
    if (rendered) stepsList.classList.add('static');
    new MutationObserver(function () {
      if (rendered) stepsList.classList.add('static');
      rendered = true;
    }).observe(stepsList, { childList: true });
    if (dashboard) {
      new MutationObserver(function () {
        if (dashboard.hidden) { rendered = false; stepsList.classList.remove('static'); }
      }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  /* ---------- skeletons: visible only while app.js has an AI button disabled ---------- */
  function watchBusy(buttonSel, skeletonSel) {
    var btn = $(buttonSel);
    var skeleton = $(skeletonSel);
    if (!btn || !skeleton) return;
    new MutationObserver(function () { skeleton.hidden = !btn.disabled; })
      .observe(btn, { attributes: true, attributeFilter: ['disabled'] });
  }
  watchBusy('#aiBtn', '#aiSkeleton');
  watchBusy('#aiComplaintBtn', '#complaintSkeleton');
})();
