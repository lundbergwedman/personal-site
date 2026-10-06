(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blocks = Array.from(document.querySelectorAll('[data-type]'));
  const STEP = { heading: 1, text: 3, pre: 9 };

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
      block.units.push({ typed, ghost, text, mode: modeOf(parent) });
    }
    block.classList.add('pending');
  }

  function reveal(unit) {
    unit.typed.textContent = unit.text;
    unit.ghost.textContent = '';
  }

  async function typeBlock(block) {
    block.classList.replace('pending', 'typing');
    const instant = block.getBoundingClientRect().bottom < 0;
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
        shown = Math.min(unit.text.length, shown + STEP[unit.mode] * burst);
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

    document.addEventListener('keydown', (event) => {
      if (running && (event.key === 'Enter' || event.key === 'Escape')) skipping = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Navigation bar: highlight the section in view

  function startNavbar() {
    const navLinks = Array.from(document.querySelectorAll('.navbar [data-section]'));
    const sectionFor = { repit: 'ventures', 'speech-app': 'ventures', jewla: 'ventures' };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const active = sectionFor[entry.target.id] || entry.target.id;
        navLinks.forEach((link) => link.setAttribute('aria-current', String(link.dataset.section === active)));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    blocks.forEach((block) => observer.observe(block));
  }

  startTypewriter();
  if ('IntersectionObserver' in window) startNavbar();
})();
