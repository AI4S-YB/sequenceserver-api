import { describe, expect, it } from 'vitest'
import { buildQueryHash, parseQueryHash } from './query-navigation'

describe('query navigation helpers', () => {
  it('builds hash from query id', () => {
    expect(buildQueryHash('query 1/alpha')).toBe('#query=query+1%2Falpha')
  })

  it('parses query id from hash', () => {
    expect(parseQueryHash('#query=query+1%2Falpha')).toBe('query 1/alpha')
  })

  it('returns empty string for unrelated hash', () => {
    expect(parseQueryHash('#tab=hits')).toBe('')
  })
})
