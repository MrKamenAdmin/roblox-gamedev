// Интерактивные инструменты: карта жанров, разборы игр, калькулятор, конструктор концепта.
// Использует S, save, esc, download из app.js (функции вызываются после его загрузки).

// ================= Калькулятор экономики =================
// Допущения по умолчанию; источники — в уроках 1.3 и 5.x.
const ECON = {
  devexRate: 0.0038,  // $ за 1 Robux по DevEx
  devShare: 70,       // % от продажи Game Pass / Developer Product, который получает разработчик
  devexMin: 30000,    // минимум Robux для заявки на DevEx
};

// Кривая удержания: степенная интерполяция между D1, D7, D30 (доли 0..1),
// после D30 — тот же наклон, что между D7 и D30. Горизонт 180 дней.
// ponytail: грубая модель кривой; для точности подставьте свои данные из Creator Analytics.
function retentionAt(d, d1, d7, d30) {
  const lg = x => Math.log(Math.max(x, 1e-4));
  const seg = (a, ra, b, rb) => !ra || !rb ? ra + (rb - ra) * (d - a) / (b - a) : Math.exp(lg(ra) + (lg(rb) - lg(ra)) * (Math.log(d) - Math.log(a)) / (Math.log(b) - Math.log(a)));
  if (d <= 1) return d1;
  if (d <= 7) return seg(1, d1, 7, d7);
  if (d <= 30) return seg(7, d7, 30, d30);
  return Math.max(0, Math.min(seg(7, d7, 30, d30), d30));
}
function lifetimeDays(d1, d7, d30, horizon = 180) {
  let sum = 1; // день установки
  for (let d = 1; d < horizon; d++) sum += retentionAt(d, d1, d7, d30);
  return sum;
}

function calcEconomy(i) {
  const dau = i.mode === 'flow' ? i.newPerDay * lifetimeDays(i.d1 / 100, i.d7 / 100, i.d30 / 100) : i.dau;
  const payersPerDay = dau * i.payerPct / 100;
  const grossDaily = payersPerDay * i.avgCheck;              // сколько Robux тратят игроки в день
  const salesMonth = grossDaily * 30 * i.devShare / 100;     // доля разработчика за 30 дней
  const totalR = salesMonth + i.adsRobux + i.rewardsRobux;
  const usd = totalR * i.rate;
  return {
    dau, payersPerDay, grossDaily, salesMonth, totalR, usd,
    usdAfterTax: usd * (1 - i.taxPct / 100),
    arpdauR: dau ? totalR / 30 / dau : 0,
    ltvR: i.mode === 'flow' && i.newPerDay ? totalR / 30 / i.newPerDay : null,
    daysToDevex: totalR ? Math.ceil(ECON.devexMin / (totalR / 30)) : Infinity,
  };
}

const CALC_FIELDS = [
  ['dau', 'DAU — уникальных игроков в день', 1000, 'Для новой игры без рекламы реалистичны десятки–сотни. Тысячи DAU — уже заметный успех.', 'dau'],
  ['newPerDay', 'Новых игроков в день', 300, 'Сколько людей впервые заходят в игру за день (из рекомендаций, рекламы, соцсетей).', 'flow'],
  ['d1', 'D1 retention, %', 20, 'Какая доля новичков вернулась на следующий день. Ориентиры сообщества — в модуле 4.', 'flow'],
  ['d7', 'D7 retention, %', 6, 'Доля вернувшихся на 7-й день. Обычно в 2–4 раза ниже D1.', 'flow'],
  ['d30', 'D30 retention, %', 2, 'Доля вернувшихся на 30-й день.', 'flow'],
  ['payerPct', 'Доля платящих среди DAU в день, %', 1, 'Сколько из дневных игроков совершают хотя бы одну покупку в этот день. Точных публичных бенчмарков нет; используйте свои данные.'],
  ['avgCheck', 'Средний чек платящего в день, Robux', 150, 'Сколько Robux в среднем тратит платящий игрок за день (сумма всех покупок).'],
  ['devShare', 'Доля разработчика с продаж, %', ECON.devShare, 'С Game Pass и Developer Product разработчик получает 70%, остальное — комиссия платформы.'],
  ['adsRobux', 'Доход от рекламы, Robux/мес', 0, 'Rewarded- и immersive-реклама. Зависит от показов и региона аудитории — вводите свою оценку.'],
  ['rewardsRobux', 'Creator Rewards, Robux/мес', 0, 'Грубо: 5 R$ в день за каждого Active Spender (тратил от $9,99 за 60 дней), для которого ваша игра — одна из первых трёх за день, плюс 35% трат приведённых новичков. Урок 1.3.'],
  ['rate', 'Курс DevEx, $ за 1 Robux', ECON.devexRate, 'Официальный курс обмена заработанных Robux на доллары.'],
  ['taxPct', 'Налог, %', 13, 'Для налогового резидента РФ — НДФЛ с иностранного дохода (см. урок 9.4). Не налоговая консультация.'],
];

function toolCalc(el) {
  const st = S.calc = S.calc || {};
  const v = k => st[k] ?? CALC_FIELDS.find(f => f[0] === k)[2];
  const fmt = (n, d = 0) => Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: d }) : '—';
  const mode = st.mode || 'dau';
  el.innerHTML = `<h1>Калькулятор экономики игры</h1>
  <p class="muted">Грубая оценка дохода. Под каждым полем — допущение. Модель считает 30 дней и не учитывает возвраты, сезонность и рекламные расходы.</p>
  <div class="calc"><div>
    <div class="seg" id="mode"><button data-m="dau" class="${mode === 'dau' ? 'on' : ''}">Знаю DAU</button><button data-m="flow" class="${mode === 'flow' ? 'on' : ''}">Считать из притока и retention</button></div>
    ${CALC_FIELDS.filter(f => !f[4] || f[4] === mode).map(([k, label, , hint]) => `
      <label class="f" for="c-${k}">${label}</label>
      <input type="number" min="0" step="any" id="c-${k}" data-k="${k}" value="${v(k)}">
      <div class="hint">${hint}</div>`).join('')}
    <button class="btn ghost" id="c-reset" style="margin-top:12px">Сбросить к значениям по умолчанию</button>
  </div><div class="out card" id="c-out"></div></div>`;

  const out = () => {
    const inp = { mode }; CALC_FIELDS.forEach(f => { inp[f[0]] = +v(f[0]) || 0; });
    const r = calcEconomy(inp);
    $('#c-out').innerHTML = `<div class="muted small">Доход разработчика за 30 дней</div>
      <div class="big">${fmt(r.totalR)} R$</div><div class="big" style="font-size:1.3rem">≈ $${fmt(r.usd)}</div>
      <div class="muted small">после налога ≈ $${fmt(r.usdAfterTax)} · за год ≈ $${fmt(r.usdAfterTax * 12)}</div>
      <h3>Из чего складывается</h3>
      ${mode === 'flow' ? `<div class="kv"><span>Расчётный DAU</span><b>${fmt(r.dau)}</b></div>` : ''}
      <div class="kv"><span>Платящих в день</span><b>${fmt(r.payersPerDay, 1)}</b></div>
      <div class="kv"><span>Игроки тратят в день</span><b>${fmt(r.grossDaily)} R$</b></div>
      <div class="kv"><span>Продажи (ваша доля)</span><b>${fmt(r.salesMonth)} R$</b></div>
      <div class="kv"><span>Реклама</span><b>${fmt(inp.adsRobux)} R$</b></div>
      <div class="kv"><span>Creator Rewards</span><b>${fmt(inp.rewardsRobux)} R$</b></div>
      <div class="kv"><span>ARPDAU</span><b>${fmt(r.arpdauR, 2)} R$ ($${fmt(r.arpdauR * inp.rate, 4)})</b></div>
      ${r.ltvR !== null ? `<div class="kv"><span>Доход на одного нового игрока (LTV)</span><b>${fmt(r.ltvR, 2)} R$</b></div>` : ''}
      <div class="kv"><span>До минимума DevEx (${fmt(ECON.devexMin)} R$)</span><b>${Number.isFinite(r.daysToDevex) ? fmt(r.daysToDevex) + ' дн.' : 'никогда'}</b></div>
      <p class="hint" style="margin-top:12px">Robux от продаж поступают не сразу (есть период ожидания), а налоговые и банковские расходы зависят от страны — см. урок 1.3.</p>`;
  };
  el.querySelector('#mode').onclick = e => { const m = e.target.dataset.m; if (m) { st.mode = m; save(); toolCalc(el); } };
  el.querySelector('#c-reset').onclick = () => { S.calc = { mode }; save(); toolCalc(el); };
  el.oninput = e => { const k = e.target.dataset.k; if (k) { st[k] = e.target.value; save(); out(); } };
  out();
}

// ================= Карта жанров =================
const AGES = ['до 9', '9–12', '13–17', '18+'];
const dots = n => `<span class="dots" title="${n} из 5">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>`;

function toolGenres(el) {
  const f = S.genreFilter = S.genreFilter || { sort: 'diff', dir: 1 };
  const sel = (k, label, opts) => `<label>${label}<select data-f="${k}"><option value="">любая</option>${opts.map(([v, t]) =>
    `<option value="${v}" ${String(f[k] ?? '') === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const n15 = [1, 2, 3, 4, 5].map(n => [n, n]);
  const st = COURSE.genreStats?.rows || {};
  const max = Math.max(1, ...Object.values(st).map(r => r.ccu));
  let rows = COURSE.genres.map(g => ({ ...g, ccu: st[g.name]?.ccu ?? -1 })).filter(g =>
    (!f.diff || g.diff <= f.diff) && (!f.team || g.teamMin <= f.team) && (!f.age || g.age.includes(f.age)) &&
    (!f.money || g.money >= f.money) && (!f.comp || g.comp <= f.comp));
  rows.sort((a, b) => (a[f.sort] > b[f.sort] ? 1 : a[f.sort] < b[f.sort] ? -1 : 0) * f.dir);
  const th = (k, t) => `<th class="sortable" data-sort="${k}">${t}${f.sort === k ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  el.innerHTML = `<h1>Карта жанров</h1>
  <p class="muted">Оценки 1–5 — экспертные (<b>практика сообщества</b>, не статистика). Сложность — для соло-новичка без опыта. Нажмите на заголовок, чтобы отсортировать.</p>
  <div class="filters">
    ${sel('diff', 'Сложность не выше', n15)}${sel('team', 'Команда не больше (чел.)', [[1, 1], [2, 2], [3, 3], [5, 5]])}
    ${sel('age', 'Возраст аудитории', AGES.map(a => [a, a]))}${sel('money', 'Монетизация не ниже', n15)}${sel('comp', 'Конкуренция не выше', n15)}
  </div>
  <div class="table-wrap genres"><table><thead><tr>${th('name', 'Жанр')}${th('ccu', 'Онлайн сейчас')}${th('diff', 'Сложность')}${th('teamMin', 'Команда')}<th>Возраст</th>${th('money', 'Монетизация')}${th('comp', 'Конкуренция')}<th>Core loop и примеры</th></tr></thead>
  <tbody>${rows.map(g => `<tr><td><b>${esc(g.name)}</b>${st[g.name] ? `<div class="small muted">Roblox: ${esc(st[g.name].official)}</div>` : ''}</td><td class="small">${ccuCell(st[g.name], max)}</td><td>${dots(g.diff)}</td><td>${esc(g.team)}</td><td class="small">${g.age.join(', ')}</td>
    <td>${dots(g.money)}</td><td>${dots(g.comp)}</td><td class="small">${esc(g.loop)}<br><span class="muted">${esc(g.examples)}</span>
    ${g.note ? `<br><i>${esc(g.note)}</i>` : ''}</td></tr>`).join('') || '<tr><td colspan="8">Под фильтры ничего не подходит.</td></tr>'}</tbody></table></div>
  <p class="small muted">Найдено: ${rows.length} из ${COURSE.genres.length}. Подробно о жанрах — в модуле 2.</p>
  ${genreStatsNote()}`;
  el.onchange = e => { const k = e.target.dataset.f; if (k) { f[k] = e.target.value && (k === 'age' ? e.target.value : +e.target.value); save(); toolGenres(el); } };
  el.onclick = e => { const k = e.target.closest('th')?.dataset.sort; if (k) { f.dir = f.sort === k ? -f.dir : k === 'ccu' ? -1 : 1; f.sort = k; save(); toolGenres(el); } };
}

// Онлайн по жанрам: снимок из content/genre-stats.js (обновляется scripts/genre_stats.py)
const fmtCcu = n => n >= 1e6 ? (n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн'
  : n >= 1e3 ? Math.round(n / 1e3) + ' тыс.' : String(n);
function ccuCell(s, max) {
  if (!s) return '—';
  const lead = s.top[0];
  return `<b>${fmtCcu(s.ccu)}</b><div class="mini"><i style="width:${(s.ccu / max * 100).toFixed(1)}%"></i></div>
    ${s.games} игр в чартах${lead ? ` · лидер забирает ${Math.round(lead[1] / s.ccu * 100)}%` : ''}
    <div class="muted">${s.top.slice(0, 2).map(([n, c, p]) => `<a href="https://www.roblox.com/games/${p}" target="_blank" rel="noopener">${esc(n)}</a> ${fmtCcu(c)}`).join(', ')}</div>`;
}
function genreStatsNote() {
  const gs = COURSE.genreStats;
  if (!gs) return '';
  return `<div class="note fact"><b>Откуда «Онлайн сейчас».</b> Снимок ${esc(gs.date)}: все игры из чартов Roblox (Top Playing Now, Trending, Top Earning, жанровые и др.) для телефонов, планшетов, ПК и консолей —
    ${gs.sampleGames.toLocaleString('ru-RU')} игр, ${fmtCcu(gs.sampleCcu)} игроков одновременно. Онлайн и жанр каждой игры взяты из официального API Roblox и сложены по жанрам карты.</div>
  <div class="note warn">Как читать: это не вся платформа, а игры, попавшие в чарты (на них приходится основная часть онлайна).
    Официальные жанры Roblox не совпадают с жанрами курса один в один — под названием жанра указано, что именно сложено.
    «Трендовые» — не жанр, а игры младше 90 дней; они же входят и в свои жанры (Steal An Egg — это Tycoon).
    Онлайн сильно меняется по часам и дням недели, а на снимок пришлись хеллоуинские ивенты.
    Колонка «лидер забирает» показывает концентрацию: чем выше процент, тем сильнее жанр держится на одной игре.</div>
  <p class="small muted">Не вошло в карту: ${gs.other.slice(0, 6).map(([n, c]) => `${esc(n)} ${fmtCcu(c)}`).join(' · ')}.</p>`;
}

// ================= Разборы игр =================
function toolGames(el, params) {
  const genre = params.get('genre') || '', focus = params.get('g');
  const genres = [...new Set(COURSE.games.map(g => g.genre))].sort();
  const list = COURSE.games.filter(g => !genre || g.genre === genre);
  el.innerHTML = `<h1>Разборы игр</h1>
  <p class="muted">Схема: жанр → core loop → чем удерживает → как зарабатывает → чему научиться. Цифры онлайна — на дату проверки, они быстро меняются.</p>
  <div class="row" style="margin:10px 0">${['', ...genres].map(g => `<a class="pill ${g === genre ? 'on' : ''}" href="#/games${g ? '?genre=' + encodeURIComponent(g) : ''}">${g || 'Все'}</a>`).join('')}</div>
  <div class="grid">${list.map(g => `<div class="card game" id="game-${g.id}" ${g.id === focus ? 'style="outline:2px solid var(--accent)"' : ''}>
    <h3>${esc(g.name)}</h3><div><span class="pill">${esc(g.genre)}</span><span class="pill">${esc(g.status)}</span><span class="pill">с ${esc(g.since)}</span></div>
    <dl><dt>Студия</dt><dd>${esc(g.studio)}</dd>
    <dt>Core loop</dt><dd>${g.loop}</dd><dt>Чем удерживает</dt><dd>${g.retention}</dd>
    <dt>Как зарабатывает</dt><dd>${g.money}</dd><dt>Чему научиться</dt><dd>${g.lesson}</dd>
    ${g.facts ? `<dt>Цифры</dt><dd class="small">${g.facts}</dd>` : ''}</dl>
    <p class="small"><a href="${esc(g.url)}" target="_blank" rel="noopener">Открыть в Roblox ↗</a>${g.checked ? ` · <span class="muted">проверено ${esc(g.checked)}</span>` : ''}</p></div>`).join('')}</div>`;
  if (focus) setTimeout(() => document.getElementById('game-' + focus)?.scrollIntoView({ block: 'center' }), 0);
}

// ================= Конструктор концепта (мини-GDD) =================
const CONCEPT = [
  { title: 'Идея', fields: [
    ['name', 'Рабочее название', 'text', 'Короткое и понятное ребёнку. Можно поменять позже.'],
    ['pitch', 'Идея в одном предложении', 'textarea', 'Формула: «Игра, где ты [действие], чтобы [цель], а [фишка]».'],
    ['genre', 'Жанр', 'genre', 'Посмотрите карту жанров: сложность для соло и конкуренцию.'],
    ['refs', 'Референсы (2–3 игры)', 'textarea', 'На что похоже и чем отличается от каждой.'],
    ['hook', 'Почему в неё будут играть вместо лидера жанра?', 'textarea', 'Одна понятная причина. «Лучше графика» обычно не причина.'],
  ] },
  { title: 'Аудитория', fields: [
    ['age', 'Возраст ядра аудитории', 'select:до 9|9–12|13–17|18+|смешанная', 'От возраста зависят темы, сложность, цены и правила.'],
    ['devices', 'Основные устройства', 'text', 'Телефон, ПК, консоль, планшет. Большинство играет с телефона — проверьте управление.'],
    ['fantasy', 'Фантазия игрока', 'textarea', 'Кем игрок себя чувствует: богачом, героем, выжившим, звездой?'],
    ['session', 'Типичная сессия', 'text', 'Например: «10–20 минут после школы, с друзьями».'],
  ] },
  { title: 'Core loop', fields: [
    ['coreAction', 'Основное действие', 'textarea', 'Что игрок делает 80% времени.'],
    ['coreReward', 'Награда', 'textarea', 'Что он получает за действие (валюта, предмет, опыт).'],
    ['coreSpend', 'На что тратит награду', 'textarea', 'Как трата делает следующее действие быстрее, интереснее или престижнее.'],
  ] },
  { title: 'Meta loop', fields: [
    ['meta', 'Долгосрочная цель', 'textarea', 'Зачем возвращаться через неделю: коллекция, ребёрт, рейтинг, новые зоны.'],
    ['social', 'Социальные механики', 'textarea', 'Что заставляет звать друзей и показывать себя другим.'],
  ] },
  { title: 'Удержание', fields: [
    ['ftue', 'Первые 60 секунд', 'textarea', 'Что игрок увидит и сделает в первую минуту, без текстовых инструкций.'],
    ['daily', 'Причина вернуться завтра', 'textarea', 'Ежедневные награды, таймеры, задания, стрики.'],
    ['events', 'Ивенты и обновления', 'textarea', 'Как часто и что именно будет меняться.'],
  ] },
  { title: 'Монетизация', fields: [
    ['passes', 'Game Passes', 'textarea', 'Разовые покупки навсегда. Список с ценами в Robux.'],
    ['products', 'Developer Products', 'textarea', 'Повторяемые покупки (валюта, бусты). Список с ценами.'],
    ['otherMoney', 'Другие источники', 'textarea', 'Приватные серверы, подписки, реклама, UGC.'],
    ['ethics', 'Что мы точно НЕ будем продавать', 'textarea', 'Граница этики: например, никаких платных лутбоксов для детей и давления таймерами.'],
  ] },
  { title: 'Запуск и 30 дней', fields: [
    ['mvp', 'MVP: что входит в первую версию', 'textarea', 'Минимум, на котором проверяется core loop.'],
    ['cut', 'Что сознательно откладываем', 'textarea', 'Всё, что не нужно для проверки идеи.'],
    ['metrics', 'Целевые метрики на первый месяц', 'textarea', 'Например: D1 ≥ X%, средняя сессия ≥ Y минут. Ориентиры — в модуле 4.'],
    ['plan', 'План по неделям', 'textarea', 'Неделя 1: … Неделя 2: … Неделя 3: … Неделя 4: …'],
  ] },
];

function conceptMd() {
  const c = S.concept || {};
  return `# ${c.name || 'Концепт игры'} — мини-GDD\n\n` + CONCEPT.map(step => `## ${step.title}\n\n` +
    step.fields.map(([k, label]) => `**${label}**\n\n${(c[k] || '—').trim()}\n`).join('\n')).join('\n');
}

function toolConcept(el) {
  const c = S.concept = S.concept || {};
  const i = Math.min(S.conceptStep || 0, CONCEPT.length - 1), step = CONCEPT[i];
  const filled = s => s.fields.some(([k]) => (c[k] || '').trim());
  const input = ([k, label, type, hint]) => {
    const val = esc(c[k] || '');
    let ctl;
    if (type === 'textarea') ctl = `<textarea id="cc-${k}" data-k="${k}">${val}</textarea>`;
    else if (type === 'genre' || type.startsWith('select:')) {
      const opts = type === 'genre' ? [...COURSE.genres.map(g => g.name), 'другое / гибрид'] : type.slice(7).split('|');
      ctl = `<select id="cc-${k}" data-k="${k}"><option value="">— выберите —</option>${opts.map(o => `<option ${c[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else ctl = `<input type="text" id="cc-${k}" data-k="${k}" value="${val}">`;
    return `<label class="f" for="cc-${k}">${label}</label><div class="hint">${hint}</div>${ctl}`;
  };
  el.innerHTML = `<h1>Конструктор концепта</h1>
  <p class="muted">Пошагово соберите мини-GDD (game design document). Всё сохраняется автоматически; в конце скачайте Markdown.</p>
  <div class="steps">${CONCEPT.map((s, si) => `<button data-step="${si}" class="${si === i ? 'on' : ''} ${filled(s) ? 'filled' : ''}">${si + 1}. ${s.title}</button>`).join('')}</div>
  <div class="card"><h2 style="margin-top:0">Шаг ${i + 1}. ${step.title}</h2>${step.fields.map(input).join('')}
  <div class="row" style="margin-top:16px">${i > 0 ? '<button class="btn ghost" data-step="' + (i - 1) + '">← Назад</button>' : ''}<span class="spacer"></span>
  ${i < CONCEPT.length - 1 ? '<button class="btn" data-step="' + (i + 1) + '">Дальше →</button>' : ''}</div></div>
  <div class="row"><button class="btn" id="cc-dl">Скачать .md</button><button class="btn ghost" id="cc-copy">Скопировать Markdown</button></div>
  <details style="margin-top:16px"><summary>Предпросмотр Markdown</summary><pre style="white-space:pre-wrap" id="cc-pre">${esc(conceptMd())}</pre></details>`;
  el.oninput = e => { const k = e.target.dataset.k; if (k) { c[k] = e.target.value; save(); $('#cc-pre').textContent = conceptMd(); } };
  el.onchange = el.oninput;
  el.onclick = e => {
    const s = e.target.dataset.step;
    if (s !== undefined) { S.conceptStep = +s; save(); toolConcept(el); scrollTo(0, 0); }
    if (e.target.id === 'cc-dl') download((c.name || 'koncept').replace(/[\\/:*?"<>|]/g, '_') + '-gdd.md', conceptMd());
    if (e.target.id === 'cc-copy') navigator.clipboard?.writeText(conceptMd()).then(() => { e.target.textContent = 'Скопировано ✓'; }, () => alert('Не удалось скопировать — используйте предпросмотр.'));
  };
}

window.TOOLS = { calc: toolCalc, genres: toolGenres, games: toolGames, concept: toolConcept };
