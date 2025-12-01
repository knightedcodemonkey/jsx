import MagicString from 'magic-string'
import { parseSync, type ParserOptions, type OxcError } from 'oxc-parser'
import type { JSXElement, JSXIdentifier, Program } from '@oxc-project/types'

type LoaderCallback = (err: Error | null, content?: string) => void

type LoaderContext<TOptions> = {
  resourcePath: string
  async(): LoaderCallback
  getOptions?: () => Partial<TOptions>
}

type AnyNode = {
  type: string
  [key: string]: unknown
}

type LoaderOptions = {
  /**
   * Name of the tagged template function. Defaults to `jsx`.
   */
  tag?: string
}

type Slot = {
  start: number
  end: number
  code: string
}

type TemplatePlaceholder = {
  marker: string
  code: string
}

type TemplateExpressionContext =
  | { type: 'tag' }
  | { type: 'spread' }
  | { type: 'attributeExisting' }
  | { type: 'attributeString'; quote: '"' | "'" }
  | { type: 'attributeUnquoted' }
  | { type: 'childExisting' }
  | { type: 'childText' }

const stripTrailingWhitespace = (value: string) => value.replace(/\s+$/g, '')
const stripLeadingWhitespace = (value: string) => value.replace(/^\s+/g, '')

const getTemplateExpressionContext = (
  left: string,
  right: string,
): TemplateExpressionContext => {
  const trimmedLeft = stripTrailingWhitespace(left)
  const trimmedRight = stripLeadingWhitespace(right)

  if (trimmedLeft.endsWith('<') || trimmedLeft.endsWith('</')) {
    return { type: 'tag' }
  }

  if (/{\s*\.\.\.$/.test(trimmedLeft) && trimmedRight.startsWith('}')) {
    return { type: 'spread' }
  }

  const attrStringMatch = trimmedLeft.match(/=\s*(["'])$/)
  if (attrStringMatch) {
    const quoteChar = attrStringMatch[1] as '"' | "'"
    if (trimmedRight.startsWith(quoteChar)) {
      return { type: 'attributeString', quote: quoteChar }
    }
  }

  if (trimmedLeft.endsWith('={') && trimmedRight.startsWith('}')) {
    return { type: 'attributeExisting' }
  }

  if (/=\s*$/.test(trimmedLeft)) {
    return { type: 'attributeUnquoted' }
  }

  if (trimmedLeft.endsWith('{') && trimmedRight.startsWith('}')) {
    return { type: 'childExisting' }
  }

  return { type: 'childText' }
}

type TransformConfig = {
  resourcePath: string
  tag: string
}

const TEMPLATE_EXPR_PLACEHOLDER_PREFIX = '__JSX_LOADER_TEMPLATE_EXPR_'

const MODULE_PARSER_OPTIONS: ParserOptions = {
  lang: 'tsx',
  sourceType: 'module',
  range: true,
  preserveParens: true,
}

const TEMPLATE_PARSER_OPTIONS: ParserOptions = {
  lang: 'tsx',
  sourceType: 'module',
  range: true,
  preserveParens: true,
}

const DEFAULT_TAG = 'jsx'

const escapeTemplateChunk = (chunk: string) =>
  chunk.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')

const formatParserError = (error: OxcError) => {
  let message = `[jsx-loader] ${error.message}`

  if (error.labels?.length) {
    const label = error.labels[0]
    if (label.message) {
      message += `\n${label.message}`
    }
  }

  if (error.codeframe) {
    message += `\n${error.codeframe}`
  }

  return message
}

const walkAst = (node: unknown, visitor: (target: AnyNode) => void) => {
  if (!node || typeof node !== 'object') {
    return
  }

  const current = node as Record<string, unknown>
  if (typeof current.type === 'string') {
    visitor(current as AnyNode)
  }

  for (const value of Object.values(current)) {
    if (!value) {
      continue
    }

    if (Array.isArray(value)) {
      value.forEach(child => walkAst(child, visitor))
      continue
    }

    if (typeof value === 'object') {
      walkAst(value, visitor)
    }
  }
}

const shouldInterpolateName = (name: JSXIdentifier) => /^[A-Z]/.test(name.name)

const addSlot = (slots: Slot[], source: string, range?: [number, number]) => {
  if (!range) {
    return
  }

  const [start, end] = range
  if (start === end) {
    return
  }

  slots.push({
    start,
    end,
    code: source.slice(start, end),
  })
}

const collectSlots = (program: Program, source: string) => {
  const slots: Slot[] = []

  const recordComponentName = (name: JSXElement['openingElement']['name']) => {
    if (!name) {
      return
    }

    switch (name.type) {
      case 'JSXIdentifier': {
        if (!shouldInterpolateName(name)) {
          return
        }
        addSlot(slots, source, name.range as [number, number])
        break
      }
      case 'JSXMemberExpression': {
        addSlot(slots, source, name.range as [number, number])
        break
      }
      default:
        break
    }
  }

  walkAst(program, node => {
    switch (node.type) {
      case 'JSXExpressionContainer': {
        const expression = node.expression as AnyNode
        if (expression.type === 'JSXEmptyExpression') {
          break
        }
        if (isLoaderPlaceholderIdentifier(expression)) {
          break
        }
        addSlot(slots, source, (expression.range ?? node.range) as [number, number])
        break
      }
      case 'JSXSpreadAttribute': {
        const argument = node.argument as AnyNode | undefined
        if (isLoaderPlaceholderIdentifier(argument)) {
          break
        }
        addSlot(slots, source, argument?.range as [number, number])
        break
      }
      case 'JSXSpreadChild': {
        const expression = node.expression as AnyNode | undefined
        if (isLoaderPlaceholderIdentifier(expression)) {
          break
        }
        addSlot(slots, source, expression?.range as [number, number])
        break
      }
      case 'JSXElement': {
        const opening = node.openingElement as {
          name: JSXElement['openingElement']['name']
        }
        recordComponentName(opening.name)

        const closing = node.closingElement as
          | { name: JSXElement['openingElement']['name'] }
          | null
          | undefined
        if (closing?.name) {
          recordComponentName(closing.name)
        }
        break
      }
      default:
        break
    }
  })

  return slots.sort((a, b) => a.start - b.start)
}

const renderTemplateWithSlots = (source: string, slots: Slot[]) => {
  let cursor = 0
  let output = ''

  slots.forEach(slot => {
    if (slot.start < cursor) {
      throw new Error('Overlapping JSX expressions detected inside template literal.')
    }

    output += escapeTemplateChunk(source.slice(cursor, slot.start))
    output += `\${${slot.code}}`
    cursor = slot.end
  })

  output += escapeTemplateChunk(source.slice(cursor))
  return { code: output, changed: slots.length > 0 }
}

const transformTemplateLiteral = (templateSource: string, resourcePath: string) => {
  const result = parseSync(
    `${resourcePath}?jsx-template`,
    templateSource,
    TEMPLATE_PARSER_OPTIONS,
  )

  if (result.errors.length > 0) {
    throw new Error(formatParserError(result.errors[0]!))
  }

  const slots = collectSlots(result.program, templateSource)
  return renderTemplateWithSlots(templateSource, slots)
}

const isTargetTaggedTemplate = (
  node: Record<string, unknown>,
  source: string,
  tag: string,
) => {
  if (node.type !== 'TaggedTemplateExpression') {
    return false
  }

  const tagNode = node.tag as Record<string, unknown>
  if (tagNode.type !== 'Identifier') {
    return false
  }

  return tagNode.name === tag
}

const TAG_PLACEHOLDER_PREFIX = '__JSX_LOADER_TAG_EXPR_'

const buildTemplateSource = (
  quasis: Array<Record<string, unknown>>,
  expressions: Array<Record<string, unknown>>,
  source: string,
  tag: string,
) => {
  const placeholderMap = new Map<string, string>()
  const tagPlaceholderMap = new Map<string, string>()
  let template = ''
  let placeholderIndex = 0
  let trimStartNext = 0
  let mutated = false

  const registerMarker = (code: string, isTag: boolean) => {
    if (isTag) {
      const existing = tagPlaceholderMap.get(code)
      if (existing) {
        return existing
      }
      const marker = `${TAG_PLACEHOLDER_PREFIX}${tagPlaceholderMap.size}__`
      tagPlaceholderMap.set(code, marker)
      placeholderMap.set(marker, code)
      return marker
    }

    const marker = `${TEMPLATE_EXPR_PLACEHOLDER_PREFIX}${placeholderIndex++}__`
    placeholderMap.set(marker, code)
    return marker
  }

  quasis.forEach((quasi, index) => {
    let chunk = (quasi.value as { cooked?: string; raw?: string }).cooked
    if (typeof chunk !== 'string') {
      chunk = (quasi.value as { raw?: string }).raw ?? ''
    }

    if (trimStartNext > 0) {
      chunk = chunk.slice(trimStartNext)
      trimStartNext = 0
    }

    template += chunk

    const expression = expressions[index]
    if (!expression) {
      return
    }

    const start = (expression.start as number | undefined) ?? null
    const end = (expression.end as number | undefined) ?? null
    if (start === null || end === null) {
      throw new Error('Unable to read template expression source range.')
    }

    const nextChunk = quasis[index + 1]
    const nextValue = nextChunk?.value as { cooked?: string; raw?: string } | undefined
    const rightText = nextValue?.cooked ?? nextValue?.raw ?? ''
    const context = getTemplateExpressionContext(chunk, rightText)
    const code = source.slice(start, end)
    const marker = registerMarker(code, context.type === 'tag')

    const appendMarker = (wrapper?: (identifier: string) => string) => {
      template += wrapper ? wrapper(marker) : marker
    }

    switch (context.type) {
      case 'tag':
      case 'spread':
      case 'attributeExisting':
      case 'childExisting': {
        appendMarker()
        break
      }
      case 'attributeString': {
        const quoteChar = context.quote
        if (!template.endsWith(quoteChar)) {
          throw new Error(
            `[jsx-loader] Expected attribute quote ${quoteChar} before template expression inside ${tag}\`\` block.`,
          )
        }
        template = template.slice(0, -1)
        appendMarker(identifier => `{${identifier}}`)
        mutated = true
        if (rightText.startsWith(quoteChar)) {
          trimStartNext = 1
        }
        break
      }
      case 'attributeUnquoted': {
        appendMarker(identifier => `{${identifier}}`)
        mutated = true
        break
      }
      case 'childText': {
        appendMarker(identifier => `{${identifier}}`)
        mutated = true
        break
      }
    }
  })

  return {
    source: template,
    mutated,
    placeholders: Array.from(placeholderMap.entries()).map(([marker, code]) => ({
      marker,
      code,
    })),
  }
}

const restoreTemplatePlaceholders = (code: string, placeholders: TemplatePlaceholder[]) =>
  placeholders.reduce((result, placeholder) => {
    return result.split(placeholder.marker).join(`\${${placeholder.code}}`)
  }, code)

const isLoaderPlaceholderIdentifier = (node: AnyNode | undefined) => {
  if (node?.type !== 'Identifier' || typeof node.name !== 'string') {
    return false
  }

  return (
    node.name.startsWith(TEMPLATE_EXPR_PLACEHOLDER_PREFIX) ||
    node.name.startsWith(TAG_PLACEHOLDER_PREFIX)
  )
}

const transformSource = (source: string, config: TransformConfig) => {
  const ast = parseSync(config.resourcePath, source, MODULE_PARSER_OPTIONS)
  if (ast.errors.length > 0) {
    throw new Error(formatParserError(ast.errors[0]!))
  }

  const taggedTemplates: Array<Record<string, unknown>> = []
  walkAst(ast.program, node => {
    if (isTargetTaggedTemplate(node, source, config.tag)) {
      taggedTemplates.push(node)
    }
  })

  if (!taggedTemplates.length) {
    return source
  }

  const magic = new MagicString(source)
  let mutated = false

  taggedTemplates
    .sort((a, b) => (b.start as number) - (a.start as number))
    .forEach(node => {
      const quasi = node.quasi as {
        quasis: Array<Record<string, unknown>>
        expressions: Array<Record<string, unknown>>
      }

      const templateSource = buildTemplateSource(
        quasi.quasis,
        quasi.expressions,
        source,
        config.tag,
      )
      const { code, changed } = transformTemplateLiteral(
        templateSource.source,
        config.resourcePath,
      )
      const restored = restoreTemplatePlaceholders(code, templateSource.placeholders)
      const templateChanged = changed || templateSource.mutated

      if (!templateChanged) {
        return
      }

      const tagSource = source.slice(
        (node.tag as { start: number; end: number }).start,
        (node.tag as { start: number; end: number }).end,
      )
      const replacement = `${tagSource}\`${restored}\``

      magic.overwrite(node.start as number, node.end as number, replacement)
      mutated = true
    })

  return mutated ? magic.toString() : source
}

export default function jsxLoader(
  this: LoaderContext<LoaderOptions>,
  input: string | Buffer,
) {
  const callback = this.async()

  try {
    const options = this.getOptions?.() ?? {}
    const tag = options.tag ?? DEFAULT_TAG
    const source = typeof input === 'string' ? input : input.toString('utf8')
    const output = transformSource(source, {
      resourcePath: this.resourcePath,
      tag,
    })

    callback(null, output)
  } catch (error) {
    callback(error as Error)
  }
}
