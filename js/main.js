/* ==========================================================================
   ORACLEBOT — main.js
   Nav scroll state, mobile toggle, scroll reveals, FAQ accordion,
   smooth-scroll, waitlist form handler, interactive preview modals.
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
      try {
        const key = 'oraclebot_waitlist';
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        list.push({ email, at: new Date().toISOString(), page: location.pathname });
        localStorage.setItem(key, JSON.stringify(list));
      } catch (_) { /* ignore storage errors */ }
      if (section) section.classList.add('is-submitted');
    });
  });

  /* ──────────────────────────────────────────────────────────────────
     Phase 16 — Interactive preview modals
     ──────────────────────────────────────────────────────────────────
     Three modals share one <dialog id="ob-modal">. Open via
     [data-modal-open="<which>"] buttons. Closes on ESC, on backdrop
     click, or on the [data-modal-close] button.

     Animations driven by a single rAF loop; if user prefers reduced
     motion we render the final state immediately.
  */

  const PREFER_REDUCED = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  })();

  const dlg = document.getElementById('ob-modal');
  const dlgTitle = document.getElementById('ob-modal-title');
  const dlgEyebrow = document.getElementById('ob-modal-eyebrow');
  const dlgBody = document.getElementById('ob-modal-body');

  // Cached fixtures, lazy-loaded on first open of the corresponding modal.
  const cache = { scan: null, probes: null };

  // --- Modal infrastructure -----------------------------------------
  function openModal(eyebrow, title) {
    if (!dlg) return false;
    dlgEyebrow.textContent = eyebrow || '';
    dlgTitle.textContent = title || '';
    dlgBody.innerHTML = '';
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    document.body.classList.add('is-modal-open');
    return true;
  }

  function closeModal() {
    if (!dlg) return;
    if (dlg.open) dlg.close();
    document.body.classList.remove('is-modal-open');
    // Stop any running scan animation.
    if (currentScanCleanup) {
      currentScanCleanup();
      currentScanCleanup = null;
    }
  }

  if (dlg) {
    dlg.addEventListener('click', (e) => {
      // Click on the dialog element itself (the backdrop) but not on its
      // inner shell closes the modal.
      if (e.target === dlg) closeModal();
    });
    dlg.addEventListener('close', () => {
      document.body.classList.remove('is-modal-open');
      if (currentScanCleanup) {
        currentScanCleanup();
        currentScanCleanup = null;
      }
    });
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-modal-open]');
    if (trigger) {
      e.preventDefault();
      const which = trigger.getAttribute('data-modal-open');
      if (which === 'live-scan') openLiveScan();
      else if (which === 'probe-explorer') openProbeExplorer(trigger.getAttribute('data-probe-id'));
      else if (which === 'embed-badge') openEmbedBadge(trigger.getAttribute('data-verification-id'));
      return;
    }
    if (e.target.closest('[data-modal-close]')) {
      e.preventDefault();
      closeModal();
    }
  });

  // --- Modal A — Live Scan replay -----------------------------------

  let currentScanCleanup = null;

  async function openLiveScan() {
    if (!openModal('Live · oracle-bot-seven.vercel.app', 'A real OracleBot scan')) return;
    dlgBody.innerHTML = '<p style="color: var(--ink-dim); font-family: var(--mono); font-size: 12px;">Loading fixture…</p>';

    try {
      if (!cache.scan) {
        const res = await fetch('js/fixtures/scan.json', { cache: 'force-cache' });
        if (!res.ok) throw new Error('fixture fetch failed');
        cache.scan = await res.json();
      }
    } catch (err) {
      dlgBody.innerHTML = '<p style="color: var(--bad); font-family: var(--mono); font-size: 12px;">Could not load scan fixture. ' + (err && err.message ? err.message : '') + '</p>';
      return;
    }

    const fx = cache.scan;
    const allFindings = (fx.findings || []).slice();
    const events = (fx.events || []).slice();

    dlgBody.innerHTML = `
      <div class="ob-scan">
        <div class="ob-scan__panel" aria-live="polite">
          <h4>Run · ${escapeHtml(fx.run.target)}</h4>
          <div class="ob-scan__metric"><span>Mode</span><b>${escapeHtml(fx.run.mode)}</b></div>
          <div class="ob-scan__metric"><span>Packs</span><b>${(fx.run.packs || []).join(' · ')}</b></div>
          <div class="ob-scan__metric"><span>Bots × duration</span><b>${fx.run.botCount} × ${fx.run.durationMinutes} min</b></div>
          <div class="ob-scan__metric"><span>Findings</span><b id="ob-scan-fcount">0</b></div>
          <div class="ob-scan__metric ob-scan__metric--score"><span>Readiness</span><b id="ob-scan-score">100</b></div>
        </div>
        <div class="ob-scan__panel">
          <h4>Live findings</h4>
          <ul class="ob-scan__events" id="ob-scan-events" aria-live="polite"></ul>
        </div>
      </div>
      <div class="ob-scan__controls">
        <button type="button" id="ob-scan-restart">Restart</button>
        <span id="ob-scan-status">Replaying…</span>
      </div>
    `;

    const eventsEl = document.getElementById('ob-scan-events');
    const fcountEl = document.getElementById('ob-scan-fcount');
    const scoreEl = document.getElementById('ob-scan-score');
    const statusEl = document.getElementById('ob-scan-status');
    const restartBtn = document.getElementById('ob-scan-restart');

    const SEV_PENALTY = { critical: 25, high: 12, medium: 6, low: 2, info: 0.5 };

    function start() {
      eventsEl.innerHTML = '';
      let timeouts = [];
      let cumulativePenalty = 0;
      let hasCritical = false;
      let surfaced = 0;
      const targetScore = fx.run.readinessScore != null ? fx.run.readinessScore : 100;

      // Filter to "finding_surfaced" events; pair each with its finding.
      const findingEvents = events.filter((e) => e.type === 'finding_surfaced');

      // Compress real timing into a 9-second replay so users don't wait
      // for the full duration. Reduced-motion = render final state.
      if (PREFER_REDUCED) {
        for (let i = 0; i < findingEvents.length; i++) {
          const f = allFindings[Math.min(i, allFindings.length - 1)] || { severity: 'medium', title: findingEvents[i].message };
          appendEventRow(f, findingEvents[i].message);
          surfaced++;
          cumulativePenalty += SEV_PENALTY[f.severity] || 0;
          if (f.severity === 'critical') hasCritical = true;
        }
        fcountEl.textContent = String(surfaced);
        scoreEl.textContent = String(targetScore);
        statusEl.textContent = 'Final state · reduced motion';
        return () => timeouts.forEach(clearTimeout);
      }

      const lastT = findingEvents[findingEvents.length - 1]?.tMs ?? 1;
      const firstT = findingEvents[0]?.tMs ?? 0;
      const span = Math.max(1, lastT - firstT);

      findingEvents.forEach((ev, i) => {
        const f = allFindings[Math.min(i, allFindings.length - 1)] || { severity: 'medium', title: ev.message };
        const at = 200 + ((ev.tMs - firstT) / span) * 9000;
        const id = setTimeout(() => {
          appendEventRow(f, ev.message);
          surfaced++;
          cumulativePenalty += SEV_PENALTY[f.severity] || 0;
          if (f.severity === 'critical') hasCritical = true;
          fcountEl.textContent = String(surfaced);
          let runningScore = Math.max(0, Math.round(100 - cumulativePenalty - (hasCritical ? 5 : 0)));
          scoreEl.textContent = String(runningScore);
          if (i === findingEvents.length - 1) {
            // Snap to authoritative score from fixture once all findings landed.
            scoreEl.textContent = String(targetScore);
            statusEl.textContent = 'Run completed · ' + (allFindings.length) + ' finding' + (allFindings.length === 1 ? '' : 's');
          }
        }, at);
        timeouts.push(id);
      });

      return () => timeouts.forEach(clearTimeout);
    }

    function appendEventRow(finding, msg) {
      const li = document.createElement('li');
      const sev = finding.severity || 'medium';
      li.innerHTML = `
        <span class="t">${formatTs()}</span>
        <span class="sev sev--${sev}">${sev}</span>
        <span>${escapeHtml((finding.title || msg || '').slice(0, 110))}</span>
      `;
      eventsEl.appendChild(li);
      eventsEl.scrollTop = eventsEl.scrollHeight;
    }

    let cleanup = start();
    restartBtn.addEventListener('click', () => {
      if (cleanup) cleanup();
      cleanup = start();
    });

    currentScanCleanup = () => { if (cleanup) cleanup(); };
  }

  // --- Modal B — Probe Explorer -------------------------------------

  async function openProbeExplorer(initialProbeId) {
    if (!openModal('Probe library', 'Explore the OracleBot probes')) return;
    dlgBody.innerHTML = '<p style="color: var(--ink-dim); font-family: var(--mono); font-size: 12px;">Loading probes…</p>';

    try {
      if (!cache.probes) {
        const res = await fetch('js/data/probes.json', { cache: 'force-cache' });
        if (!res.ok) throw new Error('probes manifest fetch failed');
        cache.probes = await res.json();
      }
    } catch (err) {
      dlgBody.innerHTML = '<p style="color: var(--bad); font-family: var(--mono); font-size: 12px;">Could not load probe manifest.</p>';
      return;
    }

    // Flat list of all shipped probes so left/right navigation works.
    const flat = [];
    (cache.probes.packs || []).forEach((pack) => {
      if (!pack.shipped) return;
      (pack.probes || []).forEach((p) => flat.push({ ...p, packLabel: pack.label, packId: pack.id }));
    });
    if (flat.length === 0) {
      dlgBody.innerHTML = '<p style="color: var(--ink-dim);">No probes available yet.</p>';
      return;
    }

    let idx = 0;
    if (initialProbeId) {
      const found = flat.findIndex((p) => p.id === initialProbeId);
      if (found >= 0) idx = found;
    }

    function render() {
      const p = flat[idx];
      dlgBody.innerHTML = `
        <div class="ob-probe">
          <span class="ob-probe__pack">${escapeHtml(p.packLabel)}</span>
          <span class="ob-probe__sev ob-probe__sev--${p.severity}">Severity · ${p.severity}</span>
          <h3 style="font-family: var(--display); font-size: 22px; margin: 4px 0 0; line-height: 1.25;">${escapeHtml(p.title)}</h3>
          <p class="ob-probe__id">probe id · ${escapeHtml(p.id)}</p>
          <p style="color: var(--ink-muted); margin: 0;">${escapeHtml(p.description)}</p>
          <div class="ob-probe__nav">
            <button type="button" id="ob-probe-prev" ${idx === 0 ? 'disabled' : ''}>← Prev</button>
            <span>${idx + 1} of ${flat.length}</span>
            <button type="button" id="ob-probe-next" ${idx === flat.length - 1 ? 'disabled' : ''}>Next →</button>
          </div>
        </div>
      `;
      document.getElementById('ob-probe-prev')?.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
      document.getElementById('ob-probe-next')?.addEventListener('click', () => { if (idx < flat.length - 1) { idx++; render(); } });
    }
    render();
  }

  // --- Modal C — Embed your badge -----------------------------------

  function openEmbedBadge(verificationId) {
    if (!openModal('Public readiness badge', 'Embed your score')) return;
    const id = verificationId || '2b840cd6-078e-403c-962e-41e26a19e030';
    const origin = location.origin.includes('localhost') ? 'https://oraclebot.net' : location.origin;
    const badgeUrl = `${origin}/api/badge/${id}.svg`;
    const pageUrl = `${origin}/score/${id}`;
    const md = `[![OracleBot Readiness](${badgeUrl})](${pageUrl})`;
    const html = `<a href="${pageUrl}"><img src="${badgeUrl}" alt="OracleBot Readiness" /></a>`;

    dlgBody.innerHTML = `
      <div class="ob-embed">
        <div class="ob-embed__badge-row">
          <a href="${pageUrl}" target="_blank" rel="noreferrer">
            <img src="${badgeUrl}" alt="OracleBot Readiness" />
          </a>
        </div>
        <div class="ob-embed__snippet">
          <header>Markdown<button type="button" class="ob-embed__copy" data-copy="${escapeAttr(md)}">copy</button></header>
          <pre>${escapeHtml(md)}</pre>
        </div>
        <div class="ob-embed__snippet">
          <header>HTML<button type="button" class="ob-embed__copy" data-copy="${escapeAttr(html)}">copy</button></header>
          <pre>${escapeHtml(html)}</pre>
        </div>
        <div class="ob-embed__snippet">
          <header>Image URL<button type="button" class="ob-embed__copy" data-copy="${escapeAttr(badgeUrl)}">copy</button></header>
          <pre>${escapeHtml(badgeUrl)}</pre>
        </div>
        <p style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-dim); margin: 0;">
          Score expires after 14 days without a fresh run · stale badge after that
        </p>
      </div>
    `;

    dlgBody.querySelectorAll('.ob-embed__copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.getAttribute('data-copy') || '');
          const orig = btn.textContent;
          btn.classList.add('is-copied');
          btn.textContent = 'copied';
          setTimeout(() => {
            btn.classList.remove('is-copied');
            btn.textContent = orig || 'copy';
          }, 1500);
        } catch (_) { /* clipboard blocked */ }
      });
    });
  }

  // --- helpers ------------------------------------------------------

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }
  let _ts = 0;
  function formatTs() {
    _ts += 1;
    return '+' + String(_ts).padStart(2, '0') + 's';
  }

})();
