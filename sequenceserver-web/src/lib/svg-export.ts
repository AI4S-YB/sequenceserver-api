const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
type ExportLocale = 'zh-CN' | 'en'
const EXPORT_STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'opacity',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'filter',
  'color',
]

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function sanitizeExportName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function inferSvgSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height }
  }

  const widthAttr = Number(svg.getAttribute('width'))
  const heightAttr = Number(svg.getAttribute('height'))
  if (Number.isFinite(widthAttr) && widthAttr > 0 && Number.isFinite(heightAttr) && heightAttr > 0) {
    return { width: widthAttr, height: heightAttr }
  }

  const rect = svg.getBoundingClientRect()
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

function inlineComputedStyles(source: SVGSVGElement, cloned: SVGSVGElement) {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll('*'))]
  const clonedNodes = [cloned, ...Array.from(cloned.querySelectorAll('*'))]

  sourceNodes.forEach((node, index) => {
    const cloneNode = clonedNodes[index]
    if (!(node instanceof Element) || !(cloneNode instanceof Element)) return

    const computed = window.getComputedStyle(node)
    const styles = EXPORT_STYLE_PROPS
      .map((property) => {
        const value = computed.getPropertyValue(property)
        return value ? `${property}:${value}` : ''
      })
      .filter(Boolean)
      .join(';')

    if (styles) {
      cloneNode.setAttribute('style', styles)
    }
  })
}

function serializeSvg(svg: SVGSVGElement): { markup: string; width: number; height: number } {
  const cloned = svg.cloneNode(true) as SVGSVGElement
  const { width, height } = inferSvgSize(svg)

  cloned.setAttribute('xmlns', SVG_NS)
  cloned.setAttribute('xmlns:xlink', XLINK_NS)
  cloned.setAttribute('version', '1.1')
  cloned.setAttribute('width', String(width))
  cloned.setAttribute('height', String(height))

  inlineComputedStyles(svg, cloned)

  const markup = new XMLSerializer().serializeToString(cloned)
  return { markup, width, height }
}

export function exportSvgElement(svg: SVGSVGElement, filenamePrefix: string) {
  const { markup } = serializeSvg(svg)
  const filename = `${sanitizeExportName(filenamePrefix)}.svg`
  downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), filename)
}

export async function exportSvgElementAsPng(
  svg: SVGSVGElement,
  filenamePrefix: string,
  locale: ExportLocale = 'zh-CN',
) {
  const { markup, width, height } = serializeSvg(svg)
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () =>
        reject(new Error(locale === 'zh-CN' ? '无法加载 SVG 图像，PNG 导出失败。' : 'Failed to load the SVG image for PNG export.'))
      element.src = url
    })

    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error(locale === 'zh-CN' ? '浏览器不支持 Canvas 2D，上图无法导出为 PNG。' : 'Canvas 2D is not supported in this browser, so PNG export is unavailable.')
    }

    context.scale(scale, scale)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((canvasBlob) => {
        if (canvasBlob) resolve(canvasBlob)
        else reject(new Error(locale === 'zh-CN' ? 'PNG 编码失败。' : 'Failed to encode the PNG image.'))
      }, 'image/png')
    })

    const filename = `${sanitizeExportName(filenamePrefix)}.png`
    downloadBlob(pngBlob, filename)
  } finally {
    URL.revokeObjectURL(url)
  }
}
