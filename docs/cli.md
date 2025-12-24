# CLI: init

The `init` command installs the WASM parser binding and helper runtimes for `@knighted/jsx`. It defaults to a safe path that only installs and verifies the binding—it will not change your bundler config unless you explicitly opt in.

## Quick start

```sh
npx @knighted/jsx init
```

What it does by default:

- Installs `@oxc-parser/binding-wasm32-wasi` that matches the library's bundled `oxc-parser` version plus runtime helpers (`@napi-rs/wasm-runtime`, `@emnapi/runtime`, `@emnapi/core`).
- Records the binding in `optionalDependencies` so the version is visible in your project.
- Verifies the binding can be imported and reports the resolved path.
- Skips loader config changes (prompted only when you opt in).

## Options

- `--package-manager`, `--pm <npm|pnpm|yarn|bun>`: override detection.
- `--wasm-package <spec>`: install a different binding spec (or set `WASM_BINDING_PACKAGE`).
- `--wasm-version <semver>`: override the default bundled version when using the standard binding package.
- `--config`: prompt for loader help (no automatic edits yet; shows guidance only).
- `--skip-config`: skip loader help (default).
- `--dry-run`: print what would happen without executing.
- `--force`, `--yes`: assume "yes" for prompts.
- `--verbose`: show additional detail (commands, resolve paths).

Examples:

```sh
# Default install + verification
npx @knighted/jsx init

# Dry run with verbose logging
npx @knighted/jsx init --dry-run --verbose

# Force npm even if a different lockfile is present
npx @knighted/jsx init --pm npm

# Prompt for loader guidance after install
npx @knighted/jsx init --config

# Install a specific binding version
npx @knighted/jsx init --wasm-version 0.100.0

# Use a custom binding spec entirely
WASM_BINDING_PACKAGE=@oxc-parser/binding-wasm32-wasi@beta npx @knighted/jsx init
```

## Notes

- The default binding install always matches the `oxc-parser` version bundled with `@knighted/jsx`; use `--wasm-version`, `--wasm-package`, or `WASM_BINDING_PACKAGE` when you intentionally need a different build.
- The command uses `npm pack` internally to pull the WASM binding even when it is marked for `cpu: ["wasm32"]`.
- Loader configuration is opt-in and requires a prompt. No config files are modified unless you request help.
- If verification fails, rerun with `--verbose` to see the resolved binding path and error details.
- `@tybys/wasm-util` is not required for the standard flow. Consider it only as an advanced workaround if your environment blocks the normal WASM install/loading path.
- Bundlers may need a WASM-friendly setting to emit the parser asset: Vite handles `.wasm` out of the box; Webpack/Rspack typically need `experiments.asyncWebAssembly = true` or an asset rule so `parser.wasm32-wasi.wasm` is copied into the build output. Ensure your bundler is configured to serve that file.
