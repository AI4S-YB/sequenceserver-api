import { describe, expect, it } from 'vitest'
import { buildBlastResultMailto } from './share'

describe('buildBlastResultMailto', () => {
  it('builds a mailto link with program, query count, databases, and url', () => {
    const href = buildBlastResultMailto({
      program: 'blastn',
      queryCount: 3,
      databaseTitles: ['Demo DB', 'Alt DB'],
      url: 'http://localhost/jobs/blast/123',
    })

    expect(href).toContain('mailto:?subject=SequenceServer%20BLASTN%20analysis%20results')
    expect(href).toContain('recent%20BLASTN%20analysis%20of%203%20sequences')
    expect(href).toContain('Demo%20DB,%20Alt%20DB')
    expect(href).toContain('http://localhost/jobs/blast/123')
  })
})
