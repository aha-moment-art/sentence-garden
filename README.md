# 句间 · Sentence Garden

一个练习英语句子、逐步脱离提示完成默写的个人网站。

**在线使用：[打开句间](https://aha-moment-art.github.io/sentence-garden/)**

## 使用

- 首页可以直接练习五句示例；点击“导入我的句子”，每行粘贴一句英文。可用 Tab 分隔英文与中文，也可以导入后逐句编辑。
- 每组最多五句，依次完成跟打、关键词填空和整句默写。按 Enter 核对，通过后再按 Enter 进入下一句。
- 使用提示、默写时听朗读或提交过错误答案的句子，会在本轮末尾额外练一次。独立完成的复习依次间隔 1、3、7 天；未独立完成的句子保持待复习。
- 设置可打开严格匹配、击键音和朗读速度。宽松匹配忽略大小写、标点和重复空格，不接受调换单词顺序。
- “导出记录”包含句库、复习记录、练习位置和已导入音频。恢复前会预览并要求确认替换。

## ElevenLabs 音频

示例的五句 MP3 已由 ElevenLabs George 英式英语生成，使用 `eleven_multilingual_v2`。播放现成音频不会调用生成接口。自己的句子可通过音频包导入；没有配音时明确显示“设备朗读”，使用设备可用的英语语音。

生成自己的音频包：

1. 在网页导出句库记录，保存为 JSON。
2. 在本机终端环境设置 `ELEVENLABS_API_KEY`，使用 Node.js 22.18+ 运行：

   ```sh
   node scripts/generate-audio.mjs --input /absolute/path/records.json --output /absolute/path/audio-pack.json
   ```

3. 网页“我的句库 → 导入音频包”，预览匹配数量并确认。按完整英文及标点匹配。

脚本只在本机读取 key，逐句生成并缓存已完成结果；重复运行同一个输出文件会复用已生成的句子。更换文本会产生新的生成用量。默认语音是官方 quickstart 使用的 George。服务若拒绝请求，脚本停止并显示错误，不自动重复计费。

**不要把 key 放入源码、GitHub 仓库或任何 `VITE_` 环境变量。** 私人导出记录和音频包也应保存在仓库之外。浏览器仅播放内置音频或导入音频，不接收 ElevenLabs key。

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

句库上限 500 组 / 10,000 句，单句英文上限 600 字符；单个导入文件不超过 100 MB，已导入音频总大小不超过 90 MB。公开仓库只有代码、原创示例和示例音频。没有个人学习记录、账户 token 或 API key。
