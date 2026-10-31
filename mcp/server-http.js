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
  // 健康检查
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'gear-cutter-calc-mcp', version: '1.0.0' }));
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
