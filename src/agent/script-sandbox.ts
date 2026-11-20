/**
 * 脚本试跑沙箱（test_script）
 *
 * 在独立子进程（限制内存、可被超时终止、不继承环境变量）的 vm 上下文里，用“仅含文档化 API 的模拟对象”
 * 试跑脚本，发现静态校验查不出的运行期问题：拼错的方法名、读空对象成员、死循环、定时器未清理等。
 * 所有模拟对象都在沙箱内部构造，宿主对象不会传入沙箱，脚本无法通过原型链触达宿主进程。
 */

import { spawnSync } from 'node:child_process'

export const SCRIPT_KINDS = ['event', 'value_changed', 'before_open', 'page', 'pipe', 'symbol_func'] as const
export type ScriptKind = typeof SCRIPT_KINDS[number]

export interface SandboxNode {
  id: string
  name?: string
  type?: string
  /** 旋转中心（roatePos）画布坐标，与运行时 getXEx/getYEx 一致 */
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
}

export interface SandboxInput {
  script: string
  kind: ScriptKind
  /** 当前图纸里存在的图元，findNodeByIdEx 只会命中这些 id */
  nodes: SandboxNode[]
  /** event / value_changed：作为 data 的目标图元 id；省略则 data 为 undefined（与运行时未配置目标图元一致） */
  target?: string
  /** 模拟测点当前值：测点全路径 → 值 */
  points?: Record<string, unknown>
  /** 图纸已声明的页面参数及初始值 */
  pageParams?: Record<string, unknown>
  /** symbol_func：数据绑定名 → 值 */
  bindings?: Record<string, unknown>
  mainValue?: unknown
  maxTimerRuns?: number
}

export interface SandboxResult {
  ok: boolean
  error?: string
  returned?: unknown
  calls: string[]
  warnings: string[]
  timerRuns: number
}

const RUN_TIMEOUT_MS = 800
const DEFAULT_TIMER_RUNS = 5
const MAX_TIMER_RUNS = 30

const HARNESS = `
(function () {
  var INPUT = JSON.parse(__INPUT__);
  var calls = [];
  var warnings = [];
  var timers = [];
  var timerSeq = 0;
  var clock = 0;
  var timerRuns = 0;
  var pageParams = INPUT.pageParams || {};
  var declared = {};
  Object.keys(pageParams).forEach(function (k) { declared[k] = true; });

  function log(msg) { if (calls.length < 60) calls.push(msg); }
  function warn(msg) { if (warnings.indexOf(msg) < 0 && warnings.length < 30) warnings.push(msg); }
  function fmt(v) {
    try {
      var s = JSON.stringify(v);
      if (s === undefined) return String(v);
      return s.length > 60 ? s.slice(0, 57) + '...' : s;
    } catch (e) { return String(v); }
  }

  var nodeInfo = {};
  (INPUT.nodes || []).forEach(function (n) { nodeInfo[n.id] = n; });
  var nodeCache = {};

  var FIELDS = [
    ['Visible', 'visible', true], ['X', 'x', 0], ['Y', 'y', 0], ['Rotation', 'rotation', 0],
    ['ScaleX', 'scaleX', 1], ['ScaleY', 'scaleY', 1], ['Width', 'width', 0], ['Height', 'height', 0],
    ['BackgroundColor', 'bg', ''], ['BorderColor', 'border', ''], ['TextColor', 'textColor', ''], ['Text', 'text', '']
  ];

  function makeNode(id) {
    if (nodeCache[id]) return nodeCache[id];
    var info = nodeInfo[id] || {};
    var state = {
      visible: true, x: info.x || 0, y: info.y || 0, rotation: 0, scaleX: 1, scaleY: 1,
      width: info.width || 0, height: info.height || 0, bg: '', border: '', textColor: '',
      text: info.text || '', attrs: {}
    };
    var label = '图元(' + (info.name || id) + ')';
    var node = {};
    FIELDS.forEach(function (f) {
      node['set' + f[0] + 'Ex'] = function (v) {
        if (f[0] === 'Text' && info.type && info.type !== 'Text') warn(label + ' 不是文字图元，setTextEx 可能无效');
        state[f[1]] = v;
        log(label + '.set' + f[0] + 'Ex(' + fmt(v) + ')');
      };
      node['get' + f[0] + 'Ex'] = function () { return state[f[1]]; };
    });
    node.getAttr = function (k) { return state.attrs[k]; };
    node.setAttr = function (k, v) { state.attrs[k] = v; log(label + '.setAttr(' + fmt(k) + ', ' + fmt(v) + ')'); };
    node.getChildrenEx = function () { return []; };
    node.getShapeEx = function () { return info.type || 'Unknown'; };
    nodeCache[id] = node;
    return node;
  }

  var gv = {
    findNodeByIdEx: function (id) {
      if (!nodeInfo[id]) { warn('gv.findNodeByIdEx(' + fmt(id) + ') 未找到该图元，返回 null，后续使用前必须判空'); return null; }
      return makeNode(id);
    },
    setZoomEx: function (v) { log('gv.setZoomEx(' + fmt(v) + ')'); },
    getZoomEx: function () { return { x: 1, y: 1 }; },
    setPageParamsEx: function (name, v) {
      if (typeof name !== 'string') warn('页面参数名必须是字符串');
      if (!declared[name]) warn('页面参数 ' + fmt(name) + ' 未在图纸中声明（组装时会按字面量自动声明）');
      pageParams[name] = v;
      log('gv.setPageParamsEx(' + fmt(name) + ', ' + fmt(v) + ')');
    },
    getPageParamsEx: function (name) {
      if (!(name in pageParams)) warn('读取了尚未设置的页面参数 ' + fmt(name) + '，返回 undefined');
      return pageParams[name];
    },
    setLayerVisibleByIndexEx: function (i, v) { log('gv.setLayerVisibleByIndexEx(' + fmt(i) + ', ' + fmt(v) + ')'); },
    getLayerVisibleByIndexEx: function () { return true; },
    setLayerVisibleByNameEx: function (n, v) { log('gv.setLayerVisibleByNameEx(' + fmt(n) + ', ' + fmt(v) + ')'); },
    getLayerVisibleByNameEx: function () { return true; }
  };

  var points = INPUT.points || {};
  var hmi = {
    utils: {
      getProjectCode: function () { return 'MOCK_PROJECT'; },
      readModelPoint: function (opts, success, error) {
        if (!opts || !Array.isArray(opts.points)) { warn('readModelPoint 的 points 必须是测点全路径数组'); return; }
        var res = {};
        opts.points.forEach(function (p) {
          if (!(p in points)) warn('模拟数据中没有测点 ' + fmt(p) + '，读取值为 undefined（可通过 points 参数提供）');
          res[p] = points[p];
        });
        log('hmi.utils.readModelPoint(' + fmt(opts.points) + ')');
        if (typeof success === 'function') success(res);
      },
      writeModelPoint: function (opts, success, error) {
        if (!opts || !Array.isArray(opts.nodes)) { warn('writeModelPoint 的 nodes 必须是 [{point, value}] 数组'); return; }
        if (!opts.gv) warn('writeModelPoint 必须传入 gv');
        opts.nodes.forEach(function (n) { log('写入测点 ' + fmt(n && n.point) + ' = ' + fmt(n && n.value)); });
        if (typeof success === 'function') success(opts.nodes.map(function () { return true; }));
      },
      openDialog: function (url) { log('hmi.utils.openDialog(' + fmt(url) + ')'); },
      openPage: function (url) { log('hmi.utils.openPage(' + fmt(url) + ')'); }
    }
  };

  function addTimer(fn, delay, repeat) {
    var id = ++timerSeq;
    timers.push({ id: id, fn: fn, at: clock + Math.max(1, Number(delay) || 1), every: repeat ? Math.max(1, Number(delay) || 1) : 0 });
    return id;
  }
  function clearTimer(id) { timers = timers.filter(function (t) { return t.id !== id; }); }
  var sandboxGlobals = {
    setTimeout: function (fn, delay) { return addTimer(fn, delay, false); },
    setInterval: function (fn, delay) { return addTimer(fn, delay, true); },
    clearTimeout: clearTimer,
    clearInterval: clearTimer
  };
  var consoleMock = { log: function () {}, info: function () {}, warn: function () {}, error: function () {}, debug: function () {} };

  var result = { ok: true, error: undefined, returned: undefined };
  var thrown;
  function capture(e) {
    thrown = e;
    result.ok = false;
    result.error = (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e));
  }

  var params, extra, data;
  var kind = INPUT.kind;
  var body = INPUT.script;
  var args;
  var names;
  var pipeData;
  if (kind === 'event' || kind === 'value_changed') {
    data = INPUT.target ? makeNode(INPUT.target) : undefined;
    var third = kind === 'event' ? {} : (function () {
      var v = {};
      Object.keys(points).forEach(function (k) { v[k] = { oldValue: 0, newValue: points[k] }; });
      return v;
    })();
    names = ['data', 'gv', kind === 'event' ? 'params' : 'value'];
    args = [data, gv, third];
  } else if (kind === 'before_open') {
    names = ['gv'];
    args = [gv];
  } else if (kind === 'page') {
    var core = new Proxy({}, { get: function (t, k) { return function () { log('core.' + String(k) + '(...)'); }; } });
    names = ['data', 'core', 'cache'];
    args = [gv, core, {}];
  } else if (kind === 'pipe') {
    var store = {};
    var enabled = false;
    pipeData = {
      setScriptEnabled: function (v) { enabled = !!v; log('data.setScriptEnabled(' + fmt(!!v) + ')'); },
      getScriptEnabled: function () { return enabled; },
      setStore: function (k, v) { store[k] = v; log('data.setStore(' + fmt(k) + ', ' + fmt(v) + ')'); },
      getStore: function (k) { return store[k]; }
    };
    names = ['data', 'gv'];
    args = [pipeData, gv];
  } else {
    var bindings = INPUT.bindings || {};
    data = {
      a: function (name) {
        if (!(name in bindings)) warn('数据绑定 ' + fmt(name) + ' 没有模拟值，读取为 undefined（可通过 bindings 参数提供）');
        return bindings[name];
      },
      getValue: function () { return INPUT.mainValue; }
    };
    names = ['data'];
    args = [data];
  }

  var fn;
  try {
    var ctor = Function;
    fn = ctor.apply(null, names.concat(['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'hmi', 'console', body]));
  } catch (e) { capture(e); }

  if (fn) {
    try {
      result.returned = fn.apply(null, args.concat([
        sandboxGlobals.setTimeout, sandboxGlobals.setInterval, sandboxGlobals.clearTimeout, sandboxGlobals.clearInterval, hmi, consoleMock
      ]));
    } catch (e) { capture(e); }
  }

  var maxRuns = INPUT.maxTimerRuns;
  while (result.ok && timers.length > 0 && timerRuns < maxRuns) {
    timers.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
    var next = timers[0];
    clock = next.at;
    if (next.every) next.at = clock + next.every; else timers.shift();
    timerRuns++;
    try {
      if (typeof next.fn === 'function') next.fn(); else warn('定时器回调不是函数');
    } catch (e) { capture(e); result.error = '定时器回调第 ' + timerRuns + ' 次执行出错：' + result.error; }
  }
  if (result.ok && timers.length > 0) {
    warn('试跑了 ' + timerRuns + ' 次定时器回调后仍有 ' + timers.length + ' 个定时器在运行（周期任务属正常；请确认已有停止条件）');
  }

  if (result.ok && kind === 'pipe') {
    if (typeof pipeData.onScriptDestroy === 'function') {
      try { pipeData.onScriptDestroy(); log('data.onScriptDestroy() 已调用'); } catch (e) { capture(e); result.error = 'onScriptDestroy 执行出错：' + result.error; }
    }
    if (timers.length > 0) warn('管道销毁（onScriptDestroy）后仍有 ' + timers.length + ' 个定时器未清除，应在 onScriptDestroy 中 clearInterval/clearTimeout');
    if (!enabled) warn('脚本没有调用 data.setScriptEnabled(true)，管道流动组不会显示');
  }
  if (result.ok && kind === 'symbol_func' && result.returned === undefined) {
    result.ok = false;
    result.error = '属性绑定函数没有 return 属性值（返回了 undefined）';
  }

  return JSON.stringify({
    ok: result.ok, error: result.error,
    returned: result.returned === undefined ? undefined : (function () { try { return JSON.parse(JSON.stringify(result.returned)); } catch (e) { return String(result.returned); } })(),
    calls: calls, warnings: warnings, timerRuns: timerRuns
  });
})()
`

/**
 * 子进程入口：从 stdin 读取 { harness, payload, timeout }，在 vm 上下文里执行并把结果写到 stdout。
 * 放在独立进程中执行，脚本即使申请超大内存或卡死也只会终止子进程，不影响服务。
 */
const CHILD_RUNNER = `
const vm = require('node:vm');
// 脚本里未处理的 Promise 拒绝不应让子进程以非 0 退出，结果已通过 stdout 返回
process.on('unhandledRejection', () => {});
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  // afterEvaluate：微任务在 vm 超时保护内执行，Promise 死循环同样会被终止
  const context = vm.createContext(Object.create(null), { microtaskMode: 'afterEvaluate' });
  let out;
  try {
    const source = request.harness.replace('__INPUT__', () => JSON.stringify(request.payload));
    out = vm.runInContext(source, context, { timeout: request.timeout });
  } catch (error) {
    const message = String(error && error.message);
    out = JSON.stringify({ ok: false, error: /timed out/i.test(message) ? '__TIMEOUT__' : '沙箱执行失败：' + message, calls: [], warnings: [], timerRuns: 0 });
  }
  process.stdout.write(out, () => process.exit(0));
});
`

const CHILD_MAX_OLD_SPACE_MB = 96
const CHILD_PROCESS_TIMEOUT_MS = 3000
const CHILD_MAX_OUTPUT_BYTES = 1024 * 1024

function failure(error: string): SandboxResult {
  return { ok: false, error, calls: [], warnings: [], timerRuns: 0 }
}

export function runScriptInSandbox(input: SandboxInput): SandboxResult {
  const maxTimerRuns = Math.min(Math.max(Math.trunc(input.maxTimerRuns ?? DEFAULT_TIMER_RUNS), 0), MAX_TIMER_RUNS)
  const request = JSON.stringify({
    harness: HARNESS,
    payload: JSON.stringify({ ...input, maxTimerRuns }),
    timeout: RUN_TIMEOUT_MS,
  })
  const timeoutMessage = `脚本执行超过 ${RUN_TIMEOUT_MS}ms，可能存在死循环或过重的同步计算`

  const child = spawnSync(
    process.execPath,
    [`--max-old-space-size=${CHILD_MAX_OLD_SPACE_MB}`, '-e', CHILD_RUNNER],
    {
      input: request,
      encoding: 'utf8',
      timeout: CHILD_PROCESS_TIMEOUT_MS,
      maxBuffer: CHILD_MAX_OUTPUT_BYTES,
      windowsHide: true,
      // 不继承服务进程的环境变量（可能含密钥）；Windows 下 node 需要 SystemRoot
      env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
    },
  )
  if (child.error) {
    const code = (child.error as NodeJS.ErrnoException).code
    return failure(code === 'ETIMEDOUT' ? timeoutMessage : `沙箱进程启动或运行失败：${child.error.message}`)
  }
  if (child.status !== 0 || !child.stdout) {
    return failure('脚本占用内存过多或沙箱异常退出，请检查是否有无限增长的数据结构')
  }
  try {
    const result = JSON.parse(child.stdout) as SandboxResult
    return result.error === '__TIMEOUT__' ? failure(timeoutMessage) : result
  } catch {
    return failure('沙箱返回了无法解析的结果')
  }
}
