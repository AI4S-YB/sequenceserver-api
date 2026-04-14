import { describe, expect, it } from 'vitest'
import { normalizeSequenceInput } from './sequence-input'

describe('normalizeSequenceInput', () => {
  it('keeps FASTA input unchanged', () => {
    const input = '>query_1\nACTGACTG'
    expect(normalizeSequenceInput(input)).toEqual({
      value: input,
      convertedFromFastq: false,
    })
  })

  it('converts valid FASTQ input to FASTA', () => {
    const input = '@query_1\nACTGACTG\n+\nFFFFFFFF'
    expect(normalizeSequenceInput(input)).toEqual({
      value: '>query_1\nACTGACTG',
      convertedFromFastq: true,
    })
  })

  it('keeps invalid FASTQ-like input unchanged', () => {
    const input = '@query_1\nACTG\n+\nFFF'
    expect(normalizeSequenceInput(input)).toEqual({
      value: input,
      convertedFromFastq: false,
    })
  })
})
