# 燕园 · 北京大学校内 POI

以「点」的方式展示北京大学校内地点的一页式静态站点。52 处点位分七个大类：校门、湖山、楼台、院系、食堂、场馆、纪念。

线上：<https://kinghihido.github.io/yanyuan-poi/>

## 先说清楚

这里是**纯静态站点**，没有后端、没有构建步骤、没有数据库。全部内容就在仓库里：

```
index.html            单页结构
assets/poi.js         点位数据 + 地图逻辑
assets/mapkey.js      地图密钥（可选，见下）
poi-coords.json       固化坐标（可选，见下）
```

## 地图与密钥

底图用**腾讯地图 JavaScript GL**（GCJ-02 坐标系），符合国内地图服务合规要求。加载方式有两套，页面会自动判断：

**本地预览** — `assets/mapkey.js` 保持占位符不动，页面走密钥代理通道，前端不落任何密钥。

**公网部署** — 代理不可用，需要自己的 key：

1. 到 <https://lbs.qq.com/dev/console/application/mine> 申请 key
2. 勾选「JavaScript GL」和「WebService API」
3. 域名白名单填 `kinghihido.github.io`
4. 打开 `assets/mapkey.js`，把占位符整段替换成你的 key

没配 key 时页面**不会白屏**：地图区域会给出提示，右侧「点录」列表照常可读。

## 坐标从哪来

仓库里**不写死坐标**，只存名称、分类、检索词和简介。运行时按这个顺序取坐标：

1. `poi-coords.json` 里的固化数据（有则直接用）
2. 浏览器 `localStorage` 上一轮的缓存
3. 都没有 → 调用腾讯地图地点检索（`TMap.service.Suggestion`，关键词限定在北大中心点附近），解析结果写回缓存

首次访问会解析 52 个点位（并发 3，带进度提示），之后走缓存，秒开。

想把坐标固化进仓库的话，浏览器控制台里跑一句，把输出粘进 `poi-coords.json`：

```js
copy(JSON.stringify(JSON.parse(localStorage.getItem("yy.poi.geo.v1")), null, 2))
```

## 视觉

沿用「雾里楼台」的墨绿纸感：WebGL2 流体墨染水面过渡页、时辰、随机诗签、落花、盖印。纸色 `#e9eee8`，墨色 `#1b2b2a`，松绿 `#2f4a45`。

## 本地预览

直接起个静态服务即可（不要用 `file://` 打开，`fetch` 会被拦）：

```bash
python -m http.server 8000
```

## 相关

- 总台：<https://github.com/kinghihido/jidacheng>
- 学海无涯（文献精读）：<https://github.com/kinghihido/paper-reading>
- 层林尽染（技术流）：<https://github.com/kinghihido/wuli-loutai>
