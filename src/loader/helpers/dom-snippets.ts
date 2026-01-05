export type DomHelperKind = 'dom'

export const DOM_HELPER_SNIPPETS: Record<DomHelperKind, string> = {
  dom: `const __jsxDomAppend = (parent, child) => {
  if (child === null || child === undefined || typeof child === 'boolean') return
  if (Array.isArray(child)) { child.forEach(entry => __jsxDomAppend(parent, entry)); return }
  if (typeof child === 'object' && typeof child[Symbol.iterator] === 'function') {
    for (const entry of child) __jsxDomAppend(parent, entry); return
  }
  if (child instanceof Node) { parent.appendChild(child); return }
  parent.appendChild(document.createTextNode(String(child)))
}

const __jsxDomClass = (el, value) => {
  if (value === null || value === undefined || value === false) return
  if (typeof value === 'string' || typeof value === 'number') { el.classList.add(...String(value).trim().split(/\\s+/u).filter(Boolean)); return }
  if (Array.isArray(value)) { value.forEach(entry => __jsxDomClass(el, entry)); return }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, active]) => {
      if (active) el.classList.add(key)
      else el.classList.remove(key)
    })
  }
}

const __jsxDomStyle = (el, value) => {
  if (value === null || value === undefined || value === false) return
  const style = el.style
  if (!style) return
  if (typeof value === 'string') { style.cssText += value; return }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, v]) => {
      if (v === null || v === undefined) return
      if (key.startsWith('--')) { style.setProperty(key, String(v)); return }
      style[key] = v
    })
  }
}

const __jsxDomResolveHandler = (propName, value) => {
  if (typeof value === 'function' || (value && typeof value === 'object' && typeof value.handleEvent === 'function')) {
    return { listener: value }
  }
  if (!value || typeof value !== 'object' || !('handler' in value)) {
    return null
  }
  const handler = value.handler
  if (typeof handler !== 'function' && !(handler && typeof handler === 'object' && typeof handler.handleEvent === 'function')) {
    return null
  }
  const options = value.options ? { ...value.options } : undefined
  const assign = (key, v) => {
    if (v === undefined || v === null) return
    if (!options) options = {}
    options[key] = v
  }
  assign('capture', value.capture)
  assign('once', value.once)
  assign('passive', value.passive)
  assign('signal', value.signal ?? undefined)
  return { listener: handler, options }
}

const __jsxDomParseEventName = raw => {
  if (!raw.startsWith('on')) return null
  if (raw.startsWith('on:')) {
    const name = raw.slice(3)
    if (!name) return null
    const capture = name.endsWith('Capture')
    const eventName = capture ? name.slice(0, -7) : name
    if (!eventName) return null
    return { eventName, capture }
  }
  const name = raw.slice(2)
  if (!name) return null
  const capture = name.endsWith('Capture')
  const eventName = (capture ? name.slice(0, -7) : name).toLowerCase()
  if (!eventName) return null
  return { eventName, capture }
}

const __jsxDomEvent = (el, propName, value) => {
  const parsed = __jsxDomParseEventName(propName)
  if (!parsed) return false
  const resolved = __jsxDomResolveHandler(propName, value)
  if (!resolved) return true
  let options = resolved.options ? { ...resolved.options } : undefined
  if (parsed.capture) {
    if (!options) options = { capture: true }
    else options.capture = true
  }
  el.addEventListener(parsed.eventName, resolved.listener, options)
  return true
}

const __jsxDomNamespaceForAttr = (raw, namespace) => {
  if (!raw.includes(':')) return null
  const prefix = raw.split(':', 1)[0]
  if (prefix === 'xml') return 'http://www.w3.org/XML/1998/namespace'
  if (prefix === 'xlink') return 'http://www.w3.org/1999/xlink'
  if (namespace === 'svg') return 'http://www.w3.org/2000/svg'
  if (namespace === 'math') return 'http://www.w3.org/1998/Math/MathML'
  return null
}

const __jsxDomSetProp = (el, name, value, namespace) => {
  if (value === null || value === undefined) return
  if (name === 'dangerouslySetInnerHTML' && value && typeof value === 'object' && '__html' in value) {
    el.innerHTML = String(value.__html ?? '')
    return
  }
  const ns = __jsxDomNamespaceForAttr(name, namespace)
  if (name === 'ref') {
    if (typeof value === 'function') { value(el); return }
    if (value && typeof value === 'object') { value.current = el; return }
  }
  if (name === 'class' || name === 'className') { __jsxDomClass(el, value); return }
  if (name === 'style') { __jsxDomStyle(el, value); return }
  if (__jsxDomEvent(el, name, value)) return
  if (typeof value === 'boolean') {
    if (value) {
      if (ns) el.setAttributeNS(ns, name, '')
      else el.setAttribute(name, '')
    } else {
      if (ns) el.removeAttributeNS(ns, name)
      else el.removeAttribute(name)
    }
    if (name in el) { try { el[name] = value } catch {}
    }
    return
  }
  if (name.startsWith('data-')) { el.setAttribute(name, value as any); return }
  if (name in el && name !== 'list') {
    try { (el as any)[name] = value } catch {}
    return
  }
  if (ns) el.setAttributeNS(ns, name, value as any)
  else el.setAttribute(name, value as any)
}

const __jsxDomAssignProps = (el, props, namespace) => {
  if (!props) return
  Object.entries(props).forEach(([name, value]) => {
    __jsxDomSetProp(el, name, value, namespace)
  })
}
`,
}
