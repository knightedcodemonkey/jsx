import { describe, it, expect } from 'vitest'

import loader from '../src/loader/jsx'

const runLoader = (source: string, options?: Record<string, unknown>) =>
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

  it('limits transformations to the configured tag list when provided', async () => {
    const source = [
      "const label = 'only react'",
      'const view = jsx`<Widget>${label}</Widget>`',
      'const reactView = reactJsx`<ReactWidget>${label}</ReactWidget>`',
    ].join('\n')

    const transformed = await runLoader(source, { tags: ['reactJsx'] })

    expect(transformed).toContain('<${ReactWidget}>{${label}}</${ReactWidget}>')
    expect(transformed).toContain('const view = jsx`<Widget>${label}</Widget>`')
  })

  it('rewrites reactJsx templates without additional configuration', async () => {
    const source = [
      "const label = 'demo'",
      'const view = reactJsx`',
      '  <ReactBadge>{${label}}</ReactBadge>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('<${ReactBadge}>')
    expect(transformed).toContain('>{${label}}')
    expect(transformed).toContain('</${ReactBadge}>')
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

  it('compiles tagged templates to React helpers when mode is react', async () => {
    const source = [
      "const title = 'Launch'",
      'const view = jsx`',
      '  <button className="cta">{title}</button>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })

    expect(transformed).toContain('__jsxReact("button", { "className": "cta" }, title)')
    expect(transformed).toContain(
      'const __jsxReactMergeProps = (...sources) => Object.assign({}, ...sources)',
    )
  })

  it('honors per-tag react overrides via tagModes', async () => {
    const source = [
      "const label = 'Ready'",
      'const runtimeView = jsx`<span>${label}</span>`',
      'const reactView = reactJsx`<button>${label}</button>`',
    ].join('\n')

    const transformed = await runLoader(source, {
      tagModes: {
        reactJsx: 'react',
      },
    })

    expect(transformed).toContain('const runtimeView = jsx`<span>{${label}}</span>`')
    expect(transformed).toContain('const reactView = __jsxReact("button", null, label)')
    expect(transformed.match(/const __jsxReactMergeProps/g)?.length).toBe(1)
  })

  it('interpolates JSX member expression component names', async () => {
    const source = [
      'const view = jsx`',
      '  <ui.Card.Section title="Launch">',
      '    Ready',
      '  </ui.Card.Section>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('<${ui.Card.Section} title="Launch">')
    expect(transformed).toContain('</${ui.Card.Section}>')
  })

  it('keeps namespaced tag names literal', async () => {
    const source = ['const view = jsx`<svg:foreignObject role="note" />`'].join('\n')
    const transformed = await runLoader(source)
    expect(transformed).toContain('<svg:foreignObject role="note" />')
  })

  it('ignores JSX empty expression containers', async () => {
    const source = [
      'const view = jsx`',
      '  <div>',
      '    {/* comment only */}',
      '  </div>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('{/* comment only */}')
  })

  it('respects manually interpolated spread children', async () => {
    const source = [
      'const children = []',
      'const view = jsx`',
      '  <>',
      '    {...${children}}',
      '  </>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source)
    expect(transformed).toContain('{...${children}}')
  })

  it('throws when a JSX template cannot be parsed', async () => {
    const source = ['const view = jsx`', '  <div>', '`'].join('\n')

    await expect(runLoader(source)).rejects.toThrow('[jsx-loader]')
  })

  it('throws when a react template cannot be parsed', async () => {
    const source = ['const view = reactJsx`', '  <section>', '`'].join('\n')

    await expect(runLoader(source, { mode: 'react' })).rejects.toThrow('[jsx-loader]')
  })

  it('requires a JSX root when compiling react templates', async () => {
    const source = ['const view = reactJsx`', '  ', '`'].join('\n')

    await expect(runLoader(source, { mode: 'react' })).rejects.toThrow(
      'single JSX root node',
    )
  })

  it('normalizes multiline text nodes in react mode', async () => {
    const source = [
      'const view = reactJsx`',
      '  <p>',
      '    Hello',
      '      world',
      '  </p>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("p", null, "Hello world")')
  })

  it('falls back to runtime mode when options.mode is invalid', async () => {
    const source = [
      "const label = 'text'",
      'const view = jsx`<span>${label}</span>`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'invalid' })
    expect(transformed).toContain('const view = jsx`<span>{${label}}</span>`')
  })

  it('emits component identifiers when compiling to react mode', async () => {
    const source = ['const view = jsx`', '  <Banner />', '`'].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact(Banner, null)')
  })

  it('supports member expression components in react mode', async () => {
    const source = ['const view = jsx`', '  <ui.Card.Section />', '`'].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("ui".Card.Section, null)')
  })

  it('stringifies namespaced tags in react mode', async () => {
    const source = ['const view = jsx`', '  <svg:foreignObject />', '`'].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("svg:foreignObject", null)')
  })

  it('throws when react mode encounters complex expressions', async () => {
    const source = [
      'const view = jsx`',
      '  <div>{items.map(item => <span>{item}</span>)}</div>',
      '`',
    ].join('\n')

    await expect(runLoader(source, { mode: 'react' })).rejects.toThrow(
      'Unable to inline complex expressions in react mode.',
    )
  })

  it('compiles interpolated tag expressions in react mode', async () => {
    const source = ['const tag = Button', 'const view = jsx`', '  <${tag} />', '`'].join(
      '\n',
    )

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact(tag, null)')
  })

  it('supports inline JSX expressions inside react children', async () => {
    const source = [
      'const view = jsx`',
      '  <section>{<span>Label</span>}</section>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("span", null, "Label")')
  })

  it('compiles literal expression containers in react mode', async () => {
    const source = ['const view = jsx`', '  <section>{"literal"}</section>', '`'].join(
      '\n',
    )

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("section", null, "literal")')
  })

  it('splits inline text interpolations when compiling react templates', async () => {
    const source = [
      "const greeting = 'Hello'",
      "const subject = 'team'",
      'const view = jsx`',
      '  <p>${greeting}, ${subject}!</p>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("p", null, greeting, ", ", subject, "!")')
  })

  it('omits JSX comments when compiling react templates', async () => {
    const source = [
      'const view = jsx`',
      '  <section>',
      '    {/* comment only */}',
      '    Ready',
      '  </section>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("section", null, "Ready")')
    expect(transformed).not.toContain('comment only')
  })

  it('expands spread children in react mode', async () => {
    const source = [
      'const items = []',
      'const view = jsx`',
      '  <>',
      '    {...items}',
      '  </>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact(React.Fragment, null, items)')
  })

  it('treats literal placeholder markers inside JSX text as expressions when registered', async () => {
    const source = [
      "const label = 'Hi'",
      'const view = jsx`',
      '  <p>${label}__JSX_LOADER_TEMPLATE_EXPR_0__</p>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    const match = transformed.match(/__jsxReact\("p", null,([\s\S]+?)\)/)
    expect(match?.[1]).toMatch(/label[\s\S]*label/)
    expect(transformed).not.toContain('__JSX_LOADER_TEMPLATE_EXPR_0__')
  })

  it('keeps literal placeholder markers when no expression is registered for them', async () => {
    const source = [
      'const view = jsx`',
      '  <p>Value: __JSX_LOADER_TEMPLATE_EXPR_123__</p>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('"Value: "')
    expect(transformed).toContain('"__JSX_LOADER_TEMPLATE_EXPR_123__"')
  })

  it('throws when a literal tag placeholder lacks a registered expression', async () => {
    const source = ['const view = jsx`', '  <__JSX_LOADER_TAG_EXPR_0__ />', '`'].join(
      '\n',
    )

    await expect(runLoader(source, { mode: 'react' })).rejects.toThrow(
      'Unable to resolve placeholder for tag expression.',
    )
  })

  it('surfaces parser label details for mismatched JSX tags', async () => {
    const source = ['const view = jsx`', '  <div></span>', '`'].join('\n')

    await expect(runLoader(source)).rejects.toThrow('Expected `</div>`')
  })

  it('merges static props and spreads in react mode', async () => {
    const source = [
      'const propsA = { role: "presentation" }',
      'const propsB = { tabIndex: 0 }',
      'const view = jsx`',
      '  <button type="button" {...propsA} data-ready="yes" {...propsB}>',
      '    Demo',
      '  </button>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain(
      '__jsxReactMergeProps({ "type": "button" }, propsA, { "data-ready": "yes" }, propsB)',
    )
  })

  it('stringifies namespaced attributes when compiling to react', async () => {
    const source = [
      'const view = jsx`',
      '  <svg:foreignObject xml:lang="fr" />',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact("svg:foreignObject", { "xml:lang": "fr" })')
  })

  it('compiles fragments in react mode', async () => {
    const source = [
      'const view = jsx`',
      '  <>',
      '    <span>Hello</span>',
      '  </>',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('__jsxReact(React.Fragment, null')
    expect(transformed).toContain('__jsxReact("span", null, "Hello")')
  })

  it('treats boolean attributes as true in react mode', async () => {
    const source = ['const view = jsx`', '  <button disabled />', '`'].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('{ "disabled": true }')
  })

  it('evaluates attribute expression containers in react mode', async () => {
    const source = [
      "const label = 'Launch'",
      'const view = jsx`',
      '  <button data-label={${label}} />',
      '`',
    ].join('\n')

    const transformed = await runLoader(source, { mode: 'react' })
    expect(transformed).toContain('{ "data-label": label }')
  })

  it('ignores invalid tagModes overrides', async () => {
    const source = [
      "const label = 'demo'",
      'const view = jsx`<button>${label}</button>`',
    ].join('\n')

    const transformed = await runLoader(source, {
      tags: ['jsx'],
      tagModes: {
        jsx: 'invalid',
      } as Record<string, string>,
    })

    expect(transformed).toContain('<button>{${label}}</button>')
  })
})
