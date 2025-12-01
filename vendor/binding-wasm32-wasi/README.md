# `@oxc-parser/binding-wasm32-wasi`

This is the **wasm32-wasip1-threads** binary for `@oxc-parser/binding`.

## Why is it vendored?

Vite (and most local bundlers) need the WebAssembly module on disk to bundle browser builds of `@knighted/jsx`. The official npm package sets `"cpu": ["wasm32"]`, which means `npm install` skips the binary unless you explicitly override platform checks. Rather than require contributors to run `npm_config_ignore_platform=true npm install …` just to work on the demo, we vend this prebuilt `.wasm` file and alias `@oxc-parser/binding-wasm32-wasi` to it inside `vite.config.ts`.

You'll also see the binding packages declared under `optionalDependencies` in `package.json`. That ensures npm will try to install the platform-specific bindings (darwin, linux, wasm) when possible but won't fail installs on unsupported systems. Browser users still need the WASM binding; marking it optional simply keeps cross-platform installs flexible.

## When can it be removed?

- If npm ever allows optional installation of wasm-only packages without environment hacks.
- If the project stops shipping the Vite demo (or moves to a CDN that already bundles the wasm binding).
- If `@oxc-parser/binding-wasm32-wasi` changes its install constraints so the binary is always available via regular `npm install`.

Until then, keeping the vendored copy ensures `npm run dev` / `npm run build:demo` work out of the box on macOS/Linux without extra setup.
