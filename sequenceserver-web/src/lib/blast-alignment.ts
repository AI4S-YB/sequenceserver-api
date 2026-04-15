import type { BlastHspPreview } from './job-results'

export type BlastAlgorithm = 'blastn' | 'blastp' | 'blastx' | 'tblastn' | 'tblastx' | string
type AlignmentLocale = 'zh-CN' | 'en'

function formatDecimal(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatEvalue(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value === 0) return '0'
  if (value >= 0.01 && value < 1000) return formatDecimal(value)
  return value.toExponential(2)
}

function formatFraction(part?: number, total?: number): string {
  if (typeof part !== 'number' || typeof total !== 'number' || total <= 0) return '-'
  return `${part}/${total} (${((part / total) * 100).toFixed(2)}%)`
}

function isProteinComparison(algorithm: BlastAlgorithm): boolean {
  return ['blastp', 'blastx', 'tblastn', 'tblastx'].includes(algorithm)
}

function qframeUnit(algorithm: BlastAlgorithm): number {
  switch (algorithm) {
    case 'blastx':
    case 'tblastx':
      return 3
    default:
      return 1
  }
}

function sframeUnit(algorithm: BlastAlgorithm): number {
  switch (algorithm) {
    case 'tblastn':
    case 'tblastx':
      return 3
    default:
      return 1
  }
}

function frameSign(frame?: number): number {
  return typeof frame === 'number' && frame < 0 ? -1 : 1
}

function initialQueryCoordinate(hsp: BlastHspPreview, algorithm: BlastAlgorithm): number {
  if (algorithm === 'blastn') return hsp.qstart ?? 0
  return frameSign(hsp.qframe) > 0 ? (hsp.qstart ?? 0) : (hsp.qend ?? 0)
}

function initialSubjectCoordinate(hsp: BlastHspPreview, algorithm: BlastAlgorithm): number {
  if (algorithm === 'blastn') return hsp.sstart ?? 0
  return frameSign(hsp.sframe) > 0 ? (hsp.sstart ?? 0) : (hsp.send ?? 0)
}

function padCoordinate(value: number | string, width: number): string {
  return String(value).padStart(width, ' ')
}

function countResidues(segment: string): number {
  return segment.replace(/-/g, '').length
}

function coordinateSpan(start: number, segment: string, unit: number, sign: number): { start: number; end: number; next: number } {
  const residues = countResidues(segment)
  if (residues <= 0) {
    return { start, end: start, next: start }
  }

  const end = start + (residues - 1) * unit * sign
  const next = end + unit * sign
  return { start, end, next }
}

export function buildHspStats(hsp: BlastHspPreview, algorithm: BlastAlgorithm): string[] {
  const stats = [
    `Score: ${formatDecimal(hsp.bitScore)} (${formatDecimal(hsp.score)})`,
    `E value: ${formatEvalue(hsp.evalue)}`,
    `Identity: ${formatFraction(hsp.identity, hsp.length)}`,
  ]

  if (isProteinComparison(algorithm)) {
    stats.push(`Positives: ${formatFraction(hsp.positives, hsp.length)}`)
  }

  stats.push(`Gaps: ${formatFraction(hsp.gaps, hsp.length)}`)

  switch (algorithm) {
    case 'tblastx':
      stats.push(`Frame: ${formatDecimal(hsp.qframe)}/${formatDecimal(hsp.sframe)}`)
      break
    case 'blastn':
      stats.push(`Strand: ${frameSign(hsp.qframe) > 0 ? '+' : '-'} / ${frameSign(hsp.sframe) > 0 ? '+' : '-'}`)
      break
    case 'blastx':
      stats.push(`Query Frame: ${formatDecimal(hsp.qframe)}`)
      break
    case 'tblastn':
      stats.push(`Hit Frame: ${formatDecimal(hsp.sframe)}`)
      break
  }

  return stats
}

export function formatPairwiseAlignment(
  hsp: BlastHspPreview,
  algorithm: BlastAlgorithm,
  lineWidth = 90,
  locale: AlignmentLocale = 'zh-CN',
): string {
  const qseq = hsp.qseq || ''
  const sseq = hsp.sseq || ''
  const midline = hsp.midline || ''
  if (!qseq || !sseq || !midline) {
    return locale === 'zh-CN'
      ? '当前 HSP 不包含可渲染的序列对齐信息。'
      : 'The current HSP does not include renderable pairwise alignment content.'
  }

  const safeLineWidth = Math.max(1, Math.floor(lineWidth))
  const coordWidth = Math.max(
    String(hsp.qstart ?? '').length,
    String(hsp.qend ?? '').length,
    String(hsp.sstart ?? '').length,
    String(hsp.send ?? '').length,
    1,
  )

  let queryCoordinate = initialQueryCoordinate(hsp, algorithm)
  let subjectCoordinate = initialSubjectCoordinate(hsp, algorithm)
  const queryUnit = qframeUnit(algorithm)
  const subjectUnit = sframeUnit(algorithm)
  const querySign = frameSign(hsp.qframe)
  const subjectSign = frameSign(hsp.sframe)

  const blocks: string[] = []

  for (let startIndex = 0; startIndex < qseq.length; startIndex += safeLineWidth) {
    const endIndex = startIndex + safeLineWidth
    const qSegment = qseq.slice(startIndex, endIndex)
    const mSegment = midline.slice(startIndex, endIndex)
    const sSegment = sseq.slice(startIndex, endIndex)

    const qSpan = coordinateSpan(queryCoordinate, qSegment, queryUnit, querySign)
    const sSpan = coordinateSpan(subjectCoordinate, sSegment, subjectUnit, subjectSign)

    blocks.push(
      `Query   ${padCoordinate(qSpan.start, coordWidth)} ${qSegment} ${qSpan.end}`,
      `${' '.repeat(coordWidth + 8)} ${mSegment}`,
      `Subject ${padCoordinate(sSpan.start, coordWidth)} ${sSegment} ${sSpan.end}`,
    )

    queryCoordinate = qSpan.next
    subjectCoordinate = sSpan.next
  }

  return blocks.join('\n\n')
}

export function buildAlignmentExport(
  queryId: string,
  hitId: string,
  hsps: BlastHspPreview[],
  algorithm: BlastAlgorithm,
  lineWidth = 90,
  locale: AlignmentLocale = 'zh-CN',
): string {
  if (!hsps.length) {
    return `${queryId} vs ${hitId}\n\n${locale === 'zh-CN' ? '无可导出的 HSP。' : 'No exportable HSP is available.'}`
  }

  return hsps
    .map((hsp, index) => {
      const header = [
        `# Query: ${queryId}`,
        `# Hit: ${hitId}`,
        `# HSP: ${hsp.number ?? index + 1}`,
        `# ${buildHspStats(hsp, algorithm).join(', ')}`,
      ].join('\n')

      return `${header}\n${formatPairwiseAlignment(hsp, algorithm, lineWidth, locale)}`
    })
    .join('\n\n')
}
