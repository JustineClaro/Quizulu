// Quizulu importer: turns an itexamanswers.net exam page into Quizulu question text.
// It runs as a bookmarklet (install it from tools/bookmarklet.html) on the exam page you're viewing.
//
// Page layout it expects: a numbered <p> per question (exhibit images inside it or in the
// blocks right after), then a <ul> of choices where correct ones are li.correct_answer (red).
// Questions that can't be multiple choice (matching, fill-in…) become "Show answer" cards
// instead of being skipped, and keep the page's own question numbers.
(() => {
  'use strict';

  const PANEL_ID = 'quizulu-importer';
  const LETTERS = 'ABCDEFGHIJ';
  const NUMBERED = /^\s*\d+\s*[.)]\s*/;

  document.getElementById(PANEL_ID)?.remove();

  const root = document.querySelector('.thecontent') || document.querySelector('.entry-content') || document.querySelector('article');
  if (!root) {
    alert('Quizulu: couldn\'t find exam questions on this page.');
    return;
  }

  // ---------- Reading the page ----------

  const isAd = el => el.matches('.fs-iai, [data-freestar-ad], script, style, ins, iframe, noscript, [class^="heateor"]');

  function isRed(el) {
    const m = getComputedStyle(el).color.match(/\d+/g);
    return Boolean(m) && +m[0] > 170 && +m[1] < 90 && +m[2] < 90;
  }

  const isCorrect = li => li.classList.contains('correct_answer')
    || isRed(li)
    || [...li.querySelectorAll('*')].some(el => el.textContent.trim() && isRed(el));

  // Text with line breaks kept, without the buttons/ads the site injects (e.g. "Copy answer").
  // Uses textContent on a clone rather than innerText, which can come back empty for off-screen parts.
  function textLines(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('button, script, style, noscript, svg, .fs-iai, [data-freestar-ad]').forEach(n => n.remove());
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('p, div, li, pre, tr, h1, h2, h3, h4, h5, h6').forEach(block => block.append('\n'));
    const keepSpacing = el.matches('pre') || Boolean(el.querySelector('pre'));
    return clone.textContent.split('\n')
      .map(l => (keepSpacing ? l.replace(/\s+$/, '') : l.replace(/\s+/g, ' ').trim()))
      .filter(l => l.trim());
  }

  function imagesIn(el) {
    const imgs = el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')];
    return imgs
      .map(img => img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src'))
      .filter(src => src && !src.startsWith('data:'))
      .map(src => new URL(src, location.href).href)
      .filter(src => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(src));
  }

  // A copy of `el` with its red parts (the site's way of showing answers) tagged [data-qz-red].
  function cloneMarkingRed(el) {
    const reds = [...el.querySelectorAll('*')].filter(n => n.textContent.trim() && isRed(n) && !isRed(n.parentElement));
    reds.forEach(n => n.setAttribute('data-qz-red', ''));
    const clone = el.cloneNode(true);
    reds.forEach(n => n.removeAttribute('data-qz-red'));
    return clone;
  }

  // The text of `el` without its red parts, e.g. the "UDP" in "UDP: (red answer)".
  function withoutRed(el) {
    if (isRed(el)) return '';
    const clone = cloneMarkingRed(el);
    clone.querySelectorAll('[data-qz-red]').forEach(n => n.remove());
    return textLines(clone).join(' ').replace(/[\s:–-]+$/, '');
  }

  // Splits a block into normal lines and lines containing red text.
  const RED_MARK = '[[qz-red]]';
  function splitRed(el) {
    if (isRed(el)) return { plain: [], red: textLines(el) };
    const clone = cloneMarkingRed(el);
    clone.querySelectorAll('[data-qz-red]').forEach(n => n.prepend(RED_MARK));
    const lines = textLines(clone);
    return {
      plain: lines.filter(l => !l.includes(RED_MARK)),
      red: lines.filter(l => l.includes(RED_MARK)).map(l => l.split(RED_MARK).join('').replace(/\s+/g, ' ').trim()),
    };
  }

  function readChoices(list) {
    return [...list.children]
      .filter(li => li.tagName === 'LI')
      .map(li => {
        const correct = isCorrect(li);
        const lines = textLines(li);
        if (lines.length) {
          lines[0] = lines[0].replace(/^\*+\s*/, '');
          // Some pages also put a "*" after the correct answer.
          if (correct) lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\*+$/, '');
        }
        return {
          lines: lines.filter(l => l.trim()),
          label: withoutRed(li),
          image: imagesIn(li)[0] || null, // used when the choice is only a picture
          correct,
          byClass: li.classList.contains('correct_answer'),
        };
      })
      .filter(c => c.lines.length || c.image);
  }

  const questions = [];
  let unreadable = 0;
  let current = null;

  function finish() {
    if (!current) return;
    const q = current;
    current = null;
    q.images = [...new Set(q.images)];
    const choices = q.choices || [];
    const correct = choices.filter(c => c.correct);

    // Every item has red text but not the site's answer class: a "label: answer" matching list.
    const labelList = choices.length > 1 && correct.length === choices.length && !choices.every(c => c.byClass);
    if (choices.length >= 2 && choices.length <= LETTERS.length && correct.length && !labelList) {
      questions.push({ kind: 'choice', num: q.num, lines: q.lines, images: q.images, choices });
      return;
    }

    // Everything else becomes a "Show answer" card.
    let images = q.images;
    let items = [];
    let answer = [...q.red, ...q.after.red];
    let answerImages = [...q.after.images];
    if (labelList) {
      items = choices.map(c => c.label);
      answer = choices.map(c => c.lines.join(' '));
    } else if (choices.length) {
      items = choices.map(c => c.lines.join(' '));
      images = [...images, ...choices.filter(c => !c.lines.length).map(c => c.image)];
      if (!answer.length) answer = correct.map(c => c.lines.join(' '));
    } else if (images.length >= 2 && !answer.length && !answerImages.length) {
      // Matching shown as two pictures: the blank one goes with the question, the filled-in one is the answer.
      answerImages = images.slice(1);
      images = images.slice(0, 1);
    }

    const lines = q.plain.length ? q.plain : q.lines;
    if (!lines.length && !images.length) {
      unreadable++;
      return;
    }
    answer = answer.filter(Boolean);
    // No answer marked in red: fall back to the site's explanation box, if there is one.
    if (!answer.length && !answerImages.length && (q.explanation.length || q.explanationImages.length)) {
      answer = ['(From the explanation on the source)', ...q.explanation];
      answerImages = q.explanationImages;
    }
    if (!answer.length && !answerImages.length) answer = ['(Answer not marked on the source)'];
    questions.push({ kind: 'card', num: q.num, lines, images, items: items.filter(Boolean), answer, answerImages: [...new Set(answerImages)] });
  }

  for (const el of root.children) {
    if (isAd(el)) continue;

    if (el.matches('ul, ol')) {
      if (current && !current.choices) current.choices = readChoices(el);
      continue;
    }

    // The explanation box closes the question. It's only used when no answer is marked in red.
    if (el.matches('.message_box')) {
      if (current) {
        const lines = textLines(el);
        if (lines.length) lines[0] = lines[0].replace(/^explanation\s*:?\s*/i, '');
        current.explanation.push(...lines.filter(l => l.trim()));
        current.explanationImages.push(...imagesIn(el));
      }
      finish();
      continue;
    }

    // Section headings close the current question.
    if (el.matches('h1, h2, h3, h4, h5, h6, hr')) {
      finish();
      continue;
    }

    const lines = textLines(el);
    if (lines.length && NUMBERED.test(lines[0])) {
      finish();
      const { plain, red } = splitRed(el);
      const dropNumber = arr => {
        if (arr.length && NUMBERED.test(arr[0])) arr[0] = arr[0].replace(NUMBERED, '');
        return arr.filter(l => l.trim());
      };
      current = {
        num: lines[0].match(/\d+/)[0],
        lines: dropNumber(lines),
        plain: dropNumber(plain),
        red,
        images: imagesIn(el),
        choices: null,
        after: { red: [], images: [] },
        explanation: [],
        explanationImages: [],
      };
    } else if (current) {
      const { plain, red } = splitRed(el);
      if (!current.choices) {
        // Exhibit text / command output / pictures between the question and its choices.
        current.lines.push(...lines);
        current.plain.push(...plain);
        current.red.push(...red);
        current.images.push(...imagesIn(el));
      } else {
        // After the choices: a red answer sentence or answer picture (fill-in / matching questions).
        current.after.red.push(...red);
        current.after.images.push(...imagesIn(el));
      }
    }
  }
  finish();

  // ---------- Building the text ----------

  function guessHeading() {
    const raw = (document.querySelector('h1')?.innerText || document.title).trim();
    // Drop filler words; a " - " part that's only filler ("- 100% Full") disappears,
    // while real ranges like "Modules 5 - 10" stay.
    const clean = s => s
      .replace(/100%|\bfull\b|\banswers?\b|\b20\d\d\b|itexamanswers(\.net)?/gi, '')
      .replace(/\(\s*\)|\[\s*\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const title = raw.split(/\s+[-–|]\s+/).map(clean).filter(Boolean).join(' - ');
    const type = /final/i.test(raw) ? 'Final'
      : /midterm/i.test(raw) ? 'Midterm'
      : /checkpoint/i.test(raw) ? 'Checkpoint'
      : /modules?\b/i.test(raw) ? 'Module'
      : /chapter/i.test(raw) ? 'Chapter'
      : /pre-?test/i.test(raw) ? 'Pretest'
      : /quiz/i.test(raw) ? 'Quiz'
      : 'Exam';
    return { type, title: title || raw };
  }

  function buildText(type, title) {
    const out = [`## ${type.trim() || 'Exam'}: ${title.trim() || 'Untitled'}`, ''];
    questions.forEach(q => {
      out.push(`${q.num}. ${q.lines[0] || '(see the picture)'}`);
      q.lines.slice(1).forEach(l => out.push(`> ${l}`));
      if (q.kind === 'card') q.items.forEach(item => out.push(`> • ${item}`));
      q.images.forEach(src => out.push(`Image: ${src}`));
      if (q.kind === 'choice') {
        q.choices.forEach((c, k) => {
          const start = `${c.correct ? '*' : ''}${LETTERS[k]}. `;
          if (!c.lines.length) return out.push(`${start}Image: ${c.image}`);
          out.push(start + c.lines[0]);
          c.lines.slice(1).forEach(l => out.push(`> ${l}`));
        });
      } else {
        out.push('Answer:');
        q.answer.forEach(l => out.push(`> ${l}`));
        q.answerImages.forEach(src => out.push(`Image: ${src}`));
      }
      out.push('');
    });
    return out.join('\n');
  }

  // ---------- Panel ----------

  const cards = questions.filter(q => q.kind === 'card').length;
  const withImages = questions.filter(q => q.images.length
    || (q.answerImages && q.answerImages.length)
    || (q.choices && q.choices.some(c => !c.lines.length))).length;
  const heading = guessHeading();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .panel {
        width: min(400px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        padding: 16px;
        border-radius: 14px;
        background: #fff;
        color: #282e3e;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .head strong { font-size: 16px; }
      .x { border: 0; background: none; font-size: 22px; line-height: 1; color: #586380; cursor: pointer; }
      p { margin: 0 0 8px; }
      .ok { font-weight: 700; color: #12a36e; }
      .none { font-weight: 700; color: #e5484d; }
      ul { margin: 0 0 10px; padding-left: 18px; color: #6e4c00; }
      label { display: block; margin: 8px 0 3px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #586380; }
      input, textarea { width: 100%; padding: 7px 9px; border: 2px solid #d9dde8; border-radius: 8px; font: inherit; color: inherit; background: #fff; }
      input:focus, textarea:focus { outline: none; border-color: #4255ff; }
      textarea { height: 180px; resize: vertical; font: 12px/1.4 ui-monospace, Consolas, monospace; }
      .row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
      .copy { padding: 9px 16px; border: 0; border-radius: 9px; background: #4255ff; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .copy:disabled { opacity: 0.5; cursor: not-allowed; }
      .status { font-weight: 600; color: #12a36e; }
      .hint { margin-top: 10px; color: #586380; font-size: 13px; }
      code { padding: 1px 4px; border-radius: 4px; background: #edeff4; font-size: 12px; }
    </style>
    <div class="panel" role="dialog" aria-label="Quizulu import">
      <div class="head"><strong>Quizulu import</strong><button class="x" aria-label="Close">×</button></div>
      ${questions.length
        ? `<p class="ok">Found ${questions.length} question${questions.length === 1 ? '' : 's'}${withImages ? ` (${withImages} with images)` : ''}.</p>
           <p>${questions.length - cards} multiple choice · ${cards} “Show answer” card${cards === 1 ? '' : 's'} (matching, fill-in…)</p>`
        : '<p class="none">No questions found on this page.</p>'}
      ${unreadable ? `<p>Skipped:</p><ul><li>${unreadable} with no text or picture to show</li></ul>` : ''}
      <label for="type">Type</label>
      <input id="type" value="${esc(heading.type)}">
      <label for="title">Title</label>
      <input id="title" value="${esc(heading.title)}">
      <label for="out">Preview</label>
      <textarea id="out" readonly></textarea>
      <div class="row">
        <button class="copy" ${questions.length ? '' : 'disabled'}>Copy to clipboard</button>
        <span class="status" aria-live="polite"></span>
      </div>
      <p class="hint">
        Paste under the <code># Subject</code> line of your file. The copied text already starts with its own
        <code>##</code> heading, so don't type another one.
        ${withImages ? 'Then run <code>python tools/save-images.py</code> to save the pictures.' : ''}
      </p>
    </div>`;
  document.body.appendChild(host);

  const $ = sel => shadow.querySelector(sel);
  const out = $('#out');
  const status = $('.status');
  const refresh = () => { out.value = buildText($('#type').value, $('#title').value); status.textContent = ''; };
  const close = () => { host.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') close(); };

  async function copy() {
    try {
      await navigator.clipboard.writeText(out.value);
    } catch {
      out.focus();
      out.select();
      document.execCommand('copy');
    }
    status.textContent = '✓ Copied';
  }

  $('#type').addEventListener('input', refresh);
  $('#title').addEventListener('input', refresh);
  $('.copy').addEventListener('click', copy);
  $('.x').addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  refresh();
})();
