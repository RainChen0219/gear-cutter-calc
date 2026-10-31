#!/usr/bin/env node
/**
 * MCP Server — 配刀参数（Streamable HTTP 版，用于远程部署）
 * 与 stdio 版共用 lib/engine.js 和同一套 tool schema。
 *
 * 环境变量：
 *   PORT       监听端口，默认 3000
 *   MCP_TOKEN  Bearer token 校验；未设置则不校验（仅本地调试用，生产必须设）
 *
 * 客户端连接：
 *   transport: streamable-http
 *   url: https://你的域名/mcp
 *   headers: { Authorization: "Bearer <MCP_TOKEN>" }
 */
const http = require('http');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { compute } = require(path.join(__dirname, '..', 'lib', 'engine'));

const PORT = parseInt(process.env.PORT || '3000', 10);
const MCP_TOKEN = process.env.MCP_TOKEN || '';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const OCR_MODEL = process.env.OCR_MODEL || 'qwen-vl-ocr';
const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

// OCR 识别结果提示词：只提取配刀核心字段，强制严格 JSON
const OCR_PROMPT = [
  '你是齿轮刀具行业的 OCR 识别助手。请识别这张齿轮/刀具设计图纸或参数照片中的齿轮参数。',
  '只提取以下字段，识别不到的字段值设为 null：',
  'm: 模数（数字，忽略单位 mm）；',
  'z: 齿数（整数）；',
  'alpha: 压力角，只允许 15、20、25、30 中的一个（数字）；',
  'gearType: 内齿/内齿圈/内花键填 "internal"，外齿/外齿轮/外花键填 "external"；',
  'standardNo: 标准号字符串（如 GB/T 1356、GB/T 3478.1、DIN 5480、DIN 867、AGMA），没有则 null。',
  '注意区分模数 m 与齿数 z，不要把尺寸直径（带 Ø 的数字）误判为模数。',
  '只输出一个 JSON 对象，不要输出任何解释、注释或 markdown 代码块标记，格式：',
  '{"m":null,"z":null,"alpha":null,"gearType":null,"standardNo":null}',
].join('\n');

// 从模型输出中稳健提取 JSON（兼容 markdown 代码块、前后多余文本）
function extractOcrJson(text) {
  if (!text) throw new Error('模型返回为空');
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('模型输出中未找到 JSON');
  return JSON.parse(s.slice(start, end + 1));
}

// 校验并规范化 OCR 字段，只保留合法值
function normalizeOcrFields(fields) {
  const out = {};
  if (fields.m != null && !isNaN(Number(fields.m)) && Number(fields.m) > 0) out.m = String(Number(fields.m));
  if (fields.z != null && !isNaN(Number(fields.z)) && Number(fields.z) > 0) out.z = String(parseInt(Number(fields.z), 10));
  if (fields.alpha != null && ['15', '20', '25', '30'].includes(String(Number(fields.alpha)))) {
    out.alpha = String(Number(fields.alpha));
  }
  if (fields.gearType === 'internal' || fields.gearType === 'external') out.gearType = fields.gearType;
  if (fields.standardNo != null && String(fields.standardNo).trim()) {
    out.standardNo = String(fields.standardNo).trim();
  }
  return out;
}

async function handleOcr(req, res, rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch (e) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_json' }));
    return;
  }
  if (!DASHSCOPE_API_KEY) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'ocr_not_configured', message: '服务器未配置 DASHSCOPE_API_KEY' }));
    return;
  }
  let dataUrl = payload.image || '';
  if (dataUrl && !/^data:/i.test(dataUrl)) dataUrl = 'data:image/jpeg;base64,' + dataUrl;
  if (!dataUrl) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'missing_image' }));
    return;
  }
  try {
    const upstream = await fetch(DASHSCOPE_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + DASHSCOPE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok || data.error) {
      const msg = (data.error && (data.error.message || data.error.code)) || ('upstream_' + upstream.status);
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'ocr_upstream_error', message: String(msg) }));
      return;
    }
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const parsed = extractOcrJson(content);
    const fields = normalizeOcrFields(parsed);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, fields, usage: data.usage || null }));
  } catch (e) {
    console.error('OCR 请求失败：', e);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'ocr_failed', message: String(e && e.message || e) }));
  }
}

// 工件参数 JSON Schema（与 stdio 版保持一致）
const PARAM_PROPERTIES = {
  unitSystem: { type: 'string', enum: ['metric', 'inch'], description: '公制/英制，默认公制' },
  alpha: { type: 'string', enum: ['15', '20', '25', '30'], description: '压力角（度）' },
  gearType: { type: 'string', enum: ['external', 'internal'], description: '外齿/内齿' },
  standardNo: { type: 'string', description: '标准号，如 GB/T 1356、GB/T 3478.1、DIN 867、DIN 5480、AGMA 25 FullDepth' },
  rootType: { type: 'string', enum: ['flat', 'fillet'], description: '平齿根/圆齿根' },
  toothProfile: { type: 'string', enum: ['normal', 'stub'], description: '正常齿/短齿' },
  m: { type: 'string', description: '模数（英制走径节 DP）' },
  z: { type: 'string', description: '齿数' },
  x: { type: 'string', description: '变位系数（名义）' },
  xm: { type: 'string', description: '径向变位量 Xm' },
  ha: { type: 'string', description: '齿顶高系数（手改）' },
  hf: { type: 'string', description: '齿根高系数（手改）' },
  cStar: { type: 'string', description: '顶隙系数' },
  daMax: { type: 'string', description: '大径上限' },
  daMin: { type: 'string', description: '大径下限' },
  dfMax: { type: 'string', description: '小径上限' },
  dfMin: { type: 'string', description: '小径下限' },
  toothThickness: { type: 'string', description: '齿厚' },
  slotWidth: { type: 'string', description: '内花键齿槽宽 E' },
  ballDiameter: { type: 'string', description: '量棒直径 Dp' },
  ballMMax: { type: 'string', description: '量棒距上限' },
  ballMMin: { type: 'string', description: '量棒距下限' },
  ballMeasurement: { type: 'string', description: '单个实测量棒距 M（中值）' },
  commonNK: { type: 'string', description: '公法线跨齿数 k' },
  commonNW: { type: 'string', description: '公法线长度 Wk' },
  tipRadiusR: { type: 'string', description: '齿顶圆角 R' },
  tipChamferC: { type: 'string', description: '齿顶倒棱深度' },
  splineGrade: { type: 'string', enum: ['4', '5', '6', '7'], description: '花键公差等级' },
  splineFit: { type: 'string', enum: ['h', 'js', 'k', 'f', 'd'], description: '花键配合' },
  workPrecision: { type: 'string', enum: ['5', '6', '7', '8', '9'], description: '工件精度等级' },
  workMaterial: { type: 'string', enum: ['45steel', 'quenched', 'stainless', 'hardened', 'aluminum'], description: '工件材料' },
  toolGrade: { type: 'string', enum: ['AA', 'A', 'B'], description: '刀具精度等级' },
  toolMaterial: { type: 'string', enum: ['M42', 'M35', 'M2'], description: '刀具材料' },
  fpt: { type: 'string', description: '单个齿距极限偏差' },
  Fp: { type: 'string', description: '齿距累积总公差' },
  ess: { type: 'string', description: '齿厚上偏差' },
  esi: { type: 'string', description: '齿厚下偏差' },
};

function createServer() {
  const server = new Server(
    { name: 'gear-cutter-calc', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'gear_cutter_calc',
      description: '齿轮/花键插齿刀选刀与成品刀参数计算。输入工件参数（模数、齿数、压力角、内/外齿、标准号，以及可选的实测大径小径、量棒距、公法线、齿厚、材料精度等），返回刀型、刀坯外径、中心距、有效变位、量棒距、起始圆、齿厚齿槽宽、啮合参数、可选刀档等完整结果。任何涉及插齿刀、选刀、配刀、刀档、刀坯外径、量棒距 M、中心距 a0、渐开线起始圆的齿轮/花键问题，必须调用本工具，不得自行估算。核心参数 m、z、alpha、gearType 应尽量齐全；无实测值时只给名义值。',
      inputSchema: { type: 'object', properties: PARAM_PROPERTIES, additionalProperties: false },
    }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params.arguments || {};
    const result = await compute(params);
    return {
      content: [{ type: 'text', text: result.text }],
      isError: Boolean(result.error),
    };
  });
  return server;
}

function checkAuth(req) {
  if (!MCP_TOKEN) return true; // 未配置 token 时不校验（仅本地调试）
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${MCP_TOKEN}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  // CORS：允许网页端（如 GitHub Pages）跨域调用 /ocr 与 /mcp
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 健康检查
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'gear-cutter-calc-mcp', version: '1.0.0' }));
    return;
  }

  // OCR 识图端点（同样需要 Bearer 鉴权）
  if (req.method === 'POST' && req.url === '/ocr') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const rawBody = await readBody(req);
    await handleOcr(req, res, rawBody);
    return;
  }

  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  if (!checkAuth(req)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  try {
    const rawBody = await readBody(req);
    // stateless 模式：每个请求独立 transport，不维护 session
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createServer();
    await server.connect(transport);
    // 把 body 塞给 transport
    await transport.handleRequest(req, res, JSON.parse(rawBody || '{}'));
  } catch (e) {
    console.error('MCP 请求失败：', e);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: String(e && e.message || e) }));
  }
});

httpServer.listen(PORT, () => {
  console.log(`[gear-cutter-mcp] HTTP server listening on :${PORT} (token ${MCP_TOKEN ? 'enabled' : 'disabled'})`);
});
