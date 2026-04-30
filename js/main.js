/* ==========================================================================
   ORACLEBOT — main.js
   Nav scroll state, mobile toggle, scroll reveals, FAQ accordion,
   smooth-scroll, waitlist form handler
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- Nav scroll state + mobile toggle ---------- */
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 24) nav.classList.add('is-scrolled');
      else nav.classList.remove('is-scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const burger = nav.querySelector('.nav__burger');
    if (burger) {
      burger.addEventListener('click', () => nav.classList.toggle('is-open'));
      nav.querySelectorAll('.nav__links a').forEach(a => {
        a.addEventListener('click', () => nav.classList.remove('is-open'));
      });
    }
  }

  /* ---------- Active nav link based on section in view ---------- */
  const navLinks = document.querySelectorAll('.nav__links a');
  const sections = Array.from(navLinks)
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = '#' + entry.target.id;
          navLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === id));
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    sections.forEach(s => navIO.observe(s));
  }

  /* ---------- Reveal-on-scroll ---------- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq__item').forEach(item => {
    const q = item.querySelector('.faq__q');
    if (!q) return;
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      // Close siblings for tidier behavior
      document.querySelectorAll('.faq__item.is-open').forEach(other => {
        if (other !== item) other.classList.remove('is-open');
      });
      item.classList.toggle('is-open', !isOpen);
    });
  });

  /* ---------- Waitlist forms (any page) ---------- */
  document.querySelectorAll('[data-waitlist-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const section = form.closest('.waitlist');
      const email = (form.querySelector('input[name="email"]') || {}).value || '';
      // Phase 1: pure landing page. Wire up Formspree / Netlify Forms / webhook here.
      try {
        const key = 'oraclebot_waitlist';
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        list.push({ email, at: new Date().toISOString(), page: location.pathname });
        localStorage.setItem(key, JSON.stringify(list));
      } catch (_) { /* ignore storage errors */ }
      if (section) section.classList.add('is-submitted');
    });
  });

})();
