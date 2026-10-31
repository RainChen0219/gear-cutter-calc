#!/usr/bin/env node
/**
 * MCP Server — 配刀参数（齿轮刀具行业垂直工具）
 * 标准 MCP 协议，stdio 传输。复用 lib/engine.js（与线上一致的 index.html 计算）。
 *
 * 客户端连接方式（stdio）：
 *   command: node
 *   args: ["<本文件绝对路径>"]
 */
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { compute } = require(path.join(__dirname, '..', 'lib', 'engine'));

// 工件参数 JSON Schema（字段 id 同名，全部可选；核心字段缺失时网页会提示）
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

const server = new Server(
  { name: 'gear-cutter-calc', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'gear_cutter_calc',
    description: '齿轮/花键插齿刀选刀与成品刀参数计算。输入工件参数（模数、齿数、压力角、内/外齿、标准号，以及可选的实测大径小径、量棒距、公法线、齿厚、材料精度等），返回刀型、刀坯外径、中心距、有效变位、量棒距、起始圆、齿厚齿槽宽、啮合参数、可选刀档等完整结果。核心参数 m、z、alpha、gearType 应尽量齐全；无实测值时只给名义值。',
    inputSchema: {
      type: 'object',
      properties: PARAM_PROPERTIES,
      additionalProperties: false,
    },
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

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})().catch(e => { console.error('MCP server 启动失败：', e); process.exit(1); });
