#!/usr/bin/env python3
"""Снимок онлайна по жанрам: собирает игры из всех чартов Roblox (Charts) по нескольким
типам устройств, берёт их текущий онлайн и официальный жанр, суммирует по жанрам карты курса
и пишет content/genre-stats.js.

Запуск из корня репозитория:  python3 scripts/genre_stats.py
"""
import collections, datetime, json, re, time, urllib.error, urllib.request, uuid

# Жанр карты курса (как в content/genres.js) -> официальные жанры Roblox (genre_l1, genre_l2 или None = все поджанры).
MAP = {
    'Obby (полоса препятствий)': [('Obby & Platformer', None)],
    'Simulator': [('Simulation', 'Incremental Simulator')],
    'Tycoon': [('Simulation', 'Tycoon')],
    'Incremental / idle': [('Simulation', 'Idle')],
    'Party / минигры': [('Party & Casual', None), ('Survival', '1 vs All')],
    'Social hangout': [('Social', None), ('Shopping', 'Avatar Shopping')],
    'Roleplay / life sim': [('Roleplay & Avatar Sim', None)],
    'Tower defense': [('Strategy', 'Tower Defense')],
    'Horror': [('Survival', 'Escape')],
    'Survival / co-op': [('Survival', '')],
    'PvP / шутеры': [('Shooter', None)],
    'Anime fighting / battlegrounds': [('Action', 'Battlegrounds & Fighting'), ('RPG', 'Action RPG')],
}
TREND = 'Трендовые вирусные игры'  # официального жанра нет: считаем игры младше TREND_DAYS
TREND_DAYS = 90
DEVICES = ['computer', 'high_end_phone', 'low_end_phone', 'high_end_tablet', 'console']


def get(url):
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(5 * (attempt + 1))  # лимит запросов Roblox
    raise SystemExit('Roblox API: слишком много запросов, попробуйте позже')


def clean(name):
    name = re.sub(r'[\[(][^\])]*[\])]', '', name)  # [🎃UPD], (ANNIVERSARY)
    name = re.sub(r'[^\w\s!?.,:&\'+-]', '', name)   # эмодзи и символы
    return re.sub(r'\s+', ' ', name).strip()


def label(l1, l2):
    return f'{l1} › {l2}' if l2 else (f'{l1} (все)' if l2 is None else f'{l1} (без поджанра)')


def main():
    ids = set()
    for device in DEVICES:
        sid, token = str(uuid.uuid4()), ''
        while True:
            d = get(f'https://apis.roblox.com/explore-api/v1/get-sorts?sessionId={sid}&device={device}&country=all'
                    + (f'&sortsPageToken={token}' if token else ''))
            ids.update(g['universeId'] for s in d['sorts'] for g in s.get('games') or [])
            token = d.get('nextSortsPageToken')
            if not token:
                break
    ids, games = sorted(ids), []
    for i in range(0, len(ids), 50):
        games += get('https://games.roblox.com/v1/games?universeIds=' + ','.join(map(str, ids[i:i + 50])))['data']
        time.sleep(1)

    now = datetime.datetime.now(datetime.timezone.utc)
    matches = lambda g, rule: g.get('genre_l1') == rule[0] and (rule[1] is None or (g.get('genre_l2') or '') == rule[1])
    rows, used = {}, set()
    for genre, rules in MAP.items():
        sel = [g for g in games if any(matches(g, r) for r in rules)]
        used.update(g['id'] for g in sel)
        rows[genre] = sel
    rows[TREND] = [g for g in games
                   if (now - datetime.datetime.fromisoformat(g['created'].replace('Z', '+00:00'))).days <= TREND_DAYS]

    def summary(sel, official):
        top = sorted(sel, key=lambda g: -g['playing'])[:3]
        return {'ccu': sum(g['playing'] for g in sel), 'games': len(sel), 'official': official,
                'top': [[clean(g['name']), g['playing'], g['rootPlaceId']] for g in top]}

    out = {genre: summary(rows[genre], ', '.join(label(*r) for r in MAP[genre])) for genre in MAP}
    out[TREND] = summary(rows[TREND], f'отдельного жанра нет — это игры младше {TREND_DAYS} дней')
    other = collections.Counter()
    for g in games:
        if g['id'] not in used:
            other[g.get('genre_l1') or 'Без жанра'] += g['playing']

    data = {
        'date': now.strftime('%Y-%m-%d %H:%M UTC'),
        'sampleGames': len(games),
        'sampleCcu': sum(g['playing'] for g in games),
        'rows': out,
        'other': other.most_common(),
    }
    with open('content/genre-stats.js', 'w', encoding='utf-8') as f:
        f.write('// Сгенерировано scripts/genre_stats.py — не редактировать вручную.\n')
        f.write('COURSE.genreStats = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    print(f"{len(games)} игр, {data['sampleCcu']:,} онлайн, снимок {data['date']}")
    for genre, r in sorted(out.items(), key=lambda kv: -kv[1]['ccu']):
        print(f"{r['ccu']:>10,}  {r['games']:>4}  {genre}")


if __name__ == '__main__':
    main()
