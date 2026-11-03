# 配刀参数计算器

![release](https://img.shields.io/badge/release-v1.1.0-2ea44f) ![html](https://img.shields.io/badge/html-100%25-orange)

内/外花键与齿轮 → 插齿刀选刀与成品刀参数工具，支持拍照识图自动填写。

## 在线使用

- GitHub Pages: https://rainchen0219.github.io/gear-cutter-calc/
- jsDelivr CDN: https://cdn.jsdelivr.net/gh/RainChen0219/gear-cutter-calc@main/index.html

## 功能

- 拍照识图自动填写（Beta）：拍图纸或相册选图，自动识别并填入 18 个字段，待确认字段人工核对采纳后才参与计算
- 公制模数 / 英制径节（DP）双模式
- 20° / 25° / 30° 三种压力角
- 内齿/内花键、外齿/外花键
- 碗形插齿刀（φ50/φ75/φ100/φ125）、盘形插齿刀（φ160/φ200）自动选型
- 大径/小径/齿厚/量棒距 M/公法线 Wk 智能软填充
- 包络法刀坯计算、x₀ 许用区间推荐
- 五用例回归校验通过

## MCP 远程服务

- 端点（Streamable HTTP）：https://api.jingmeicuttingtool.com/mcp
- 在支持 MCP 的 AI 客户端中添加该端点，即可用自然语言调用配刀计算；鉴权方式以发布说明为准。

## 使用

直接用浏览器打开 `index.html` 即可，无需安装任何依赖。

## 技术栈

单文件 HTML + 原生 JS + CSS；拍照识图由后端服务提供，模型密钥不暴露在前端。
