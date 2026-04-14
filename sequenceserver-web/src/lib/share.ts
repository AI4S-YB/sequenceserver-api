export function buildBlastResultMailto(input: {
  program?: string | null
  queryCount?: number
  databaseTitles?: string[]
  url: string
}): string {
  const program = (input.program || 'BLAST').toUpperCase()
  const queryCount = input.queryCount || 0
  const databases = (input.databaseTitles || []).slice(0, 15).join(', ') || '-'

  const mailto = `mailto:?subject=SequenceServer ${program} analysis results&body=Hello,

Here is a link to my recent ${program} analysis of ${queryCount} sequences.
${input.url}

The following databases were used (up to 15 are shown):
${databases}

Thank you for using SequenceServer, and please remember to cite our paper.
`

  return encodeURI(mailto).replace(/(%20){2,}/g, '')
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const element = document.createElement('input')
  element.value = value
  document.body.appendChild(element)
  element.select()
  document.execCommand('copy')
  document.body.removeChild(element)
}
