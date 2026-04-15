import { useEffect, useState, type ReactNode } from 'react'

function readInitialCollapsed(storageKey: string | undefined, defaultCollapsed: boolean) {
  if (typeof window === 'undefined' || !storageKey) return defaultCollapsed

  const stored = window.localStorage.getItem(storageKey)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return defaultCollapsed
}

export function CollapsibleSection({
  title,
  children,
  defaultCollapsed = false,
  storageKey,
  actions,
  className = 'result-box',
}: {
  title: string
  children: ReactNode
  defaultCollapsed?: boolean
  storageKey?: string
  actions?: ReactNode
  className?: string
}) {
  const [collapsed, setCollapsed] = useState(() => readInitialCollapsed(storageKey, defaultCollapsed))

  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return
    window.localStorage.setItem(storageKey, String(collapsed))
  }, [collapsed, storageKey])

  return (
    <section className={`${className} collapsible-section ${collapsed ? 'collapsible-section-collapsed' : ''}`}>
      <div className="collapsible-header">
        <button
          aria-expanded={!collapsed}
          className="collapsible-toggle"
          onClick={() => setCollapsed((current) => !current)}
          type="button"
        >
          <span className={`collapsible-chevron ${collapsed ? 'collapsed' : ''}`}>▾</span>
          <span>{title}</span>
        </button>
        {actions ? <div className="collapsible-actions">{actions}</div> : null}
      </div>
      {!collapsed ? <div className="collapsible-content">{children}</div> : null}
    </section>
  )
}
