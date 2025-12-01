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

  it('throws when outer template expressions are used', async () => {
    const source = 'const view = jsx`<div>${count}</div>`'

    await expect(runLoader(source)).rejects.toThrow(/Template expressions inside jsx`/)
  })
})
