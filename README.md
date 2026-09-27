# 句间 · Sentence Garden

一个练习英语句子、逐步脱离提示完成默写的个人网站。

**在线使用：[打开句间](https://aha-moment-art.github.io/sentence-garden/)**

## 使用

- 首页可以直接练习五句示例；点击“导入我的句子”，每行粘贴一句英文。可用 Tab 分隔英文与中文，也可以导入后逐句编辑。
- 每组最多五句，依次完成跟打、关键词填空和整句默写。按 Enter 核对，通过后再按 Enter 进入下一句。
- 使用提示、默写时听朗读或提交过错误答案的句子，会在本轮末尾额外练一次。独立完成的复习依次间隔 1、3、7 天；未独立完成的句子保持待复习。
- 设置可打开严格匹配、击键音和朗读速度。宽松匹配忽略大小写、标点和重复空格，不接受调换单词顺序。
- “导出记录”包含句库、复习记录、练习位置和已导入音频。恢复前会预览并要求确认替换。

## 四个项目的句库

点击“项目句库”，选择项目、分类，再选每组 5 条开始。支持搜索、分页、指定组号，以及直接默写。练过的条目才保存到当前浏览器；不会自动覆盖原来的句库或复习记录。

| 项目 | 句子条目 | 词条 | 内容 |
|---|---:|---:|---|
| British Ear | 676 | — | ARU 与两组议会视频逐句原声 |
| WordLeap | 35,478 | 33,783 | 七套词库、自定义例句及内置示例 |
| BritSpeak | 6 | — | 真人录音与中英对照 |
| Level Up | 2,300 | 2,300 | 46 天卡片、词条英美音、92 段每日听力 |

计数保留跨词库、跨日期的重复内容。Level Up **例句没有独立配音**，单词发音与每日整段听力分开呈现；WordLeap 87 条内置示例也没有独立句子录音。其他原有录音按原文件对应关系接入。

分类 JSON 按需加载，音频使用 GitHub 固定提交版本的原文件（需联网）。已有录音播放不消耗 ElevenLabs 生成额度。记录导出保留原音频链接，用户自行导入的音频包仍随记录导出。编辑英文后不再使用不匹配的旧录音。

来源版本与计数见 `public/library/index.json`，许可见 `public/library/NOTICE.txt`。导入脚本 `scripts/import-projects.mjs` 从各项目固定版本的数据快照生成目录，并逐个检查所有音频路径存在于原 Git 文件树。

复现公开数据（Node 22+ 与 GitHub CLI）：

```sh
node scripts/fetch-projects.mjs /absolute/path/outside-repo/source-snapshots
node scripts/import-projects.mjs /absolute/path/outside-repo/source-snapshots
```

## 自己的 ElevenLabs 音频

示例的五句 MP3 已由 ElevenLabs George 英式英语生成，使用 `eleven_multilingual_v2`。播放现成音频不会调用生成接口。自己的句子可通过音频包导入；没有配音时明确显示“设备朗读”，使用设备可用的英语语音。

生成自己的音频包：

1. 在网页导出句库记录，保存为 JSON。
2. 在本机终端环境设置 `ELEVENLABS_API_KEY`，使用 Node.js 22.18+ 运行：

   ```sh
   node scripts/generate-audio.mjs --input /absolute/path/records.json --output /absolute/path/audio-pack.json
   ```

3. 网页“我的句库 → 导入音频包”，预览匹配数量并确认。按完整英文及标点匹配。

脚本只在本机读取 key，逐句生成并缓存已完成结果；重复运行同一个输出文件会复用已生成的句子。更换文本会产生新的生成用量。默认语音是 George。服务若拒绝请求，脚本停止并显示错误，不自动重复计费。

**不要把 key 放入源码、GitHub 仓库或任何 `VITE_` 环境变量。** 私人导出记录和音频包也应保存在仓库之外。浏览器播放已有音频，不接收 ElevenLabs key。

音频包格式（版本 1）：

```json
{
  "format": "sentence-garden-audio",
  "version": 1,
  "voice": "George · British English",
  "clips": [{"text": "Your sentence.", "audio": "data:audio/mpeg;base64,..."}]
}
```

## 本地开发与验证

```sh
npm ci
npm run dev
npm test
npm run build
npm run test:e2e
```

浏览器测试使用本机 Google Chrome；覆盖导入、完整三阶段、提示与错句重试、严格模式、编辑删除、刷新恢复、导出迁移、无语音兼容和响应式布局。Playwright 产物放到仓库以外的 `../../work/test-results`。

## 发布与数据

推送 `main` 后，GitHub Actions 执行测试、构建并发布到 GitHub Pages。Vite 使用相对资源路径，可部署在项目子路径。

学习数据保存在当前浏览器 IndexedDB。音频使用独立储存区，输入时不会反复写入整套音频。无账号、无云同步；清除网站数据、更换浏览器或网址会使原记录不可用，请先导出。

个人句库上限 1,000 组 / 100,000 条，单句英文上限 600 字符；单个导入文件不超过 100 MB，已导入音频总大小不超过 90 MB。公开仓库包含代码、原创示例与上述公开项目素材目录；没有个人学习记录、账户 token 或 API key。
