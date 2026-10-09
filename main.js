(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blocks = Array.from(document.querySelectorAll('[data-type]'));
  const STEP = { heading: 1, text: 3, pre: 9 };
  const SECTIONS = ['home', 'story', 'ask', 'contact'];

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
    document.querySelectorAll('.navbar a[href^="#"], .keys a[href^="#"], .chapters a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        jumpTo(link.getAttribute('href').slice(1));
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;

      const key = event.key;
      if (key === '/') {
        event.preventDefault();
        jumpTo('ask');
        document.getElementById('cx-input')?.focus({ preventScroll: true });
      } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'h' || key === 'l') {
        event.preventDefault();
        moveChapter(key === 'ArrowLeft' || key === 'h' ? -1 : 1);
      } else if (/^[0-9]$/.test(key) && SECTIONS[Number(key)]) {
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
      root.classList.toggle('in-story', section === 'story');
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        setActive(entry.target.dataset.nav || entry.target.id);
        if (entry.target.id === 'story') setChapter(-1);
        else if (chapters.includes(entry.target)) setChapter(chapters.indexOf(entry.target));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    blocks.forEach((block) => observer.observe(block));

    window.addEventListener('scroll', () => {
      const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
      if (atBottom) setActive(SECTIONS[SECTIONS.length - 1]);
    }, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Story chapters: the strip in the bottom bar scrolls to each chapter and
  // highlights the one in view.

  const chapters = Array.from(document.querySelectorAll('.chapter'));
  const chapterStrip = document.querySelector('.chapters');
  const chapterLinks = Array.from(document.querySelectorAll('.chapters a'));
  let chapterIndex = -1;

  function setChapter(index) {
    chapterIndex = index;
    chapterLinks.forEach((link, i) => link.setAttribute('aria-current', String(i === index)));
    const link = chapterLinks[index];
    if (!link) return;
    // Keep the current chapter visible on narrow screens without scrolling the page.
    const bar = chapterStrip.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    if (box.left < bar.left) chapterStrip.scrollLeft -= bar.left - box.left;
    else if (box.right > bar.right) chapterStrip.scrollLeft += box.right - bar.right;
  }

  function moveChapter(delta) {
    const from = activeSection === 'story' ? chapterIndex : delta > 0 ? -1 : chapters.length;
    const index = Math.max(0, Math.min(chapters.length - 1, from + delta));
    jumpTo(chapters[index].id);
    setChapter(index);
  }

  // ---------------------------------------------------------------------------
  // Ask: a Codex CLI style composer. The form's data-endpoint points at the
  // worker in /worker, which holds the API key and streams plain text back.

  const ASK_HISTORY = 11;
  const ASK_IDEAS = [
    'How did Repit start?',
    'What was Fundaments?',
    'What does a cyber soldier do?',
    'What are you building next?',
  ];

  function startAsk() {
    const form = document.querySelector('.cx-composer');
    if (!form) return;
    const input = form.querySelector('textarea');
    const log = document.querySelector('.cx-log');
    const context = document.querySelector('.cx-context');
    const history = [];
    let controller = null;

    const footer = document.querySelector('.cx-footer');
    // Keep the composer and its hint line clear of the fixed bottom bar.
    // ('nearest' ignores scroll-margin when the line is barely visible.)
    const keepInView = () => {
      const box = footer.getBoundingClientRect();
      const margin = parseFloat(getComputedStyle(footer).scrollMarginBottom) || 0;
      if (box.top < 0 || box.bottom > window.innerHeight - margin) {
        footer.scrollIntoView({ block: 'end', behavior: 'instant' });
      }
    };

    const line = (className, text) => {
      const item = document.createElement('li');
      item.className = className;
      if (text !== undefined) item.textContent = text;
      log.append(item);
      return item;
    };

    const prefixed = (className, mark, text) => {
      const item = line(className);
      const prefix = document.createElement('span');
      prefix.className = 'cx-mark';
      prefix.setAttribute('aria-hidden', 'true');
      prefix.textContent = mark;
      const body = document.createElement('div');
      body.textContent = text;
      item.append(prefix, body);
      keepInView();
      return body;
    };

    const updateContext = () => {
      const used = Math.min(history.length, 10) * 9;
      context.textContent = `${100 - used}% context left`;
    };

    const resize = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };

    const working = () => {
      const item = line('cx-status');
      const started = Date.now();
      const draw = () => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        item.innerHTML = `<span class="cx-mark">•</span><div><span class="cx-shimmer">Working</span> <span class="dim">(${seconds}s • esc to interrupt)</span></div>`;
      };
      draw();
      keepInView();
      const timer = setInterval(draw, 1000);
      return () => {
        clearInterval(timer);
        item.remove();
      };
    };

    async function ask(question) {
      history.push({ role: 'user', content: question });
      updateContext();
      controller = new AbortController();
      const stop = working();
      let text = '';
      let out = null;

      try {
        const endpoint = form.dataset.endpoint;
        if (!endpoint) throw new Error('offline');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-ASK_HISTORY) }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(response.status === 429 ? 'busy' : 'failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          if (!out && text.trim()) {
            stop();
            out = prefixed('cx-bot', '•', '');
          }
          if (out) out.textContent = text.trim();
          keepInView();
        }
        if (!text.trim()) throw new Error('failed');
        history.push({ role: 'assistant', content: text.trim() });
      } catch (error) {
        stop();
        history.pop();
        const reason = error.name === 'AbortError' ? 'interrupted' : error.message;
        const messages = {
          offline: "The AI isn't connected yet. Until it is, email me at gabriel@lundbergwedman.com and I'll answer myself.",
          busy: "That's a lot of questions! Give it a minute and try again.",
          interrupted: 'Conversation interrupted. Ask something else whenever you like.',
        };
        prefixed('cx-note cx-error', '■', messages[reason] || 'Something went wrong. Try again, or email gabriel@lundbergwedman.com.');
      } finally {
        controller = null;
        updateContext();
      }
    }

    function command(name) {
      prefixed('cx-user', '›', name);
      if (name === '/clear') {
        log.replaceChildren();
        history.length = 0;
        updateContext();
      } else if (name === '/help') {
        prefixed('cx-note', '•', `Things you can ask:\n${ASK_IDEAS.map((idea) => `  ${idea}`).join('\n')}`);
      } else if (name === '/status') {
        const asked = history.filter((message) => message.role === 'user').length;
        prefixed('cx-note', '•', `model:     ${form.dataset.model || 'unknown'}\nquestions: ${asked}\n${context.textContent}`);
      } else {
        prefixed('cx-note cx-error', '■', `Unrecognized command '${name}'. Type /help for ideas.`);
      }
    }

    async function submit() {
      const question = input.value.trim();
      if (!question || controller) return;
      input.value = '';
      resize();
      if (question.startsWith('/')) {
        command(question.split(/\s+/)[0].toLowerCase());
        return;
      }
      form.classList.add('busy');
      prefixed('cx-user', '›', question);
      await ask(question);
      form.classList.remove('busy');
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    input.addEventListener('input', () => {
      resize();
      // After the browser has scrolled the caret into view.
      requestAnimationFrame(keepInView);
    });
    input.addEventListener('focus', keepInView);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        if (controller) controller.abort();
        else input.blur();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && controller) controller.abort();
    });
  }

  startTypewriter();
  startKeyboard();
  startAsk();
  if ('IntersectionObserver' in window) startNavbar();
})();
