/**
 * engine.js — 配刀计算核心引擎（无状态、可复用）
 * 用 jsdom 加载与线上一致的 index.html，注入参数，调用 calculate()，返回结构化结果。
 * calc.js（CLI）与 mcp/server.js（MCP）共用本模块。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'assets', 'index.html');

// 字段设置顺序：先联动字段（决定标准号选项、系数），再其余
const PRIORITY_ORDER = ['unitSystem', 'alpha', 'gearType', 'standardNo', 'rootType',
  'toothProfile', 'm', 'z', 'ha', 'hf', 'cStar', 'xm', 'x'];

function setField(dom, id, value) {
  const el = dom.window.document.getElementById(id);
  if (!el) return false;
  if (el.tagName === 'SELECT') {
    const has = Array.from(el.options).some(o => o.value === String(value));
    if (!has) {
      const opt = dom.window.document.createElement('option');
      opt.value = String(value);
      el.appendChild(opt);
    }
    el.value = String(value);
    el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  } else {
    el.value = value === null || value === undefined ? '' : String(value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
  return true;
}

function applyParams(dom, params) {
  const keys = Object.keys(params);
  for (const id of PRIORITY_ORDER) {
    if (id in params) { setField(dom, id, params[id]); delete params[id]; }
  }
  for (const id of keys) {
    if (id in params) setField(dom, id, params[id]);
  }
}

function readCards(dom) {
  const doc = dom.window.document;
  const cards = [];
  doc.querySelectorAll('#result .result-card').forEach(card => {
    if (card.style.display === 'none') return;
    const titleEl = card.querySelector('h3, .card-title, .result-card-title');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const rows = [];
    card.querySelectorAll('.param-item').forEach(item => {
      const name = (item.querySelector('.param-name') || {}).textContent || '';
      const val = (item.querySelector('.param-value') || {}).textContent || '';
      if (name || val) rows.push({ name: name.trim(), value: val.trim() });
    });
    const text = card.innerText || card.textContent || '';
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    cards.push({ card: title, rows, lines });
  });
  return cards;
}

/**
 * 计算配刀参数
 * @param {object} params 工件参数（字段 id 同名）
 * @returns {Promise<{error:string, summary:string, cards:Array, text:string}>}
 */
async function compute(params) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'https://rainchen0219.github.io/gear-cutter-calc/',
  });
  try {
    await new Promise(resolve => {
      if (dom.window.document.readyState === 'complete') resolve();
      else dom.window.addEventListener('load', resolve);
    });
    dom.window.Element.prototype.scrollIntoView = function () {};
    await new Promise(r => setTimeout(r, 100));

    applyParams(dom, params);

    if (typeof dom.window.calculate === 'function') dom.window.calculate();
    else if (typeof dom.window._doCalculate === 'function') dom.window._doCalculate();

    await new Promise(r => setTimeout(r, 50));

    const doc = dom.window.document;
    const errBox = doc.getElementById('inputErrorBox');
    const error = errBox ? errBox.textContent.trim() : '';
    const strip = doc.getElementById('summaryStrip');
    const summary = strip ? strip.textContent.trim() : '';
    const cards = readCards(dom);

    // 组装可读文本
    let text = '';
    if (error) text += '【输入校验】\n' + error + '\n\n';
    if (summary) text += '【结果摘要】\n' + summary + '\n\n';
    for (const c of cards) {
      if (c.card) text += '■ ' + c.card + '\n';
      for (const line of c.lines) {
        if (line === c.card) continue;
        text += '  ' + line + '\n';
      }
      text += '\n';
    }
    if (!error && !cards.length) {
      const r = doc.getElementById('result');
      text += (r.innerText || r.textContent || '').trim();
    }

    return { error, summary, cards, text: text.trim() };
  } finally {
    dom.window.close();
  }
}

module.exports = { compute };
