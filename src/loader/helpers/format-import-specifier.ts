type AnyNode = {
  type: string
  local?: { name?: string }
  imported?: { name?: string; value?: string }
  [key: string]: unknown
}

export const formatImportSpecifier = (spec: AnyNode) => {
  const node = spec as {
    type: string
    local?: { name?: string }
    imported?: { name?: string; value?: string }
  }

  if (node.type === 'ImportDefaultSpecifier') {
    const name = node.local?.name
    if (!name) {
      throw new Error('[jsx-loader] Encountered default import without a local name.')
    }
    return name
  }

  if (node.type === 'ImportNamespaceSpecifier') {
    const name = node.local?.name
    if (!name) {
      throw new Error('[jsx-loader] Encountered namespace import without a local name.')
    }
    return `* as ${name}`
  }

  if (node.type === 'ImportSpecifier') {
    const imported = node.imported?.name
    if (!imported) {
      throw new Error('[jsx-loader] Encountered named import without an imported name.')
    }

    const local = node.local?.name ?? imported
    return imported === local ? imported : `${imported} as ${local}`
  }

  return ''
}
