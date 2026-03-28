import { parseSync } from 'oxc-parser'
import { transformSync } from 'oxc-transform'
import { transpileJsxSource, type TranspileJsxSourceOptions } from './transpile.js'

type SourceRange = [number, number]
type TransformSourceType = 'module' | 'script'
type TypeScriptStripBackend = 'oxc-transform' | 'transpile-manual'
type DiagnosticSource = 'parser' | 'transform'
type OxcDiagnosticLike = {
  severity: string
  message: string
  labels?: Array<{
    start: number
    end: number
  }>
  codeframe: string | null
  helpMessage: string | null
}

export type TransformDiagnostic = {
  source: DiagnosticSource
  severity: string
  message: string
  range: SourceRange | null
  codeframe: string | null
  helpMessage: string | null
}

export type TransformImportBinding = {
  kind: 'default' | 'named' | 'namespace'
  local: string
  imported: string | null
  isTypeOnly: boolean
  range: SourceRange | null
}

export type TransformImport = {
  source: string
  importKind: 'type' | 'value'
  sideEffectOnly: boolean
  bindings: TransformImportBinding[]
  range: SourceRange | null
}

export type TransformTopLevelDeclarationKind = 'function' | 'class' | 'variable'

export type TransformTopLevelDeclarationExportKind = 'none' | 'named' | 'default'

export type TransformVariableInitializerKind =
  | 'arrow-function'
  | 'function-expression'
  | 'class-expression'
  | 'other'
  | null

export type TransformTopLevelDeclaration = {
  name: string
  kind: TransformTopLevelDeclarationKind
  exportKind: TransformTopLevelDeclarationExportKind
  range: SourceRange | null
  statementRange: SourceRange | null
  initializerKind: TransformVariableInitializerKind
}

export type TransformJsxSourceOptions = TranspileJsxSourceOptions & {
  collectTopLevelDeclarations?: boolean
  collectTopLevelJsxExpression?: boolean
}

type InternalTransformJsxSourceOptions = TransformJsxSourceOptions & {
  /* Internal compare switch for parity spikes. */
  typescriptStripBackend?: TypeScriptStripBackend
}

export type TransformJsxSourceResult = {
  code: string
  changed: boolean
  imports: TransformImport[]
  diagnostics: TransformDiagnostic[]
  declarations?: TransformTopLevelDeclaration[]
  hasTopLevelJsxExpression?: boolean
}

const createParserOptions = (sourceType: TransformSourceType) => ({
  lang: 'tsx' as const,
  sourceType,
  range: true,
  preserveParens: true,
})

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isSourceRange = (value: unknown): value is SourceRange =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number'

const toSourceRange = (value: unknown): SourceRange | null => {
  if (!isObjectRecord(value) || !isSourceRange(value.range)) {
    return null
  }

  return value.range
}

const asImportKind = (value: unknown): 'type' | 'value' =>
  value === 'type' ? 'type' : 'value'

const toDiagnostic = (
  source: DiagnosticSource,
  diagnostic: OxcDiagnosticLike,
): TransformDiagnostic => {
  const firstLabel = diagnostic.labels?.[0]
  const range: SourceRange | null =
    firstLabel &&
    typeof firstLabel.start === 'number' &&
    typeof firstLabel.end === 'number'
      ? [firstLabel.start, firstLabel.end]
      : null

  return {
    source,
    severity: diagnostic.severity,
    message: diagnostic.message,
    range,
    codeframe: diagnostic.codeframe,
    helpMessage: diagnostic.helpMessage,
  }
}

const toImportBinding = (
  specifier: unknown,
  declarationImportKind: 'type' | 'value',
): TransformImportBinding | null => {
  if (!isObjectRecord(specifier) || typeof specifier.type !== 'string') {
    return null
  }

  if (specifier.type === 'ImportDefaultSpecifier') {
    const localName =
      isObjectRecord(specifier.local) && typeof specifier.local.name === 'string'
        ? specifier.local.name
        : null

    if (!localName) {
      return null
    }

    return {
      kind: 'default',
      local: localName,
      imported: 'default',
      isTypeOnly: declarationImportKind === 'type',
      range: toSourceRange(specifier),
    }
  }

  if (specifier.type === 'ImportNamespaceSpecifier') {
    const localName =
      isObjectRecord(specifier.local) && typeof specifier.local.name === 'string'
        ? specifier.local.name
        : null

    if (!localName) {
      return null
    }

    return {
      kind: 'namespace',
      local: localName,
      imported: '*',
      isTypeOnly: declarationImportKind === 'type',
      range: toSourceRange(specifier),
    }
  }

  if (specifier.type === 'ImportSpecifier') {
    const importedName =
      isObjectRecord(specifier.imported) && typeof specifier.imported.name === 'string'
        ? specifier.imported.name
        : null
    const localName =
      isObjectRecord(specifier.local) && typeof specifier.local.name === 'string'
        ? specifier.local.name
        : null

    if (!importedName || !localName) {
      return null
    }

    return {
      kind: 'named',
      local: localName,
      imported: importedName,
      isTypeOnly:
        declarationImportKind === 'type' || asImportKind(specifier.importKind) === 'type',
      range: toSourceRange(specifier),
    }
  }

  return null
}

const collectImportMetadata = (body: unknown): TransformImport[] => {
  if (!Array.isArray(body)) {
    return []
  }

  const imports: TransformImport[] = []

  body.forEach(statement => {
    if (
      !isObjectRecord(statement) ||
      statement.type !== 'ImportDeclaration' ||
      !isObjectRecord(statement.source) ||
      typeof statement.source.value !== 'string'
    ) {
      return
    }

    const importKind = asImportKind(statement.importKind)
    const bindings = Array.isArray(statement.specifiers)
      ? statement.specifiers
          .map(specifier => toImportBinding(specifier, importKind))
          .filter((binding): binding is TransformImportBinding => binding !== null)
      : []

    imports.push({
      source: statement.source.value,
      importKind,
      sideEffectOnly: bindings.length === 0 && importKind === 'value',
      bindings,
      range: toSourceRange(statement),
    })
  })

  return imports
}

const toIdentifierName = (value: unknown): string | null => {
  if (!isObjectRecord(value)) {
    return null
  }

  if (value.type !== 'Identifier') {
    return null
  }

  return typeof value.name === 'string' ? value.name : null
}

const toVariableInitializerKind = (value: unknown): TransformVariableInitializerKind => {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'ArrowFunctionExpression') {
    return 'arrow-function'
  }

  if (value.type === 'FunctionExpression') {
    return 'function-expression'
  }

  if (value.type === 'ClassExpression') {
    return 'class-expression'
  }

  return 'other'
}

const pushTopLevelDeclarationMetadata = ({
  declaration,
  exportKind,
  statementRange,
  declarations,
}: {
  declaration: Record<string, unknown>
  exportKind: TransformTopLevelDeclarationExportKind
  statementRange: SourceRange | null
  declarations: TransformTopLevelDeclaration[]
}) => {
  if (declaration.type === 'FunctionDeclaration') {
    const name = toIdentifierName(declaration.id)
    if (!name) {
      return
    }

    declarations.push({
      name,
      kind: 'function',
      exportKind,
      range: toSourceRange(declaration),
      statementRange,
      initializerKind: null,
    })
    return
  }

  if (declaration.type === 'ClassDeclaration') {
    const name = toIdentifierName(declaration.id)
    if (!name) {
      return
    }

    declarations.push({
      name,
      kind: 'class',
      exportKind,
      range: toSourceRange(declaration),
      statementRange,
      initializerKind: null,
    })
    return
  }

  if (!Array.isArray(declaration.declarations)) {
    return
  }

  for (const declarator of declaration.declarations) {
    if (!isObjectRecord(declarator)) {
      continue
    }

    const name = toIdentifierName(declarator.id)
    if (!name) {
      continue
    }

    declarations.push({
      name,
      kind: 'variable',
      exportKind,
      range: toSourceRange(declarator),
      statementRange,
      initializerKind: toVariableInitializerKind(declarator.init),
    })
  }
}

const collectTopLevelDeclarationMetadata = (
  body: unknown,
): TransformTopLevelDeclaration[] => {
  if (!Array.isArray(body)) {
    return []
  }

  const declarations: TransformTopLevelDeclaration[] = []

  for (const statement of body) {
    if (!isObjectRecord(statement) || typeof statement.type !== 'string') {
      continue
    }

    const statementRange = toSourceRange(statement)

    if (statement.type === 'ExportNamedDeclaration') {
      if (!isObjectRecord(statement.declaration)) {
        continue
      }

      pushTopLevelDeclarationMetadata({
        declaration: statement.declaration,
        exportKind: 'named',
        statementRange,
        declarations,
      })
      continue
    }

    if (statement.type === 'ExportDefaultDeclaration') {
      if (!isObjectRecord(statement.declaration)) {
        continue
      }

      pushTopLevelDeclarationMetadata({
        declaration: statement.declaration,
        exportKind: 'default',
        statementRange,
        declarations,
      })
      continue
    }

    pushTopLevelDeclarationMetadata({
      declaration: statement,
      exportKind: 'none',
      statementRange,
      declarations,
    })
  }

  return declarations
}

const unwrapExpressionNode = (value: unknown): unknown => {
  let current = value

  while (isObjectRecord(current) && typeof current.type === 'string') {
    if (current.type === 'ParenthesizedExpression') {
      current = current.expression
      continue
    }

    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSInstantiationExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSTypeAssertion'
    ) {
      current = current.expression
      continue
    }

    break
  }

  return current
}

const isJsxExpressionNode = (value: unknown): boolean => {
  const unwrapped = unwrapExpressionNode(value)
  if (!isObjectRecord(unwrapped) || typeof unwrapped.type !== 'string') {
    return false
  }

  return unwrapped.type === 'JSXElement' || unwrapped.type === 'JSXFragment'
}

const collectTopLevelJsxExpressionMetadata = (body: unknown): boolean => {
  if (!Array.isArray(body)) {
    return false
  }

  for (const statement of body) {
    if (!isObjectRecord(statement) || statement.type !== 'ExpressionStatement') {
      continue
    }

    if (isJsxExpressionNode(statement.expression)) {
      return true
    }
  }

  return false
}

const ensureSupportedOptions = (options: InternalTransformJsxSourceOptions) => {
  if (
    options.sourceType !== undefined &&
    options.sourceType !== 'module' &&
    options.sourceType !== 'script'
  ) {
    throw new Error(
      `[jsx] Unsupported sourceType "${String(options.sourceType)}". Use "module" or "script".`,
    )
  }

  if (
    options.typescript !== undefined &&
    options.typescript !== 'preserve' &&
    options.typescript !== 'strip'
  ) {
    throw new Error(
      `[jsx] Unsupported typescript mode "${String(options.typescript)}". Use "preserve" or "strip".`,
    )
  }

  if (
    options.typescriptStripBackend !== undefined &&
    options.typescriptStripBackend !== 'oxc-transform' &&
    options.typescriptStripBackend !== 'transpile-manual'
  ) {
    throw new Error(
      `[jsx] Unsupported typescriptStripBackend "${String(options.typescriptStripBackend)}". Use "oxc-transform" or "transpile-manual".`,
    )
  }

  if (
    options.collectTopLevelDeclarations !== undefined &&
    typeof options.collectTopLevelDeclarations !== 'boolean'
  ) {
    throw new Error(
      `[jsx] Unsupported collectTopLevelDeclarations value "${String(options.collectTopLevelDeclarations)}". Use true or false.`,
    )
  }

  if (
    options.collectTopLevelJsxExpression !== undefined &&
    typeof options.collectTopLevelJsxExpression !== 'boolean'
  ) {
    throw new Error(
      `[jsx] Unsupported collectTopLevelJsxExpression value "${String(options.collectTopLevelJsxExpression)}". Use true or false.`,
    )
  }
}

export function transformJsxSource(
  source: string,
  options: TransformJsxSourceOptions = {},
): TransformJsxSourceResult {
  const internalOptions = options as InternalTransformJsxSourceOptions

  ensureSupportedOptions(internalOptions)

  const sourceType = internalOptions.sourceType ?? 'module'
  const typescriptMode = internalOptions.typescript ?? 'preserve'
  const typescriptStripBackend = internalOptions.typescriptStripBackend ?? 'oxc-transform'

  const parsed = parseSync(
    'transform-jsx-source.tsx',
    source,
    createParserOptions(sourceType),
  )

  const parserDiagnostics = parsed.errors.map(error => toDiagnostic('parser', error))
  const imports = collectImportMetadata(parsed.program.body)
  const declarations = internalOptions.collectTopLevelDeclarations
    ? collectTopLevelDeclarationMetadata(parsed.program.body)
    : undefined
  const hasTopLevelJsxExpression = internalOptions.collectTopLevelJsxExpression
    ? collectTopLevelJsxExpressionMetadata(parsed.program.body)
    : undefined

  if (parserDiagnostics.length) {
    return {
      code: source,
      changed: false,
      imports,
      diagnostics: parserDiagnostics,
      declarations,
      hasTopLevelJsxExpression,
    }
  }

  const transpileBaseOptions: TranspileJsxSourceOptions = {
    sourceType,
    createElement: internalOptions.createElement,
    fragment: internalOptions.fragment,
    typescript: 'preserve',
  }

  if (typescriptMode !== 'strip') {
    const result = transpileJsxSource(source, transpileBaseOptions)
    return {
      code: result.code,
      changed: result.changed,
      imports,
      diagnostics: parserDiagnostics,
      declarations,
      hasTopLevelJsxExpression,
    }
  }

  if (typescriptStripBackend === 'transpile-manual') {
    const result = transpileJsxSource(source, {
      ...transpileBaseOptions,
      typescript: 'strip',
    })

    return {
      code: result.code,
      changed: result.changed,
      imports,
      diagnostics: parserDiagnostics,
      declarations,
      hasTopLevelJsxExpression,
    }
  }

  const transformed = transformSync('transform-jsx-source.tsx', source, {
    lang: 'tsx',
    sourceType,
    jsx: 'preserve',
    typescript: {},
  })
  const transformDiagnostics = transformed.errors.map(error =>
    toDiagnostic('transform', error),
  )
  const diagnostics = [...parserDiagnostics, ...transformDiagnostics]

  if (transformDiagnostics.length) {
    const fallbackCode = transformed.code || source

    return {
      code: fallbackCode,
      changed: fallbackCode !== source,
      imports,
      diagnostics,
      declarations,
      hasTopLevelJsxExpression,
    }
  }

  const jsxResult = transpileJsxSource(transformed.code, transpileBaseOptions)

  return {
    code: jsxResult.code,
    changed: jsxResult.code !== source,
    imports,
    diagnostics,
    declarations,
    hasTopLevelJsxExpression,
  }
}
