(() => {
  'use strict';

  const app = document.getElementById('app');
  const QUESTIONS_DIR = 'questions/';
  const LETTERS = 'ABCDEFGHIJ';
  const PRAISE = ['Nice!', 'Correct!', 'You got it!', 'Great job!', 'Nailed it!'];
  const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);

  // ---------- Helpers ----------

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = sel => app.querySelector(sel);
  const $$ = sel => [...app.querySelectorAll(sel)];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const short = s => (s.length > 50 ? `${s.slice(0, 50)}…` : s);
  const count = (n, word) => `${n} ${n === 1 ? word : plural(word)}`;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function slug(s) {
    return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  function uniqueId(base, used) {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  }

  function plural(word) {
    if (/[^z]z$/i.test(word)) return `${word}zes`;            // Quiz → Quizzes
    if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
    if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
    return `${word}s`;
  }

  // ---------- Question file parsing ----------
  //
  //   # Subject name
  //   ## Type: Title          (Type groups the sets: Quiz, Formative, Midterm, Module…)
  //   1. Question text
  //   > more text            (continues the question or the choice above it, kept exactly as written)
  //   Image: images/x.png    (relative to the questions folder, or a full https:// link)
  //   A. Choice
  //   *B. Correct choice     (2–3 starred choices make it a "Choose 2/3" question)
  //   C. Image: x.png        (a picture as the choice)
  //   Answer: text           (no lettered choices: a "Show answer" card; > and Image: lines below it
  //                           belong to the answer, and the student marks themselves right or wrong)
  //   // comment

  const QUESTION_RE = /^(?:Q\s*)?\d+\s*[.)]\s*(?=\D)(.+)$/i;
  const CHOICE_RE = /^(\*)?\s*([A-Za-z])\s*[.)]\s*(\*)?\s*(.+)$/;
  const IMAGE_RE = /^image\s*:\s*(.+)$/i;
  const ANSWER_RE = /^answer\s*:\s*(.*)$/i;
  // "(Choose two.)" in the source text: removed (the app shows its own "Choose 2") and checked against the stars.
  const CHOOSE_RE = /\s*\(\s*choose\s+(one|two|three|four|five|[1-5])\s*\.?\s*\)/i;
  const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

  function parseSubject(text, file) {
    const errors = [];
    const err = (line, msg) => errors.push(`${file}, line ${line}: ${msg}`);
    const assessments = [];
    let name = '';
    let assessment = null;
    let question = null;

    function closeQuestion() {
      if (!question) return;
      const q = question;
      question = null;
      if (q.broken) return; // already reported
      if (q.answer) {
        q.answer.text = q.answer.text.trim();
        if (!q.answer.text && !q.answer.images.length) return err(q.line, `"${short(q.text)}" has an empty "Answer:".`);
        q.text = q.text.replace(CHOOSE_RE, '').trim();
        assessment.questions.push(q);
        return;
      }
      if (q.choices.length < 2) return err(q.line, `"${short(q.text)}" needs at least 2 choices.`);
      if (!q.choices.some(c => c.correct)) return err(q.line, `"${short(q.text)}" has no correct answer. Put * before the right choice.`);
      const choose = q.text.match(CHOOSE_RE);
      if (choose) {
        q.text = q.text.replace(CHOOSE_RE, '').trim();
        const said = NUMBER_WORDS[choose[1].toLowerCase()] || Number(choose[1]);
        const stars = q.choices.filter(c => c.correct).length;
        if (said !== stars) return err(q.line, `"${short(q.text)}" says choose ${said} but has ${stars} starred answers.`);
      }
      assessment.questions.push(q);
    }

    text.split(/\r?\n/).forEach((raw, i) => {
      const n = i + 1;
      const line = raw.trim();
      if (!line || line.startsWith('//')) return;
      let m;

      // "> text" continues the answer, the choice right above it, or the question.
      if (line.startsWith('>')) {
        const extra = `\n${raw.replace(/^\s*>\s?/, '')}`;
        if (!question) err(n, '"> …" lines belong under a question or a choice.');
        else if (question.answer) question.answer.text += extra;
        else if (question.choices.length) question.choices[question.choices.length - 1].text += extra;
        else question.text += extra;
        return;
      }

      if ((m = line.match(IMAGE_RE))) {
        if (!question) err(n, '"Image:" lines belong under a question.');
        else (question.answer ? question.answer.images : question.images).push(m[1].trim());
        return;
      }

      if ((m = line.match(ANSWER_RE))) {
        if (!question) return err(n, '"Answer:" belongs under a question.');
        if (question.answer) return err(n, 'this question already has an "Answer:" line.');
        question.answer = { text: m[1], images: [] };
        return;
      }

      if ((m = line.match(/^##\s*(.+)$/))) {
        closeQuestion();
        const head = m[1].trim();
        const colon = head.indexOf(':');
        const type = colon > 0 ? head.slice(0, colon).trim() : head.split(/\s+/)[0];
        const title = colon > 0 ? head.slice(colon + 1).trim() || type : head;
        assessment = { type, title, line: n, questions: [] };
        assessments.push(assessment);
        return;
      }

      if ((m = line.match(/^#\s*(.+)$/))) {
        if (name) err(n, 'only one "# Subject name" line is allowed per file.');
        else name = m[1].trim();
        return;
      }

      if ((m = line.match(QUESTION_RE))) {
        closeQuestion();
        question = { text: m[1].trim(), choices: [], images: [], answer: null, line: n, broken: !assessment };
        if (!assessment) err(n, 'this question comes before any "## Type: Title" heading.');
        return;
      }

      // Anything else under "Answer:" is part of the answer.
      if (question && question.answer) {
        question.answer.text += `\n${line}`;
        return;
      }

      m = line.match(CHOICE_RE);
      if (question && m) {
        const expected = LETTERS[question.choices.length];
        if (m[2].toUpperCase() === expected) {
          const picture = m[4].trim().match(IMAGE_RE);
          question.choices.push({
            text: picture ? '' : m[4].trim(),
            image: picture ? picture[1].trim() : null,
            correct: Boolean(m[1] || m[3]),
          });
          return;
        }
        if (question.choices.length) {
          if (!question.broken) err(n, `expected choice "${expected}." here but found "${m[2].toUpperCase()}.".`);
          return;
        }
      }

      // Extra lines before the first choice belong to the question (multi-line questions).
      if (question && !question.choices.length) {
        question.text += `\n${line}`;
        return;
      }

      // Unreadable line: report it once, and swallow the choices that follow it
      // (usually a question with a missing number) instead of reporting each one.
      closeQuestion();
      question = { text: line, choices: [], images: [], answer: null, line: n, broken: true };
      err(n, `couldn't read "${short(line)}". Questions start with a number (1.), choices with a letter (A.).`);
    });
    closeQuestion();

    if (!assessments.length) errors.push(`${file}: no quizzes found. Start one with a line like "## Quiz: Quiz 1".`);

    const kept = assessments.filter(a => {
      if (a.questions.length) return true;
      err(a.line, `"${short(a.title)}" has no questions yet, so it's hidden.`);
      return false;
    });
    kept.forEach(a => {
      a.questions.forEach(q => { q.source = a.title; });
    });

    const base = file.replace(/\.txt$/i, '');
    const fallbackName = base.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { subject: { name: name || fallbackName, assessments: kept }, errors };
  }

  // ---------- Loading ----------

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function loadData() {
    if (location.protocol === 'file:') return { fatal: 'file' };

    let files;
    try {
      files = (await fetchText(`${QUESTIONS_DIR}subjects.txt`))
        .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('//'));
    } catch {
      return { fatal: 'list' };
    }

    const parsed = await Promise.all(files.map(async file => {
      try {
        return parseSubject(await fetchText(QUESTIONS_DIR + file), file);
      } catch {
        return { subject: null, errors: [`Couldn't load questions/${file}. Check the file name in subjects.txt.`] };
      }
    }));

    // Files with the same "# Subject" line join into one subject, so each exam can live in its own file.
    const byName = new Map();
    parsed.forEach(({ subject }) => {
      if (!subject) return;
      const key = subject.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, { name: subject.name, assessments: [] });
      byName.get(key).assessments.push(...subject.assessments);
    });

    const subjectIds = new Set();
    const subjects = [...byName.values()].filter(s => s.assessments.length);
    subjects.forEach(s => {
      s.id = uniqueId(slug(s.name), subjectIds);
      const setIds = new Set();
      s.assessments.forEach(a => { a.id = uniqueId(slug(a.title), setIds); });
    });
    return { subjects, errors: parsed.flatMap(p => p.errors) };
  }

  // ---------- Routing ----------

  let data = null;
  let keyHandler = null;
  let session = null;
  const ready = loadData().then(d => { data = d; });

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    keyHandler = null;
    closeLightbox();
    window.scrollTo(0, 0);
    if (!data) {
      app.innerHTML = '<p class="loading muted">Loading questions…</p>';
      await ready;
    }
    if (data.fatal) return renderFatal(data.fatal);

    const [view, id, sub, ids] = location.hash.replace(/^#\/?/, '').split('/');
    const subject = view === 's' && data.subjects.find(s => s.id === id);
    if (subject && sub === 'play') return renderPlay(subject, (ids || '').split(','));
    if (subject) return renderSubject(subject);
    if (view) return go('#/');
    renderHome();
  }

  document.addEventListener('keydown', e => {
    if (lightbox) {
      if (e.key === 'Escape') closeLightbox();
      return;
    }
    if (!keyHandler || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.matches('input, textarea, select, [contenteditable]')) return;
    // Let a focused button handle its own Enter/Space activation.
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('button, a')) return;
    keyHandler(e);
  });

  window.addEventListener('hashchange', route);

  // ---------- Shared bits ----------

  function renderFatal(kind) {
    const msg = kind === 'file'
      ? 'Browsers block reading the question files when index.html is opened by double-clicking. Run it through a small web server instead (see README.md → "Preview on your computer").'
      : 'Couldn\'t find questions/subjects.txt. Make sure the questions folder was uploaded with the site.';
    app.innerHTML = `
      <section class="empty">
        <h1>${kind === 'file' ? 'Open Quizulu through a web server' : 'No questions found'}</h1>
        <p class="muted">${msg}</p>
      </section>`;
  }

  function errorBanner() {
    if (!data.errors.length) return '';
    const shown = data.errors.slice(0, 15);
    const more = data.errors.length - shown.length;
    return `
      <details class="warn" ${IS_LOCAL ? 'open' : ''}>
        <summary>⚠ ${count(data.errors.length, 'problem')} in the question files. Those questions were skipped.</summary>
        <ul>
          ${shown.map(e => `<li>${esc(e)}</li>`).join('')}
          ${more > 0 ? `<li>…and ${more} more</li>` : ''}
        </ul>
      </details>`;
  }

  // ---------- Exhibit images ----------

  const imageSrc = p => (/^(https?:)?\/\//i.test(p) || p.startsWith('/') || p.startsWith(QUESTIONS_DIR) ? p : QUESTIONS_DIR + p);

  function imagesHtml(images) {
    if (!images.length) return '';
    return `
      <div class="q-images">
        ${images.map(p => `
          <button type="button" class="q-image" data-full="${esc(imageSrc(p))}" aria-label="Show exhibit full size">
            <img src="${esc(imageSrc(p))}" alt="Exhibit" data-path="${esc(p)}">
          </button>`).join('')}
      </div>`;
  }

  // A choice is either text or a picture ("C. Image: x.png").
  const choiceHtml = c => (c.image
    ? `<span class="opt-img"><img src="${esc(imageSrc(c.image))}" alt="Picture choice" data-path="${esc(c.image)}"></span>`
    : `<span class="opt-text">${esc(c.text)}</span>`);

  // A missing image (often a capital-letter mismatch, which only breaks online) shows a visible warning.
  function wireImages() {
    $$('img[data-path]').forEach(img => img.addEventListener('error', () => {
      const box = document.createElement('div');
      box.className = 'img-error';
      box.textContent = `⚠ Image not found: ${img.dataset.path}. Check the file name (capital letters matter online).`;
      (img.closest('.q-image') || img).replaceWith(box);
    }));
  }

  let lightbox = null;

  function openLightbox(src) {
    closeLightbox();
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `<img src="${esc(src)}" alt="Exhibit, full size"><button class="lightbox-close" aria-label="Close">×</button>`;
    lightbox.addEventListener('click', closeLightbox);
    document.body.appendChild(lightbox);
    document.body.classList.add('no-scroll');
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.remove();
    lightbox = null;
    document.body.classList.remove('no-scroll');
  }

  app.addEventListener('click', e => {
    const btn = e.target.closest('.q-image');
    if (btn) openLightbox(btn.dataset.full);
  });

  function groupByType(assessments) {
    const groups = new Map();
    assessments.forEach(a => {
      const key = a.type.toLowerCase();
      if (!groups.has(key)) groups.set(key, { type: a.type, items: [] });
      groups.get(key).items.push(a);
    });
    return [...groups.values()];
  }

  // ---------- Home ----------

  function renderHome() {
    document.title = 'Quizulu';
    if (!data.subjects.length) {
      app.innerHTML = `
        ${errorBanner()}
        <section class="empty">
          <h1>No subjects yet</h1>
          <p class="muted">Add a subject file to the questions folder and list it in questions/subjects.txt.</p>
        </section>`;
      return;
    }

    // Each subject is a folder that opens on hover (adapted from Uiverse.io by Cobp).
    app.innerHTML = `
      ${errorBanner()}
      <section class="landing">
        <h1 class="page-title">Choose a subject</h1>
        <div class="folder-row">
          ${data.subjects.map(s => {
            const total = s.assessments.reduce((n, a) => n + a.questions.length, 0);
            return `
              <a class="folder-card" href="#/s/${s.id}" aria-label="${esc(s.name)}: ${count(s.assessments.length, 'set')}, ${count(total, 'question')}">
                <span class="folder" aria-hidden="true">
                  <span class="folder-back"></span>
                  <span class="folder-paper paper-1"></span>
                  <span class="folder-paper paper-2"></span>
                  <span class="folder-paper paper-3"></span>
                  <span class="folder-front"></span>
                </span>
                <span class="folder-name">${esc(s.name)}</span>
              </a>`;
          }).join('')}
        </div>
      </section>`;
  }

  // ---------- Quiz settings (remembered on this device) ----------

  const SETTINGS_KEY = 'quizulu.settings.v1';
  const settings = { shuffleChoices: true, shuffleQuestions: true };
  const saved = readSettings();
  Object.keys(settings).forEach(key => { if (typeof saved[key] === 'boolean') settings[key] = saved[key]; });

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable (private mode etc.): settings last for this visit only.
    }
  }

  const switchHtml = (key, label, hint) => `
    <label class="setting">
      <span><span class="setting-label">${label}</span><span class="setting-hint">${hint}</span></span>
      <input type="checkbox" role="switch" data-setting="${key}" ${settings[key] ? 'checked' : ''}>
      <span class="switch" aria-hidden="true"></span>
    </label>`;

  // ---------- Subject: pick sets ----------

  function renderSubject(subject) {
    document.title = `${subject.name} · Quizulu`;
    const byId = new Map(subject.assessments.map(a => [a.id, a]));

    app.innerHTML = `
      ${errorBanner()}
      <a href="#/" class="btn btn-sm back">Go back</a>
      <h1 class="page-title">${esc(subject.name)}</h1>
      <div class="select-bar">
        <span class="muted">Pick one or more, then start.</span>
        <button class="btn btn-sm" id="toggle-all">Select all</button>
      </div>
      ${groupByType(subject.assessments).map(g => `
        <section class="group">
          <h2 class="group-title">${esc(plural(g.type))}</h2>
          <div class="pick-list">
            ${g.items.map(a => `
              <label class="pick">
                <input type="checkbox" value="${a.id}">
                <span class="check" aria-hidden="true"></span>
                <span class="pick-title">${esc(a.title)}</span>
                <span class="pick-count">${count(a.questions.length, 'question')}</span>
              </label>`).join('')}
          </div>
        </section>`).join('')}
      <section class="group">
        <h2 class="group-title">Settings</h2>
        <div class="settings-card">
          ${switchHtml('shuffleChoices', 'Shuffle choices', 'Mix up the order of A, B, C, D')}
          ${switchHtml('shuffleQuestions', 'Shuffle question order', 'Off keeps the order from the file (1, 2, 3…)')}
        </div>
      </section>
      <div class="start-bar">
        <span id="summary" class="muted">Nothing selected</span>
        <button class="btn btn-primary btn-lg" id="start" disabled>Start</button>
      </div>`;

    const boxes = $$('.pick input');
    const toggleAll = $('#toggle-all');
    const startBtn = $('#start');

    function update() {
      const chosen = boxes.filter(b => b.checked);
      const total = chosen.reduce((n, b) => n + byId.get(b.value).questions.length, 0);
      boxes.forEach(b => b.closest('.pick').classList.toggle('on', b.checked));
      $('#summary').textContent = chosen.length
        ? `${count(chosen.length, 'set')} · ${count(total, 'question')}`
        : 'Nothing selected';
      startBtn.disabled = !chosen.length;
      toggleAll.textContent = chosen.length === boxes.length ? 'Clear all' : 'Select all';
    }

    $$('[data-setting]').forEach(input => input.addEventListener('change', () => {
      settings[input.dataset.setting] = input.checked;
      saveSettings();
    }));

    boxes.forEach(b => b.addEventListener('change', update));
    toggleAll.addEventListener('click', () => {
      const all = boxes.every(b => b.checked);
      boxes.forEach(b => { b.checked = !all; });
      update();
    });
    startBtn.addEventListener('click', () => {
      const ids = boxes.filter(b => b.checked).map(b => b.value);
      if (ids.length) go(`#/s/${subject.id}/play/${ids.join(',')}`);
    });
  }

  // ---------- Answering ----------

  // Choices that refer to other choices by letter ("Both A and B") would break if shuffled.
  const PINNED_RE = /\bof the above\b/i;
  const LETTER_REF_RE = [/\b[A-J]\s*(?:,|&|and|or|nor)\s*[A-J]\b/, /\b(?:[Oo]nly|[Bb]oth|[Nn]either)\s+[A-J]\b/];

  function arrangeChoices(choices) {
    if (choices.some(c => LETTER_REF_RE.some(re => re.test(c.text)))) return choices.slice();
    const pinned = choices.filter(c => PINNED_RE.test(c.text));
    return [...shuffle(choices.filter(c => !PINNED_RE.test(c.text))), ...pinned];
  }

  function renderPlay(subject, ids) {
    const picked = ids.map(id => subject.assessments.find(a => a.id === id)).filter(Boolean);
    if (!picked.length) return go(`#/s/${subject.id}`);
    startSession(subject, picked.flatMap(a => a.questions), {
      label: picked.length === 1 ? picked[0].title : `${picked.length} sets mixed`,
      showSource: picked.length > 1,
    });
  }

  function startSession(subject, pool, opts) {
    document.title = `${opts.label} · ${subject.name}`;
    const asked = settings.shuffleQuestions ? shuffle(pool) : pool.slice();
    session = {
      subject,
      pool,
      opts,
      i: 0,
      results: [],
      items: asked.map(q => (q.answer
        ? { q, kind: 'card', choices: q.choices.slice(), need: 0 }
        : {
          q,
          kind: 'choice',
          choices: settings.shuffleChoices ? arrangeChoices(q.choices) : q.choices.slice(),
          need: q.choices.filter(c => c.correct).length,
        })),
    };
    window.scrollTo(0, 0);
    renderQuestion();
  }

  function keyIndex(key, n) {
    const letter = key.length === 1 ? LETTERS.indexOf(key.toUpperCase()) : -1;
    if (letter >= 0 && letter < n) return letter;
    const digit = Number(key);
    return Number.isInteger(digit) && digit >= 1 && digit <= n ? digit - 1 : -1;
  }

  function renderQuestion() {
    const s = session;
    const item = s.items[s.i];
    const total = s.items.length;
    const card = item.kind === 'card'; // "Show answer" card: no choices to click, the student self-checks
    const multi = !card && item.need > 1;
    const picked = new Set();
    let answered = false;

    app.innerHTML = `
      <div class="study-head">
        <a href="#/s/${s.subject.id}" class="btn btn-sm back">Go back</a>
        <span class="study-label">${esc(s.opts.label)}</span>
      </div>
      <div class="progress"><div class="progress-bar" id="bar" style="width:${(s.results.length / total) * 100}%"></div></div>
      <div class="progress-meta">
        <span>${s.i + 1} / ${total}</span>
        <span id="score"></span>
      </div>
      <div class="q-card">
        ${s.opts.showSource ? `<div class="q-source">${esc(item.q.source)}</div>` : ''}
        <div class="q-prompt">${esc(item.q.text)}</div>
        ${imagesHtml(item.q.images)}
        ${card ? `
          ${item.choices.length ? `<ul class="card-items">${item.choices.map(c => `<li>${choiceHtml(c)}</li>`).join('')}</ul>` : ''}
          <div class="q-instruction" id="card-hint">Think of your answer, then tap Show answer.</div>
          <div class="answer-box" id="answer" hidden>
            <div class="answer-label">Answer</div>
            ${item.q.answer.text ? `<div class="answer-text">${esc(item.q.answer.text)}</div>` : ''}
            ${imagesHtml(item.q.answer.images)}
          </div>` : `
          <div class="q-instruction">
            ${multi ? `<span class="choose-pill" id="pill">Choose ${item.need}</span>` : 'Choose one'}
          </div>
          <div class="options ${multi ? 'multi' : ''}">
            ${item.choices.map((c, k) => `
              <button class="option" ${multi ? 'aria-pressed="false"' : ''}>
                <span class="key">${LETTERS[k]}</span>${choiceHtml(c)}
              </button>`).join('')}
          </div>`}
        <div class="feedback" id="feedback" aria-live="polite"></div>
      </div>
      <div class="next-row">
        <button class="btn btn-lg" id="prev" ${s.i === 0 ? 'hidden' : ''}>Previous</button>
        <div class="next-actions">
          ${card ? `
            <button class="btn btn-primary btn-lg" id="show">Show answer</button>
            <button class="btn btn-lg" id="missed-it" hidden>I missed it</button>
            <button class="btn btn-primary btn-lg" id="got-it" hidden>I got it</button>` : ''}
          ${multi ? '<button class="btn btn-primary btn-lg" id="check" disabled>Check</button>' : ''}
          <button class="btn btn-primary btn-lg" id="next" hidden>${s.i + 1 < total ? 'Next' : 'See results'}</button>
        </div>
      </div>`;

    wireImages();
    const buttons = $$('.option');
    const prevBtn = $('#prev');
    const nextBtn = $('#next');
    const checkBtn = $('#check');
    const feedback = $('#feedback');

    function drawScore() {
      const right = s.results.filter(r => r.correct).length;
      $('#score').innerHTML = `<span class="score-good">✓ ${right}</span> · <span class="score-bad">✗ ${s.results.length - right}</span>`;
    }

    function setFeedback(text, kind) {
      feedback.textContent = text;
      feedback.className = `feedback ${kind}`;
    }

    function mark(btn, cls, symbol) {
      btn.classList.add(cls);
      btn.querySelector('.key').textContent = symbol;
    }

    function choose(k) {
      if (answered) return;
      if (!multi) {
        picked.add(k);
        return reveal();
      }
      if (picked.has(k)) {
        picked.delete(k);
      } else if (picked.size >= item.need) {
        const pill = $('#pill');
        pill.classList.remove('nudge');
        void pill.offsetWidth; // restart the animation
        pill.classList.add('nudge');
        return setFeedback(`You can only choose ${item.need}. Tap one to unselect it first.`, 'hint');
      } else {
        picked.add(k);
      }
      buttons[k].classList.toggle('selected', picked.has(k));
      buttons[k].setAttribute('aria-pressed', String(picked.has(k)));
      setFeedback('', '');
      checkBtn.disabled = picked.size !== item.need;
      if (picked.size === item.need) checkBtn.focus();
    }

    // Locks the question and colours the choices. `animate` is false when revisiting via Previous.
    function showAnswer(result, animate) {
      answered = true;
      if (!animate) $('.options').classList.add('no-anim');
      buttons.forEach((b, k) => {
        const c = item.choices[k];
        const chose = picked.has(k);
        b.disabled = true;
        b.classList.remove('selected');
        if (c.correct && chose) mark(b, 'correct', '✓');
        else if (chose) mark(b, 'wrong', '✗');
        else if (c.correct) mark(b, multi ? 'missed' : 'correct', '✓');
        else b.classList.add('dim');
      });
      setFeedback(result.feedback, result.correct ? 'good' : 'bad');
      $('#bar').style.width = `${(s.results.length / total) * 100}%`;
      drawScore();
      if (checkBtn) checkBtn.hidden = true;
      nextBtn.hidden = false;
    }

    function reveal() {
      const correct = item.choices.every((c, k) => c.correct === picked.has(k));
      let text;
      if (correct) {
        text = pick(PRAISE);
      } else if (multi) {
        const hits = item.choices.filter((c, k) => c.correct && picked.has(k)).length;
        text = `Not quite. You got ${hits} of ${item.need}; all must be right to score. Missed answers are outlined in green.`;
      } else {
        text = 'Not quite. The correct answer is in green.';
      }
      s.results.push({ item, picked: [...picked], correct, feedback: text });
      showAnswer(s.results[s.i], true);
      nextBtn.focus();
    }

    // ---- "Show answer" cards ----

    function revealCard() {
      $('#answer').hidden = false;
      $('#show').hidden = true;
      $('#missed-it').hidden = false;
      $('#got-it').hidden = false;
      $('#card-hint').textContent = 'Did you get it right?';
    }

    // The card's answer is open and locked, with how the student marked it.
    function showCardResult(result) {
      answered = true;
      revealCard();
      $('#missed-it').hidden = true;
      $('#got-it').hidden = true;
      $('#card-hint').hidden = true;
      setFeedback(result.feedback, result.correct ? 'good' : 'bad');
      $('#bar').style.width = `${(s.results.length / total) * 100}%`;
      drawScore();
      nextBtn.hidden = false;
    }

    function selfMark(correct) {
      s.results.push({ item, picked: [], correct, feedback: correct ? 'You marked this: got it.' : 'You marked this: missed it.' });
      answered = true;
      next();
    }

    function next() {
      if (!answered) return;
      s.i++;
      window.scrollTo(0, 0);
      if (s.i < total) renderQuestion();
      else renderResults();
    }

    function previous() {
      if (s.i === 0) return;
      s.i--;
      window.scrollTo(0, 0);
      renderQuestion();
    }

    buttons.forEach((b, k) => b.addEventListener('click', () => choose(k)));
    prevBtn.addEventListener('click', previous);
    nextBtn.addEventListener('click', next);
    if (checkBtn) checkBtn.addEventListener('click', () => { if (picked.size === item.need) reveal(); });
    if (card) {
      $('#show').addEventListener('click', revealCard);
      $('#got-it').addEventListener('click', () => selfMark(true));
      $('#missed-it').addEventListener('click', () => selfMark(false));
    }

    keyHandler = e => {
      if (e.key === 'ArrowLeft') return previous();
      if (card) {
        // Enter shows the answer; marking yourself right or wrong is always a deliberate click.
        if (!['Enter', ' ', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        if (answered) next();
        else if ($('#answer').hidden) revealCard();
        return;
      }
      const k = keyIndex(e.key, item.choices.length);
      if (!answered && k >= 0) return choose(k);
      if (!['Enter', ' ', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      if (answered) next();
      else if (multi && picked.size === item.need) reveal();
    };

    // Already answered (we came back with Previous): show it as it was, locked.
    const past = s.results[s.i];
    if (past && card) {
      showCardResult(past);
    } else if (past) {
      past.picked.forEach(k => picked.add(k));
      showAnswer(past, false);
    }
    drawScore();
  }

  function renderResults() {
    const s = session;
    const total = s.items.length;
    const right = s.results.filter(r => r.correct).length;
    const missed = s.results.filter(r => !r.correct);
    const pct = Math.round((right / total) * 100);
    const headline = pct === 100 ? 'Perfect score! 🎉'
      : pct >= 80 ? 'Great work!'
      : pct >= 50 ? 'Getting there. Keep going!'
      : "Keep practicing. You've got this.";

    app.innerHTML = `
      <a href="#/s/${s.subject.id}" class="btn btn-sm back">Go back</a>
      <section class="results">
        <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
        <h1>${headline}</h1>
        <p class="muted">${right} of ${total} correct · ${esc(s.opts.label)}</p>
        <div class="result-actions">
          ${missed.length ? `<button class="btn btn-primary btn-lg" id="retry">Retry missed (${missed.length})</button>` : ''}
          <button class="btn btn-lg ${missed.length ? '' : 'btn-primary'}" id="restart">Restart</button>
          <a class="btn btn-lg" href="#/s/${s.subject.id}">Choose other sets</a>
        </div>
      </section>
      ${missed.length ? `
        <h2 class="section-title">Review what you missed</h2>
        <div class="review-list">${missed.map(r => reviewCard(r, s.opts.showSource)).join('')}</div>` : ''}`;

    const retry = () => startSession(s.subject, missed.map(r => r.item.q), {
      ...s.opts,
      label: s.opts.label.endsWith('(retry)') ? s.opts.label : `${s.opts.label} (retry)`,
    });
    const restart = () => startSession(s.subject, s.pool, s.opts);
    wireImages();

    $('#restart').addEventListener('click', restart);
    if (missed.length) $('#retry').addEventListener('click', retry);
    keyHandler = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      (missed.length ? retry : restart)();
    };
  }

  function reviewCard({ item, picked }, showSource) {
    const body = item.kind === 'card'
      ? `
        ${item.choices.length ? `<ul class="card-items">${item.choices.map(c => `<li>${choiceHtml(c)}</li>`).join('')}</ul>` : ''}
        <div class="answer-box">
          <div class="answer-label">Answer</div>
          ${item.q.answer.text ? `<div class="answer-text">${esc(item.q.answer.text)}</div>` : ''}
          ${imagesHtml(item.q.answer.images)}
        </div>`
      : `
        <ul class="review-choices">
          ${item.choices.map((c, k) => {
            const chose = picked.includes(k);
            const cls = c.correct ? 'is-correct' : chose ? 'is-wrong' : '';
            const symbol = c.correct ? '✓' : chose ? '✗' : LETTERS[k];
            return `
              <li class="${cls}">
                <span class="key">${symbol}</span>
                ${choiceHtml(c)}
                ${chose ? '<span class="tag">Your answer</span>' : ''}
              </li>`;
          }).join('')}
        </ul>`;
    return `
      <div class="review-card">
        ${showSource ? `<div class="q-source">${esc(item.q.source)}</div>` : ''}
        <div class="review-q">${esc(item.q.text)}</div>
        ${imagesHtml(item.q.images)}
        ${body}
      </div>`;
  }

  route();
})();
