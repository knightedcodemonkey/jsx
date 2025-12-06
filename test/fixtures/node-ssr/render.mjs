/* eslint-env node */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { renderToString } from 'react-dom/server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../..')
const runtimeEntry = path.join(rootDir, 'dist/node/index.js')
const reactRuntimeEntry = path.join(rootDir, 'dist/node/react/index.js')

const ensureArtifacts = async () => {
  try {
    await fs.access(runtimeEntry)
    await fs.access(reactRuntimeEntry)
  } catch (error) {
    console.error('[node-ssr-fixture] Missing dist artifacts. Run "npm run build" first.')
    throw error
  }
}

const run = async () => {
  await ensureArtifacts()

  const [{ jsx }, { reactJsx }] = await Promise.all([
    import(pathToFileURL(runtimeEntry).href),
    import(pathToFileURL(reactRuntimeEntry).href),
  ])

  const ReactBadge = ({ label }) =>
    reactJsx`
        <button className="react-badge" type="button">
          React badge: {${label}}
        </button>
      `

  const reactTree = reactJsx`
      <section>
        <h2>SSR React tree</h2>
        <${ReactBadge} label={${'Server-side only'}} />
      </section>
    `

  const reactMarkup = renderToString(reactTree)

  const domShell = jsx`
      <article className="ssr-demo">
        <header>
          <h1>Hybrid SSR demo</h1>
          <p>Rendered with jsx + ReactDOMServer.renderToString</p>
        </header>
        <section className="react-fragment" dangerouslySetInnerHTML={${{ __html: reactMarkup }}}></section>
        <footer>
          <small>{${new Date().toISOString()}}</small>
        </footer>
      </article>
    `

  const markup = domShell.outerHTML
  console.log('[node-ssr-fixture] Markup ready:')
  console.log(markup)
}

run().catch(error => {
  console.error('[node-ssr-fixture] Failed to render SSR demo')
  console.error(error)
  process.exitCode = 1
})
