/**
 * 布局引擎 — 语义布局树 → 绝对坐标
 *
 * 设计目标：让上层（组件库 / 模型）只描述**结构与语义分组**（垂直栈 / 水平栈 /
 * 内边距 / 间距 / 对齐），由本引擎**确定性地**计算每个叶子的绝对坐标，最终拍平成
 * 现有的扁平 elements 数组。
 *
 * 关键性质（构造保证，而非事后修补）：
 * - 同一容器内的兄弟节点在主轴上顺序排布，天然**不重叠**。
 * - 子节点被约束在父节点的内容盒（padding 之内），天然**不越界**。
 *
 * 这是精简版 flexbox 子集：支持 vstack / hstack / box，padding、gap、主轴 justify、
 * 交叉轴 align、以及主轴 grow（弹性填充）。
 */

// ============================================================
// 类型
// ============================================================

/** 布局完成后传给叶子渲染函数的绝对矩形 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 交叉轴对齐 */
export type Align = 'start' | 'center' | 'end' | 'stretch'

/** 主轴分布 */
export type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around'

/** 叶子渲染函数：拿到最终绝对矩形，产出一个或多个扁平图元 */
export type LeafRenderer = (rect: Rect) => Record<string, unknown>[]

/**
 * 布局节点。
 * - `type: 'box'` 且无 children → 叶子（必须给 width/height 或依赖父级 stretch）。
 * - 容器（vstack/hstack）→ 主轴依次排布 children。
 * - 任意节点都可带 `render`（在自身完整矩形上绘制，如面板背景），再排布 children。
 */
export interface LayoutNode {
  type: 'vstack' | 'hstack' | 'box'
  /** 固定宽度；省略时由内容或父级 stretch 推导 */
  width?: number
  /** 固定高度；省略时由内容或父级 stretch 推导 */
  height?: number
  /** 主轴弹性系数（>0 时按比例瓜分剩余空间） */
  grow?: number
  /** 内边距 */
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number }
  /** 子节点主轴间距 */
  gap?: number
  /** 交叉轴对齐（作用于所有 children，默认 stretch） */
  align?: Align
  /** 主轴分布（仅在无 grow 且有剩余空间时生效，默认 start） */
  justify?: Justify
  /** 覆盖父级 align 的自身对齐 */
  alignSelf?: Align
  /** 在自身完整矩形上绘制（背景等） */
  render?: LeafRenderer
  /** 子节点 */
  children?: LayoutNode[]
}

interface Insets {
  t: number
  r: number
  b: number
  l: number
}

interface Size {
  w: number
  h: number
}

// ============================================================
// 工具
// ============================================================

function normalizePadding(p: LayoutNode['padding']): Insets {
  if (p == null) return { t: 0, r: 0, b: 0, l: 0 }
  if (typeof p === 'number') return { t: p, r: p, b: p, l: p }
  return { t: p.top ?? 0, r: p.right ?? 0, b: p.bottom ?? 0, l: p.left ?? 0 }
}

function maxOf(nums: number[]): number {
  return nums.reduce((m, n) => (n > m ? n : m), 0)
}

// ============================================================
// 测量 — 计算节点内容固有尺寸
// ============================================================

/**
 * 返回节点的固有尺寸。
 * - 显式 width/height 优先。
 * - 容器：主轴 = Σ子主轴 + 间距；交叉轴 = max 子交叉轴；再加 padding。
 */
function measure(node: LayoutNode): Size {
  const pad = normalizePadding(node.padding)

  if (!node.children || node.children.length === 0) {
    return { w: node.width ?? 0, h: node.height ?? 0 }
  }

  const gap = node.gap ?? 0
  const sizes = node.children.map(measure)
  const gapTotal = gap * (node.children.length - 1)

  if (node.type === 'hstack') {
    const contentW = sizes.reduce((a, s) => a + s.w, 0) + gapTotal
    const contentH = maxOf(sizes.map(s => s.h))
    return {
      w: node.width ?? contentW + pad.l + pad.r,
      h: node.height ?? contentH + pad.t + pad.b,
    }
  }

  // vstack / box（box 也按纵向堆叠内容测量）
  const contentW = maxOf(sizes.map(s => s.w))
  const contentH = sizes.reduce((a, s) => a + s.h, 0) + gapTotal
  return {
    w: node.width ?? contentW + pad.l + pad.r,
    h: node.height ?? contentH + pad.t + pad.b,
  }
}

// ============================================================
// 排布 — 在给定绝对矩形内放置子节点
// ============================================================

function crossOffset(align: Align, space: number, size: number): number {
  switch (align) {
    case 'center':
      return (space - size) / 2
    case 'end':
      return space - size
    default:
      return 0
  }
}

function arrange(
  node: LayoutNode,
  x: number,
  y: number,
  w: number,
  h: number,
  out: Record<string, unknown>[],
): void {
  // 先画自身（背景等），坐标为完整矩形
  if (node.render) {
    out.push(...node.render({ x, y, w, h }))
  }

  const children = node.children
  if (!children || children.length === 0) return

  const pad = normalizePadding(node.padding)
  const cx = x + pad.l
  const cy = y + pad.t
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b
  const gap = node.gap ?? 0
  const isVertical = node.type !== 'hstack'

  const sizes = children.map(measure)
  const childMain = sizes.map(s => (isVertical ? s.h : s.w))
  const mainSpace = isVertical ? ch : cw
  const crossSpace = isVertical ? cw : ch

  const grows = children.map(c => c.grow ?? 0)
  const growSum = grows.reduce((a, b) => a + b, 0)
  const gapTotal = gap * (children.length - 1)
  const usedMain = childMain.reduce((a, b) => a + b, 0) + gapTotal
  const leftover = mainSpace - usedMain

  // 主轴最终尺寸（grow 瓜分剩余空间）
  const finalMain = [...childMain]
  if (growSum > 0 && leftover > 0) {
    children.forEach((_, i) => {
      finalMain[i] += (grows[i] / growSum) * leftover
    })
  }

  // 主轴起始偏移 + 额外间距（justify，仅在无 grow 且有剩余时）
  let cursor = 0
  let extraGap = 0
  if (growSum === 0 && leftover > 0) {
    switch (node.justify) {
      case 'center':
        cursor = leftover / 2
        break
      case 'end':
        cursor = leftover
        break
      case 'space-between':
        extraGap = children.length > 1 ? leftover / (children.length - 1) : 0
        break
      case 'space-around':
        extraGap = leftover / children.length
        cursor = extraGap / 2
        break
      default:
        cursor = 0
    }
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const mainSize = finalMain[i]
    const align = child.alignSelf ?? node.align ?? 'stretch'
    const intrinsicCross = isVertical ? sizes[i].w : sizes[i].h
    const crossSize = align === 'stretch' ? crossSpace : intrinsicCross
    const crossOff = crossOffset(align, crossSpace, crossSize)

    let childX: number
    let childY: number
    let childW: number
    let childH: number

    if (isVertical) {
      childX = cx + crossOff
      childY = cy + cursor
      childW = crossSize
      childH = mainSize
    } else {
      childX = cx + cursor
      childY = cy + crossOff
      childW = mainSize
      childH = crossSize
    }

    arrange(child, childX, childY, childW, childH, out)
    cursor += mainSize + gap + extraGap
  }
}

// ============================================================
// 入口
// ============================================================

/**
 * 渲染布局树为扁平图元数组。
 * @param root 根节点（其 width/height 省略时由内容推导）
 * @param x 根节点绝对左上 x
 * @param y 根节点绝对左上 y
 */
export function renderLayout(
  root: LayoutNode,
  x: number,
  y: number,
): Record<string, unknown>[] {
  const size = measure(root)
  const out: Record<string, unknown>[] = []
  arrange(root, x, y, root.width ?? size.w, root.height ?? size.h, out)
  return out
}

/** 测量布局树的固有尺寸（用于外部需要预知面板大小时） */
export function measureLayout(root: LayoutNode): Size {
  return measure(root)
}
