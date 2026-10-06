(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blocks = Array.from(document.querySelectorAll('[data-type]'));
  const PROMPT = 'gabriel@gw:~$';
  const STEP = { cmd: 1, out: 3, pre: 9 };

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
    if (element.closest('.cmd')) return 'cmd';
    if (element.closest('pre')) return 'pre';
    return 'out';
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
      if (instant || skipping) {
        reveal(unit);
        continue;
      }
      if (previous === 'cmd' && unit.mode !== 'cmd') await sleep(320);
      previous = unit.mode === 'instant' && unit.typed.closest('.cmd') ? 'cmd' : unit.mode;
      unit.typed.after(cursor);

      if (unit.mode === 'instant') {
        reveal(unit);
        if (unit.typed.closest('.cmd')) await sleep(260);
        continue;
      }

      let shown = 0;
      while (shown < unit.text.length && !skipping) {
        const burst = queue.length ? 4 : 1;
        shown = Math.min(unit.text.length, shown + STEP[unit.mode] * burst);
        unit.typed.textContent = unit.text.slice(0, shown);
        unit.ghost.textContent = unit.text.slice(shown);
        await sleep(unit.mode === 'cmd' ? 35 + Math.random() * 70 : 14);
      }
      reveal(unit);
      if (unit.mode === 'out' && !skipping) await sleep(25);
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
      if (event.target.closest('input')) return;
      if (running && (event.key === 'Enter' || event.key === 'Escape')) skipping = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Interactive shell

  function startShell() {
    const form = document.getElementById('shell-form');
    const input = document.getElementById('shell-input');
    const output = document.getElementById('shell-output');

    const links = {};
    document.querySelectorAll('a[data-link]').forEach((anchor) => {
      links[anchor.dataset.link] = anchor.href;
    });

    const pretty = (url) => url.replace(/^(mailto:|https?:\/\/(www\.)?)/, '').replace(/\/$/, '');

    function print(lines, className) {
      for (const line of [].concat(lines)) {
        const paragraph = document.createElement('p');
        if (className) paragraph.className = className;
        paragraph.textContent = line;
        output.append(paragraph);
      }
    }

    function open(name) {
      const url = links[name];
      if (url.startsWith('mailto:')) window.location.href = url;
      else window.open(url, '_blank', 'noopener');
      return `opening ${pretty(url)} ...`;
    }

    function goTo(target) {
      const section = target && document.getElementById(target.replace(/^ventures\//, '').replace(/\/.*$/, ''));
      if (!section || section.id === 'shell') return `no such file or directory: ${target || ''}`;
      section.scrollIntoView();
      return `-> ${section.id}`;
    }

    const commands = {
      help: () => [
        'available commands:',
        '  whoami      who is this guy',
        '  ls          list ventures',
        '  cat <name>  jump to a venture (repit, speech-app, jewla)',
        '  repit       open repitfitness.se',
        '  contact     list all contact info',
        '  linkedin    github    instagram    email',
        '  date        echo      clear        help',
      ],
      whoami: () => 'gabriel lundberg wedman. 19. founder & full-stack developer, göteborg.',
      ls: () => 'repit/    speech-app/    jewla/',
      cat: (args) => goTo(args[0]),
      cd: (args) => goTo(args[0]),
      repit: () => open('repit'),
      'speech-app': () => 'speech-app: private prototype. ask me about it.',
      jewla: () => 'jewla: permission denied (stealth mode). check back soon.',
      contact: () => ['linkedin', 'github', 'instagram', 'email']
        .map((name) => `${name.padEnd(11)}${pretty(links[name])}`),
      linkedin: () => open('linkedin'),
      github: () => open('github'),
      instagram: () => open('instagram'),
      email: () => open('email'),
      mail: () => open('email'),
      date: () => new Date().toString(),
      echo: (args) => args.join(' '),
      clear: () => {
        output.replaceChildren();
        return [];
      },
      pwd: () => '/home/gabriel',
      sudo: () => 'gabriel is not in the sudoers file. this incident will be reported.',
      rm: () => 'nice try.',
      coffee: () => '[  OK  ] coffee.service restarted. productivity +20%.',
      exit: () => 'there is no exit. try "help".',
    };

    const history = [];
    let historyIndex = 0;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const raw = input.value.trim();
      input.value = '';
      print(`${PROMPT} ${raw}`, 'echo');
      if (!raw) return;

      history.push(raw);
      historyIndex = history.length;

      const [name, ...args] = raw.split(/\s+/);
      const command = commands[name.toLowerCase()];
      print(command ? command(args) : `command not found: ${name}. try "help".`);
      form.scrollIntoView({ block: 'nearest' });
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' && history.length) {
        event.preventDefault();
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
      } else if (event.key === 'ArrowDown' && history.length) {
        event.preventDefault();
        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = history[historyIndex] || '';
      } else if (event.key === 'Tab' && input.value) {
        event.preventDefault();
        const matches = Object.keys(commands).filter((name) => name.startsWith(input.value));
        if (matches.length === 1) input.value = `${matches[0]} `;
        else if (matches.length > 1) print(matches.join('    '));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Status bar: active section and clock

  function startStatusBar() {
    const navLinks = Array.from(document.querySelectorAll('.statusbar [data-section]'));
    const sectionFor = { repit: 'ventures', 'speech-app': 'ventures', jewla: 'ventures' };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const active = sectionFor[entry.target.id] || entry.target.id;
        navLinks.forEach((link) => link.setAttribute('aria-current', String(link.dataset.section === active)));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    blocks.forEach((block) => observer.observe(block));

    const clock = document.getElementById('clock');
    const tick = () => {
      const now = new Date();
      const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      clock.textContent = `"gabriel@gw" ${time} ${date}`;
    };
    tick();
    setInterval(tick, 15000);
  }

  startTypewriter();
  startShell();
  if ('IntersectionObserver' in window) startStatusBar();
})();
