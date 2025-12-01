import { describe, it, expect } from 'vitest'

import loader from '../src/loader/jsx'

const runLoader = (source: string, options?: { tag?: string }) =>
  new Promise<string>((resolve, reject) => {
    const context = {
      resourcePath: '/virtual/file.tsx',
      getOptions: () => options ?? {},
      async() {
        return (err: Error | null, result?: string) => {
          if (err) {
            reject(err)
            return
          }
          resolve(result ?? '')
        }
      },
    }

    loader.call(context as never, source)
  })

describe('jsx loader', () => {
  it('leaves static templates untouched', async () => {
    const source = ['const view = jsx`<div><p>Hello</p></div>`'].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toBe(source)
  })

  it('rewrites component tags and props', async () => {
    const source = [
      "const labelText = 'Launch'",
      'const view = jsx`',
      '  <section>',
      '    <FancyButton label={labelText}>Ready?</FancyButton>',
      '  </section>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)

    expect(transformed).toContain('<${FancyButton} label={${labelText}}>')
    expect(transformed).toContain('</${FancyButton}>')
  })

  it('handles spread attributes and children expressions', async () => {
    const source = [
      'const view = jsx`',
      '  <Widget {...props}>{slots}</Widget>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)

    expect(transformed).toContain('<${Widget} {...${props}}>')
    expect(transformed).toContain('>{${slots}}</${Widget}>')
  })

  it('supports custom tag names via options', async () => {
    const source = ['const template = htmlx`', '  <Fancy kind={variant} />', '`'].join(
      '\n',
    )

    const transformed = await runLoader(source, { tag: 'htmlx' })
    expect(transformed).toContain('<${Fancy} kind={${variant}} />')
  })

  it('allows template literal expressions without JSX braces', async () => {
    const source = [
      "const value = 'Hello'",
      'const view = jsx`',
      '  <button title="${value}">',
      '    Label: ${value}',
      '  </button>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)

    expect(transformed).toContain('title={${value}}')
    expect(transformed).toContain('Label: {${value}}')
  })

  it('honors manual JSX wrappers for tags, spreads, and braces', async () => {
    const source = [
      "const tag = 'section'",
      "const label = 'custom'",
      'const props = { role: "presentation" }',
      'const child = document.createElement("span")',
      'const view = jsx`',
      '  <${tag} data-label={${label}} {...${props}}>',
      '    {${child}}',
      '  </${tag}>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)

    expect(transformed).toMatch(
      /<\$\{tag\} data-label=\{\$\{label\}\} \{\.\.\.\$\{props\}\}>/,
    )
    expect(transformed).toContain('{${child}}')
    expect(transformed).toContain('</${tag}>')
  })

  it('surfaces parser errors with helpful metadata', async () => {
    await expect(runLoader('const = 5')).rejects.toThrow('[jsx-loader]')
  })

  it('returns source when no tagged templates are present', async () => {
    const source = ['const meaning = 42', 'const doubled = meaning * 2'].join('\n')
    const transformed = await runLoader(source)
    expect(transformed).toBe(source)
  })

  it('skips non-identifier tagged template calls', async () => {
    const source = [
      'const factory = { jsx }',
      "const title = 'hi'",
      'const view = factory.jsx`',
      '  <button>${title}</button>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toBe(source)
  })

  it('rewrites unquoted attribute expressions', async () => {
    const source = [
      "const mode = 'quiet'",
      'const view = jsx`',
      '  <button data-mode=${mode} />',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('data-mode={${mode}}')
  })

  it('collects spread children expressions', async () => {
    const source = [
      'const parts = [document.createTextNode("a")]',
      'const view = jsx`',
      '  <>',
      '    {...parts}',
      '  </>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('{...${parts}}')
  })

  it('sorts multiple tagged templates before mutating', async () => {
    const source = [
      "const title = 'ok'",
      "const label = 'ready'",
      'const first = jsx`<button title="${title}" />`',
      'const second = jsx`<span>${label}</span>`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('title={${title}}')
    expect(transformed).toContain('<span>{${label}}</span>')
  })

  it('throws when attribute strings are spaced away from expressions', async () => {
    const source = [
      "const label = 'oops'",
      'const view = jsx`',
      '  <button title=" ${label}">',
      '    Click me',
      '  </button>',
      '`',
    ].join('\n')

    await expect(runLoader(source)).rejects.toThrow('Expected attribute quote')
  })
})
