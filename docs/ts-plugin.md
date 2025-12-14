# TypeScript Plugin Support

Use the [`@knighted/jsx-ts-plugin`](https://github.com/knightedcodemonkey/jsx-ts-plugin) to teach the TypeScript language server how to understand `@knighted/jsx` tagged templates. The current feature set focuses on inline diagnostics inside `jsx`/`reactJsx` templates, with more editor tooling planned in the future.

## Installation

```sh
npm install --save-dev @knighted/jsx-ts-plugin
```

## Configuration

Enable the plugin inside the `plugins` section of your `tsconfig.json` (or `jsconfig.json`).

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@knighted/jsx-ts-plugin"
      }
    ]
  }
}
```

Restart your editor/TS server after saving the config. The plugin repository documents every option and includes advanced examples—see [knightedcodemonkey/jsx-ts-plugin](https://github.com/knightedcodemonkey/jsx-ts-plugin) for details.
