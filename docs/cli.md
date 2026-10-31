# CLI: init

The `init` command installs the WASM parser binding and its dependency graph for `@knighted/jsx` through the selected package manager. It does not replace the host project's direct runtime dependencies or change bundler configuration automatically.

## Quick start

```sh
npx @knighted/jsx init
```

What it does by default:

- Installs `@oxc-parser/binding-wasm32-wasip1` matching the library's bundled `oxc-parser` version, saving an exact binding dependency through the package manager.
- Lets the package manager resolve the binding's runtime dependencies rather than adding emnapi packages to the host's direct dependencies.
- For binding 0.156.0 under npm, records the scoped compatibility override described below. Conflicting existing binding overrides are rejected, not overwritten.
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
npx @knighted/jsx init --wasm-version 0.156.0

# Also prepare the transformer binding for browser TypeScript stripping
npx @knighted/jsx init --pm npm --wasm-package @oxc-transform/binding-wasm32-wasip1@0.156.0
```

## Notes

- The default binding install always matches the `oxc-parser` version bundled with `@knighted/jsx`; use `--wasm-version`, `--wasm-package`, or `WASM_BINDING_PACKAGE` when you intentionally need a different build.
- The current WASM binding has no CPU restriction and is installed normally; the CLI no longer deletes its directory or extracts a tarball without installing dependencies.
- The repository's `npm run setup:wasm` helper applies the same compatibility policies to both WASM bindings and uses npm installation without saving dependency changes or running install scripts. Missing root policies are saved first; existing matching policies and the lockfile are preserved.
- For the supported OXC bindings, use a canonical exact version. Ranges, tags, prefixed versions such as `=0.156.0`, and version strings with leading zeroes are rejected before installation.
- Run affected npm installs from the workspace root. Workspace-child installs are rejected before any files change because npm ignores child-package overrides. This conservative check also rejects nested projects beneath a workspace manifest.
- Loader configuration is opt-in and requires a prompt. No config files are modified unless you request help.
- If verification fails, rerun with `--verbose` to see the resolved binding path and error details.
- `@tybys/wasm-util` is not required for the standard flow. Consider it only as an advanced workaround if your environment blocks the normal WASM install/loading path.
- Bundlers may need a WASM-friendly setting to emit the parser asset: Vite handles `.wasm` out of the box; Webpack/Rspack typically need `experiments.asyncWebAssembly = true` or an asset rule so `parser.wasm32-wasip1.wasm` is copied into the build output. Ensure your bundler is configured to serve that file.

## OXC 0.156.0 runtime compatibility workaround

The published dependency requirements are inconsistent:

- Both `@oxc-parser/binding-wasm32-wasip1@0.156.0` and
  `@oxc-transform/binding-wasm32-wasip1@0.156.0` declare emnapi core/runtime
  `2.0.0-alpha.6` and `@napi-rs/wasm-runtime ~1.2.6`.
- WASM runtime 1.2.6 accepts emnapi 1.x or `2.0.0-beta.2` as peers, but not alpha.6.
- A normal install can share that runtime with a host's emnapi 1.x packages. The
  binding's alpha context then fails during initialization with
  `this.bridge.setLastError is not a function`.
- A nested npm install instead produces an invalid alpha peer graph; nesting alone
  is not a supported solution.

For each selected binding at this exact version, the CLI applies the following
npm-only workaround (the parser policy is shown; the transformer policy uses its
own package name as the outer key):

```json
{
  "overrides": {
    "@oxc-parser/binding-wasm32-wasip1@0.156.0": {
      "@napi-rs/wasm-runtime": {
        ".": "1.2.5",
        "@emnapi/core": "2.0.0-alpha.6",
        "@emnapi/runtime": "2.0.0-alpha.6"
      }
    }
  }
}
```

Runtime 1.2.5 accepts alpha.6. The scope retains the binding's declared emnapi versions
without changing the host's runtime dependencies. Pinning 1.2.5 intentionally overrides
the binding's published `~1.2.6` requirement: this is a locally tested compatibility
workaround, not an upstream-supported dependency declaration. Real WASM parsing and
dependency validation were verified both after installation and after `npm ci`.

Existing unrelated npm overrides are preserved, matching scoped overrides are reused,
and any competing selector for the same binding is conservatively rejected, including
ranges and unversioned keys. This intentionally avoids guessing whether selectors overlap
or merging host policies. A dry run
does not save any policy or install packages. For manual setup, add the scoped policy
above before running `npm install @oxc-parser/binding-wasm32-wasip1@0.156.0 --save-exact`.

Browser consumers of `@knighted/jsx/transform` should also run the transformer CLI
command above so its subtree policy is recorded in the consuming project. Package-level
overrides are not inherited by consumers. The package includes both exact WASM bindings;
the DOM-only runtime does not import or initialize the transformer until used.

### Package-manager follow-up

- **npm:** the version-scoped workaround is implemented and tested.
- **pnpm:** still needs an equivalent scoped override and isolated peer-graph validation.
- **Yarn:** still needs an equivalent resolution policy, verified for supported Classic
  and modern/PnP layouts.
- **Bun:** still needs verified subtree override support that does not globally replace
  the host's runtime dependencies.

For binding 0.156.0, the CLI rejects pnpm, Yarn, and Bun before installing or changing
the project. Other binding specs retain ordinary package-manager installation, without
this version-specific compatibility guarantee. Do not assume a global runtime override
is a safe substitute. Use npm deliberately or wait for the relevant manager support;
forcing `--pm npm` in another manager's project can introduce an npm lockfile.

Remove this workaround only after an upstream release aligns its binding/runtime peer
requirements and fresh-install, clean-reinstall, and host-coexistence tests pass. The
broader CDN drift solution remains separate from this CLI compatibility workaround.
