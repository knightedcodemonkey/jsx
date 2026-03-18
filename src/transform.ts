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

export type TransformJsxSourceOptions = TranspileJsxSourceOptions

type InternalTransformJsxSourceOptions = TransformJsxSourceOptions & {
  /* Internal compare switch for parity spikes. */
  typescriptStripBackend?: TypeScriptStripBackend
}

export type TransformJsxSourceResult = {
  code: string
  changed: boolean
  imports: TransformImport[]
  diagnostics: TransformDiagnostic[]
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

    const bindings = Array.isArray(statement.specifiers)
      ? statement.specifiers
          .map(specifier =>
            toImportBinding(specifier, asImportKind(statement.importKind)),
          )
          .filter((binding): binding is TransformImportBinding => binding !== null)
      : []

    imports.push({
      source: statement.source.value,
      importKind: asImportKind(statement.importKind),
      sideEffectOnly: bindings.length === 0,
      bindings,
      range: toSourceRange(statement),
    })
  })

  return imports
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

  if (parserDiagnostics.length) {
    return {
      code: source,
      changed: false,
      imports,
      diagnostics: parserDiagnostics,
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
    }
  }

  const jsxResult = transpileJsxSource(transformed.code, transpileBaseOptions)

  return {
    code: jsxResult.code,
    changed: jsxResult.code !== source,
    imports,
    diagnostics,
  }
}
