export interface SequenceNormalizationResult {
  value: string
  convertedFromFastq: boolean
}

function convertChunk(fastqChunk: string[]): string[] {
  const header = `>${fastqChunk[0].slice(1)}`
  return [header, fastqChunk[1]]
}

function isValidFastqChunk(fastqChunk: string[]): boolean {
  if (fastqChunk.length !== 4) return false

  return (
    fastqChunk[0].startsWith('@') &&
    fastqChunk[2].startsWith('+') &&
    fastqChunk[1].length === fastqChunk[3].length
  )
}

export function normalizeSequenceInput(sequence: string): SequenceNormalizationResult {
  const trimmed = sequence.trim()
  if (!trimmed.startsWith('@')) {
    return { value: sequence, convertedFromFastq: false }
  }

  const lines = trimmed.split('\n')
  const fastaLines: string[] = []

  for (let index = 0; index < lines.length; index += 4) {
    const chunk = lines.slice(index, index + 4)
    if (!isValidFastqChunk(chunk)) {
      return { value: sequence, convertedFromFastq: false }
    }

    fastaLines.push(...convertChunk(chunk))
  }

  return {
    value: fastaLines.join('\n'),
    convertedFromFastq: true,
  }
}
