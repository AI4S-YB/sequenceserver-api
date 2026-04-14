import { useMemo, useRef, useState } from 'react'
import { exportSvgElement, exportSvgElementAsPng } from '../lib/svg-export'
import type { BlastHitPreview, BlastQueryPreview, BlastResultSummary } from '../lib/job-results'

const SVG_SIZE = 760
const CENTER = SVG_SIZE / 2
const OUTER_RADIUS = 278
const INNER_RADIUS = 238
const LABEL_RADIUS = 316
const CHORD_RADIUS = 212
const NODE_GAP = 0.055
const MAX_QUERIES = 8
const MAX_HITS_PER_QUERY = 2
const MAX_HSPS_PER_HIT = 2
const MAX_HIT_NODES = 12

type OverviewNode = {
  id: string
  kind: 'query' | 'hit'
  label: string
  length: number
  startAngle: number
  endAngle: number
}

type OverviewLink = {
  id: string
  queryId: string
  hitId: string
  queryAngle: number
  hitAngle: number
  bitScore: number
  evalue?: number
  rank: number
}

function polarToCartesian(radius: number, angle: number) {
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  }
}

function donutPath(startAngle: number, endAngle: number, outerRadius: number, innerRadius: number) {
  const outerStart = polarToCartesian(outerRadius, startAngle)
  const outerEnd = polarToCartesian(outerRadius, endAngle)
  const innerEnd = polarToCartesian(innerRadius, endAngle)
  const innerStart = polarToCartesian(innerRadius, startAngle)
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function chordPath(startAngle: number, endAngle: number) {
  const start = polarToCartesian(CHORD_RADIUS, startAngle)
  const end = polarToCartesian(CHORD_RADIUS, endAngle)
  const control1 = polarToCartesian(108, startAngle)
  const control2 = polarToCartesian(108, endAngle)

  return [
    `M ${start.x} ${start.y}`,
    `C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
  ].join(' ')
}

function normalizeLength(length?: number): number {
  return typeof length === 'number' && length > 0 ? length : 100
}

function angleForCoordinate(node: OverviewNode, sequenceLength: number, start?: number, end?: number): number {
  const safeLength = Math.max(sequenceLength, 1)
  const midpoint = (((start ?? 1) + (end ?? start ?? 1)) / 2 - 1) / Math.max(safeLength - 1, 1)
  const clamped = Math.max(0, Math.min(1, midpoint))
  return node.startAngle + (node.endAngle - node.startAngle) * clamped
}

function truncateLabel(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 2)}..` : label
}

function chordColor(level: number): string {
  const safeLevel = Math.max(0, Math.min(1, level))
  const opacity = 0.22 + safeLevel * 0.68
  const red = Math.round(opacity * 181 + (1 - opacity) * 255)
  const green = Math.round(opacity * 101 + (1 - opacity) * 255)
  const blue = Math.round(opacity * 29 + (1 - opacity) * 255)
  return `rgb(${red}, ${green}, ${blue})`
}

function nodeColor(kind: 'query' | 'hit', active: boolean): string {
  if (kind === 'query') return active ? '#8b4513' : '#335c67'
  return active ? '#b5651d' : '#7c9a92'
}

function buildOverview(summary: BlastResultSummary) {
  const queryCandidates = summary.queries.filter((query) => query.hitCount > 0).slice(0, MAX_QUERIES)
  const hitMap = new Map<string, BlastHitPreview>()

  queryCandidates.forEach((query) => {
    query.hits.slice(0, MAX_HITS_PER_QUERY).forEach((hit) => {
      if (!hitMap.has(hit.id) && hitMap.size < MAX_HIT_NODES) {
        hitMap.set(hit.id, hit)
      }
    })
  })

  const baseNodes = [
    ...queryCandidates.map((query) => ({
      id: query.id,
      kind: 'query' as const,
      label: query.id,
      length: normalizeLength(query.length),
    })),
    ...Array.from(hitMap.values()).map((hit) => ({
      id: hit.id,
      kind: 'hit' as const,
      label: hit.id,
      length: normalizeLength(hit.length),
    })),
  ]

  if (baseNodes.length < 2) {
    return {
      nodes: [] as OverviewNode[],
      links: [] as OverviewLink[],
      queryCount: queryCandidates.length,
      hitCount: hitMap.size,
    }
  }

  const totalLength = baseNodes.reduce((sum, node) => sum + node.length, 0)
  const usableAngle = Math.PI * 2 - NODE_GAP * baseNodes.length
  let angleCursor = -Math.PI / 2

  const nodes = baseNodes.map((node) => {
    const arcAngle = (node.length / totalLength) * usableAngle
    const overviewNode: OverviewNode = {
      ...node,
      startAngle: angleCursor,
      endAngle: angleCursor + arcAngle,
    }
    angleCursor += arcAngle + NODE_GAP
    return overviewNode
  })

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const links: OverviewLink[] = []

  queryCandidates.forEach((query) => {
    const queryNode = nodeMap.get(query.id)
    if (!queryNode) return

    query.hits.slice(0, MAX_HITS_PER_QUERY).forEach((hit, hitIndex) => {
      const hitNode = nodeMap.get(hit.id)
      if (!hitNode) return

      hit.hsps.slice(0, MAX_HSPS_PER_HIT).forEach((hsp, hspIndex) => {
        links.push({
          id: `${query.id}__${hit.id}__${hsp.number ?? hspIndex + 1}`,
          queryId: query.id,
          hitId: hit.id,
          queryAngle: angleForCoordinate(queryNode, normalizeLength(query.length), hsp.qstart, hsp.qend),
          hitAngle: angleForCoordinate(hitNode, normalizeLength(hit.length), hsp.sstart, hsp.send),
          bitScore: hsp.bitScore ?? 0,
          evalue: hsp.evalue,
          rank: hitIndex + 1,
        })
      })
    })
  })

  return {
    nodes,
    links,
    queryCount: queryCandidates.length,
    hitCount: hitMap.size,
  }
}

export function BlastCircosOverview({
  summary,
  selectedQuery,
}: {
  summary: BlastResultSummary
  selectedQuery: BlastQueryPreview | null
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [focusOverride, setFocusOverride] = useState<string | null>(null)
  const [hoverText, setHoverText] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const overview = useMemo(() => buildOverview(summary), [summary])
  const maxBitScore = useMemo(() => Math.max(...overview.links.map((link) => link.bitScore), 1), [overview.links])
  const activeNodeId = focusOverride === null ? (selectedQuery?.id || '') : focusOverride

  async function handleExport(type: 'svg' | 'png') {
    if (!svgRef.current) return

    try {
      const filename = `${summary.searchId || 'blast'}__circos_overview`
      if (type === 'svg') {
        exportSvgElement(svgRef.current, filename)
      } else {
        await exportSvgElementAsPng(svgRef.current, filename)
      }
      setExportMessage(`圆环总览已导出为 ${type.toUpperCase()}。`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : '圆环总览导出失败。')
    }
  }

  if (overview.nodes.length < 2 || overview.links.length < 2) {
    return (
      <div className="visual-card">
        <div className="visual-card-header">
          <h5>全局圆环总览</h5>
        </div>
        <p>当前命中关系过少，暂时不适合展示 Circos 风格总览。</p>
      </div>
    )
  }

  return (
    <div className="visual-card">
      <div className="visual-card-header">
        <h5>全局圆环总览</h5>
        <div className="toolbar-group">
          <button className="secondary-button" onClick={() => void handleExport('svg')} type="button">
            SVG
          </button>
          <button className="secondary-button" onClick={() => void handleExport('png')} type="button">
            PNG
          </button>
          <button
            className={activeNodeId ? 'secondary-button active' : 'secondary-button'}
            onClick={() => setFocusOverride('')}
            type="button"
          >
            {activeNodeId ? '清除聚焦' : '全部显示'}
          </button>
        </div>
      </div>
      <p className="toolbar-note">
        选择前 {overview.queryCount} 个有命中的 query，以及它们前 {MAX_HITS_PER_QUERY} 个 hit 构建圆环总览；点击外圈可聚焦 query 或 hit。
      </p>
      {hoverText ? <p className="toolbar-note">{hoverText}</p> : null}
      {exportMessage ? <p className="toolbar-note">{exportMessage}</p> : null}
      <div className="visual-scroll">
        <svg
          aria-label="BLAST 全局圆环总览"
          className="overview-chart circos-chart"
          ref={svgRef}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          width="100%"
        >
          <circle cx={CENTER} cy={CENTER} fill="rgba(20, 33, 61, 0.02)" r={INNER_RADIUS - 22} />
          {overview.links.map((link) => {
            const active = !activeNodeId || activeNodeId === link.queryId || activeNodeId === link.hitId
            return (
              <path
                d={chordPath(link.queryAngle, link.hitAngle)}
                fill="none"
                key={link.id}
                onMouseEnter={() =>
                  setHoverText(
                    `${link.queryId} -> ${link.hitId} | hit rank ${link.rank} | bit score ${link.bitScore.toFixed(2)} | evalue ${link.evalue ?? '-'}`,
                  )
                }
                onMouseLeave={() => setHoverText('')}
                stroke={chordColor(link.bitScore / maxBitScore)}
                strokeOpacity={active ? 0.9 : 0.12}
                strokeWidth={active ? 2.4 : 1.2}
              />
            )
          })}

          {overview.nodes.map((node) => {
            const active = !activeNodeId || activeNodeId === node.id
            const midAngle = (node.startAngle + node.endAngle) / 2
            const labelPoint = polarToCartesian(LABEL_RADIUS, midAngle)
            const rotation = (midAngle * 180) / Math.PI
            const flip = rotation > 90 || rotation < -90

            return (
              <g key={node.id}>
                <path
                  className="circos-node"
                  d={donutPath(node.startAngle, node.endAngle, OUTER_RADIUS, INNER_RADIUS)}
                  fill={nodeColor(node.kind, active)}
                  fillOpacity={active ? 0.92 : 0.38}
                  onClick={() => setFocusOverride((current) => (current === node.id ? '' : node.id))}
                  onMouseEnter={() =>
                    setHoverText(`${node.kind === 'query' ? 'Query' : 'Hit'}: ${node.id} | 长度 ${new Intl.NumberFormat('zh-CN').format(node.length)}`)
                  }
                  onMouseLeave={() => setHoverText('')}
                  stroke="rgba(20, 33, 61, 0.12)"
                  strokeWidth="1"
                  style={{ cursor: 'pointer' }}
                />
                <text
                  className="circos-label"
                  fillOpacity={active ? 1 : 0.45}
                  textAnchor={flip ? 'end' : 'start'}
                  transform={`translate(${labelPoint.x} ${labelPoint.y}) rotate(${flip ? rotation + 180 : rotation})`}
                >
                  {truncateLabel(node.label)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="metric-helper">
        外圈按序列长度分配弧段，内层弦线表示 query 与 top hit 的 HSP 对应关系。颜色越深表示 bit score 越高。
      </p>
    </div>
  )
}
