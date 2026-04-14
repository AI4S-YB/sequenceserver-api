import { useRef, useState, type RefObject } from 'react'
import { BlastCircosOverview } from './blast-circos-overview'
import { exportSvgElement, exportSvgElementAsPng } from '../lib/svg-export'
import type { BlastHitPreview, BlastQueryPreview, BlastResultSummary } from '../lib/job-results'

const QUERY_BAR_WIDTH = 36
const QUERY_GAP = 14
const QUERY_CHART_HEIGHT = 180
const ALIGNMENT_WIDTH = 760
const HIT_ROW_HEIGHT = 30
const HISTOGRAM_WIDTH = 760
const HISTOGRAM_HEIGHT = 220
const HISTOGRAM_BINS = 8

function formatLabel(value?: number): string {
  return typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : '-'
}

function maxOrFallback(values: number[], fallback: number): number {
  if (!values.length) return fallback
  return Math.max(...values, fallback)
}

function buildHistogram(lengths: number[], bins: number) {
  if (!lengths.length) return []

  const min = Math.min(...lengths)
  const max = Math.max(...lengths)
  const span = Math.max(1, max - min)
  const step = Math.max(1, Math.ceil(span / bins))

  return Array.from({ length: bins }, (_, index) => {
    const start = min + index * step
    const end = index === bins - 1 ? max : start + step - 1
    const count = lengths.filter((value) => {
      if (index === bins - 1) return value >= start && value <= end
      return value >= start && value < start + step
    }).length

    return { start, end, count }
  })
}

function firstHspRange(hit: BlastHitPreview): { start: number; end: number } | null {
  const first = hit.hsps[0]
  if (!first?.qstart || !first?.qend) return null

  return {
    start: Math.min(first.qstart, first.qend),
    end: Math.max(first.qstart, first.qend),
  }
}

export function BlastVisualOverview({
  summary,
  selectedQuery,
}: {
  summary: BlastResultSummary
  selectedQuery: BlastQueryPreview | null
}) {
  const queryChartRef = useRef<SVGSVGElement | null>(null)
  const alignmentChartRef = useRef<SVGSVGElement | null>(null)
  const histogramChartRef = useRef<SVGSVGElement | null>(null)
  const [exportMessage, setExportMessage] = useState('')
  const queryChartWidth = Math.max(520, summary.queries.length * (QUERY_BAR_WIDTH + QUERY_GAP) + 60)
  const maxHitCount = maxOrFallback(summary.queries.map((query) => query.hitCount), 1)

  const selectedQueryLength = selectedQuery?.length || 1
  const visibleAlignmentHits = (selectedQuery?.hits || []).slice(0, 12)
  const alignmentHeight = Math.max(120, visibleAlignmentHits.length * HIT_ROW_HEIGHT + 48)

  const histogram = buildHistogram(
    (selectedQuery?.hits || []).map((hit) => hit.length).filter((value): value is number => typeof value === 'number' && value > 0),
    HISTOGRAM_BINS,
  )
  const maxHistogramCount = maxOrFallback(histogram.map((bin) => bin.count), 1)

  async function handleExport(
    ref: RefObject<SVGSVGElement | null>,
    type: 'svg' | 'png',
    filename: string,
    label: string,
  ) {
    if (!ref.current) return

    try {
      if (type === 'svg') {
        exportSvgElement(ref.current, filename)
      } else {
        await exportSvgElementAsPng(ref.current, filename)
      }
      setExportMessage(`${label} 已导出为 ${type.toUpperCase()}。`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : `${label} 导出失败。`)
    }
  }

  return (
    <div className="result-box">
      <h4>图形概览</h4>
      <p className="toolbar-note">先补上新前端自己的可视化层，用于覆盖旧结果页最常用的图形概览能力。</p>
      {exportMessage ? <p className="toolbar-note">{exportMessage}</p> : null}

      <div className="visual-grid">
        <BlastCircosOverview selectedQuery={selectedQuery} summary={summary} />

        <div className="visual-card">
          <div className="visual-card-header">
            <h5>Query 命中分布</h5>
            <div className="toolbar-group">
              <button
                className="secondary-button"
                onClick={() => handleExport(queryChartRef, 'svg', `${summary.searchId || 'blast'}__query_hit_overview`, 'Query 命中分布')}
                type="button"
              >
                SVG
              </button>
              <button
                className="secondary-button"
                onClick={() => handleExport(queryChartRef, 'png', `${summary.searchId || 'blast'}__query_hit_overview`, 'Query 命中分布')}
                type="button"
              >
                PNG
              </button>
            </div>
          </div>
          <div className="visual-scroll">
            <svg
              aria-label="Query 命中分布图"
              className="overview-chart"
              height={QUERY_CHART_HEIGHT}
              ref={queryChartRef}
              viewBox={`0 0 ${queryChartWidth} ${QUERY_CHART_HEIGHT}`}
              width="100%"
            >
              <line stroke="rgba(20, 33, 61, 0.18)" x1="36" x2={queryChartWidth - 12} y1="148" y2="148" />
              {summary.queries.map((query, index) => {
                const x = 42 + index * (QUERY_BAR_WIDTH + QUERY_GAP)
                const barHeight = maxHitCount ? (query.hitCount / maxHitCount) * 108 : 0
                const y = 148 - barHeight
                const active = selectedQuery?.id === query.id

                return (
                  <g key={query.id}>
                    <rect
                      fill={active ? '#b5651d' : '#335c67'}
                      height={barHeight}
                      opacity={active ? 1 : 0.82}
                      rx="8"
                      width={QUERY_BAR_WIDTH}
                      x={x}
                      y={y}
                    />
                    <text fill="#14213d" fontSize="11" textAnchor="middle" x={x + QUERY_BAR_WIDTH / 2} y={y - 6}>
                      {query.hitCount}
                    </text>
                    <text fill="#5f6f82" fontSize="10" textAnchor="middle" x={x + QUERY_BAR_WIDTH / 2} y="164">
                      {index + 1}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
          <p className="metric-helper">横轴是 query 顺序，纵轴是命中数量。当前选中的 query 会高亮。</p>
        </div>

        <div className="visual-card">
          <div className="visual-card-header">
            <h5>当前 Query 对齐概览</h5>
            <div className="toolbar-group">
              <button
                className="secondary-button"
                disabled={!selectedQuery}
                onClick={() =>
                  handleExport(
                    alignmentChartRef,
                    'svg',
                    `${summary.searchId || 'blast'}__${selectedQuery?.id || 'query'}__alignment_overview`,
                    '当前 Query 对齐概览',
                  )
                }
                type="button"
              >
                SVG
              </button>
              <button
                className="secondary-button"
                disabled={!selectedQuery}
                onClick={() =>
                  handleExport(
                    alignmentChartRef,
                    'png',
                    `${summary.searchId || 'blast'}__${selectedQuery?.id || 'query'}__alignment_overview`,
                    '当前 Query 对齐概览',
                  )
                }
                type="button"
              >
                PNG
              </button>
            </div>
          </div>
          {selectedQuery ? (
            <>
              <div className="visual-scroll">
                <svg
                  aria-label="当前 Query 对齐概览图"
                  className="overview-chart"
                  height={alignmentHeight}
                  ref={alignmentChartRef}
                  viewBox={`0 0 ${ALIGNMENT_WIDTH} ${alignmentHeight}`}
                  width="100%"
                >
                  <line stroke="rgba(20, 33, 61, 0.18)" x1="140" x2="720" y1="24" y2="24" />
                  {visibleAlignmentHits.map((hit, index) => {
                    const range = firstHspRange(hit)
                    const y = 42 + index * HIT_ROW_HEIGHT
                    const label = hit.id.length > 20 ? `${hit.id.slice(0, 18)}..` : hit.id

                    return (
                      <g key={`${selectedQuery.id}-${hit.id}`}>
                        <text fill="#14213d" fontSize="11" x="8" y={y + 4}>
                          {label}
                        </text>
                        <line stroke="rgba(20, 33, 61, 0.12)" x1="140" x2="720" y1={y} y2={y} />
                        {range ? (
                          <rect
                            fill="#b5651d"
                            height="10"
                            opacity="0.82"
                            rx="5"
                            width={Math.max(4, ((range.end - range.start + 1) / selectedQueryLength) * 580)}
                            x={140 + ((range.start - 1) / selectedQueryLength) * 580}
                            y={y - 5}
                          />
                        ) : null}
                      </g>
                    )
                  })}
                </svg>
              </div>
              <p className="metric-helper">
                以 query 坐标显示当前 query 前 12 个命中的首个 HSP 范围。query 长度：{formatLabel(selectedQuery.length)}。
              </p>
            </>
          ) : (
            <p>当前没有可展示的 query。</p>
          )}
        </div>

        <div className="visual-card">
          <div className="visual-card-header">
            <h5>命中长度分布</h5>
            <div className="toolbar-group">
              <button
                className="secondary-button"
                disabled={!selectedQuery || !histogram.length}
                onClick={() =>
                  handleExport(
                    histogramChartRef,
                    'svg',
                    `${summary.searchId || 'blast'}__${selectedQuery?.id || 'query'}__hit_length_histogram`,
                    '命中长度分布',
                  )
                }
                type="button"
              >
                SVG
              </button>
              <button
                className="secondary-button"
                disabled={!selectedQuery || !histogram.length}
                onClick={() =>
                  handleExport(
                    histogramChartRef,
                    'png',
                    `${summary.searchId || 'blast'}__${selectedQuery?.id || 'query'}__hit_length_histogram`,
                    '命中长度分布',
                  )
                }
                type="button"
              >
                PNG
              </button>
            </div>
          </div>
          {selectedQuery && histogram.length ? (
            <>
              <div className="visual-scroll">
                <svg
                  aria-label="命中长度分布图"
                  className="overview-chart"
                  height={HISTOGRAM_HEIGHT}
                  ref={histogramChartRef}
                  viewBox={`0 0 ${HISTOGRAM_WIDTH} ${HISTOGRAM_HEIGHT}`}
                  width="100%"
                >
                  <line stroke="rgba(20, 33, 61, 0.18)" x1="46" x2="740" y1="176" y2="176" />
                  {histogram.map((bin, index) => {
                    const x = 54 + index * 82
                    const barHeight = maxHistogramCount ? (bin.count / maxHistogramCount) * 112 : 0
                    const y = 176 - barHeight

                    return (
                      <g key={`${bin.start}-${bin.end}`}>
                        <rect
                          fill="#335c67"
                          height={barHeight}
                          opacity="0.82"
                          rx="8"
                          width="54"
                          x={x}
                          y={y}
                        />
                        <text fill="#14213d" fontSize="11" textAnchor="middle" x={x + 27} y={y - 6}>
                          {bin.count}
                        </text>
                        <text fill="#5f6f82" fontSize="10" textAnchor="middle" x={x + 27} y="192">
                          {index + 1}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
              <p className="metric-helper">
                按命中长度做 8 档分箱。当前 query：{selectedQuery.id}，命中数 {formatLabel(selectedQuery.hitCount)}。
              </p>
            </>
          ) : (
            <p>当前 query 没有足够的命中长度数据。</p>
          )}
        </div>
      </div>
    </div>
  )
}
