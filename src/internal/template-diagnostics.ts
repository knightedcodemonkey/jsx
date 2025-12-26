import type { OxcError } from 'oxc-parser'

export type TemplateExpressionRange = {
  index: number
  sourceStart: number
  sourceEnd: number
}

export type TemplateDiagnostics = {
  expressionRanges: TemplateExpressionRange[]
}

type TemplateDisplaySpan = {
  index: number
  templateStart: number
  templateEnd: number
  label: string
}

type CombinedExpressionSpan = {
  sourceStart: number
  sourceEnd: number
  templateStart: number
  templateEnd: number
  delta: number
}

const DEFAULT_LABEL = 'oxc-parser'

const buildTemplateDisplaySource = (templates: TemplateStringsArray) => {
  const raw = templates.raw ?? templates
  let source = raw[0] ?? ''
  const spans: TemplateDisplaySpan[] = []

  for (let idx = 0; idx < raw.length - 1; idx++) {
    const label = '${expr#' + idx + '}'
    const templateStart = source.length
    source += label
    const templateEnd = source.length
    spans.push({ index: idx, templateStart, templateEnd, label })
    source += raw[idx + 1] ?? ''
  }

  return { source, spans }
}

const combineExpressionSpans = (
  diagnostics: TemplateDiagnostics,
  templateSpans: TemplateDisplaySpan[],
) => {
  const templateSpanMap = new Map<number, TemplateDisplaySpan>()
  templateSpans.forEach(span => {
    templateSpanMap.set(span.index, span)
  })

  return diagnostics.expressionRanges
    .map(span => {
      const templateSpan = templateSpanMap.get(span.index)
      if (!templateSpan) {
        return null
      }

      const sourceLength = Math.max(0, span.sourceEnd - span.sourceStart)
      const templateLength = Math.max(
        0,
        templateSpan.templateEnd - templateSpan.templateStart,
      )
      return {
        sourceStart: span.sourceStart,
        sourceEnd: span.sourceEnd,
        templateStart: templateSpan.templateStart,
        templateEnd: templateSpan.templateEnd,
        delta: templateLength - sourceLength,
      }
    })
    .filter((span): span is CombinedExpressionSpan => Boolean(span))
    .sort((a, b) => a.sourceStart - b.sourceStart)
}

const mapIndexToTemplate = (
  index: number,
  spans: CombinedExpressionSpan[],
  templateLength: number,
) => {
  if (!Number.isFinite(index) || index <= 0) {
    return 0
  }

  let delta = 0
  for (const span of spans) {
    if (index < span.sourceStart) {
      break
    }

    if (index < span.sourceEnd) {
      const relative = Math.max(0, index - span.sourceStart)
      const templateSpanLength = Math.max(0, span.templateEnd - span.templateStart)
      if (templateSpanLength === 0) {
        return span.templateStart
      }
      const clamped = Math.min(relative, Math.max(0, templateSpanLength - 1))
      return span.templateStart + clamped
    }

    delta += span.delta
  }

  const mapped = index + delta
  if (mapped <= 0) {
    return 0
  }

  if (mapped >= templateLength) {
    return templateLength
  }

  return mapped
}

const getLineAndColumnFromIndex = (source: string, index: number) => {
  const limit = Math.max(0, Math.min(index, source.length))
  let line = 1
  let column = 1

  for (let idx = 0; idx < limit; idx++) {
    if (source.charCodeAt(idx) === 10) {
      line++
      column = 1
      continue
    }
    column++
  }

  return { line, column }
}

const computeLineOffsets = (lines: string[]) => {
  const offsets: number[] = []
  let cursor = 0

  lines.forEach((line, index) => {
    offsets.push(cursor)
    cursor += line.length
    if (index < lines.length - 1) {
      cursor += 1
    }
  })

  return offsets
}

const createPointerLine = (
  lineNumber: number,
  lineText: string,
  lineStartOffset: number,
  rangeStart: number,
  rangeEnd: number,
  startLine: number,
  endLine: number,
) => {
  const lineEndOffset = lineStartOffset + lineText.length
  const overlapStart = Math.max(rangeStart, lineStartOffset)
  const overlapEnd = Math.min(rangeEnd, lineEndOffset)

  if (overlapEnd > overlapStart) {
    const pointerStart = Math.max(0, overlapStart - lineStartOffset)
    const pointerWidth = Math.max(1, overlapEnd - overlapStart)
    return ' '.repeat(pointerStart) + '^'.repeat(pointerWidth)
  }

  if (lineText.length === 0 && lineNumber >= startLine && lineNumber <= endLine) {
    return '^'
  }

  if (lineNumber === startLine) {
    const caretPos = Math.max(0, rangeStart - lineStartOffset)
    return ' '.repeat(Math.min(caretPos, lineText.length)) + '^'
  }

  return ''
}

const buildCodeFrame = (
  source: string,
  start: number,
  end: number,
  startLine: number,
  endLine: number,
) => {
  if (!source.length) {
    return ''
  }

  const lines = source.split('\n')
  const offsets = computeLineOffsets(lines)
  const frameStart = Math.max(1, startLine - 1)
  const frameEnd = Math.min(lines.length, endLine + 1)
  const gutterWidth = String(frameEnd).length
  const frame: string[] = []

  for (let lineNumber = frameStart; lineNumber <= frameEnd; lineNumber++) {
    const lineText = lines[lineNumber - 1] ?? ''
    const gutter = String(lineNumber).padStart(gutterWidth, ' ')
    frame.push(`${gutter} | ${lineText}`)
    const pointer = createPointerLine(
      lineNumber,
      lineText,
      offsets[lineNumber - 1] ?? 0,
      start,
      end,
      startLine,
      endLine,
    )

    if (pointer) {
      frame.push(`${' '.repeat(gutterWidth)} | ${pointer}`)
    }
  }

  return frame.join('\n')
}

export type TaggedTemplateFormatOptions = {
  label?: string
}

export const formatTaggedTemplateParserError = (
  tagName: string,
  templates: TemplateStringsArray,
  diagnostics: TemplateDiagnostics,
  error: OxcError,
  options?: TaggedTemplateFormatOptions,
) => {
  const label = options?.label ?? DEFAULT_LABEL
  const fallback = `[${label}] ${error.message}`
  const primaryLabel = error.labels?.[0]

  if (!primaryLabel) {
    return fallback
  }

  const { source: templateSource, spans } = buildTemplateDisplaySource(templates)
  const combinedSpans = combineExpressionSpans(diagnostics, spans)
  const mapIndex = (value: number | null | undefined) => {
    const numeric = typeof value === 'number' ? value : 0
    return mapIndexToTemplate(numeric, combinedSpans, templateSource.length)
  }

  const startIndex = mapIndex(primaryLabel.start)
  let endIndex = mapIndex(primaryLabel.end)

  if (endIndex <= startIndex) {
    endIndex = Math.min(templateSource.length, startIndex + 1)
  }

  const startLocation = getLineAndColumnFromIndex(templateSource, startIndex)
  const endLocation = getLineAndColumnFromIndex(
    templateSource,
    Math.max(startIndex, endIndex - 1),
  )
  const codeframe = buildCodeFrame(
    templateSource,
    startIndex,
    endIndex,
    startLocation.line,
    endLocation.line,
  )

  let message = `[${label}] ${error.message}`
  message += `\n--> ${tagName} template:${startLocation.line}:${startLocation.column}`

  if (primaryLabel.message) {
    message += `\n${primaryLabel.message}`
  }

  if (codeframe) {
    message += `\n${codeframe}`
  }

  if (error.helpMessage) {
    message += `\n${error.helpMessage}`
  }

  return message
}
