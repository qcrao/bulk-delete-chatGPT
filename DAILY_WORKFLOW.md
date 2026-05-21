# 日常维护流程

这个项目现在是“一套共享代码，同时打包 Chrome 和 Firefox”。大多数代码只需要改一次，然后分别生成两个浏览器的扩展包。

## 1. 日常改代码

如果 ChatGPT 官方网页改版，通常需要改的是共享源码，例如：

```text
config.js
checkboxManager.js
domHandler.js
conversationHandler.js
addCheckboxes.js
bulkDeleteConversations.js
bulkArchiveConversations.js
popup.js
background.js
```

这些文件会同时进入 Chrome 包和 Firefox 包。也就是说，普通 DOM selector、按钮点击、批量删除/归档逻辑的修复，一般不需要单独再改一份 Firefox 代码。

## 2. Manifest 文件怎么维护

Chrome 使用：

```text
manifest.json
```

Firefox 使用：

```text
manifest.firefox.json
```

如果你改了 `manifest.json` 里的这些字段，需要检查 `manifest.firefox.json` 是否也要同步：

```text
version
name
description
icons
action/default_popup
content_scripts/js
content_scripts/matches
```

需要保留的浏览器差异：

```text
Chrome:  background.service_worker, identity, identity.email
Firefox: background.scripts, storage, browser_specific_settings.gecko
```

## 3. 本地测试 Chrome

打开 Chrome：

```text
chrome://extensions/
```

然后：

1. 打开 Developer mode / 开发者模式。
2. 点击 Load unpacked / 加载已解压的扩展程序。
3. 选择项目根目录：

```text
/Users/qcrao/bulk-delete-chatGPT
```

4. 每次改完代码后，在 `chrome://extensions/` 里重新加载扩展。
5. 到这里测试：

```text
https://chatgpt.com
```

## 4. 本地测试 Firefox

先生成 Firefox 测试目录：

```bash
scripts/build-firefox.sh
```

打开 Firefox，地址栏输入：

```text
about:debugging#/runtime/this-firefox
```

然后：

1. 点击 Load Temporary Add-on... / 临时加载附加组件...
2. 选择：

```text
/Users/qcrao/bulk-delete-chatGPT/dist/firefox/manifest.json
```

3. 到这里测试：

```text
https://chatgpt.com
```

注意：Firefox 的临时扩展在重启 Firefox 后会失效，需要重新加载。

## 5. 同时打包 Chrome 和 Firefox

运行：

```bash
scripts/package-extensions.sh
```

它会生成：

```text
dist/chrome/
dist/firefox/
dist/packages/chatgpt-bulk-delete-chrome-v<version>.zip
dist/packages/chatgpt-bulk-delete-firefox-v<version>.zip
```

上传商店时使用：

```text
Chrome Web Store:
dist/packages/chatgpt-bulk-delete-chrome-v<version>.zip

Firefox Add-ons:
dist/packages/chatgpt-bulk-delete-firefox-v<version>.zip
```

## 6. 上传前验证

运行：

```bash
npx --yes web-ext lint --source-dir dist/firefox --self-hosted
node --check background.js
node --check popup.js
```

Firefox lint 期望结果：

```text
errors: 0
warnings: 0
```

## 7. 发新版本 Checklist

发布新版本前：

1. 同步更新两个 manifest 的 `version`：

```text
manifest.json
manifest.firefox.json
```

2. 同时打包两个浏览器：

```bash
scripts/package-extensions.sh
```

3. 验证 Firefox 包：

```bash
npx --yes web-ext lint --source-dir dist/firefox --self-hosted
```

4. 上传 `dist/packages/` 里的两个 zip：

```text
dist/packages/chatgpt-bulk-delete-chrome-v<version>.zip
dist/packages/chatgpt-bulk-delete-firefox-v<version>.zip
```

## 8. 常用命令

同时打包 Chrome 和 Firefox：

```bash
scripts/package-extensions.sh
```

只生成 Firefox 本地测试目录：

```bash
scripts/build-firefox.sh
```

验证 Firefox 包：

```bash
npx --yes web-ext lint --source-dir dist/firefox --self-hosted
```

检查 JavaScript 语法：

```bash
node --check background.js
node --check popup.js
```

清理生成目录：

```bash
rm -rf dist
```

## 9. 让 Codex 帮忙打包

这个仓库里有本地 skill：

```text
.agents/skills/extension-release-packaging/SKILL.md
```

以后可以直接说：

```text
打包
```

Codex 应该会执行本地打包流程，生成 Chrome 和 Firefox 两个 zip，并验证 Firefox 包。
