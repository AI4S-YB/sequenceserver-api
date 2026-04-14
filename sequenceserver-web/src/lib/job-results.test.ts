import { describe, expect, it } from 'vitest'
import { summarizeBlastResult, summarizeDatabaseResult } from './job-results'

describe('summarizeBlastResult', () => {
  it('extracts summary, queries, hits, and hsps from blast result payload', () => {
    const summary = summarizeBlastResult({
      search_id: 'job-123',
      program: 'blastn',
      program_version: 'BLASTN 2.16.0+',
      querydb: [{ title: 'Demo DB', id: 'db-1' }],
      params: { evalue: '1e-5', matrix: 'BLOSUM62' },
      stats: { nsequences: 10, ncharacters: 1200 },
      queries: [
        {
          number: 1,
          id: 'query_1',
          title: 'Example query',
          length: 120,
          hits: [
            {
              id: 'hit_1',
              title: 'Example hit',
              length: 300,
              total_score: 220,
              qcovs: 95,
              sciname: 'Arabidopsis thaliana',
              hsps: [
                {
                  number: 1,
                  evalue: 1e-20,
                  bit_score: 180.5,
                  identity: 110,
                  length: 120,
                  qcovhsp: 95,
                  qstart: 1,
                  qend: 120,
                  sstart: 5,
                  send: 124,
                },
              ],
            },
          ],
        },
      ],
    })

    expect(summary).not.toBeNull()
    expect(summary?.searchId).toBe('job-123')
    expect(summary?.program).toBe('blastn')
    expect(summary?.databaseTitles).toEqual(['Demo DB'])
    expect(summary?.queryCount).toBe(1)
    expect(summary?.queriesWithHits).toBe(1)
    expect(summary?.totalHits).toBe(1)
    expect(summary?.queries[0]?.id).toBe('query_1')
    expect(summary?.queries[0]?.topHit?.id).toBe('hit_1')
    expect(summary?.queries[0]?.hits[0]?.hsps[0]?.bitScore).toBe(180.5)
  })

  it('returns null for invalid blast result payload', () => {
    expect(summarizeBlastResult(null)).toBeNull()
    expect(summarizeBlastResult('invalid')).toBeNull()
  })
})

describe('summarizeDatabaseResult', () => {
  it('extracts indexed database metadata', () => {
    const summary = summarizeDatabaseResult({
      id: 'db-1',
      name: '/data/demo.fa',
      title: 'Demo DB',
      type: 'nucleotide',
      indexed: true,
      nsequences: 25,
      ncharacters: 1000,
      updated_on: '2026-04-13',
      format: '5',
      categories: ['uploads'],
    })

    expect(summary).not.toBeNull()
    expect(summary?.id).toBe('db-1')
    expect(summary?.indexed).toBe(true)
    expect(summary?.nsequences).toBe(25)
    expect(summary?.categories).toEqual(['uploads'])
  })

  it('returns null for invalid database result payload', () => {
    expect(summarizeDatabaseResult(undefined)).toBeNull()
    expect(summarizeDatabaseResult('invalid')).toBeNull()
  })
})
