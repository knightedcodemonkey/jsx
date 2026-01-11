/*
 * This file is a type-only test suite: declarations are intentionally "unused"
 * so TypeScript will fail the build if the reactJsx typings drift. Linting is
 * secondary here, so we disable unused-var checks.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type * as React from 'react'
import type {
  ReactJsxComponent,
  ReactJsxDomAttributes,
  ReactJsxEventHandler,
  ReactJsxIntrinsicElement,
  ReactJsxIntrinsicElements,
  ReactJsxRef,
  ReactJsxRenderable,
} from '../src/react/index.js'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Expect<T extends true> = T

type IntrinsicElementsEqual = Expect<
  Equal<ReactJsxIntrinsicElements, React.JSX.IntrinsicElements>
>

type ButtonProps = ReactJsxIntrinsicElement<'button'>
type ButtonClick = Parameters<NonNullable<ButtonProps['onClick']>>[0]
type ButtonClickIsReactMouse = Expect<
  Equal<ButtonClick, React.MouseEvent<HTMLButtonElement>>
>

type ButtonRefIsReactRef = Expect<
  Equal<ButtonProps['ref'], ReactJsxRef<HTMLButtonElement> | undefined>
>

type DomAttributesMatch = Expect<
  Equal<ReactJsxDomAttributes<HTMLDivElement>, React.DOMAttributes<HTMLDivElement>>
>

type EventHandlerType = ReactJsxEventHandler<React.SyntheticEvent<HTMLDivElement>>
const _eventHandler: EventHandlerType | undefined = undefined

// @ts-expect-error href is not allowed on button
const invalidButton: ButtonProps = { href: '#' }

type DemoProps = { label: string }
type DemoComponent = ReactJsxComponent<DemoProps>
type DemoComponentProps = React.ComponentProps<DemoComponent>
type DemoPropsArePropsWithChildren = Expect<
  Equal<DemoComponentProps, React.PropsWithChildren<DemoProps>>
>

type RenderableAllowsNull = Expect<null extends ReactJsxRenderable ? true : false>
