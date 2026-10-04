# 天机一线

《天机一线》浏览器公开试玩仓库。

<!-- AUTO_RELEASE_START -->
## 当前公开版本

- 游戏版本：**v0.3.68**
- 公开试玩：https://aughost1983.github.io/tianji-yixian/
- 发布包：`tianji-yixian-v0.3.68-web.zip`
<!-- AUTO_RELEASE_END -->

## 运行与存档

- 运行方式：纯浏览器 HTML/CSS/JavaScript
- 存档位置：浏览器 `localStorage`
- 访问者：无需 GitHub 账号
- 对外网址保持不变；不同发布版本的 JS/CSS/图片/音频放在独立的 `releases/vX.Y.Z/` 目录中，避免版本间资源缓存混用。
- 同一浏览器、同一站点 origin 下的 `localStorage` 继续共用，因此正常升版不会因为资源目录变化而自动丢档。

## 自动部署

上传符合以下格式的网页发布包到 `main` 根目录：

```
tianji-yixian-vX.Y.Z-web.zip
```

GitHub Actions 会自动：

1. 从仓库中的发布 ZIP 里选择版本号最高的一版；
2. 解压到 `gh-pages/releases/vX.Y.Z/`；
3. 更新根目录 `release.json` 指向最新公开版本；
4. 保留最近 3 个完整发布版本的静态资源；
5. 更新本 README 的“当前公开版本”信息；
6. 推送 `gh-pages`，由 GitHub Pages 发布。

GitHub Pages 的发布源保持为 **Deploy from a branch → gh-pages → /(root)**。
