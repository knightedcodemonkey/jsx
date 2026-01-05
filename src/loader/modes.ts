export type LoaderMode = 'runtime' | 'react' | 'dom'

export const DEFAULT_MODE: LoaderMode = 'runtime'

export const parseLoaderMode = (value: unknown): LoaderMode | null => {
  if (typeof value !== 'string') return null
  switch (value) {
    case 'runtime':
    case 'react':
    case 'dom':
      return value
    default:
      return null
  }
}
