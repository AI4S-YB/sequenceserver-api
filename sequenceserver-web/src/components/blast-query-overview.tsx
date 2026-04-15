import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useI18n } from '../lib/i18n'
import type { BlastHitPreview, BlastHspPreview, BlastQueryPreview } from '../lib/job-results'
import { exportSvgElement, exportSvgElementAsPng, sanitizeExportName } from '../lib/svg-export'

const DEFAULT_VISIBLE_HITS = 20
const VISIBLE_HITS_STEP = 20
const TRACK_CHART_WIDTH = 920
const TRACK_LABEL_WIDTH = 210
const TRACK_RIGHT_MARGIN = 32
const TRACK_TOP_MARGIN = 28
const TRACK_BOTTOM_MARGIN = 54
const TRACK_ROW_HEIGHT = 28
const TRACK_BAR_HEIGHT = 12
const HISTOGRAM_WIDTH = 920
const HISTOGRAM_HEIGHT = 280
const HISTOGRAM_MARGIN = { top: 24, right: 30, bottom: 60, left: 52 }
const HISTOGRAM_BIN_COUNT = 12

type SupportedAlgorithm = 'blastn' | 'blastp' | 'blastx' | 'tblastn' | 'tblastx' | string

type HistogramBin = {
  start: number
  end: number
  hits: BlastHitPreview[]
}

function formatCount(value: number | undefined, locale: 'zh-CN' | 'en'): string {
  return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat(locale).format(value) : '-'
}

function truncateLabel(value: string, limit = 28): string {
  return value.length > limit ? `${value.slice(0, limit - 2)}..` : value
}

function bestEvalue(hit: BlastHitPreview): number | undefined {
  const values = hit.hsps
    .map((hsp) => hsp.evalue)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)

  if (!values.length) return undefined
  return Math.min(...values)
}

function hspRange(hsp: BlastHspPreview): { start: number; end: number } | null {
  if (typeof hsp.qstart !== 'number' || typeof hsp.qend !== 'number') return null

  return {
    start: Math.min(hsp.qstart, hsp.qend),
    end: Math.max(hsp.qstart, hsp.qend),
  }
}

function effectiveHitLengthUnit(algorithm: SupportedAlgorithm, isChinese: boolean): string {
  if (algorithm === 'blastp' || algorithm === 'blastx') {
    return isChinese ? 'aa' : 'aa'
  }

  return isChinese ? 'bp' : 'bp'
}

function effectiveQueryLength(length: number | undefined, algorithm: SupportedAlgorithm): number {
  if (typeof length !== 'number' || length <= 0) return 0
  if (algorithm === 'blastx') return Math.max(1, Math.round(length / 3))
  if (algorithm === 'tblastn') return length * 3
  return length
}

function interpolateHexColor(from: string, to: string, ratio: number): string {
  const start = from.replace('#', '')
  const end = to.replace('#', '')
  const clamped = Math.max(0, Math.min(1, ratio))

  const channels = [0, 2, 4].map((offset) => {
    const a = Number.parseInt(start.slice(offset, offset + 2), 16)
    const b = Number.parseInt(end.slice(offset, offset + 2), 16)
    return Math.round(a + (b - a) * clamped)
      .toString(16)
      .padStart(2, '0')
  })

  return `#${channels.join('')}`
}

function createHitColorResolver(hits: BlastHitPreview[]) {
  const scores = hits
    .map((hit) => bestEvalue(hit))
    .filter((value): value is number => typeof value === 'number')
    .map((value) => (value === 0 ? -320 : Math.log10(value)))

  const weakest = scores.length ? Math.max(...scores) : 0
  const strongest = scores.length ? Math.min(...scores) : weakest

  return (hit: BlastHitPreview): string => {
    const value = bestEvalue(hit)
    if (typeof value !== 'number') return '#a9b3c1'

    const score = value === 0 ? -320 : Math.log10(value)
    const ratio = weakest === strongest ? 0 : (score - strongest) / (weakest - strongest)
    return interpolateHexColor('#c74f14', '#f6bea2', ratio)
  }
}

function buildHistogramBins(hits: BlastHitPreview[], domainMax: number): HistogramBin[] {
  if (!hits.length || domainMax <= 0) return []

  const binWidth = Math.max(1, Math.ceil(domainMax / HISTOGRAM_BIN_COUNT))
  const bins = Array.from({ length: HISTOGRAM_BIN_COUNT }, (_, index) => ({
    start: index * binWidth,
    end: index === HISTOGRAM_BIN_COUNT - 1 ? domainMax : Math.min(domainMax, (index + 1) * binWidth),
    hits: [] as BlastHitPreview[],
  }))

  hits.forEach((hit) => {
    if (typeof hit.length !== 'number' || hit.length <= 0) return
    const zeroBased = Math.max(0, hit.length - 1)
    const index = Math.min(HISTOGRAM_BIN_COUNT - 1, Math.floor(zeroBased / binWidth))
    bins[index]?.hits.push(hit)
  })

  bins.forEach((bin) => {
    bin.hits.sort((left, right) => {
      const leftValue = bestEvalue(left) ?? Number.POSITIVE_INFINITY
      const rightValue = bestEvalue(right) ?? Number.POSITIVE_INFINITY
      return leftValue - rightValue
    })
  })

  return bins
}

function buildAxisTicks(maxValue: number, count: number): number[] {
  if (maxValue <= 0) return [0]

  return Array.from({ length: count + 1 }, (_, index) => Math.round((maxValue / count) * index))
}

function tooltipForHit(hit: BlastHitPreview, locale: 'zh-CN' | 'en'): string {
  const evalue = bestEvalue(hit)
  const pieces = [
    hit.id,
    `${locale === 'zh-CN' ? '长度' : 'Length'}: ${formatCount(hit.length, locale)}`,
    `${locale === 'zh-CN' ? '最佳 E 值' : 'Best E-value'}: ${typeof evalue === 'number' ? evalue : '-'}`,
  ]

  return pieces.join('\n')
}

export function BlastQueryOverview({
  query,
  algorithm,
  searchId,
  onFocusHit,
  variant = 'cards',
}: {
  query: BlastQueryPreview
  algorithm: SupportedAlgorithm
  searchId?: string
  onFocusHit?: (hitId: string) => void
  variant?: 'cards' | 'inline'
}) {
  const { isChinese, locale } = useI18n()
  const alignmentChartRef = useRef<SVGSVGElement | null>(null)
  const histogramChartRef = useRef<SVGSVGElement | null>(null)
  const [visibleHitCount, setVisibleHitCount] = useState(DEFAULT_VISIBLE_HITS)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    setVisibleHitCount(DEFAULT_VISIBLE_HITS)
    setExportMessage('')
  }, [query.id])

  const queryLength = Math.max(1, query.length || 1)
  const trackWidth = TRACK_CHART_WIDTH - TRACK_LABEL_WIDTH - TRACK_RIGHT_MARGIN
  const visibleHits = useMemo(() => query.hits.slice(0, visibleHitCount), [query.hits, visibleHitCount])
  const trackHeight = Math.max(150, TRACK_TOP_MARGIN + visibleHits.length * TRACK_ROW_HEIGHT + TRACK_BOTTOM_MARGIN)
  const colorForHit = useMemo(() => createHitColorResolver(query.hits), [query.hits])
  const histogramDomainMax = useMemo(() => {
    const lengths = query.hits
      .map((hit) => hit.length)
      .filter((value): value is number => typeof value === 'number' && value > 0)

    return Math.max(effectiveQueryLength(query.length, algorithm), ...lengths, 1)
  }, [algorithm, query.hits, query.length])
  const histogramBins = useMemo(() => buildHistogramBins(query.hits, histogramDomainMax), [query.hits, histogramDomainMax])
  const histogramMaxCount = Math.max(1, ...histogramBins.map((bin) => bin.hits.length))
  const histogramPlotWidth = HISTOGRAM_WIDTH - HISTOGRAM_MARGIN.left - HISTOGRAM_MARGIN.right
  const histogramPlotHeight = HISTOGRAM_HEIGHT - HISTOGRAM_MARGIN.top - HISTOGRAM_MARGIN.bottom
  const histogramBarWidth = histogramBins.length ? histogramPlotWidth / histogramBins.length : histogramPlotWidth
  const queryReferenceLength = effectiveQueryLength(query.length, algorithm)
  const gradientId = useMemo(() => `query-overview-gradient-${sanitizeExportName(query.id)}`, [query.id])
  const xTicks = useMemo(() => buildAxisTicks(histogramDomainMax, 4), [histogramDomainMax])
  const yTicks = useMemo(() => {
    const raw = buildAxisTicks(histogramMaxCount, Math.min(4, histogramMaxCount))
    return Array.from(new Set(raw))
  }, [histogramMaxCount])

  async function handleExport(
    ref: RefObject<SVGSVGElement | null>,
    type: 'svg' | 'png',
    label: string,
    suffix: string,
  ) {
    if (!ref.current) return

    const filename = `${searchId || 'blast'}__${query.id}__${suffix}`

    try {
      if (type === 'svg') {
        exportSvgElement(ref.current, filename)
      } else {
        await exportSvgElementAsPng(ref.current, filename, locale)
      }
      setExportMessage(isChinese ? `${label} 已导出为 ${type.toUpperCase()}。` : `${label} exported as ${type.toUpperCase()}.`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : isChinese ? `${label} 导出失败。` : `Failed to export ${label}.`)
    }
  }

  const panelClassName = variant === 'inline' ? 'query-overview-panel' : 'visual-card'

  return (
    <div className={variant === 'inline' ? 'query-overview-grid query-overview-grid-inline' : 'query-overview-grid'}>
      {exportMessage ? <p className="toolbar-note">{exportMessage}</p> : null}

      <div className={panelClassName}>
        <div className="visual-card-header">
          <div>
            <h5>{isChinese ? '命中对齐总览' : 'Hit Alignment Overview'}</h5>
            <p className="metric-helper">
              {isChinese
                ? '按旧版结果页的阅读方式，显示当前 query 前若干个命中的 HSP 在 query 坐标上的覆盖范围。点击行可跳转到下方对应 hit 详情。'
                : 'Shows the HSP coverage of the current query hits on query coordinates, following the legacy result page reading pattern. Click a row to jump to the corresponding hit detail below.'}
            </p>
          </div>
          <div className="toolbar-group">
            <button
              className="secondary-button"
              onClick={() => handleExport(alignmentChartRef, 'svg', isChinese ? '命中对齐总览' : 'Hit Alignment Overview', 'query_hits_overview')}
              type="button"
            >
              SVG
            </button>
            <button
              className="secondary-button"
              onClick={() => handleExport(alignmentChartRef, 'png', isChinese ? '命中对齐总览' : 'Hit Alignment Overview', 'query_hits_overview')}
              type="button"
            >
              PNG
            </button>
          </div>
        </div>

        {query.hits.length ? (
          <>
            <div className="visual-scroll">
              <svg
                aria-label={isChinese ? 'Query 命中对齐总览' : 'Query hit alignment overview'}
                className="overview-chart query-track-chart"
                height={trackHeight}
                ref={alignmentChartRef}
                viewBox={`0 0 ${TRACK_CHART_WIDTH} ${trackHeight}`}
                width="100%"
              >
                <defs>
                  <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#c74f14" />
                    <stop offset="100%" stopColor="#f6bea2" />
                  </linearGradient>
                </defs>

                <line
                  className="query-axis-line"
                  stroke="rgba(20, 33, 61, 0.18)"
                  x1={TRACK_LABEL_WIDTH}
                  x2={TRACK_LABEL_WIDTH + trackWidth}
                  y1="18"
                  y2="18"
                />
                <text className="graph-axis-title" x={TRACK_LABEL_WIDTH} y="14">
                  1
                </text>
                <text className="graph-axis-title" textAnchor="end" x={TRACK_LABEL_WIDTH + trackWidth} y="14">
                  {formatCount(query.length, locale)}
                </text>

                {visibleHits.map((hit, index) => {
                  const y = TRACK_TOP_MARGIN + index * TRACK_ROW_HEIGHT
                  const color = colorForHit(hit)
                  const ranges = hit.hsps
                    .map((hsp) => hspRange(hsp))
                    .filter((value): value is { start: number; end: number } => value !== null)

                  return (
                    <g
                      className="query-hit-row"
                      key={`${query.id}-${hit.id}`}
                      onClick={() => onFocusHit?.(hit.id)}
                      role={onFocusHit ? 'button' : undefined}
                      tabIndex={onFocusHit ? 0 : -1}
                      onKeyDown={(event) => {
                        if (!onFocusHit) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onFocusHit(hit.id)
                        }
                      }}
                    >
                      <title>{tooltipForHit(hit, locale)}</title>
                      <text className="graph-axis-title" x="10" y={y + 4}>
                        {index + 1}. {truncateLabel(hit.id)}
                      </text>
                      <line
                        className="query-hit-baseline"
                        stroke="rgba(20, 33, 61, 0.12)"
                        x1={TRACK_LABEL_WIDTH}
                        x2={TRACK_LABEL_WIDTH + trackWidth}
                        y1={y}
                        y2={y}
                      />
                      {ranges.length ? (
                        ranges.map((range, rangeIndex) => {
                          const startX = TRACK_LABEL_WIDTH + ((range.start - 1) / queryLength) * trackWidth
                          const width = Math.max(4, ((range.end - range.start + 1) / queryLength) * trackWidth)

                          return (
                            <rect
                              fill={color}
                              height={TRACK_BAR_HEIGHT}
                              key={`${hit.id}-${rangeIndex}`}
                              opacity="0.92"
                              rx="6"
                              width={width}
                              x={startX}
                              y={y - TRACK_BAR_HEIGHT / 2}
                            />
                          )
                        })
                      ) : (
                        <text className="graph-tick" textAnchor="end" x={TRACK_LABEL_WIDTH + trackWidth} y={y + 4}>
                          {isChinese ? '无 HSP 坐标' : 'No HSP coordinates'}
                        </text>
                      )}
                    </g>
                  )
                })}

                <g transform={`translate(${TRACK_CHART_WIDTH - 196}, ${trackHeight - 22})`}>
                  <rect fill={`url(#${gradientId})`} height="10" rx="5" width="120" x="0" y="-10" />
                  <text className="graph-tick" textAnchor="start" x="0" y="14">
                    {isChinese ? '更强' : 'Stronger'}
                  </text>
                  <text className="graph-tick" textAnchor="end" x="120" y="14">
                    {isChinese ? '更弱' : 'Weaker'}
                  </text>
                </g>
              </svg>
            </div>

            <div className="query-overview-controls">
              <span className="toolbar-note">
                {isChinese
                  ? `当前显示前 ${formatCount(visibleHits.length, locale)} / ${formatCount(query.hits.length, locale)} 个命中。`
                  : `Showing the first ${formatCount(visibleHits.length, locale)} / ${formatCount(query.hits.length, locale)} hits.`}
              </span>
              <div className="toolbar-group">
                <button
                  className="secondary-button"
                  disabled={visibleHitCount <= DEFAULT_VISIBLE_HITS}
                  onClick={() => setVisibleHitCount((current) => Math.max(DEFAULT_VISIBLE_HITS, current - VISIBLE_HITS_STEP))}
                  type="button"
                >
                  {isChinese ? '收起 20 个' : 'View Less'}
                </button>
                <button
                  className="secondary-button"
                  disabled={visibleHitCount >= query.hits.length}
                  onClick={() => setVisibleHitCount((current) => Math.min(query.hits.length, current + VISIBLE_HITS_STEP))}
                  type="button"
                >
                  {isChinese ? '再展开 20 个' : 'View More'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="metric-helper">{isChinese ? '当前 query 没有命中，无法绘制图形总览。' : 'This query has no hits, so the overview chart is unavailable.'}</p>
        )}
      </div>

      <div className={panelClassName}>
        <div className="visual-card-header">
          <div>
            <h5>{isChinese ? '命中长度分布' : 'Hit Length Distribution'}</h5>
            <p className="metric-helper">
              {isChinese
                ? '按旧版结果页方式显示命中长度分布，并用参考线标出当前 query 的等效长度。'
                : 'Displays the hit length distribution in a legacy-style histogram and marks the effective query length with a reference line.'}
            </p>
          </div>
          <div className="toolbar-group">
            <button
              className="secondary-button"
              onClick={() => handleExport(histogramChartRef, 'svg', isChinese ? '命中长度分布' : 'Hit Length Distribution', 'query_length_distribution')}
              type="button"
            >
              SVG
            </button>
            <button
              className="secondary-button"
              onClick={() => handleExport(histogramChartRef, 'png', isChinese ? '命中长度分布' : 'Hit Length Distribution', 'query_length_distribution')}
              type="button"
            >
              PNG
            </button>
          </div>
        </div>

        {query.hits.some((hit) => typeof hit.length === 'number' && hit.length > 0) ? (
          <div className="visual-scroll">
            <svg
              aria-label={isChinese ? '命中长度分布图' : 'Hit length distribution chart'}
              className="overview-chart query-histogram-chart"
              height={HISTOGRAM_HEIGHT}
              ref={histogramChartRef}
              viewBox={`0 0 ${HISTOGRAM_WIDTH} ${HISTOGRAM_HEIGHT}`}
              width="100%"
            >
              <line
                className="query-axis-line"
                stroke="rgba(20, 33, 61, 0.18)"
                x1={HISTOGRAM_MARGIN.left}
                x2={HISTOGRAM_MARGIN.left + histogramPlotWidth}
                y1={HISTOGRAM_MARGIN.top + histogramPlotHeight}
                y2={HISTOGRAM_MARGIN.top + histogramPlotHeight}
              />
              <line
                className="query-axis-line"
                stroke="rgba(20, 33, 61, 0.18)"
                x1={HISTOGRAM_MARGIN.left}
                x2={HISTOGRAM_MARGIN.left}
                y1={HISTOGRAM_MARGIN.top}
                y2={HISTOGRAM_MARGIN.top + histogramPlotHeight}
              />

              {yTicks.map((tick) => {
                const y = HISTOGRAM_MARGIN.top + histogramPlotHeight - (tick / histogramMaxCount) * histogramPlotHeight
                return (
                  <g key={`y-${tick}`}>
                    <line
                      stroke="rgba(20, 33, 61, 0.08)"
                      x1={HISTOGRAM_MARGIN.left}
                      x2={HISTOGRAM_MARGIN.left + histogramPlotWidth}
                      y1={y}
                      y2={y}
                    />
                    <text className="graph-tick" textAnchor="end" x={HISTOGRAM_MARGIN.left - 8} y={y + 4}>
                      {tick}
                    </text>
                  </g>
                )
              })}

              {histogramBins.map((bin, index) => {
                const x = HISTOGRAM_MARGIN.left + index * histogramBarWidth
                const width = Math.max(10, histogramBarWidth - 6)
                const segmentHeight = histogramPlotHeight / histogramMaxCount

                return (
                  <g key={`bin-${bin.start}-${bin.end}`}>
                    {bin.hits.map((hit, hitIndex) => {
                      const y =
                        HISTOGRAM_MARGIN.top +
                        histogramPlotHeight -
                        (hitIndex + 1) * segmentHeight

                      return (
                        <rect
                          fill={colorForHit(hit)}
                          height={Math.max(3, segmentHeight - 1)}
                          key={`${bin.start}-${hit.id}-${hitIndex}`}
                          opacity="0.92"
                          rx="3"
                          width={width}
                          x={x + 3}
                          y={y}
                        >
                          <title>{tooltipForHit(hit, locale)}</title>
                        </rect>
                      )
                    })}
                    <text className="graph-tick query-bin-label" textAnchor="middle" x={x + histogramBarWidth / 2} y={HISTOGRAM_MARGIN.top + histogramPlotHeight + 20}>
                      {index === HISTOGRAM_BIN_COUNT - 1 ? `${formatCount(bin.start + 1, locale)}+` : formatCount(Math.max(1, bin.start + 1), locale)}
                    </text>
                  </g>
                )
              })}

              {xTicks.map((tick) => {
                const x = HISTOGRAM_MARGIN.left + (tick / histogramDomainMax) * histogramPlotWidth
                return (
                  <text className="graph-tick" key={`x-${tick}`} textAnchor="middle" x={x} y={HISTOGRAM_HEIGHT - 18}>
                    {formatCount(tick, locale)}
                  </text>
                )
              })}

              {queryReferenceLength > 0 ? (
                <g>
                  <line
                    className="query-reference-line"
                    stroke="#b5651d"
                    strokeDasharray="6 4"
                    strokeWidth="2"
                    x1={HISTOGRAM_MARGIN.left + (queryReferenceLength / histogramDomainMax) * histogramPlotWidth}
                    x2={HISTOGRAM_MARGIN.left + (queryReferenceLength / histogramDomainMax) * histogramPlotWidth}
                    y1={HISTOGRAM_MARGIN.top}
                    y2={HISTOGRAM_MARGIN.top + histogramPlotHeight}
                  />
                  <text
                    className="graph-axis-title"
                    textAnchor="middle"
                    x={HISTOGRAM_MARGIN.left + (queryReferenceLength / histogramDomainMax) * histogramPlotWidth}
                    y={16}
                  >
                    {isChinese ? 'Query' : 'Query'}
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
        ) : (
          <p className="metric-helper">{isChinese ? '当前命中没有可用长度信息。' : 'No hit length information is available for this query.'}</p>
        )}

        <p className="metric-helper">
          {isChinese
            ? `横轴为命中序列长度（${effectiveHitLengthUnit(algorithm, true)}），纵轴为命中数量；橙色虚线表示当前 query 的等效长度 ${formatCount(queryReferenceLength, locale)}。`
            : `The x-axis shows hit sequence length (${effectiveHitLengthUnit(algorithm, false)}), the y-axis shows hit counts, and the orange dashed line marks the effective query length ${formatCount(queryReferenceLength, locale)}.`}
        </p>
      </div>
    </div>
  )
}
