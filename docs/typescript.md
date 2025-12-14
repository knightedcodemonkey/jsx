# TypeScript guide

The `@knighted/jsx` compiler plugin and runtime typings let you keep DOM and React tagged templates type-safe without a separate build step. This guide shows the recommended `tsconfig` layouts for projects that:

- Author DOM helpers with the `jsx` tagged template.
- Compose React elements through `reactJsx`.
- Mix the helpers with traditional React components that use the normal JSX transform.

> [!NOTE]
> At runtime you still render through the tagged template functions (`jsx`, `reactJsx`, or their Node variants). The `@knighted/jsx/jsx-runtime` entry only exists so TypeScript can validate `.tsx` helpers when you set `jsxImportSource`.

## Quick start (single config)

Use one `tsconfig.json` when the whole project can share the same JSX compiler options:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@knighted/jsx",
    "plugins": [
      {
        "name": "@knighted/jsx-ts-plugin",
        "tagModes": {
          "jsx": "dom",
          "reactJsx": "react",
        },
      },
    ],
  },
  "include": ["src"],
}
```

- `jsxImportSource` points TypeScript at the packaged runtime typings so `.tsx` helpers get DOM-friendly diagnostics.
- The language-service plugin enforces DOM vs React rules for tagged templates in `.ts` files. Add extra keys in `tagModes` if you alias `jsx`/`reactJsx` to different identifiers.
- React components still compile and run through React’s own runtime; the setting only affects type checking.

## Mixed React build + DOM helper configs

Larger repos sometimes prefer separate project references. The pattern below keeps React’s default JSX runtime for your main app while opt-ing `.tsx` helper folders into the `@knighted/jsx` diagnostics.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
  },
}
```

```jsonc
// tsconfig.react.json (default React transform)
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/dom-helpers/**"],
}
```

```jsonc
// tsconfig.jsx-helpers.json (DOM + React tagged templates)
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@knighted/jsx",
    "plugins": [
      {
        "name": "@knighted/jsx-ts-plugin",
        "tagModes": {
          "jsx": "dom",
          "reactJsx": "react",
        },
      },
    ],
  },
  "include": ["src/dom-helpers/**/*.ts", "src/dom-helpers/**/*.tsx"],
}
```

Run `tsc --build tsconfig.react.json tsconfig.jsx-helpers.json` (or wire both configs into your scripts). Only the helper config needs the plugin; the React build keeps its default runtime semantics.

## Tips

- Keep `jsxImportSource` scoped to the configs that actually need DOM diagnostics. Standard React components do not require it.
- `reactJsx` tagged templates already return `ReactElement`s, so you can mix them into React trees even when the file compiles under the helper config.
- When you rename the template tag identifiers, update `tagModes` so the plugin continues to associate each tag with the correct mode.
- Pair editor diagnostics with `tsc --noEmit` (using the same config) to ensure CI surfaces the same errors.
