import MagicString from 'magic-string'
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
          const text = normalizeJsxTextValue(child.value)
          if (text) {
            compiled.push(JSON.stringify(text))
          }
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

    if ('range' in node && Array.isArray(node.range)) {
      throw new Error('[jsx-loader] Unable to inline complex expressions in react mode.')
    }

    /* c8 ignore next */
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
  helpers: string[]
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

const DEFAULT_TAGS = ['jsx', 'reactJsx']
const DEFAULT_MODE: LoaderMode = 'runtime'

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
    return
  }

  const [start, end] = range
  if (start === end) {
    /* c8 ignore next */
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

const normalizeJsxTextValue = (value: string) => {
  const collapsed = value.replace(/\r/g, '').replace(/\n\s+/g, ' ')
  const trimmed = collapsed.trim()
  return trimmed.length > 0 ? trimmed : ''
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
      /* c8 ignore next */
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
      /* c8 ignore next */
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

const compileReactTemplate = (
  templateSource: string,
  placeholders: TemplatePlaceholder[],
  resourcePath: string,
) => {
  const parsed = parseSync(
    `${resourcePath}?jsx-react-template`,
    templateSource,
    TEMPLATE_PARSER_OPTIONS,
  )

  if (parsed.errors.length > 0) {
    throw new Error(formatParserError(parsed.errors[0]!))
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
    return false
  }

  return (
    node.name.startsWith(TEMPLATE_EXPR_PLACEHOLDER_PREFIX) ||
    node.name.startsWith(TAG_PLACEHOLDER_PREFIX)
  )
}

const transformSource = (source: string, config: TransformConfig): TransformResult => {
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
    return { code: source, helpers: [] }
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

      if (mode === 'runtime') {
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
        return
      }

      if (mode === 'react') {
        const compiled = compileReactTemplate(
          templateSource.source,
          templateSource.placeholders,
          config.resourcePath,
        )
        helperKinds.add('react')
        magic.overwrite(node.start as number, node.end as number, compiled)
        mutated = true
        return
      }

      /* c8 ignore next */
      throw new Error(
        `[jsx-loader] Transformation mode "${mode}" not implemented yet for tag "${tagName}".`,
      )
    })

  return {
    code: mutated ? magic.toString() : source,
    helpers: Array.from(helperKinds)
      .map(kind => HELPER_SNIPPETS[kind])
      .filter(Boolean),
  }
}

export default function jsxLoader(
  this: LoaderContext<LoaderOptions>,
  input: string | Buffer,
) {
  const callback = this.async()

  try {
    const options = this.getOptions?.() ?? {}
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

    if (configuredTagModes) {
      Object.entries(configuredTagModes).forEach(([tagName, mode]) => {
        const parsed = parseLoaderMode(mode)
        if (!parsed || typeof tagName !== 'string' || !tagName.length) {
          return
        }
        tagModes.set(tagName, parsed)
      })
    }

    const defaultMode = parseLoaderMode(options.mode) ?? DEFAULT_MODE
    const tags = Array.from(new Set([...tagList, ...tagModes.keys()]))
    tags.forEach(tagName => {
      if (!tagModes.has(tagName)) {
        tagModes.set(tagName, defaultMode)
      }
    })
    const source = typeof input === 'string' ? input : input.toString('utf8')
    const { code, helpers } = transformSource(source, {
      resourcePath: this.resourcePath,
      tags,
      tagModes,
    })

    if (helpers.length) {
      callback(null, `${code}\n${helpers.join('\n')}`)
      return
    }

    callback(null, code)
  } catch (error) {
    callback(error as Error)
  }
}
