declare module 'linkedom' {
  export type ParseResult = {
    window: Window & typeof globalThis
    document: Document
    [key: string]: unknown
  }

  export function parseHTML(html: string): ParseResult
}
