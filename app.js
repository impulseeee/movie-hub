'use strict';
/* MovieHub · 全网影视聚合 —— 纯前端，无需后端 */

// ==================== 配置 ====================
const DEFAULTS = {
  tmdbKey: '',
  tmdbBase: 'https://api.themoviedb.org/3',
  imgBase: 'https://image.tmdb.org/t/p',
  region: 'CN',
  lang: 'zh-CN',
};

// 全网正版平台直达搜索（无需任何 Key）
const PLATFORMS = [
  ['腾讯视频', q => `https://v.qq.com/x/search/?q=${q}`],
  ['爱奇艺', q => `https://so.iqiyi.com/so/q_${q}`],
  ['优酷', q => `https://so.youku.com/search_video/q_${q}`],
  ['芒果TV', q => `https://so.mgtv.com/so?k=${q}`],
  ['哔哩哔哩', q => `https://search.bilibili.com/all?keyword=${q}`],
  ['西瓜视频', q => `https://www.ixigua.com/search/${q}`],
  ['Netflix', q => `https://www.netflix.com/search?q=${q}`],
  ['Prime Video', q => `https://www.primevideo.com/search/?phrase=${q}`],
  ['Apple TV', q => `https://tv.apple.com/search?term=${q}`],
  ['YouTube', q => `https://www.youtube.com/results?search_query=${q}`],
  ['豆瓣电影', q => `https://search.douban.com/movie/subject_search?search_text=${q}`],
  ['JustWatch', q => `https://www.justwatch.com/cn/search?q=${q}`],
];

const CATS = {
  trending:  ['本周热门', '/trending/all/week'],
  movie_pop: ['热门电影', '/movie/popular', 'movie'],
  tv_pop:    ['热门剧集', '/tv/popular', 'tv'],
  now:       ['正在热映', '/movie/now_playing', 'movie'],
  movie_top: ['高分电影', '/movie/top_rated', 'movie'],
  tv_top:    ['高分剧集', '/tv/top_rated', 'tv'],
  anime:     ['动画', '/discover/tv', 'tv', { with_genres: 16, sort_by: 'popularity.desc' }],
  cn_tv:     ['国产剧', '/discover/tv', 'tv', { with_origin_country: 'CN', sort_by: 'popularity.desc' }],
  kr_tv:     ['韩剧', '/discover/tv', 'tv', { with_origin_country: 'KR', sort_by: 'popularity.desc' }],
  jp_anime:  ['日漫', '/discover/tv', 'tv', { with_origin_country: 'JP', with_genres: 16, sort_by: 'popularity.desc' }],
};

// Internet Archive 公有领域馆藏（可合法免费在线观看）
const IA_COLS = [
  ['feature_films', '经典电影'],
  ['Film_Noir', '黑色电影'],
  ['SciFi_Horror', '科幻恐怖'],
  ['silent_films', '默片'],
  ['animationandcartoons', '动画短片'],
  ['classic_tv', '经典电视'],
];

const REGIONS = [
  ['CN', '中国大陆'], ['HK', '中国香港'], ['TW', '中国台湾'], ['US', '美国'], ['JP', '日本'],
  ['KR', '韩国'], ['GB', '英国'], ['SG', '新加坡'], ['CA', '加拿大'], ['AU', '澳大利亚'],
];

const HOT_WORDS = ['流浪地球', '繁花', '奥本海默', '沙丘', '庆余年', '黑神话', '进击的巨人', '星际穿越'];

// ==================== 状态 & 工具 ====================
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const state = {
  settings: { ...DEFAULTS, ...LS.get('mh_settings', {}) },
  favs: LS.get('mh_favs', []),
  items: new Map(),
  tok: 0,
  modalTok: 0,
  route: '',
  discover: { cat: 'trending', page: 1 },
  archive: { col: 'feature_films', q: '', page: 1 },
  providers: {},
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = s => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const hasKey = () => !!state.settings.tmdbKey.trim();
const img = (size, p) => (p ? `${state.settings.imgBase.replace(/\/$/, '')}/${size}${p}` : '');
const loading = () => '<div class="loading"></div>';
const empty = msg => `<div class="empty">${esc(msg)}</div>`;
const errBox = e => `<div class="error">加载失败：${esc(e.message || e)}。${
  /TMDB|Failed to fetch|NetworkError/i.test(e.message || '') ? '请检查 API Key 或网络（国内网络可在“设置”中配置代理地址）。' : ''}</div>`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ==================== 数据源 ====================
async function tmdb(path, params = {}) {
  const s = state.settings;
  const key = s.tmdbKey.trim();
  if (!key) throw new Error('未配置 TMDB API Key');
  const url = new URL(s.tmdbBase.replace(/\/$/, '') + path);
  url.searchParams.set('language', s.lang);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key; // v4 读取令牌
  else url.searchParams.set('api_key', key);                             // v3 API 密钥
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`TMDB ${r.status}${r.status === 401 ? '（API Key 无效）' : ''}`);
  return r.json();
}

function normTmdb(r, type) {
  const mt = r.media_type || type;
  return {
    key: `tmdb:${mt}:${r.id}`, src: 'tmdb', id: r.id, mt,
    title: r.title || r.name || '未知',
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
    rating: r.vote_average ? r.vote_average.toFixed(1) : '',
    poster: img('w342', r.poster_path),
  };
}

async function iaSearch({ q = '', col = '', page = 1, rows = 24 }) {
  const cols = col || IA_COLS.map(c => c[0]).join(' OR ');
  let query = `mediatype:(movies) AND collection:(${cols})`;
  const kw = q.replace(/[()"':\\[\]{}^~*?!]/g, ' ').trim();
  if (kw) query += ` AND (title:(${kw}) OR subject:(${kw}))`;
  const u = new URL('https://archive.org/advancedsearch.php');
  u.searchParams.set('q', query);
  ['identifier', 'title', 'year', 'description'].forEach(f => u.searchParams.append('fl[]', f));
  u.searchParams.append('sort[]', 'downloads desc');
  u.searchParams.set('rows', rows);
  u.searchParams.set('page', page);
  u.searchParams.set('output', 'json');
  const r = await fetch(u);
  if (!r.ok) throw new Error('Internet Archive ' + r.status);
  const d = await r.json();
  return { items: d.response.docs.map(normIa), total: d.response.numFound };
}

function normIa(d) {
  const desc = Array.isArray(d.description) ? d.description[0] : d.description;
  return {
    key: `ia:${d.identifier}`, src: 'ia', id: d.identifier, mt: 'free',
    title: Array.isArray(d.title) ? d.title[0] : d.title || d.identifier,
    year: String(d.year || '').slice(0, 4), rating: '',
    poster: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
    overview: strip(desc),
  };
}

// ==================== 组件 ====================
const isFav = key => state.favs.some(f => f.key === key);

function card(it) {
  state.items.set(it.key, it);
  const fav = isFav(it.key);
  const badge = { movie: '电影', tv: '剧集', free: '免费看' }[it.mt] || '';
  return `<div class="card" data-key="${esc(it.key)}">
    <div class="poster">
      ${it.poster ? `<img loading="lazy" src="${esc(it.poster)}" alt="" onerror="this.remove()">` : ''}
      <span class="ph">${esc(it.title)}</span>
      ${badge ? `<span class="badge">${badge}</span>` : ''}
      ${it.rating ? `<span class="score">★ ${it.rating}</span>` : ''}
      <button class="fav ${fav ? 'on' : ''}" data-fav="${esc(it.key)}" title="收藏">${fav ? '♥' : '♡'}</button>
    </div>
    <div class="meta"><div class="t" title="${esc(it.title)}">${esc(it.title)}</div><div class="y">${esc(it.year) || '&nbsp;'}</div></div>
  </div>`;
}
const grid = items => `<div class="grid">${items.map(card).join('')}</div>`;

function platformLinks(title) {
  const q = encodeURIComponent(title);
  return `<div class="platforms">${PLATFORMS.map(([n, f]) =>
    `<a href="${esc(f(q))}" target="_blank" rel="noopener">${n} ↗</a>`).join('')}</div>`;
}

function noKeyNotice(compact) {
  return `<div class="notice">
    <h3>🔑 配置 TMDB API Key 解锁影视资料库</h3>
    <p>${compact ? '影视详情、评分、演员、正版观看渠道需要免费的 TMDB Key（约 1 分钟申请）。'
      : '热门榜单、影视详情、评分、演员、预告片和“在哪看”正版渠道数据都来自 TMDB，需要一个免费的 API Key（约 1 分钟申请）。<br>未配置时仍可使用：顶部搜索的「全网平台直达」以及「免费片库」在线观看。'}</p>
    <div class="row"><a class="btn" href="#/settings">去配置</a><a class="btn ghost" href="#/archive">先看免费片库</a></div>
  </div>`;
}

// ==================== 页面：发现 ====================
async function renderDiscover(append = false) {
  const d = state.discover;
  const tok = state.tok;
  if (!append) {
    d.page = 1;
    view.innerHTML = `
      <section class="hero">
        <h1>一次搜索，聚合全网影视</h1>
        <p>影视资料 · 评分演员 · 正版平台在哪看 · 十余家视频平台直达 · 公版电影免费在线看</p>
        <div class="hot">热搜：${HOT_WORDS.map(w => `<a href="#/search/${encodeURIComponent(w)}">${w}</a>`).join('')}</div>
      </section>
      ${hasKey() ? `<div class="chips">${Object.entries(CATS).map(([k, [n]]) =>
        `<button data-cat="${k}" class="${k === d.cat ? 'active' : ''}">${n}</button>`).join('')}</div>` : ''}
      <div id="list">${hasKey() ? loading() : noKeyNotice()}</div>
      <div class="more-wrap"><button id="moreBtn" class="btn ghost hidden" data-more="discover">加载更多</button></div>`;
  }
  if (!hasKey()) return;
  const [, path, type, extra = {}] = CATS[d.cat];
  const list = $('#list');
  try {
    const data = await tmdb(path, { page: d.page, ...extra });
    if (tok !== state.tok) return;
    const items = data.results.filter(r => (r.media_type || type) !== 'person').map(r => normTmdb(r, type));
    const g = $('.grid', list);
    if (append && g) g.insertAdjacentHTML('beforeend', items.map(card).join(''));
    else list.innerHTML = items.length ? grid(items) : empty('暂无内容');
    $('#moreBtn').classList.toggle('hidden', d.page >= Math.min(data.total_pages, 500));
  } catch (e) {
    if (tok === state.tok) list.innerHTML = errBox(e);
  }
}

// ==================== 页面：搜索 ====================
function renderSearch(q) {
  const tok = state.tok;
  $('#q').value = q;
  document.title = `${q} - MovieHub`;
  view.innerHTML = `
    <h2 class="sec">“${esc(q)}” 的聚合搜索结果</h2>
    <div class="panel"><div class="panel-h">🌐 全网平台直达（点击直接在对应平台搜索）</div>${platformLinks(q)}</div>
    <h3 class="sec">🎞️ 影视资料 <small>TMDB · 点击查看详情与正版观看渠道</small></h3>
    <div id="tmdbRes">${hasKey() ? loading() : noKeyNotice(true)}</div>
    <h3 class="sec">🆓 可免费在线观看 <small>Internet Archive 公有领域片库（英文片名匹配更佳）</small></h3>
    <div id="iaRes">${loading()}</div>`;

  if (hasKey()) {
    tmdb('/search/multi', { query: q, include_adult: false })
      .then(d => {
        if (tok !== state.tok) return;
        const items = d.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(r => normTmdb(r));
        $('#tmdbRes').innerHTML = items.length ? grid(items) : empty('没有找到相关影视');
      })
      .catch(e => { if (tok === state.tok) $('#tmdbRes').innerHTML = errBox(e); });
  }
  iaSearch({ q, rows: 12 })
    .then(r => { if (tok === state.tok) $('#iaRes').innerHTML = r.items.length ? grid(r.items) : empty('公版片库中没有匹配的影片'); })
    .catch(e => { if (tok === state.tok) $('#iaRes').innerHTML = errBox(e); });
}

// ==================== 页面：免费片库 ====================
async function renderArchive(append = false) {
  const a = state.archive;
  const tok = state.tok;
  if (!append) {
    a.page = 1;
    view.innerHTML = `
      <section class="hero">
        <h1>🆓 免费片库</h1>
        <p>来自 Internet Archive 的公有领域 / 开放授权影视，数万部经典电影、动画、老电视剧，可直接在线播放与下载，完全合法免费。</p>
      </section>
      <div class="chips">${IA_COLS.map(([k, n]) => `<button data-col="${k}" class="${k === a.col ? 'active' : ''}">${n}</button>`).join('')}</div>
      <form id="iaForm" class="search" style="max-width:420px;margin-bottom:18px">
        <input id="iaQ" type="search" placeholder="在当前分类中搜索（英文）…" value="${esc(a.q)}">
        <button type="submit">筛选</button>
      </form>
      <div id="list">${loading()}</div>
      <div class="more-wrap"><button id="moreBtn" class="btn ghost hidden" data-more="archive">加载更多</button></div>`;
  }
  const list = $('#list');
  try {
    const r = await iaSearch({ q: a.q, col: a.col, page: a.page });
    if (tok !== state.tok) return;
    const g = $('.grid', list);
    if (append && g) g.insertAdjacentHTML('beforeend', r.items.map(card).join(''));
    else list.innerHTML = r.items.length ? grid(r.items) : empty('没有找到影片');
    $('#moreBtn').classList.toggle('hidden', a.page * 24 >= r.total);
  } catch (e) {
    if (tok === state.tok) list.innerHTML = errBox(e);
  }
}

// ==================== 页面：收藏 ====================
function renderFavs() {
  view.innerHTML = `<h2 class="sec">♥ 我的收藏 <small>${state.favs.length} 部 · 保存在本浏览器</small></h2>
    ${state.favs.length ? grid(state.favs) : empty('还没有收藏，点击海报右上角的 ♡ 即可收藏')}`;
}

// ==================== 页面：设置 ====================
function renderSettings() {
  const s = state.settings;
  const opt = (list, cur) => list.map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`).join('');
  view.innerHTML = `<div class="settings">
    <h2 class="sec">⚙️ 设置</h2>
    <div class="panel guide" style="margin-bottom:20px">
      <div class="panel-h">如何免费获取 TMDB API Key？</div>
      <ol>
        <li>打开 <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a> 注册并登录账号</li>
        <li>进入 <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">设置 → API</a>，申请 Developer（个人用途）</li>
        <li>复制「API 密钥」或「API 读取访问令牌」粘贴到下方，保存即可</li>
      </ol>
    </div>
    <form id="setForm">
      <div class="field"><label>TMDB API Key / 读取访问令牌</label>
        <input name="tmdbKey" type="password" value="${esc(s.tmdbKey)}" placeholder="粘贴 v3 API Key 或 v4 Token（eyJ 开头）">
        <div class="hint">仅保存在你的浏览器 localStorage 中，不会上传到任何服务器。</div></div>
      <div class="field"><label>TMDB API 地址</label>
        <input name="tmdbBase" value="${esc(s.tmdbBase)}">
        <div class="hint">国内网络若无法访问，可部署 README 中的 Cloudflare Worker 代理，填 <code>https://你的域名/3</code></div></div>
      <div class="field"><label>TMDB 图片地址</label>
        <input name="imgBase" value="${esc(s.imgBase)}">
        <div class="hint">使用代理时填 <code>https://你的域名/t/p</code></div></div>
      <div class="field"><label>默认“在哪看”地区</label><select name="region">${opt(REGIONS, s.region)}</select></div>
      <div class="field"><label>资料语言</label>
        <select name="lang">${opt([['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en-US', 'English'], ['ja-JP', '日本語']], s.lang)}</select></div>
      <div class="d-actions">
        <button class="btn" type="submit">保存</button>
        <button class="btn ghost" type="button" data-action="test">测试连接</button>
        <button class="btn ghost" type="button" data-action="reset">恢复默认地址</button>
      </div>
    </form>
  </div>`;
}

function readSettingsForm() {
  const f = new FormData($('#setForm'));
  const s = { ...state.settings };
  for (const [k, v] of f.entries()) s[k] = String(v).trim();
  s.tmdbBase ||= DEFAULTS.tmdbBase;
  s.imgBase ||= DEFAULTS.imgBase;
  return s;
}

// ==================== 详情弹窗 ====================
function openModal(html) {
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
  document.body.classList.add('lock');
}
function closeModal() {
  state.modalTok++;
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = ''; // 停止播放
  document.body.classList.remove('lock');
}
function openItem(it) {
  if (!it) return;
  it.src === 'ia' ? openIa(it) : openTmdb(it);
}

function renderProviders(region) {
  const r = state.providers[region];
  if (!r) return '<div class="empty small">该地区暂无正版平台收录数据，可切换地区，或使用下方「全网平台直达」搜索。</div>';
  const groups = [['flatrate', '会员/订阅'], ['free', '免费'], ['ads', '免费（含广告）'], ['rent', '租赁'], ['buy', '购买']];
  const rows = groups.filter(([k]) => r[k]?.length).map(([k, n]) => `<div class="prov-row"><span class="prov-label">${n}</span>${
    r[k].map(x => `<a class="prov" href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(x.provider_name)}">
      <img src="${esc(img('w92', x.logo_path))}" alt=""><span>${esc(x.provider_name)}</span></a>`).join('')}</div>`).join('');
  return rows + `<a class="link" href="${esc(r.link)}" target="_blank" rel="noopener">查看完整观看方式 →</a>`;
}

async function openTmdb(it) {
  openModal(loading());
  const tok = ++state.modalTok;
  try {
    const d = await tmdb(`/${it.mt}/${it.id}`, { append_to_response: 'credits,videos,watch/providers' });
    if (tok !== state.modalTok) return;
    let vids = d.videos?.results || [];
    if (!vids.some(v => v.site === 'YouTube')) {
      try { vids = (await tmdb(`/${it.mt}/${it.id}/videos`, { language: 'en-US' })).results; } catch {}
      if (tok !== state.modalTok) return;
    }
    const trailer = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer') || vids.find(v => v.site === 'YouTube');
    state.providers = d['watch/providers']?.results || {};
    const avail = Object.keys(state.providers);
    let region = state.settings.region;
    if (!state.providers[region] && avail.length) region = avail.includes('US') ? 'US' : avail[0];
    const regionList = [...REGIONS];
    avail.forEach(c => { if (!regionList.some(r => r[0] === c)) regionList.push([c, c]); });

    const title = d.title || d.name;
    const orig = d.original_title || d.original_name;
    const year = (d.release_date || d.first_air_date || '').slice(0, 4);
    const tags = [
      it.mt === 'movie' ? '电影' : '剧集', year,
      ...(d.genres || []).map(g => g.name),
      d.runtime ? `${d.runtime} 分钟` : '',
      d.number_of_seasons ? `${d.number_of_seasons} 季 / ${d.number_of_episodes} 集` : '',
      (d.production_countries || d.origin_country || []).map(c => c.name || c).slice(0, 2).join(' / '),
    ].filter(Boolean);
    const cast = (d.credits?.cast || []).slice(0, 14);
    const directors = (d.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name);
    const creators = (d.created_by || []).map(c => c.name);
    const people = it.mt === 'movie' ? directors : creators;
    const fav = isFav(it.key);
    // 让收藏能拿到最新数据
    state.items.set(it.key, { ...it, title, year, poster: img('w342', d.poster_path) || it.poster,
      rating: d.vote_average ? d.vote_average.toFixed(1) : it.rating });

    openModal(`<div class="detail">
      <div class="d-hero" style="--bd:url('${esc(img('w1280', d.backdrop_path))}')">
        <div class="d-head">
          ${d.poster_path ? `<img class="d-poster" src="${esc(img('w500', d.poster_path))}" alt="">` : '<div class="d-poster"></div>'}
          <div class="d-info">
            <h2>${esc(title)} ${orig && orig !== title ? `<small>${esc(orig)}</small>` : ''}</h2>
            <div class="d-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
            ${d.vote_average ? `<div class="d-score">★ ${d.vote_average.toFixed(1)}<span>${d.vote_count} 人评分 · TMDB</span></div>` : ''}
            ${people.length ? `<div class="note">${it.mt === 'movie' ? '导演' : '主创'}：${esc(people.join(' / '))}</div>` : ''}
            <p class="d-overview">${esc(d.overview || '暂无中文简介')}</p>
            <div class="d-actions">
              ${trailer ? `<button class="btn" data-trailer="${esc(trailer.key)}">▶ 播放预告片</button>` : ''}
              <button class="btn ghost" data-fav="${esc(it.key)}">${fav ? '♥ 已收藏' : '♡ 收藏'}</button>
              <a class="btn ghost" href="https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(title)}" target="_blank" rel="noopener">豆瓣评分 ↗</a>
              <a class="btn ghost" href="https://www.themoviedb.org/${it.mt}/${it.id}" target="_blank" rel="noopener">TMDB ↗</a>
            </div>
          </div>
        </div>
      </div>
      <div class="d-body">
        <div id="trailerBox"></div>
        <h3>📺 在哪看（正版平台）
          <select id="regionSel">${regionList.map(([c, n]) => `<option value="${c}" ${c === region ? 'selected' : ''}>${n}${state.providers[c] ? ' ✓' : ''}</option>`).join('')}</select>
        </h3>
        <div id="provBox">${renderProviders(region)}</div>
        <h3>🌐 全网平台直达</h3>
        ${platformLinks(title)}
        ${cast.length ? `<h3>👥 演员</h3><div class="cast">${cast.map(c => `<div>
          ${c.profile_path ? `<img loading="lazy" src="${esc(img('w185', c.profile_path))}" alt="">` : '<i></i>'}
          <b title="${esc(c.name)}">${esc(c.name)}</b><span title="${esc(c.character)}">${esc(c.character)}</span></div>`).join('')}</div>` : ''}
      </div>
    </div>`);
  } catch (e) {
    if (tok === state.modalTok) openModal(`<div class="d-body" style="padding-top:40px">${errBox(e)}</div>`);
  }
}

function openIa(it) {
  const id = encodeURIComponent(it.id);
  const fav = isFav(it.key);
  openModal(`<div class="detail"><div class="d-body" style="padding-top:22px">
    <h2 style="margin:0;padding-right:40px">${esc(it.title)} <small class="note">${esc(it.year)}</small></h2>
    <div class="player"><iframe src="https://archive.org/embed/${id}" allow="fullscreen; autoplay" allowfullscreen></iframe></div>
    <p class="d-overview">${esc(cut(it.overview || '暂无简介', 800))}</p>
    <div class="d-actions">
      <button class="btn ghost" data-fav="${esc(it.key)}">${fav ? '♥ 已收藏' : '♡ 收藏'}</button>
      <a class="btn ghost" href="https://archive.org/details/${id}" target="_blank" rel="noopener">在 Archive.org 打开 / 下载 ↗</a>
    </div>
    <p class="note">本片来自 Internet Archive 公有领域 / 开放授权馆藏，可合法免费观看与下载。</p>
  </div></div>`);
}

// ==================== 收藏 ====================
function toggleFav(key) {
  const i = state.favs.findIndex(f => f.key === key);
  if (i >= 0) {
    state.favs.splice(i, 1);
    toast('已取消收藏');
  } else {
    const it = state.items.get(key);
    if (!it) return;
    state.favs.unshift({ ...it });
    toast('已加入收藏');
  }
  LS.set('mh_favs', state.favs);
  const on = i < 0;
  $$('[data-fav]').filter(b => b.dataset.fav === key).forEach(b => {
    if (b.classList.contains('fav')) { b.classList.toggle('on', on); b.textContent = on ? '♥' : '♡'; }
    else b.textContent = on ? '♥ 已收藏' : '♡ 收藏';
  });
  if (state.route === 'favs') renderFavs();
}

// ==================== 路由 & 事件 ====================
function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'discover';
  const [name, ...rest] = hash.split('/');
  const arg = decodeURIComponent(rest.join('/'));
  state.tok++;
  state.route = name;
  closeModal();
  $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
  if (name !== 'search') { document.title = 'MovieHub · 全网影视聚合'; }
  window.scrollTo(0, 0);
  if (name === 'search' && arg) renderSearch(arg);
  else if (name === 'archive') renderArchive();
  else if (name === 'favs') renderFavs();
  else if (name === 'settings') renderSettings();
  else { state.route = 'discover'; renderDiscover(); }
}

window.addEventListener('hashchange', route);

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'searchForm') {
    const q = $('#q').value.trim();
    if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
  } else if (f.id === 'iaForm') {
    state.archive.q = $('#iaQ').value.trim();
    state.tok++;
    renderArchive();
  } else if (f.id === 'setForm') {
    state.settings = readSettingsForm();
    LS.set('mh_settings', state.settings);
    toast('设置已保存');
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'regionSel') $('#provBox').innerHTML = renderProviders(e.target.value);
});

document.addEventListener('click', async e => {
  const t = e.target;
  const favBtn = t.closest('[data-fav]');
  if (favBtn) { e.preventDefault(); e.stopPropagation(); toggleFav(favBtn.dataset.fav); return; }
  if (t.closest('[data-close]')) { closeModal(); return; }

  const tr = t.closest('[data-trailer]');
  if (tr) {
    $('#trailerBox').innerHTML = `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(tr.dataset.trailer)}?autoplay=1"
      allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>`;
    return;
  }
  const c = t.closest('.card');
  if (c) { openItem(state.items.get(c.dataset.key)); return; }

  const cat = t.closest('[data-cat]');
  if (cat) {
    state.discover.cat = cat.dataset.cat;
    $$('[data-cat]').forEach(b => b.classList.toggle('active', b === cat));
    state.tok++;
    $('#list').innerHTML = loading();
    $('#moreBtn').classList.add('hidden');
    state.discover.page = 1;
    renderDiscover(true).catch(() => {});
    return;
  }
  const col = t.closest('[data-col]');
  if (col) {
    state.archive.col = col.dataset.col;
    state.archive.q = '';
    state.tok++;
    renderArchive();
    return;
  }
  const more = t.closest('[data-more]');
  if (more) {
    more.classList.add('hidden');
    if (more.dataset.more === 'discover') { state.discover.page++; renderDiscover(true); }
    else { state.archive.page++; renderArchive(true); }
    return;
  }
  const act = t.closest('[data-action]');
  if (act?.dataset.action === 'reset') {
    $('[name=tmdbBase]').value = DEFAULTS.tmdbBase;
    $('[name=imgBase]').value = DEFAULTS.imgBase;
  } else if (act?.dataset.action === 'test') {
    const old = state.settings;
    state.settings = readSettingsForm();
    try {
      await tmdb('/configuration');
      toast('✅ 连接成功，记得点击保存');
    } catch (err) {
      toast('❌ ' + (err.message || '连接失败'));
    } finally {
      state.settings = old;
    }
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

route();
