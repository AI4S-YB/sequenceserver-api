import { describe, expect, it } from 'vitest'
import { isBlastResultWarning } from './result-warning'

describe('isBlastResultWarning', () => {
  it('recognizes large result warning payloads', () => {
    expect(
      isBlastResultWarning({
        user_warning: 'LARGE_RESULT',
        download_links: [],
      }),
    ).toBe(true)
  })

  it('rejects regular result payloads', () => {
    expect(
      isBlastResultWarning({
        search_id: 'job-1',
        queries: [],
      }),
    ).toBe(false)
  })
})
