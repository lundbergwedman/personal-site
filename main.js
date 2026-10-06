(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blocks = Array.from(document.querySelectorAll('[data-type]'));
  const STEP = { heading: 1, text: 3, pre: 9 };
  const SECTIONS = ['home', 'about', 'story', 'ventures', 'contact'];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------------------------------------------------------------------------
  // Typewriter: every text node is split into a visible part and an invisible
  // "ghost" part, so the page keeps its final layout while text is printed.

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  cursor.setAttribute('aria-hidden', 'true');

  const queue = [];
  let running = false;
  let skipping = false;
  let current = null;
  let activeSection = 'home';

  function modeOf(element) {
    if (element.closest('[data-instant]')) return 'instant';
    if (element.closest('h2, h3, .hello')) return 'heading';
    if (element.closest('pre')) return 'pre';
    return 'text';
  }

  function prepare(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    block.units = [];
    for (const node of nodes) {
      const parent = node.parentElement;
      const text = node.nodeValue;
      if (!parent.closest('pre') && !text.trim()) continue;

      const typed = document.createElement('span');
      const ghost = document.createElement('span');
      ghost.className = 'ghost';
      ghost.textContent = text;
      node.replaceWith(typed, ghost);
      const stepOverride = parent.closest('[data-step]');
      block.units.push({ typed, ghost, text, mode: modeOf(parent), step: stepOverride && Number(stepOverride.dataset.step) });
    }
    block.classList.add('pending');
  }

  function reveal(unit) {
    unit.typed.textContent = unit.text;
    unit.ghost.textContent = '';
  }

  async function typeBlock(block) {
    current = block;
    block.classList.replace('pending', 'typing');
    const instant = block.instant || block.getBoundingClientRect().bottom < 0;
    let previous = null;

    for (const unit of block.units) {
      if (instant || skipping || unit.mode === 'instant') {
        reveal(unit);
        continue;
      }
      if (previous === 'heading' && unit.mode !== 'heading') await sleep(320);
      previous = unit.mode;
      unit.typed.after(cursor);

      let shown = 0;
      while (shown < unit.text.length && !skipping) {
        const burst = queue.length ? 4 : 1;
        shown = Math.min(unit.text.length, shown + (unit.step || STEP[unit.mode]) * burst);
        unit.typed.textContent = unit.text.slice(0, shown);
        unit.ghost.textContent = unit.text.slice(shown);
        await sleep(unit.mode === 'heading' ? 35 + Math.random() * 60 : 14);
      }
      reveal(unit);
      if (unit.mode === 'text' && !skipping) await sleep(25);
    }

    const last = block.units[block.units.length - 1];
    if (last) last.typed.after(cursor);
    block.classList.replace('typing', 'done');
  }

  function enqueue(block) {
    const index = blocks.indexOf(block);
    for (const earlier of blocks.slice(0, index + 1)) {
      if (earlier.queued) continue;
      earlier.queued = true;
      queue.push(earlier);
    }
    run();
  }

  async function run() {
    if (running) return;
    running = true;
    while (queue.length) {
      skipping = false;
      await typeBlock(queue.shift());
    }
    running = false;
    if (blocks.every((block) => block.classList.contains('done'))) cursor.remove();
  }

  function startTypewriter() {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      blocks.forEach((block) => block.classList.add('done'));
      root.classList.add('ready');
      return;
    }

    blocks.forEach(prepare);
    root.classList.add('ready');

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        enqueue(entry.target);
      }
    }, { rootMargin: '0px 0px -15% 0px' });
    blocks.forEach((block) => observer.observe(block));
  }

  // ---------------------------------------------------------------------------
  // Navigation: jumping finishes everything above the target instantly, so the
  // page doesn't type out sections the visitor skipped past.

  function jumpTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const index = blocks.indexOf(target);
    blocks.slice(0, index).forEach((block) => {
      block.instant = true;
    });
    if (running && current && blocks.indexOf(current) < index) skipping = true;
    activeSection = target.dataset.nav || id;
    if (index === 0) window.scrollTo({ top: 0 });
    else target.scrollIntoView();
    window.history.replaceState(null, '', `#${id}`);
  }

  function startKeyboard() {
    document.querySelectorAll('.navbar a[href^="#"], .keys a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        jumpTo(link.getAttribute('href').slice(1));
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;

      const key = event.key;
      if (/^[0-9]$/.test(key) && SECTIONS[Number(key)]) {
        event.preventDefault();
        jumpTo(SECTIONS[Number(key)]);
      } else if (key === 'j' || key === 'k') {
        event.preventDefault();
        const index = SECTIONS.indexOf(activeSection) + (key === 'j' ? 1 : -1);
        jumpTo(SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, index))]);
      } else if ((key === 'Enter' || key === 'Escape') && running) {
        skipping = true;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Navigation bar: highlight the section in view

  function startNavbar() {
    const navLinks = Array.from(document.querySelectorAll('.navbar [data-section], .keys [data-section]'));

    const setActive = (section) => {
      activeSection = section;
      navLinks.forEach((link) => link.setAttribute('aria-current', String(link.dataset.section === section)));
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(entry.target.dataset.nav || entry.target.id);
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    blocks.forEach((block) => observer.observe(block));

    window.addEventListener('scroll', () => {
      const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
      if (atBottom) setActive(SECTIONS[SECTIONS.length - 1]);
    }, { passive: true });
  }

  startTypewriter();
  startKeyboard();
  if ('IntersectionObserver' in window) startNavbar();
})();
