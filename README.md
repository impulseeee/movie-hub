# 🎬 MovieHub · 全网影视聚合

纯前端静态网站，无需后端和数据库，打开就能用。

## 功能

| 功能 | 说明 | 需要 Key |
|---|---|---|
| 🌐 全网平台直达 | 一次搜索，一键跳转腾讯视频/爱奇艺/优酷/芒果/B站/西瓜/Netflix/Prime/Apple TV/YouTube/豆瓣/JustWatch | ❌ |
| 🆓 免费片库 | Internet Archive 公有领域电影、动画、老剧，**站内直接在线播放** | ❌ |
| 🔥 发现 | 本周热门、热门电影/剧集、正在热映、高分榜、动画、国产剧、韩剧、日漫 | ✅ TMDB |
| 🎞️ 详情 | 简介、评分、导演、演员、预告片 | ✅ TMDB |
| 📺 在哪看 | 按地区展示该片在哪些正版平台可订阅/免费/租/买（JustWatch 数据） | ✅ TMDB |
| ♥ 收藏 | 保存在浏览器本地 | ❌ |

## 本地运行

```bash
cd movie-hub
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

（也可以直接双击 `index.html` 打开。）

## 配置 TMDB Key（免费，约 1 分钟）

1. 注册 https://www.themoviedb.org/signup
2. 进入 https://www.themoviedb.org/settings/api 申请 Developer Key
3. 在网站「设置」页粘贴「API 密钥」或「API 读取访问令牌」→ 保存

## 部署成公网网站（任选其一，均免费）

- **Netlify Drop**：打开 https://app.netlify.com/drop ，把 `movie-hub` 文件夹拖进去，立刻得到网址。
- **Vercel**：`npx vercel movie-hub`
- **Cloudflare Pages / GitHub Pages**：上传本目录即可，无需构建命令。

## 国内网络无法访问 TMDB？部署一个代理（Cloudflare Worker）

在 Cloudflare 控制台 → Workers → 新建，粘贴以下代码并部署：

```js
export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const u = new URL(req.url);
    const host = u.pathname.startsWith('/t/p/') ? 'https://image.tmdb.org' : 'https://api.themoviedb.org';
    const r = await fetch(host + u.pathname + u.search, {
      headers: { Authorization: req.headers.get('Authorization') || '', Accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    const res = new Response(r.body, r);
    Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  },
};
```

然后在网站「设置」里填：
- TMDB API 地址：`https://你的worker域名/3`
- TMDB 图片地址：`https://你的worker域名/t/p`

> `*.workers.dev` 在部分地区也可能访问不了，可以绑定一个自己的域名。

## 文件结构

```
movie-hub/
├── index.html   页面结构
├── style.css    样式（深色主题，适配手机）
└── app.js       全部逻辑（路由、数据源、详情、收藏、设置）
```

## 说明

本站不存储、不转载任何视频文件。站内播放的仅限 Internet Archive 公有领域/开放授权内容；其余影视通过正版平台跳转观看。
