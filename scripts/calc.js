#!/usr/bin/env node
/**
 * calc.js — 配刀参数 skill 命令行入口
 * 核心计算逻辑在 lib/engine.js（与 MCP server 共用）。
 *
 * 用法：
 *   node calc.js '<JSON 参数>'
 *   node calc.js params.json
 *   echo '<JSON>' | node calc.js
 *   node calc.js ... --json   （输出结构化 JSON）
 */
const fs = require('fs');
const path = require('path');
const { compute } = require(path.join(__dirname, '..', 'lib', 'engine'));

function readInput() {
  const args = process.argv.slice(2).filter(a => a !== '--json');
  let raw = '';
  if (args.length) {
    const a = args[0];
    if (a.trim().startsWith('{')) raw = a;
    else raw = fs.readFileSync(a, 'utf8');
  } else {
    raw = fs.readFileSync(0, 'utf8');
  }
  return JSON.parse(raw);
}

(async () => {
  const params = readInput();
  const result = await compute(params);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ error: result.error, summary: result.summary, cards: result.cards }, null, 2));
  } else {
    console.log(result.text);
  }
})().catch(e => { console.error('calc.js 运行失败：', e.message); process.exit(1); });
