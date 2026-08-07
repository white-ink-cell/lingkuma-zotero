# 上游项目与移植说明

[English](UPSTREAM.md) | **简体中文** | [日本語](UPSTREAM_ja.md) | [한국어](UPSTREAM_ko.md)

本项目是 **LingKuma 1.1.0** 的非官方 Zotero 移植版。

- 原项目：`lingkuma/LingKuma`
- Zotero 移植版维护 / 发布：`white-ink-cell`

LingKuma 原项目的作者、版权和第三方许可证保持不变。`white-ink-cell` 仅表示本 Zotero 移植版的维护和发布者。

## 主要移植工作

1. **Zotero 运行环境适配** —— 在 LingKuma 外部增加兼容层，使其阅读功能可以在 Zotero 中运行。
2. **句子选取优化** —— 重建 PDF 定位文本并完善句子边界，使整句翻译和 Word Explosion 更可靠地取得完整句子。
3. **磨砂玻璃兼容** —— 将 Zotero / Gecko 无法完整支持的 Chromium 液态玻璃渲染替换为兼容的磨砂玻璃效果，同时保留原版 UI 与主题逻辑。
4. **多语言翻译适配** —— 对原版偏向中文的默认 Prompt 和语言元数据进行适配，使翻译与解释遵循用户选择的源语言 / 目标语言。

## 原则

本项目的目标是 **将 LingKuma 移植到 Zotero**。上游文件及原项目署名保持不变，Zotero 专用功能放在适配层中实现。
