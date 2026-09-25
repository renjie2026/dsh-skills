# dsh-skills

给 AI 助手用的 **DeepSeek Harness（DSH）插件与皮肤开发技能**（Agent Skills）。

两个技能都提炼自一个真实可用的 dsh 插件 —— [dsh-theme-gallery](https://github.com/renjie2026/dsh-theme-gallery)（桌面版主题皮肤画廊）的开发过程。它们记录的不是通用最佳实践，而是**真实踩过的坑**：每一类故障都附当时的报错原文、根因与修法，以及把同类错误固化成自动检查的方法。

| 技能 | 内容 | 什么时候用 |
|---|---|---|
| [`dsh-plugin-author`](dsh-plugin-author/SKILL.md) | dsh 插件全流程：`package.json` 三声明、宿主/浏览器半侧、Cordis 服务注入、slot 注册、**8 类真实故障模式**（含 renderer 自旋）、测试与审计方法论、发布 | 从零写插件；插件不激活；面板空白；`X is not defined`；渲染进程内存上涨 |
| [`dsh-theme-skin-author`](dsh-theme-skin-author/SKILL.md) | 皮肤 JSON 格式与 token 契约、`--dsw-alias-*` / `--dsw-specific-*` 两层、配色两区规则、`register` 与 `overrideTokens` 的数据模型区别、侧栏素材移植、阅读态 | 做皮肤；皮肤选中了却没颜色；移植现有系统的配色 |

## 安装

技能是**纯 Markdown 指令，不含可执行代码**。把单个技能目录复制进你的 AI 工具的 skills 目录（以 Claude Code 为例）：

```sh
git clone https://github.com/renjie2026/dsh-skills.git
cp -r dsh-skills/dsh-plugin-author ~/.claude/skills/
cp -r dsh-skills/dsh-theme-skin-author ~/.claude/skills/
```

其他支持 `SKILL.md` 约定的 agent 同理：把技能目录放进它的技能搜索路径即可。

## 自检

```sh
npm install
npm test        # node validate-skills.mjs
```

校验每个 SKILL.md：frontmatter 可解析、`name` 与目录一致、`description` 说明了何时使用、代码围栏全部闭合、引用的相对路径真实存在。技能被 AI 消费时**坏格式 = 静默失效**（技能根本不出现在目录里，且无任何报错），所以先校验再分享。

## 相关

- 插件本体：<https://github.com/renjie2026/dsh-theme-gallery> —— DeepSeek Harness 桌面版主题皮肤画廊（一个插件管全部皮肤，JSON 数据驱动）
- 官方生态：给 GitHub 项目加 **`dsh-plugin`** topic，即进入 DeepSeek Harness 社区插件索引

## License

[MIT](LICENSE)

---

作者 & 维护：[renjie2026](https://github.com/renjie2026)
