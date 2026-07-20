/**
 * Symbol comp builders.
 *
 * The model supplies only user-facing geometry/style arguments. These builders
 * fill the stable className/attrs/store structure required by the symbol editor.
 */

function generateNodeId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 21; i++) id += chars.charAt(Math.floor(Math.random() * chars.length))
  return id
}

let latestIndex = 100000

function nextName(label: string): string {
  latestIndex += 1
  return `${label}-${latestIndex}`
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function string(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function bounds(points: number[]) {
  const xs = points.filter((_, index) => index % 2 === 0)
  const ys = points.filter((_, index) => index % 2 === 1)
  if (xs.length === 0 || ys.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function commonAttrs(args: Record<string, unknown>, name: string) {
  return {
    draggable: boolean(args.draggable, true),
    shadowOpacity: number(args.shadowOpacity, 0),
    shadowBlur: number(args.shadowBlur, 6),
    shadowOffsetX: number(args.shadowOffsetX, 3),
    shadowOffsetY: number(args.shadowOffsetY, 3),
    shadowColor: string(args.shadowColor, '#1ABC9C'),
    hitStrokeWidth: number(args.hitStrokeWidth, 4),
    fill: string(args.fill, '#D8D8D8'),
    stroke: string(args.stroke, '#979797'),
    strokeWidth: number(args.strokeWidth, 1),
    name: string(args.name, nextName(name)),
    _scaleX: 1,
    _scaleY: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    moveable: boolean(args.moveable, true),
    rotation: number(args.rotation, 0),
    logicLayer: '1',
  }
}

function store(shape: string, width: number, height: number) {
  return {
    shape,
    _originInfo: { width, height },
    node_id: generateNodeId(),
  }
}

function buildRect(args: Record<string, unknown>) {
  const width = number(args.width, 200)
  const height = number(args.height, 200)
  const cornerRadius = typeof args.cornerRadius === 'number' ? args.cornerRadius : undefined
  const shape = cornerRadius === undefined ? 'Rectangle' : 'RoundRect'
  const attrs: Record<string, unknown> = {
    ...commonAttrs(args, cornerRadius === undefined ? '矩形' : '圆角矩形'),
    x: number(args.x, 0),
    y: number(args.y, 0),
    width,
    height,
  }
  if (cornerRadius !== undefined) attrs.cornerRadius = cornerRadius
  return { className: 'Rect', attrs, store: store(shape, width, height) }
}

function buildEllipse(args: Record<string, unknown>) {
  const width = number(args.width, 200)
  const height = number(args.height, 200)
  return {
    className: 'Ellipse',
    attrs: {
      ...commonAttrs(args, '椭圆'),
      x: number(args.x, width / 2),
      y: number(args.y, height / 2),
      width,
      height,
      radiusX: width / 2,
      radiusY: height / 2,
    },
    store: store('Ellipse', width, height),
  }
}

function buildText(args: Record<string, unknown>) {
  const width = number(args.width, 80)
  const height = number(args.height, 40)
  const attrs: Record<string, unknown> = {
    ...commonAttrs({ ...args, fill: args.fill ?? '#000000' }, '文本'),
    text: string(args.text, '文字'),
    x: number(args.x, 0),
    y: number(args.y, 0),
    width,
    height,
    align: string(args.align, 'center'),
    verticalAlign: string(args.verticalAlign, 'middle'),
    wrap: string(args.wrap, 'char'),
  }
  for (const key of ['fontFamily', 'fontSize', 'fontStyle', 'padding', 'letterSpacing', 'ellipsis', 'textDecoration']) {
    if (args[key] !== undefined) attrs[key] = args[key]
  }
  return {
    className: 'Text',
    attrs,
    store: {
      ...store('Text', width, height),
      underline: args.textDecoration === 'underline',
      deleteline: args.textDecoration === 'line-through',
      font: {},
    },
  }
}

function getLinePoints(args: Record<string, unknown>): number[] {
  if (Array.isArray(args.points)) return args.points.filter(value => typeof value === 'number') as number[]
  return [
    number(args.x1, 0),
    number(args.y1, 0),
    number(args.x2, 100),
    number(args.y2, 0),
  ]
}

function buildLineLike(
  args: Record<string, unknown>,
  options: { className: string; shape: string; name: string; closed: boolean },
) {
  const points = getLinePoints(args)
  const box = bounds(points)
  const attrs: Record<string, unknown> = {
    ...commonAttrs(args, options.name),
    points,
    closed: boolean(args.closed, options.closed),
    x: number(args.x, box.x),
    y: number(args.y, box.y),
    width: box.width,
    height: box.height,
  }
  if (Array.isArray(args.controlPoints)) attrs.controlPoints = args.controlPoints
  return {
    className: options.className,
    attrs,
    store: store(options.shape, box.width, box.height),
  }
}

function buildArcLike(
  args: Record<string, unknown>,
  options: { className: string; shape: string; name: string; closePath?: boolean; transparent?: boolean },
) {
  const width = number(args.width, 200)
  const height = number(args.height, 200)
  const attrs: Record<string, unknown> = {
    ...commonAttrs({ ...args, fill: args.fill ?? (options.transparent ? '#D8D8D800' : '#D8D8D8') }, options.name),
    x: number(args.x, options.shape === 'Pie' ? 0 : width / 2),
    y: number(args.y, options.shape === 'Pie' ? 0 : height / 2),
    width,
    height,
    radiusX: width / 2,
    radiusY: height / 2,
    startAngle: number(args.startAngle, 0),
    endAngle: number(args.endAngle, 90),
  }
  if (options.closePath) attrs.closePath = true
  return {
    className: options.className,
    attrs,
    store: store(options.shape, width, height),
  }
}

export function buildSymbolElement(type: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'Rect': return buildRect(args)
    case 'Ellipse': return buildEllipse(args)
    case 'Text': return buildText(args)
    case 'Line': return buildLineLike(args, { className: 'Line', shape: 'Line', name: '直线', closed: false })
    case 'Polygon': return buildLineLike(args, { className: 'Line', shape: 'Polygon', name: '多边形', closed: true })
    case 'Curve': return buildLineLike(args, { className: 'Curve', shape: 'Curve', name: '折线', closed: false })
    case 'Arc': return buildArcLike(args, { className: 'Arc', shape: 'Arc', name: '弧', transparent: true })
    case 'Chord': return buildArcLike(args, { className: 'Arc', shape: 'Chord', name: '弦', closePath: true })
    case 'Pie': return buildArcLike(args, { className: 'Pie', shape: 'Pie', name: '饼图' })
    default: throw new Error(`不支持的图符图元类型: ${type}`)
  }
}
