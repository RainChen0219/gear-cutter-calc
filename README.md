# 配刀参数计算器

![release](https://img.shields.io/badge/release-v1.2.1-2ea44f) ![html](https://img.shields.io/badge/html-100%25-orange)

内/外花键与齿轮 → 插齿刀选刀与成品刀参数工具，支持拍照识图自动填写。

## 在线使用

- GitHub Pages: https://rainchen0219.github.io/gear-cutter-calc/
- jsDelivr CDN: https://cdn.jsdelivr.net/gh/RainChen0219/gear-cutter-calc@main/index.html

## 功能

- 拍照识图自动填写（Beta）：拍图纸或相册选图，自动识别并填入 18 个字段，待确认字段人工核对采纳后才参与计算
- 公制模数 / 英制径节（DP）双模式
- 20° / 25° / 30° 三种压力角
- 内齿/内花键、外齿/外花键
- 加工方式「滚刀」分支（v1.1.1）：外直齿轮/外花键滚刀加工，输出工件参数、公法线与跨棒距、根切校验、滚刀配对、花键大小径；内齿禁用滚刀
- 滚刀本体参数（v1.2.0）：主体（d₀/γ/Zk/αp/K/HK）、法向齿形（mn/αn/Pn/sn/ha₀/hf₀/h₀）、轴向齿形（阿基米德蜗杆投影 Pax/αax/sax/Pz）、精度等级（GB/T 6083）；支持非标齿廓（手填 ha*/hf*/c*）
- 滚刀修复（v1.2.1）：hf₀ 补顶隙档、γ 改精确 atan、配对按标准号判定；齿厚/跨棒距/公法线反推实际变位 x₁；齿廓系数与外径过小输入拦截
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
