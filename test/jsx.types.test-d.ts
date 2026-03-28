/*
 * This file is a type-only test suite: declarations are intentionally "unused"
 * so TypeScript will fail the build if the jsx typings drift. Linting is
 * secondary here, so we disable unused-var checks.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { JsxChildren, JsxComponent, JsxRenderable } from '../src/index.js'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Expect<T extends true> = T

type ChildrenAliasMatchesRenderableUnion = Expect<
  Equal<JsxChildren, JsxRenderable | JsxRenderable[]>
>

type DemoProps = { label: string }
type DemoComponent = JsxComponent<DemoProps>
type DemoComponentProps = Parameters<DemoComponent>[0]
type ComponentChildrenUsesAlias = Expect<
  Equal<DemoComponentProps['children'], JsxChildren | undefined>
>
