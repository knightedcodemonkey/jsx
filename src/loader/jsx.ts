import MagicString, { type SourceMap } from 'magic-string'
import { parseSync, type ParserOptions, type OxcError } from 'oxc-parser'
import type {
  Expression,
  JSXAttribute,
  JSXChild,
  JSXElement,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXSpreadAttribute,
  Program,
} from '@oxc-project/types'
import {
  formatTaggedTemplateParserError,
  type TemplateDiagnostics,
  type TemplateExpressionRange,
} from '../internal/template-diagnostics.js'

type LoaderCallback = (
  error: Error | null,
  content?: string,
  map?: SourceMap | null,
) => void

type LoaderContext<TOptions> = {
  resourcePath: string
  // webpack/rspack expose target; optional for other bundlers.
  target?: string
  // webpack-compatible warning hook; optional for other bundlers.
  emitWarning?: (warning: Error | string) => void
  async(): LoaderCallback
  getOptions?: () => Partial<TOptions>
}

type AnyNode = {
  type: string
  [key: string]: unknown
}

type LoaderMode = 'runtime' | 'react'

type LoaderOptions = {
  /**
   * Name of the tagged template function. Defaults to `jsx`.
   * Deprecated in favor of `tags`.
   * @deprecated Use `tags` instead.
   */
  tag?: string
  /**
   * List of tagged template function names to transform. Defaults to `['jsx', 'reactJsx']`.
   */
  tags?: string[]
  /**
   * Global transformation mode for every tag. Defaults to `runtime`.
   */
  mode?: LoaderMode
  /**
   * Optional per-tag override of the transformation mode. Keys map to tag names.
   */
  tagModes?: Record<string, LoaderMode | undefined>
  /**
   * When true, generate inline source maps for mutated files.
   */
  sourceMap?: boolean
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

const createPlaceholderMap = (placeholders: TemplatePlaceholder[]) =>
  new Map(placeholders.map(entry => [entry.marker, entry.code]))

class ReactTemplateBuilder {
  private placeholderMap: Map<string, string>

  constructor(placeholderSource: TemplatePlaceholder[]) {
    this.placeholderMap = createPlaceholderMap(placeholderSource)
  }

  compile(node: JSXElement | JSXFragment): string {
    return this.compileNode(node)
  }

  private compileNode(node: JSXElement | JSXFragment): string {
    if (node.type === 'JSXFragment') {
      const children = this.compileChildren(node.children)
      return this.buildCreateElement('React.Fragment', 'null', children)
    }

    const opening = node.openingElement
    const tagExpr = this.compileTagName(opening.name)
    const propsExpr = this.compileProps(opening.attributes)
    const children = this.compileChildren(node.children)
    return this.buildCreateElement(tagExpr, propsExpr, children)
  }

  private compileChildren(children: JSXChild[]): string[] {
    const compiled: string[] = []

    children.forEach(child => {
      switch (child.type) {
        case 'JSXText': {
          const segments = normalizeJsxTextSegments(child.value, this.placeholderMap)
          segments.forEach(segment => {
            if (segment.kind === 'text') {
              compiled.push(JSON.stringify(segment.value))
              return
            }
            compiled.push(segment.value)
          })
          break
        }
        case 'JSXExpressionContainer': {
          if (child.expression.type === 'JSXEmptyExpression') {
            break
          }
          compiled.push(this.compileExpression(child.expression))
          break
        }
        case 'JSXSpreadChild': {
          compiled.push(this.compileExpression(child.expression))
          break
        }
        case 'JSXElement':
        case 'JSXFragment': {
          compiled.push(this.compileNode(child))
          break
        }
      }
    })

    return compiled
  }

  private compileProps(attributes: (JSXAttribute | JSXSpreadAttribute)[]): string {
    const segments: string[] = []
    let staticEntries: string[] = []

    const flushStatics = () => {
      if (!staticEntries.length) {
        return
      }
      segments.push(`{ ${staticEntries.join(', ')} }`)
      staticEntries = []
    }

    attributes.forEach(attribute => {
      if (attribute.type === 'JSXSpreadAttribute') {
        flushStatics()
        segments.push(this.compileExpression(attribute.argument))
        return
      }

      const name = this.compileAttributeName(attribute.name)
      let value: string

      if (!attribute.value) {
        value = 'true'
      } else if (attribute.value.type === 'Literal') {
        value = JSON.stringify(attribute.value.value)
      } else if (attribute.value.type === 'JSXExpressionContainer') {
        if (attribute.value.expression.type === 'JSXEmptyExpression') {
          return
        }
        value = this.compileExpression(attribute.value.expression)
      } else {
        value = 'undefined'
      }

      staticEntries.push(`${JSON.stringify(name)}: ${value}`)
    })

    flushStatics()

    if (!segments.length) {
      return 'null'
    }

    if (segments.length === 1) {
      return segments[0]!
    }

    return `__jsxReactMergeProps(${segments.join(', ')})`
  }

  private compileAttributeName(
    name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression,
  ): string {
    switch (name.type) {
      case 'JSXIdentifier':
        return name.name
      case 'JSXNamespacedName':
        return `${name.namespace.name}:${name.name.name}`
      case 'JSXMemberExpression':
        return `${this.compileAttributeName(name.object)}.${name.property.name}`
      default:
        /* c8 ignore next */
        return ''
    }
  }

  private compileTagName(name: JSXElement['openingElement']['name']): string {
    if (!name) {
      /* c8 ignore next */
      throw new Error('[jsx-loader] Encountered JSX element without a tag name.')
    }

    if (name.type === 'JSXIdentifier') {
      if (isLoaderPlaceholderIdentifier(name as unknown as AnyNode) && name.name) {
        const resolved = this.placeholderMap.get(name.name)
        if (!resolved) {
          /* c8 ignore next 3 */
          throw new Error(
            '[jsx-loader] Unable to resolve placeholder for tag expression.',
          )
        }
        return resolved
      }
      if (/^[A-Z]/.test(name.name)) {
        return name.name
      }
      return JSON.stringify(name.name)
    }

    if (name.type === 'JSXMemberExpression') {
      const object = this.compileTagName(name.object as never)
      return `${object}.${name.property.name}`
    }

    if (name.type === 'JSXNamespacedName') {
      return JSON.stringify(`${name.namespace.name}:${name.name.name}`)
    }

    /* c8 ignore next */
    throw new Error('[jsx-loader] Unsupported tag expression in react mode.')
  }

  private compileExpression(node: Expression | JSXElement | JSXFragment): string {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      return this.compileNode(node)
    }

    if (node.type === 'Identifier') {
      const resolved = this.placeholderMap.get(node.name as string)
      if (resolved) {
        return resolved
      }
      return node.name as string
    }

    if (node.type === 'Literal') {
      return JSON.stringify((node as { value: unknown }).value)
    }

    if ('range' in node && Array.isArray(node.range)) {
      throw new Error('[jsx-loader] Unable to inline complex expressions in react mode.')
    }

    /* c8 ignore next */
    /* v8 ignore next */
    /* istanbul ignore next */
    // Should never happen because OXC always annotates expression ranges.
    throw new Error('[jsx-loader] Unable to compile expression for react mode.')
  }

  private buildCreateElement(type: string, props: string, children: string[]) {
    const args: string[] = [type, props]
    if (children.length) {
      args.push(children.join(', '))
    }
    return `__jsxReact(${args.join(', ')})`
  }
}

type TemplateExpressionContext =
  | { type: 'tag' }
  | { type: 'spread' }
  | { type: 'attributeExisting' }
  | { type: 'attributeString'; quote: '"' | "'" }
  | { type: 'attributeUnquoted' }
  | { type: 'childExisting' }
  | { type: 'childText' }

type JsxTextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'expression'; value: string }

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
  tags: string[]
  tagModes: Map<string, LoaderMode>
}

type HelperKind = 'react'

type TransformResult = {
  code: string
  map?: SourceMap
  mutated: boolean
}

const TEMPLATE_EXPR_PLACEHOLDER_PREFIX = '__JSX_LOADER_TEMPLATE_EXPR_'
const TEMPLATE_EXPR_PLACEHOLDER_PATTERN = new RegExp(
  `${TEMPLATE_EXPR_PLACEHOLDER_PREFIX}\\d+__`,
  'g',
)

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

const DEFAULT_TAGS = ['jsx', 'reactJsx']
const DEFAULT_MODE: LoaderMode = 'runtime'

const WEB_TARGETS = new Set(['web', 'webworker', 'electron-renderer', 'node-webkit'])

const isWebTarget = (target: string | undefined) =>
  target ? WEB_TARGETS.has(target) : false

const HELPER_SNIPPETS: Record<HelperKind, string> = {
  react: `const __jsxReactMergeProps = (...sources) => Object.assign({}, ...sources)
const __jsxReact = (type, props, ...children) => React.createElement(type, props, ...children)
`,
}

const parseLoaderMode = (value: unknown): LoaderMode | null => {
  if (typeof value !== 'string') {
    return null
  }

  switch (value) {
    case 'runtime':
    case 'react':
      return value
    default:
      return null
  }
}

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
    /* c8 ignore next */
    /* v8 ignore next */
    // OXC always provides ranges; guard defends against malformed AST nodes.
    return
  }

  const [start, end] = range
  if (start === end) {
    /* c8 ignore next */
    /* v8 ignore next */
    // Zero-length ranges indicate parser bugs and would emit empty slices.
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
      /* c8 ignore next */
      /* v8 ignore next */
      // JSX elements emitted by OXC always carry a name; this is defensive.
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
        /* c8 ignore next */
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
      /* c8 ignore next */
      /* v8 ignore next */
      // Slots are generated from non-overlapping JSX ranges; this protects against parser regressions.
      throw new Error('Overlapping JSX expressions detected inside template literal.')
    }

    output += escapeTemplateChunk(source.slice(cursor, slot.start))
    output += `\${${slot.code}}`
    cursor = slot.end
  })

  output += escapeTemplateChunk(source.slice(cursor))
  return { code: output, changed: slots.length > 0 }
}

const transformTemplateLiteral = (
  templateSource: string,
  resourcePath: string,
  tagName: string,
  templates: TemplateStringsArray,
  diagnostics: TemplateDiagnostics,
) => {
  const result = parseSync(
    `${resourcePath}?jsx-template`,
    templateSource,
    TEMPLATE_PARSER_OPTIONS,
  )

  if (result.errors.length > 0) {
    throw new Error(
      formatTaggedTemplateParserError(
        tagName,
        templates,
        diagnostics,
        result.errors[0]!,
        {
          label: 'jsx-loader',
        },
      ),
    )
  }

  const slots = collectSlots(result.program, templateSource)
  return renderTemplateWithSlots(templateSource, slots)
}

const getTaggedTemplateName = (node: Record<string, unknown>) => {
  if (node.type !== 'TaggedTemplateExpression') {
    return null
  }

  const tagNode = node.tag as Record<string, unknown>
  if (tagNode.type !== 'Identifier') {
    return null
  }

  return tagNode.name as string
}

const extractJsxRoot = (program: Program): JSXElement | JSXFragment => {
  for (const statement of program.body) {
    if (statement.type === 'ExpressionStatement') {
      const expression = statement.expression
      if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
        return expression
      }
    }
  }

  throw new Error('[jsx-loader] Expected the template to contain a single JSX root node.')
}

const normalizeJsxTextSegments = (
  value: string,
  placeholders: Map<string, string>,
): JsxTextSegment[] => {
  const collapsed = value.replace(/\r/g, '').replace(/\n\s+/g, ' ')
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? ''
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? ''
  const trimStart = /\n/.test(leadingWhitespace)
  const trimEnd = /\n/.test(trailingWhitespace)

  let normalized = collapsed
  if (trimStart) {
    normalized = normalized.replace(/^\s+/, '')
  }
  if (trimEnd) {
    normalized = normalized.replace(/\s+$/, '')
  }

  if (normalized.length === 0 || normalized.trim().length === 0) {
    return [] as JsxTextSegment[]
  }

  const segments: JsxTextSegment[] = []
  TEMPLATE_EXPR_PLACEHOLDER_PATTERN.lastIndex = 0
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = TEMPLATE_EXPR_PLACEHOLDER_PATTERN.exec(normalized))) {
    const index = match.index
    const slice = normalized.slice(cursor, index)
    if (slice) {
      segments.push({ kind: 'text', value: slice })
    }

    const marker = match[0]
    const expression = placeholders.get(marker)
    if (expression) {
      segments.push({ kind: 'expression', value: expression })
    } else {
      segments.push({ kind: 'text', value: marker })
    }

    cursor = index + marker.length
  }

  const remainder = normalized.slice(cursor)
  if (remainder) {
    segments.push({ kind: 'text', value: remainder })
  }

  return segments
}

const TAG_PLACEHOLDER_PREFIX = '__JSX_LOADER_TAG_EXPR_'

const materializeTemplateStrings = (
  quasis: Array<Record<string, unknown>>,
): TemplateStringsArray => {
  const cooked: string[] = []
  const raw: string[] = []

  quasis.forEach(quasi => {
    const value = quasi.value as { cooked?: string; raw?: string }
    const cookedChunk =
      typeof value.cooked === 'string' ? value.cooked : (value.raw ?? '')
    const rawChunk = typeof value.raw === 'string' ? value.raw : cookedChunk
    cooked.push(cookedChunk)
    raw.push(rawChunk)
  })

  const templates = cooked as unknown as TemplateStringsArray
  Object.defineProperty(templates, 'raw', {
    value: raw as readonly string[],
    writable: false,
    configurable: false,
    enumerable: false,
  })
  return templates
}

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
  const expressionRanges: TemplateExpressionRange[] = []

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

  const appendInsertion = (expressionIndex: number, insertion: string) => {
    const start = template.length
    template += insertion
    const end = template.length
    expressionRanges.push({ index: expressionIndex, sourceStart: start, sourceEnd: end })
  }

  quasis.forEach((quasi, index) => {
    let chunk = (quasi.value as { cooked?: string; raw?: string }).cooked
    if (typeof chunk !== 'string') {
      /* c8 ignore next */
      /* v8 ignore next */
      // Cooked text is always available for valid templates; fall back shields invalid escape sequences.
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
    const expressionIndex = index

    const start = (expression.start as number | undefined) ?? null
    const end = (expression.end as number | undefined) ?? null
    if (start === null || end === null) {
      /* c8 ignore next */
      /* v8 ignore next */
      // Expressions parsed from tagged templates always include start/end ranges.
      throw new Error('Unable to read template expression source range.')
    }

    const nextChunk = quasis[index + 1]
    const nextValue = nextChunk?.value as { cooked?: string; raw?: string } | undefined
    const rightText = nextValue?.cooked ?? nextValue?.raw ?? ''
    const context = getTemplateExpressionContext(chunk, rightText)
    const code = source.slice(start, end)
    const marker = registerMarker(code, context.type === 'tag')

    const appendMarker = (wrapper?: (identifier: string) => string) => {
      const insertion = wrapper ? wrapper(marker) : marker
      appendInsertion(expressionIndex, insertion)
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
    diagnostics: { expressionRanges },
  }
}

const restoreTemplatePlaceholders = (code: string, placeholders: TemplatePlaceholder[]) =>
  placeholders.reduce((result, placeholder) => {
    return result.split(placeholder.marker).join(`\${${placeholder.code}}`)
  }, code)

const createInlineSourceMapComment = (map: SourceMap) => {
  const payload = Buffer.from(JSON.stringify(map), 'utf8').toString('base64')
  return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${payload}`
}

const compileReactTemplate = (
  templateSource: string,
  placeholders: TemplatePlaceholder[],
  resourcePath: string,
  tagName: string,
  templates: TemplateStringsArray,
  diagnostics: TemplateDiagnostics,
) => {
  const parsed = parseSync(
    `${resourcePath}?jsx-react-template`,
    templateSource,
    TEMPLATE_PARSER_OPTIONS,
  )

  if (parsed.errors.length > 0) {
    throw new Error(
      formatTaggedTemplateParserError(
        tagName,
        templates,
        diagnostics,
        parsed.errors[0]!,
        {
          label: 'jsx-loader',
        },
      ),
    )
  }

  const root = extractJsxRoot(parsed.program)
  const builder = new ReactTemplateBuilder(placeholders)
  return builder.compile(root)
}

const isLoaderPlaceholderIdentifier = (node: AnyNode | undefined) => {
  if (
    !node ||
    (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') ||
    typeof node.name !== 'string'
  ) {
    /* c8 ignore next */
    /* v8 ignore next */
    // Visitor only calls this helper with identifier-like nodes; guard prevents crashes on malformed ASTs.
    return false
  }

  return (
    node.name.startsWith(TEMPLATE_EXPR_PLACEHOLDER_PREFIX) ||
    node.name.startsWith(TAG_PLACEHOLDER_PREFIX)
  )
}

const transformSource = (
  source: string,
  config: TransformConfig,
  options?: { sourceMap: boolean },
): TransformResult => {
  const ast = parseSync(config.resourcePath, source, MODULE_PARSER_OPTIONS)
  if (ast.errors.length > 0) {
    throw new Error(formatParserError(ast.errors[0]!))
  }

  type TaggedTemplateInfo = {
    node: Record<string, unknown>
    tagName: string
  }

  const taggedTemplates: TaggedTemplateInfo[] = []
  walkAst(ast.program, node => {
    const tagName = getTaggedTemplateName(node)
    if (tagName && config.tags.includes(tagName)) {
      taggedTemplates.push({ node, tagName })
    }
  })

  if (!taggedTemplates.length) {
    return { code: source, mutated: false }
  }

  const magic = new MagicString(source)
  let mutated = false
  const helperKinds = new Set<HelperKind>()

  taggedTemplates
    .sort((a, b) => (b.node.start as number) - (a.node.start as number))
    .forEach(entry => {
      const { node, tagName } = entry
      const mode = config.tagModes.get(tagName) ?? DEFAULT_MODE
      const quasi = node.quasi as {
        quasis: Array<Record<string, unknown>>
        expressions: Array<Record<string, unknown>>
      }

      const templateSource = buildTemplateSource(
        quasi.quasis,
        quasi.expressions,
        source,
        tagName,
      )
      const templateStrings = materializeTemplateStrings(quasi.quasis)

      if (mode === 'runtime') {
        const { code, changed } = transformTemplateLiteral(
          templateSource.source,
          config.resourcePath,
          tagName,
          templateStrings,
          templateSource.diagnostics,
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
        return
      }

      if (mode === 'react') {
        const compiled = compileReactTemplate(
          templateSource.source,
          templateSource.placeholders,
          config.resourcePath,
          tagName,
          templateStrings,
          templateSource.diagnostics,
        )
        helperKinds.add('react')
        magic.overwrite(node.start as number, node.end as number, compiled)
        mutated = true
        return
      }

      /* c8 ignore next */
      /* v8 ignore next */
      // Modes are validated during option parsing; this fallback guards future extensions.
      throw new Error(
        `[jsx-loader] Transformation mode "${mode}" not implemented yet for tag "${tagName}".`,
      )
    })

  const helperSource = Array.from(helperKinds)
    .map(kind => HELPER_SNIPPETS[kind])
    .filter(Boolean)
    .join('\n')

  if (helperSource) {
    const helperBlock = `${helperSource.trimEnd()}\n\n`
    const shebangIndex = source.startsWith('#!') ? source.indexOf('\n') : -1

    if (shebangIndex >= 0) {
      magic.appendLeft(shebangIndex + 1, helperBlock)
    } else {
      magic.prepend(helperBlock)
    }
    mutated = true
  }

  const code = mutated ? magic.toString() : source
  const map =
    options?.sourceMap && mutated
      ? magic.generateMap({
          hires: true,
          source: config.resourcePath,
          includeContent: true,
        })
      : undefined

  return {
    code,
    map,
    mutated,
  }
}

export default function jsxLoader(
  this: LoaderContext<LoaderOptions>,
  input: string | Buffer,
) {
  const callback = this.async() as LoaderCallback

  try {
    const options = this.getOptions?.() ?? {}
    const warn = this.emitWarning?.bind(this)
    const webTarget = isWebTarget(this.target)
    const explicitTags = Array.isArray(options.tags)
      ? options.tags.filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        )
      : null
    const legacyTag =
      typeof options.tag === 'string' && options.tag.length > 0 ? options.tag : null
    const tagList = explicitTags?.length
      ? explicitTags
      : legacyTag
        ? [legacyTag]
        : DEFAULT_TAGS
    const tagModes = new Map<string, LoaderMode>()
    const configuredTagModes =
      options.tagModes && typeof options.tagModes === 'object'
        ? options.tagModes
        : undefined
    const userSpecifiedMode = parseLoaderMode(options.mode)
    const defaultMode = userSpecifiedMode ?? DEFAULT_MODE
    const userConfiguredTags = new Set<string>()

    if (configuredTagModes) {
      Object.entries(configuredTagModes).forEach(([tagName, mode]) => {
        const parsed = parseLoaderMode(mode)
        if (!parsed || typeof tagName !== 'string' || !tagName.length) {
          return
        }
        tagModes.set(tagName, parsed)
        userConfiguredTags.add(tagName)
      })
    }

    const tags = Array.from(new Set([...tagList, ...tagModes.keys()]))
    tags.forEach(tagName => {
      if (!tagModes.has(tagName)) {
        tagModes.set(tagName, defaultMode)
      }
    })

    // If targeting the web and runtime mode is only implied (not explicitly requested),
    // downgrade to react to avoid bundling the Node-only wasm parser.
    if (webTarget && userSpecifiedMode === null) {
      tagModes.forEach((mode, tagName) => {
        if (mode === 'runtime' && !userConfiguredTags.has(tagName)) {
          tagModes.set(tagName, 'react')
          warn?.(
            new Error(
              `[jsx-loader] Falling back to react mode for tag "${tagName}" because the runtime parser is not browser-safe. Set mode explicitly if you need runtime behavior.`,
            ),
          )
        }
      })
    }
    const source = typeof input === 'string' ? input : input.toString('utf8')
    const enableSourceMap = options.sourceMap === true
    const { code, map } = transformSource(
      source,
      {
        resourcePath: this.resourcePath,
        tags,
        tagModes,
      },
      { sourceMap: enableSourceMap },
    )

    const output =
      map && enableSourceMap ? `${code}\n${createInlineSourceMapComment(map)}` : code

    callback(null, output, map)
  } catch (error) {
    callback(error as Error)
  }
}
