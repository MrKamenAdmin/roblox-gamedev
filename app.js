// Ядро курса: хранилище, навигация, уроки, квизы, глоссарий.
// Контент лежит в content/*.js, интерактивные инструменты — в tools.js.

const KEY = 'rbx-course-v1';
let S = {};
try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { S = {}; }
for (const k of ['done', 'quiz', 'ex']) S[k] = S[k] || {};
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* приватный режим: работаем без сохранения */ } }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const C = window.COURSE;
const allLessons = () => C.modules.flatMap(m => m.lessons.map(l => ({ ...l, module: m })));
const findLesson = id => allLessons().find(l => l.id === id);
const ready = l => !!l.body;

const TOOLS_NAV = [
  ['#/genres', 'Карта жанров'], ['#/games', 'Разборы игр'], ['#/calc', 'Калькулятор экономики'],
  ['#/concept', 'Конструктор концепта'], ['#/exercises', 'Мои упражнения'], ['#/glossary', 'Глоссарий'],
];

// ---------- Прогресс и навигация ----------
function progress() {
  const ls = allLessons(), d = ls.filter(l => S.done[l.id]).length;
  return { done: d, total: ls.length, pct: ls.length ? Math.round(d / ls.length * 100) : 0 };
}
function renderTop() {
  const p = progress();
  $('#top-bar').style.width = p.pct + '%';
  $('#top-pct').textContent = p.pct + '%';
}
function renderSidebar(hash) {
  const cur = hash.split('?')[0];
  const link = (href, text, extra = '') => `<a href="${href}" class="${href === cur ? 'active' : ''} ${extra}">${text}</a>`;
  const mods = C.modules.map(m => {
    const open = m.lessons.some(l => '#/lesson/' + l.id === cur);
    return `<details ${open ? 'open' : ''}><summary>${m.n}. ${esc(m.title)}</summary><div>` +
      m.lessons.map(l => link('#/lesson/' + l.id,
        `<span class="check">${S.done[l.id] ? '✓' : ''}</span><span>${l.id.replace('m', '').replace('-', '.')} ${esc(l.title)}</span>`,
        ready(l) ? '' : 'soon')).join('') + '</div></details>';
  }).join('');
  $('#sidebar').innerHTML =
    `<div class="nav-group">${link('#/', '🏠 Главная')}</div>` +
    `<div class="nav-group"><p class="nav-title">Модули</p>${mods}</div>` +
    `<div class="nav-group"><p class="nav-title">Инструменты</p>${TOOLS_NAV.map(([h, t]) => link(h, t)).join('')}</div>`;
}

// ---------- Страницы ----------
function pageHome() {
  const p = progress();
  const firstTodo = allLessons().find(l => ready(l) && !S.done[l.id]);
  return `<h1>Геймдев на Roblox: от идеи до денег</h1>
  <p>Курс про бизнес и дизайн игр на Roblox — без программирования. Уроки по 5–10 минут, после каждого квиз.
  Прогресс и ответы хранятся в этом браузере.</p>
  <div class="card"><div class="row"><div><div class="big">${p.done} / ${p.total}</div><div class="muted small">уроков пройдено</div></div>
  <span class="spacer"></span>${firstTodo ? `<a class="btn" href="#/lesson/${firstTodo.id}">${p.done ? 'Продолжить' : 'Начать'}: ${esc(firstTodo.title)}</a>` : ''}</div></div>
  <h2>Модули</h2><div class="grid">${C.modules.map(m => {
    const done = m.lessons.filter(l => S.done[l.id]).length, isReady = m.lessons.some(ready);
    return `<a class="card" style="text-decoration:none;color:inherit" href="#/lesson/${m.lessons[0].id}">
      <div class="muted small">Модуль ${m.n} · ${done}/${m.lessons.length}${isReady ? '' : ' · готовится'}</div>
      <b>${esc(m.title)}</b><div class="small muted">${esc(m.intro || '')}</div></a>`;
  }).join('')}</div>
  <h2>Инструменты</h2><div class="grid">${TOOLS_NAV.map(([h, t]) => `<a class="card" style="text-decoration:none;color:inherit" href="${h}"><b>${t}</b></a>`).join('')}</div>
  <p class="small muted" style="margin-top:40px">Плашки в тексте: <b>Факт</b> — подтверждено источником;
  <b>Практика сообщества</b> — эмпирическое правило разработчиков; <b>Точных данных нет</b> — честно о пробелах.
  <br><button class="btn ghost" id="reset" style="margin-top:12px">Сбросить весь прогресс</button></p>`;
}

function pageLesson(id) {
  const l = findLesson(id);
  if (!l) return pageNotFound();
  const ls = allLessons(), i = ls.findIndex(x => x.id === id), prev = ls[i - 1], next = ls[i + 1];
  const nav = `<div class="lesson-nav">${prev ? `<a class="btn ghost" href="#/lesson/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="btn ghost" href="#/lesson/${next.id}">${esc(next.title)} →</a>` : ''}</div>`;
  const head = `<div class="crumbs"><a href="#/">Главная</a> › Модуль ${l.module.n}. ${esc(l.module.title)}</div>
    <h1>${esc(l.title)}</h1>`;
  if (!ready(l)) return head + `<div class="note unknown">Урок готовится — модули публикуются по одному.</div>` + nav;
  return head +
    `<div class="meta">⏱ ${l.minutes} мин · Проверено: ${esc(l.verified)}</div>
    <article class="lesson-body">${l.body}</article>
    ${l.exercise ? renderExercise(l) : ''}
    <section class="summary"><h2>Главное за 30 секунд</h2><ul>${l.summary.map(s => `<li>${s}</li>`).join('')}</ul></section>
    ${l.quiz ? `<section class="quiz" id="quiz"><h2>Квиз</h2><div id="quiz-body"></div></section>` : ''}
    <div class="done-box"><button class="btn ${S.done[id] ? 'ghost' : ''}" id="done-btn">${S.done[id] ? '✓ Пройдено (снять отметку)' : 'Отметить урок пройденным'}</button></div>
    <section class="sources"><h2>Источники</h2><ol>${l.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ol>
    <p class="muted">Проверено: ${esc(l.verified)}. Roblox быстро меняется — сверяйтесь с первоисточниками.</p></section>` + nav;
}

function renderExercise(l) {
  const e = l.exercise, ans = S.ex[l.id] || {};
  return `<section class="card"><h2 style="margin-top:0">🎮 Сыграй и разбери: ${esc(e.title)}</h2>${e.intro}
    ${e.questions.map((q, qi) => `<label class="f" for="ex-${qi}">${qi + 1}. ${esc(q)}</label>
      <textarea id="ex-${qi}" data-ex="${esc(l.id)}" data-qi="${qi}">${esc(ans[qi] || '')}</textarea>`).join('')}
    <p class="hint">Ответы сохраняются автоматически. Все упражнения — в разделе <a href="#/exercises">«Мои упражнения»</a>.</p></section>`;
}

// Квиз: после ответа показываем объяснение для каждого варианта
function renderQuiz(l) {
  const box = $('#quiz-body'); if (!box) return;
  const st = S.quiz[l.id] || {};
  const answered = l.quiz.filter((_, qi) => st[qi] !== undefined).length;
  const correct = l.quiz.filter((q, qi) => st[qi] !== undefined && q.a[st[qi]].ok).length;
  box.innerHTML = l.quiz.map((q, qi) => {
    const pick = st[qi];
    return `<div class="q"><p>${qi + 1}. ${q.q}</p>${q.a.map((a, ai) => {
      const cls = pick === undefined ? '' : a.ok ? 'right' : ai === pick ? 'wrong' : '';
      const mark = pick === undefined ? '' : a.ok ? '✓ ' : ai === pick ? '✗ ' : '';
      return `<button class="opt ${cls}" data-qi="${qi}" data-ai="${ai}" ${pick !== undefined ? 'disabled' : ''}>${mark}${a.t}
        ${pick !== undefined ? `<span class="why">${a.why}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }).join('') + (answered === l.quiz.length
    ? `<p class="score">Результат: ${correct} из ${l.quiz.length}. <button class="btn ghost" id="quiz-reset">Пройти заново</button></p>` : '');
  box.onclick = e => {
    if (e.target.id === 'quiz-reset') { delete S.quiz[l.id]; save(); return renderQuiz(l); }
    const b = e.target.closest('.opt'); if (!b || b.disabled) return;
    S.quiz[l.id] = { ...(S.quiz[l.id] || {}), [b.dataset.qi]: +b.dataset.ai };
    const finished = Object.keys(S.quiz[l.id]).length === l.quiz.length && !S.done[l.id];
    if (finished) S.done[l.id] = true; // квиз пройден — урок засчитан
    save();
    if (finished) route(); else renderQuiz(l);
  };
}

function pageExercises() {
  const items = allLessons().filter(l => l.exercise);
  if (!items.length) return '<h1>Мои упражнения</h1><p>Пока нет упражнений.</p>';
  return `<h1>Мои упражнения</h1><p class="muted">Ответы из блоков «Сыграй и разбери».</p>
    <button class="btn ghost" id="ex-export">Скачать всё в Markdown</button>` +
    items.map(l => `<div class="card"><h3 style="margin-top:0"><a href="#/lesson/${l.id}">${esc(l.exercise.title)}</a></h3>` +
      l.exercise.questions.map((q, qi) => `<p><b>${esc(q)}</b><br>${esc((S.ex[l.id] || {})[qi] || '—')}</p>`).join('') + '</div>').join('');
}
function exercisesMd() {
  return '# Мои упражнения «Сыграй и разбери»\n\n' + allLessons().filter(l => l.exercise).map(l =>
    `## ${l.exercise.title}\n\n` + l.exercise.questions.map((q, qi) => `**${q}**\n\n${(S.ex[l.id] || {})[qi] || '—'}\n`).join('\n')).join('\n');
}

function pageGlossary() {
  const items = [...C.glossary].sort((a, b) => a.term.localeCompare(b.term, 'ru'));
  return `<h1>Глоссарий</h1><input type="text" id="gl-search" placeholder="Поиск термина…">
    <dl class="glossary" id="gl-list">${items.map(g => `<div data-s="${esc((g.term + ' ' + g.def).toLowerCase())}"><dt>${esc(g.term)}</dt><dd>${g.def}</dd></div>`).join('')}</dl>`;
}

const pageNotFound = () => '<h1>Страница не найдена</h1><p><a href="#/">На главную</a></p>';

// ---------- Глоссарий в тексте ----------
// match: строки; '*' на конце = любое окончание (для русских слов)
const glRegex = g => new RegExp('(?<![\\p{L}\\p{N}])(' + (g.match || [g.term]).map(m =>
  m.endsWith('*') ? m.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\p{L}*' : m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
).join('|') + ')(?![\\p{L}\\p{N}])', 'iu');

function highlightGlossary(root) {
  const used = new Set(), entries = C.glossary.map((g, i) => ({ g, i, re: glRegex(g) }));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('a,button,h1,h2,h3,code,th,.gl,.no-gl') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let node of nodes) {
    for (;;) {
      let best = null;
      for (const e of entries) {
        if (used.has(e.i)) continue;
        const m = e.re.exec(node.data);
        if (m && (!best || m.index < best.m.index)) best = { e, m };
      }
      if (!best) break;
      used.add(best.e.i);
      const after = node.splitText(best.m.index), rest = after.splitText(best.m[0].length);
      const b = document.createElement('button');
      b.className = 'gl'; b.type = 'button'; b.dataset.gi = best.e.i; b.textContent = after.data;
      after.replaceWith(b);
      node = rest;
    }
  }
}

const pop = $('#gl-pop');
function showGl(btn) {
  const g = C.glossary[btn.dataset.gi];
  pop.innerHTML = `<b>${esc(g.term)}</b>${g.def}`;
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(16, Math.min(r.left, innerWidth - pw - 16)) + 'px';
  pop.style.top = (r.bottom + ph + 8 > innerHeight ? r.top - ph - 6 : r.bottom + 6) + 'px';
}
document.addEventListener('click', e => {
  const b = e.target.closest('.gl');
  if (b) showGl(b); else if (!e.target.closest('#gl-pop')) pop.hidden = true;
});
if (matchMedia('(hover: hover)').matches) {
  document.addEventListener('mouseover', e => { const b = e.target.closest('.gl'); if (b) showGl(b); });
  document.addEventListener('mouseout', e => { if (e.target.closest('.gl')) pop.hidden = true; });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
addEventListener('scroll', () => { pop.hidden = true; }, { passive: true });

// ---------- Роутер ----------
function route() {
  const hash = location.hash || '#/';
  const [path, query] = hash.slice(1).split('?');
  const params = new URLSearchParams(query || '');
  const app = $('#app'), parts = path.split('/').filter(Boolean);
  const tools = window.TOOLS || {};
  const wide = ['genres', 'games', 'calc'].includes(parts[0]);
  app.classList.toggle('wide', wide);
  app.onclick = app.oninput = app.onchange = null; // обработчики инструментов не должны переживать смену страницы
  pop.hidden = true;

  if (!parts.length) app.innerHTML = pageHome();
  else if (parts[0] === 'lesson') app.innerHTML = pageLesson(parts[1]);
  else if (parts[0] === 'glossary') app.innerHTML = pageGlossary();
  else if (parts[0] === 'exercises') app.innerHTML = pageExercises();
  else if (tools[parts[0]]) tools[parts[0]](app, params);
  else app.innerHTML = pageNotFound();

  if (parts[0] === 'lesson') {
    const l = findLesson(parts[1]);
    if (l && ready(l)) { highlightGlossary(app.querySelector('.lesson-body')); if (l.quiz) renderQuiz(l); }
  }
  renderSidebar(hash); renderTop();
  document.title = (app.querySelector('h1')?.textContent || '') + ' · Геймдев на Roblox';
}

// Делегированные обработчики страниц
$('#app').addEventListener('click', e => {
  const t = e.target;
  if (t.id === 'done-btn') {
    const id = location.hash.split('/')[2];
    S.done[id] = !S.done[id]; if (!S.done[id]) delete S.done[id]; save(); route();
  } else if (t.id === 'reset' && confirm('Удалить весь прогресс, ответы и концепт?')) {
    S = { done: {}, quiz: {}, ex: {}, theme: S.theme }; save(); route();
  } else if (t.id === 'ex-export') download('moi-uprazhneniya.md', exercisesMd());
});
$('#app').addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.ex) { (S.ex[t.dataset.ex] = S.ex[t.dataset.ex] || {})[t.dataset.qi] = t.value; save(); }
  if (t.id === 'gl-search') {
    const q = t.value.toLowerCase();
    document.querySelectorAll('#gl-list > div').forEach(d => { d.hidden = !d.dataset.s.includes(q); });
  }
});

$('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
$('#sidebar').addEventListener('click', e => { if (e.target.closest('a')) $('#sidebar').classList.remove('open'); });
$('#theme-btn').onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  S.theme = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = S.theme; save();
};
addEventListener('hashchange', () => { route(); $('#app').focus({ preventScroll: true }); scrollTo(0, 0); });
route();
