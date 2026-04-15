import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function AppShell() {
  const { locale, setLocale, t } = useI18n()
  const navItems = [
    { to: '/', label: t('nav.overview') },
    { to: '/databases', label: t('nav.databases') },
    { to: '/blast/new', label: t('nav.blast') },
    { to: '/jobs', label: t('nav.jobs') },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">{t('app.brandKicker')}</p>
          <h1>{t('app.brandTitle')}</h1>
          <p className="brand-copy">{t('app.brandCopy')}</p>
        </div>

        <div className="language-switch" role="group" aria-label="language switch">
          <button
            className={locale === 'zh-CN' ? 'language-button active' : 'language-button'}
            onClick={() => setLocale('zh-CN')}
            type="button"
          >
            {t('locale.zh-CN')}
          </button>
          <button
            className={locale === 'en' ? 'language-button active' : 'language-button'}
            onClick={() => setLocale('en')}
            type="button"
          >
            {t('locale.en')}
          </button>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              end={item.to === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <div className="content-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
