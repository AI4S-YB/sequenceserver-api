import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: '总览' },
  { to: '/databases', label: '数据库管理' },
  { to: '/blast/new', label: 'BLAST 提交' },
  { to: '/jobs', label: '任务中心' },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">SequenceServer API Frontend</p>
          <h1>前后端分离控制台</h1>
          <p className="brand-copy">基于 `/api/v1/*` 接口的新前端骨架。</p>
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
        <Outlet />
      </main>
    </div>
  )
}
