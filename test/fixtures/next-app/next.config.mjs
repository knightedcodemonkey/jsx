import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const distDir = path.join(repoRoot, 'dist')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@knighted/jsx': path.join(distDir, 'index.js'),
      '@knighted/jsx/react': path.join(distDir, 'react/index.js'),
      '@knighted/jsx/node': path.join(distDir, 'node/index.js'),
      '@knighted/jsx/node/react': path.join(distDir, 'node/react/index.js'),
      '@oxc-parser/binding-wasm32-wasi': path.join(
        repoRoot,
        'test/fixtures/rspack-app/stubs/oxc-wasm.js',
      ),
    }

    config.module.rules.push({
      test: /\.[jt]sx?$/,
      include: path.join(__dirname, 'pages'),
      enforce: 'post',
      use: [
        {
          loader: path.join(distDir, 'loader/jsx.js'),
        },
      ],
    })

    return config
  },
}

export default nextConfig
