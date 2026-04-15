import { useMemo, useRef, useState } from 'react'
import { buildAlignmentExport, buildHspStats, formatPairwiseAlignment, type BlastAlgorithm } from '../lib/blast-alignment'
import { useI18n } from '../lib/i18n'
import { exportSvgElement, exportSvgElementAsPng } from '../lib/svg-export'
import type { BlastHitPreview } from '../lib/job-results'

const LINE_WIDTH_OPTIONS = [60, 90, 120] as const
const GRAPH_WIDTH = 860
const GRAPH_HEIGHT = 250
const GRAPH_PADDING_X = 80
const GRAPH_PADDING_Y = 52

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function blendWithWhite(channel: number, opacity: number): number {
  return Math.round(opacity * channel + (1 - opacity) * 255)
}

function hspColor(level: number): string {
  const safeLevel = Math.max(0, Math.min(1, level))
  const opacity = 0.3 + safeLevel * 0.7
  const red = blendWithWhite(199, opacity)
  const green = blendWithWhite(79, opacity)
  const blue = blendWithWhite(20, opacity)
  return `rgb(${red}, ${green}, ${blue})`
}

function mapCoordinate(
  coordinate: number | undefined,
  sequenceLength: number,
  reverse: boolean,
  minX: number,
  maxX: number,
): number {
  const safeCoordinate = typeof coordinate === 'number' ? coordinate : 1
  const safeLength = Math.max(sequenceLength, 1)
  const ratio = safeLength <= 1 ? 0 : (safeCoordinate - 1) / (safeLength - 1)
  const normalized = reverse ? 1 - ratio : ratio
  return minX + normalized * (maxX - minX)
}

function polygonPoints(
  qstart: number | undefined,
  qend: number | undefined,
  sstart: number | undefined,
  send: number | undefined,
  queryLength: number,
  subjectLength: number,
  queryReverse: boolean,
  subjectReverse: boolean,
  minX: number,
  maxX: number,
  queryY: number,
  subjectY: number,
): string {
  const queryStartX = mapCoordinate(qstart, queryLength, queryReverse, minX, maxX)
  const queryEndX = mapCoordinate(qend, queryLength, queryReverse, minX, maxX)
  const subjectStartX = mapCoordinate(sstart, subjectLength, subjectReverse, minX, maxX)
  const subjectEndX = mapCoordinate(send, subjectLength, subjectReverse, minX, maxX)

  const topLeft = Math.min(queryStartX, queryEndX)
  const topRight = Math.max(queryStartX, queryEndX)
  const bottomLeft = Math.min(subjectStartX, subjectEndX)
  const bottomRight = Math.max(subjectStartX, subjectEndX)

  return [
    `${topLeft},${queryY + 2}`,
    `${bottomLeft},${subjectY - 2}`,
    `${bottomRight},${subjectY - 2}`,
    `${topRight},${queryY + 2}`,
  ].join(' ')
}

function buildAxisTicks(sequenceLength: number, reverse: boolean, locale: 'zh-CN' | 'en') {
  const safeLength = Math.max(sequenceLength, 1)
  const positions = [0, 0.25, 0.5, 0.75, 1]

  return positions.map((position) => {
    const value = reverse
      ? Math.round(safeLength - position * (safeLength - 1))
      : Math.round(1 + position * (safeLength - 1))

    return {
      position,
      label: new Intl.NumberFormat(locale).format(value),
    }
  })
}

export function BlastAlignmentViewer({
  queryId,
  hit,
  algorithm,
  queryLength,
}: {
  queryId: string
  hit: BlastHitPreview
  algorithm: BlastAlgorithm
  queryLength?: number
}) {
  const { isChinese, locale } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [selectedHspIndex, setSelectedHspIndex] = useState(0)
  const [lineWidth, setLineWidth] = useState<number>(90)
  const [exportMessage, setExportMessage] = useState('')
  const graphRef = useRef<SVGSVGElement | null>(null)

  const safeSelectedHspIndex = Math.min(selectedHspIndex, Math.max(0, hit.hsps.length - 1))
  const selectedHsp = hit.hsps[safeSelectedHspIndex]
  const computedQueryLength = useMemo(() => {
    if (!expanded && typeof queryLength === 'number' && queryLength > 0) return queryLength
    if (typeof queryLength === 'number' && queryLength > 0) return queryLength
    return hit.hsps.reduce((max, hsp) => Math.max(max, hsp.qstart ?? 0, hsp.qend ?? 0), 1)
  }, [expanded, hit.hsps, queryLength])
  const computedSubjectLength = useMemo(() => {
    if (!expanded && typeof hit.length === 'number' && hit.length > 0) return hit.length
    if (typeof hit.length === 'number' && hit.length > 0) return hit.length
    return hit.hsps.reduce((max, hsp) => Math.max(max, hsp.sstart ?? 0, hsp.send ?? 0), 1)
  }, [expanded, hit.hsps, hit.length])
  const queryReverse = (hit.hsps[0]?.qframe ?? 1) < 0
  const subjectReverse = (hit.hsps[0]?.sframe ?? 1) < 0
  const alignmentText = useMemo(
    () => {
      if (!expanded) return ''
      return selectedHsp
        ? formatPairwiseAlignment(selectedHsp, algorithm, lineWidth, locale)
        : (isChinese ? '当前命中没有 HSP。' : 'No HSP is available for this hit.')
    },
    [algorithm, expanded, isChinese, lineWidth, locale, selectedHsp],
  )
  const maxBitScore = useMemo(
    () => (expanded ? Math.max(...hit.hsps.map((hsp) => hsp.bitScore ?? 0), 1) : 1),
    [expanded, hit.hsps],
  )
  const queryTicks = useMemo(
    () => (expanded ? buildAxisTicks(computedQueryLength, queryReverse, locale) : []),
    [computedQueryLength, expanded, locale, queryReverse],
  )
  const subjectTicks = useMemo(
    () => (expanded ? buildAxisTicks(computedSubjectLength, subjectReverse, locale) : []),
    [computedSubjectLength, expanded, locale, subjectReverse],
  )

  async function handleGraphicExport(type: 'svg' | 'png') {
    if (!graphRef.current) return

    const filename = `${queryId}__${hit.id}__graphical_alignment`
    try {
      if (type === 'svg') {
        exportSvgElement(graphRef.current, filename)
      } else {
        await exportSvgElementAsPng(graphRef.current, filename, locale)
      }
      setExportMessage(isChinese ? `图形对齐概览已导出为 ${type.toUpperCase()}。` : `Graphic alignment overview exported as ${type.toUpperCase()}.`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : (isChinese ? '图形对齐导出失败。' : 'Failed to export the graphic alignment overview.'))
    }
  }

  if (!hit.hsps.length) {
    return <p className="toolbar-note">{isChinese ? '当前命中没有 HSP，无法展开 alignment。' : 'This hit has no HSP, so the alignment view cannot be expanded.'}</p>
  }

  return (
    <div className="alignment-viewer">
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            className={expanded ? 'secondary-button active' : 'secondary-button'}
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? (isChinese ? '收起 alignment' : 'Collapse Alignment') : (isChinese ? '查看 alignment' : 'View Alignment')}
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              const exportText = buildAlignmentExport(queryId, hit.id, hit.hsps, algorithm, lineWidth, locale)
              downloadTextFile(
                exportText,
                `${sanitizeFilename(queryId)}__${sanitizeFilename(hit.id)}__alignment.txt`,
              )
            }}
            type="button"
          >
            {isChinese ? '导出全部 HSP 文本' : 'Export All HSP Text'}
          </button>
          {selectedHsp ? (
            <button
              className="secondary-button"
              onClick={() => {
                downloadTextFile(
                  buildAlignmentExport(queryId, hit.id, [selectedHsp], algorithm, lineWidth, locale),
                  `${sanitizeFilename(queryId)}__${sanitizeFilename(hit.id)}__hsp_${selectedHsp.number ?? safeSelectedHspIndex + 1}.txt`,
                )
              }}
              type="button"
            >
              {isChinese ? '导出当前 HSP' : 'Export Current HSP'}
            </button>
          ) : null}
        </div>
        <div className="toolbar-group">
          <span className="toolbar-note">{isChinese ? 'HSP 数量' : 'HSP Count'}：{hit.hsps.length}</span>
        </div>
      </div>

      {expanded ? (
        <div className="alignment-panel">
          <div className="visual-card alignment-graphic-card">
            <div className="toolbar">
              <div className="toolbar-group">
                <strong>{isChinese ? '图形对齐概览' : 'Graphic Alignment Overview'}</strong>
                <span className="toolbar-note">
                  {isChinese
                    ? `选中多边形可切换 HSP。Query ${queryReverse ? '反向轴' : '正向轴'}，Subject ${subjectReverse ? '反向轴' : '正向轴'}。`
                    : `Select a polygon to switch HSP. Query uses a ${queryReverse ? 'reverse' : 'forward'} axis and Subject uses a ${subjectReverse ? 'reverse' : 'forward'} axis.`}
                </span>
              </div>
              <div className="toolbar-group">
                <button className="secondary-button" onClick={() => void handleGraphicExport('svg')} type="button">
                  SVG
                </button>
                <button className="secondary-button" onClick={() => void handleGraphicExport('png')} type="button">
                  PNG
                </button>
                <span className="legend-chip legend-chip-weak">{isChinese ? '低 bit score' : 'Low Bit Score'}</span>
                <span className="legend-chip legend-chip-strong">{isChinese ? '高 bit score' : 'High Bit Score'}</span>
              </div>
            </div>
            {exportMessage ? <p className="toolbar-note">{exportMessage}</p> : null}
            <div className="visual-scroll">
              <svg
                aria-label={isChinese ? '单个 hit 的图形对齐概览' : 'Graphic alignment overview for a single hit'}
                className="overview-chart"
                ref={graphRef}
                viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                width="100%"
              >
                <line
                  stroke="#14213d"
                  strokeOpacity="0.3"
                  strokeWidth="2"
                  x1={GRAPH_PADDING_X}
                  x2={GRAPH_WIDTH - GRAPH_PADDING_X}
                  y1={GRAPH_PADDING_Y}
                  y2={GRAPH_PADDING_Y}
                />
                <line
                  stroke="#14213d"
                  strokeOpacity="0.3"
                  strokeWidth="2"
                  x1={GRAPH_PADDING_X}
                  x2={GRAPH_WIDTH - GRAPH_PADDING_X}
                  y1={GRAPH_HEIGHT - GRAPH_PADDING_Y}
                  y2={GRAPH_HEIGHT - GRAPH_PADDING_Y}
                />
                <text className="graph-axis-label" x={20} y={GRAPH_PADDING_Y + 4}>
                  Query
                </text>
                <text className="graph-axis-label" x={20} y={GRAPH_HEIGHT - GRAPH_PADDING_Y + 4}>
                  Subject
                </text>
                <text className="graph-axis-title" textAnchor="end" x={GRAPH_WIDTH - 12} y={24}>
                  {queryId} ({new Intl.NumberFormat(locale).format(computedQueryLength)})
                </text>
                <text className="graph-axis-title" textAnchor="end" x={GRAPH_WIDTH - 12} y={GRAPH_HEIGHT - 12}>
                  {hit.id} ({new Intl.NumberFormat(locale).format(computedSubjectLength)})
                </text>

                {queryTicks.map((tick) => {
                  const x = GRAPH_PADDING_X + tick.position * (GRAPH_WIDTH - GRAPH_PADDING_X * 2)
                  return (
                    <g key={`query-tick-${tick.position}`}>
                      <line
                        stroke="#14213d"
                        strokeOpacity="0.14"
                        x1={x}
                        x2={x}
                        y1={GRAPH_PADDING_Y - 12}
                        y2={GRAPH_PADDING_Y + 12}
                      />
                      <text className="graph-tick" textAnchor="middle" x={x} y={GRAPH_PADDING_Y - 18}>
                        {tick.label}
                      </text>
                    </g>
                  )
                })}

                {subjectTicks.map((tick) => {
                  const x = GRAPH_PADDING_X + tick.position * (GRAPH_WIDTH - GRAPH_PADDING_X * 2)
                  return (
                    <g key={`subject-tick-${tick.position}`}>
                      <line
                        stroke="#14213d"
                        strokeOpacity="0.14"
                        x1={x}
                        x2={x}
                        y1={GRAPH_HEIGHT - GRAPH_PADDING_Y - 12}
                        y2={GRAPH_HEIGHT - GRAPH_PADDING_Y + 12}
                      />
                      <text className="graph-tick" textAnchor="middle" x={x} y={GRAPH_HEIGHT - GRAPH_PADDING_Y + 28}>
                        {tick.label}
                      </text>
                    </g>
                  )
                })}

                {hit.hsps
                  .slice()
                  .reverse()
                  .map((hsp) => {
                    const originalIndex = hit.hsps.findIndex((item) => item === hsp)
                    const scoreLevel = (hsp.bitScore ?? 0) / maxBitScore
                    const selected = originalIndex === safeSelectedHspIndex

                    return (
                      <g key={`${hit.id}-polygon-${hsp.number ?? originalIndex + 1}`}>
                        <polygon
                          className={selected ? 'alignment-polygon alignment-polygon-active' : 'alignment-polygon'}
                          fill={hspColor(scoreLevel)}
                          onClick={() => setSelectedHspIndex(originalIndex)}
                          points={polygonPoints(
                            hsp.qstart,
                            hsp.qend,
                            hsp.sstart,
                            hsp.send,
                            computedQueryLength,
                            computedSubjectLength,
                            queryReverse,
                            subjectReverse,
                            GRAPH_PADDING_X,
                            GRAPH_WIDTH - GRAPH_PADDING_X,
                            GRAPH_PADDING_Y,
                            GRAPH_HEIGHT - GRAPH_PADDING_Y,
                          )}
                          stroke={selected ? '#14213d' : 'rgba(20, 33, 61, 0.16)'}
                          strokeWidth={selected ? 2.4 : 1}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>
                            {`HSP ${hsp.number ?? originalIndex + 1} | bit score ${hsp.bitScore ?? '-'} | evalue ${hsp.evalue ?? '-'}`}
                          </title>
                        </polygon>
                        <text
                          className={selected ? 'graph-hsp-label graph-hsp-label-active' : 'graph-hsp-label'}
                          textAnchor="middle"
                          x={GRAPH_WIDTH / 2}
                          y={GRAPH_HEIGHT / 2}
                        >
                          {selected ? `HSP ${hsp.number ?? originalIndex + 1}` : ''}
                        </text>
                      </g>
                    )
                  })}
              </svg>
            </div>
            <p className="metric-helper">
              {isChinese
                ? '颜色越深表示 bit score 越高；当前高亮 HSP 会同步更新下方文本 alignment 和统计信息。'
                : 'Darker color indicates a higher bit score. The highlighted HSP also updates the text alignment and statistics below.'}
            </p>
          </div>

          <div className="alignment-toolbar">
            <div className="toolbar-group alignment-chip-group">
              {hit.hsps.map((hsp, index) => (
                <button
                  className={safeSelectedHspIndex === index ? 'secondary-button active' : 'secondary-button'}
                  key={`${hit.id}-hsp-${hsp.number ?? index + 1}`}
                  onClick={() => setSelectedHspIndex(index)}
                  type="button"
                >
                  HSP {hsp.number ?? index + 1}
                </button>
              ))}
            </div>
            <div className="toolbar-group">
              <span className="toolbar-note">{isChinese ? '每行字符' : 'Characters Per Line'}</span>
              {LINE_WIDTH_OPTIONS.map((size) => (
                <button
                  className={lineWidth === size ? 'secondary-button active' : 'secondary-button'}
                  key={size}
                  onClick={() => setLineWidth(size)}
                  type="button"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {selectedHsp ? (
            <>
              <div className="key-value-grid">
                {buildHspStats(selectedHsp, algorithm).map((item) => (
                  <div className="key-value-item" key={item}>
                    <span>{isChinese ? '统计' : 'Stat'}</span>
                    <strong>{item}</strong>
                  </div>
                ))}
                <div className="key-value-item">
                  <span>{isChinese ? 'Query 范围' : 'Query Range'}</span>
                  <strong>
                    {selectedHsp.qstart ?? '-'} - {selectedHsp.qend ?? '-'}
                  </strong>
                </div>
                <div className="key-value-item">
                  <span>{isChinese ? 'Subject 范围' : 'Subject Range'}</span>
                  <strong>
                    {selectedHsp.sstart ?? '-'} - {selectedHsp.send ?? '-'}
                  </strong>
                </div>
                <div className="key-value-item">
                  <span>{isChinese ? '当前命中长度' : 'Current Hit Length'}</span>
                  <strong>{new Intl.NumberFormat(locale).format(computedSubjectLength)}</strong>
                </div>
              </div>
              <pre className="alignment-box">{alignmentText}</pre>
            </>
          ) : (
            <p>{isChinese ? '当前命中没有可渲染的 HSP。' : 'This hit has no renderable HSP.'}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
