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

  // Story chapters live in tabs; a hidden chapter is skipped until it's opened.
  const isHidden = (block) => Boolean(block.closest('[hidden]'));

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
    const instant = block.instant || isHidden(block) || block.getBoundingClientRect().bottom < 0;
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
      if (earlier.queued || isHidden(earlier)) continue;
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
    if (blocks.every((block) => isHidden(block) || block.classList.contains('done'))) cursor.remove();
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
      if (!isHidden(block)) block.instant = true;
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
      if (key === '/') {
        event.preventDefault();
        jumpTo('ask');
        document.getElementById('cc-input')?.focus({ preventScroll: true });
      } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'h' || key === 'l') {
        if (event.target instanceof Element && event.target.closest('[role="tab"]')) return;
        event.preventDefault();
        moveChapter(key === 'ArrowLeft' || key === 'h' ? -1 : 1, { reveal: true });
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

  // ---------------------------------------------------------------------------
  // Story tabs

  const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
  const tabList = document.querySelector('.tabs');

  function selectChapter(tab, { focus = false, reveal = false } = {}) {
    for (const other of tabs) {
      const selected = other === tab;
      const panel = document.getElementById(other.getAttribute('aria-controls'));
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      if (!selected && !panel.hidden && current === panel && running) skipping = true;
      panel.hidden = !selected;
    }
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) tab.focus({ preventScroll: true });
    if (reveal) {
      const box = tabList.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) {
        tabList.scrollIntoView({ block: 'start' });
      }
    }
  }

  function moveChapter(delta, options) {
    const index = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = tabs[Math.max(0, Math.min(tabs.length - 1, index + delta))];
    selectChapter(next, options);
  }

  function startTabs() {
    tabs.forEach((tab) => tab.addEventListener('click', () => selectChapter(tab)));

    tabList.addEventListener('keydown', (event) => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, h: -1, l: 1 };
      if (event.key in moves) {
        event.preventDefault();
        moveChapter(moves[event.key], { focus: true });
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        selectChapter(tabs[event.key === 'Home' ? 0 : tabs.length - 1], { focus: true });
      }
    });

    document.querySelectorAll('.tab-steps [data-move]').forEach((button) => {
      button.addEventListener('click', () => moveChapter(Number(button.dataset.move), { reveal: true }));
    });
  }

  // ---------------------------------------------------------------------------
  // Ask: a small Claude Code style prompt. The form's data-endpoint points at
  // the worker in /worker, which holds the API key and streams plain text back.

  const ASK_HISTORY = 11;
  const ASK_IDEAS = [
    'How did Repit start?',
    'What was Fundaments?',
    'What does a cyber soldier do?',
    'What are you building next?',
  ];
  const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  const VERBS = ['Thinking', 'Warming up', 'Repping', 'Compiling', 'Spotting', 'Bulking'];

  function startAsk() {
    const form = document.querySelector('.cc-form');
    if (!form) return;
    const input = form.querySelector('input');
    const log = document.querySelector('.cc-log');
    const history = [];
    let busy = false;

    const line = (className, text) => {
      const item = document.createElement('li');
      item.className = className;
      if (text !== undefined) item.textContent = text;
      log.append(item);
      form.scrollIntoView({ block: 'nearest' });
      return item;
    };

    const answerLine = () => {
      const item = line('cc-bot');
      const dot = document.createElement('span');
      dot.className = 'cc-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '⏺';
      const text = document.createElement('div');
      text.className = 'cc-text';
      item.append(dot, text);
      return text;
    };

    const spinner = () => {
      const item = line('cc-status');
      const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
      let frame = 0;
      const draw = () => {
        item.textContent = `${SPINNER[frame++ % SPINNER.length]} ${verb}…`;
      };
      draw();
      const timer = setInterval(draw, 120);
      return () => {
        clearInterval(timer);
        item.remove();
      };
    };

    async function ask(question) {
      history.push({ role: 'user', content: question });
      const stop = spinner();
      let text = '';
      let out = null;

      try {
        const endpoint = form.dataset.endpoint;
        if (!endpoint) throw new Error('offline');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-ASK_HISTORY) }),
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
            out = answerLine();
          }
          if (out) out.textContent = text.trim();
          form.scrollIntoView({ block: 'nearest' });
        }
        if (!text.trim()) throw new Error('failed');
        history.push({ role: 'assistant', content: text.trim() });
      } catch (error) {
        stop();
        history.pop();
        const messages = {
          offline: "The AI isn't connected yet. Until it is, email me at gabriel@lundbergwedman.com and I'll answer myself.",
          busy: "That's a lot of questions! Give it a minute and try again.",
        };
        const note = `⎿ ${messages[error.message] || 'Something went wrong. Try again, or email gabriel@lundbergwedman.com.'}`;
        if (out) {
          out.closest('li').classList.add('cc-error');
          out.textContent = `${text.trim()}\n\n${note}`;
        } else {
          line('cc-note cc-error', note);
        }
      }
    }

    function command(name) {
      if (name === '/clear') {
        log.replaceChildren();
        history.length = 0;
      } else if (name === '/help') {
        line('cc-user', `> ${name}`);
        line('cc-note', `Things you can ask:\n${ASK_IDEAS.map((idea) => `  · ${idea}`).join('\n')}`);
      } else {
        line('cc-user', `> ${name}`);
        line('cc-note cc-error', `⎿ Unknown command ${name}. Try /help or /clear.`);
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question || busy) return;
      input.value = '';
      if (question.startsWith('/')) {
        command(question.split(/\s+/)[0].toLowerCase());
        return;
      }
      busy = true;
      form.classList.add('busy');
      line('cc-user', `> ${question}`);
      await ask(question);
      busy = false;
      form.classList.remove('busy');
      input.focus({ preventScroll: true });
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') input.blur();
    });
  }

  startTypewriter();
  startKeyboard();
  startTabs();
  startAsk();
  if ('IntersectionObserver' in window) startNavbar();
})();
