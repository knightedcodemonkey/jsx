import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Children, type ReactElement, type ReactNode } from 'react'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { removeGlobals, restoreGlobals, snapshotGlobals } from './helpers/node-globals.js'

const execFileAsync = promisify(execFile)
const projectRoot = process.cwd()
const tsupCli = join(projectRoot, 'node_modules', 'tsup', 'dist', 'cli-default.js')

const importLiteModule = (...segments: string[]) =>
  import(pathToFileURL(join(projectRoot, ...segments)).href)

type DomLiteModule = { jsx: typeof import('../src/jsx.js').jsx }
type ReactLiteModule = { reactJsx: typeof import('../src/react/index.js').reactJsx }
type NodeLiteModule = { jsx: typeof import('../src/node/index.js').jsx }
type NodeReactLiteModule = {
  reactJsx: typeof import('../src/node/react/index.js').reactJsx
}

let liteBuildPromise: Promise<void> | null = null

const ensureLiteBundles = () => {
  if (!liteBuildPromise) {
    liteBuildPromise = execFileAsync('node', [tsupCli, '--config', 'tsup.config.ts'], {
      cwd: projectRoot,
      env: { ...process.env, TSUP_SILENT: 'true' },
    }).then(() => undefined)
  }
  return liteBuildPromise
}

beforeAll(async () => {
  await ensureLiteBundles()
})

describe('lite DOM entry', () => {
  it('renders DOM nodes with basic props', async () => {
    const { jsx } = (await importLiteModule('dist', 'lite', 'index.js')) as DomLiteModule
    const element = jsx`
      <section data-kind={${'lite-dom'}}>
        Lite DOM Entry
      </section>
    ` as HTMLElement

    expect(element.tagName).toBe('SECTION')
    expect(element.dataset.kind).toBe('lite-dom')
    expect(element.textContent?.trim()).toBe('Lite DOM Entry')
  })
})

describe('lite React entry', () => {
  it('creates React elements using the lite bundle', async () => {
    const { reactJsx } = (await importLiteModule(
      'dist',
      'lite',
      'react',
      'index.js',
    )) as ReactLiteModule

    const Badge = ({ label }: { label: string }) =>
      reactJsx`
        <span className="lite-badge">{${label}}</span>
      `

    const tree = reactJsx`
      <article data-lite="react">
        Status: <${Badge} label={${'ready'}} />
      </article>
    `

    expect(tree.type).toBe('article')
    const props = tree.props as Record<string, unknown> & {
      children?: ReactNode | ReactNode[]
    }
    expect(props['data-lite']).toBe('react')

    const children = Children.toArray(props.children ?? [])
    expect(children).toHaveLength(2)

    const badge = children[1] as ReactElement
    expect(badge.type).toBe(Badge)
    expect((badge.props as { label?: string }).label).toBe('ready')
  })
})

describe('lite node entry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('re-exports jsx when a DOM already exists', async () => {
    const { jsx } = (await importLiteModule(
      'dist',
      'lite',
      'node',
      'index.js',
    )) as NodeLiteModule
    const element = jsx`<div data-kind="lite-node" />` as HTMLDivElement

    expect(element.getAttribute('data-kind')).toBe('lite-node')
  })

  it('bootstraps a DOM shim when globals are missing', async () => {
    const snapshot = snapshotGlobals()
    removeGlobals()
    vi.resetModules()

    try {
      const { jsx } = (await importLiteModule(
        'dist',
        'lite',
        'node',
        'index.js',
      )) as NodeLiteModule
      const button = jsx`<button>shimmed lite dom</button>` as HTMLButtonElement

      expect(button.tagName).toBe('BUTTON')
      expect(globalThis.document).toBeDefined()
      expect(globalThis.window).toBeDefined()
    } finally {
      restoreGlobals(snapshot)
      vi.resetModules()
    }
  })
})

describe('lite node + react entry', () => {
  it('exports reactJsx for server contexts', async () => {
    const { reactJsx } = (await importLiteModule(
      'dist',
      'lite',
      'node',
      'react',
      'index.js',
    )) as NodeReactLiteModule
    const tree = reactJsx`
      <div data-kind="lite-node-react">
        <span>ready</span>
      </div>
    `

    const props = tree.props as Record<string, unknown> & {
      children?: ReactNode | ReactNode[]
    }
    expect(props['data-kind']).toBe('lite-node-react')
    const rendered = Children.toArray(props.children ?? [])
    expect(rendered).toHaveLength(1)
    expect((rendered[0] as ReactElement).type).toBe('span')
  })
})
