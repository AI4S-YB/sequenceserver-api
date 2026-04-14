import { describe, expect, it } from 'vitest'
import { buildAlignmentExport, buildHspStats, formatPairwiseAlignment } from './blast-alignment'

describe('blast-alignment helpers', () => {
  const hsp = {
    number: 1,
    bitScore: 180.5,
    score: 98,
    evalue: 1e-20,
    identity: 8,
    positives: 9,
    gaps: 1,
    length: 10,
    qstart: 1,
    qend: 9,
    sstart: 5,
    send: 13,
    qframe: 1,
    sframe: 1,
    qseq: 'ACGT-ACGTA',
    sseq: 'ACGTTAC-TA',
    midline: '|||| || ||',
  }

  it('builds readable HSP stats', () => {
    expect(buildHspStats(hsp, 'blastp')).toEqual([
      'Score: 180.50 (98)',
      'E value: 1.00e-20',
      'Identity: 8/10 (80.00%)',
      'Positives: 9/10 (90.00%)',
      'Gaps: 1/10 (10.00%)',
    ])
  })

  it('renders pairwise alignment text blocks with coordinates', () => {
    const text = formatPairwiseAlignment(hsp, 'blastn', 6)

    expect(text).toContain('Query    1 ACGT-A 5')
    expect(text).toContain('Subject  5 ACGTTA 10')
    expect(text).toContain('Query    6 CGTA 9')
    expect(text).toContain('Subject 11 C-TA 13')
  })

  it('exports all hsps with headers', () => {
    const text = buildAlignmentExport('query_1', 'hit_1', [hsp], 'blastn', 10)

    expect(text).toContain('# Query: query_1')
    expect(text).toContain('# Hit: hit_1')
    expect(text).toContain('# HSP: 1')
    expect(text).toContain('Query    1 ACGT-ACGTA 9')
  })
})
