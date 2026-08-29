import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRolePermissions } from '../hooks/useRolePermissions'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: 'D' },
  {
    to: '/masters',
    label: 'Masters',
    icon: 'M',
    children: [
      { to: '/masters/employees', label: 'Employees' },
    ],
  },
  {
    to: '/hr',
    label: 'HR',
    icon: 'H',
    children: [
      { to: '/hr/salary-breakups', label: 'Salary Breakups' },
      { to: '/hr/days-and-interests', label: 'Governmental Salary' },
      { to: '/hr/employee-attendance', label: 'Employee Attendance' },
      { to: '/hr/advances', label: 'Advances' },
    ],
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: 'R',
    children: [
      { to: '/reports/direct-salary-calculation', label: 'Direct Salary Calculation' },
    ],
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'S',
    children: [
      { to: '/settings/reset-password', label: 'Reset your password' },
      { to: '/settings/users', label: 'Users' },
    ],
  },
]

function Layout() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isReadOnlyRole, canManageUsers } = useRolePermissions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mastersOpen, setMastersOpen] = useState(location.pathname.startsWith('/masters'))
  const [hrOpen, setHrOpen] = useState(location.pathname.startsWith('/hr'))
  const [reportsOpen, setReportsOpen] = useState(location.pathname.startsWith('/reports'))
  const [settingsOpen, setSettingsOpen] = useState(location.pathname.startsWith('/settings'))

  const currentTitle = navItems.find((item) => location.pathname.startsWith(item.to))?.label || 'Dashboard'

  const handleNavClick = () => setMenuOpen(false)

  return (
    <div className={`app-shell ${isReadOnlyRole ? 'role-readonly' : ''}`}>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark">KE</div>
          <div>
            <p className="brand-name">KumarExports</p>
            <p className="brand-subtitle">Global Trade Hub</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Sidebar navigation">
          {navItems.map((item) => (
            <div key={item.to}>
              {item.children ? (
                <>
                  <button
                    type="button"
                    className={`nav-link nav-toggle ${location.pathname.startsWith(item.to) ? 'active' : ''}`}
                    onClick={() => {
                      if (item.to.startsWith('/masters')) {
                        setMastersOpen((prev) => !prev)
                      } else if (item.to.startsWith('/hr')) {
                        setHrOpen((prev) => !prev)
                      } else if (item.to.startsWith('/reports')) {
                        setReportsOpen((prev) => !prev)
                      } else if (item.to.startsWith('/settings')) {
                        setSettingsOpen((prev) => !prev)
                      }
                    }}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="nav-caret">▾</span>
                  </button>
                  {item.to.startsWith('/masters') && mastersOpen ? (
                    <div className="submenu">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) => `nav-link sub-link ${isActive ? 'active' : ''}`}
                          onClick={handleNavClick}
                        >
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                  {item.to.startsWith('/hr') && hrOpen ? (
                    <div className="submenu">
                      {item.children
                        .filter((child) => child.to !== '/settings/users' || canManageUsers)
                        .map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={({ isActive }) => `nav-link sub-link ${isActive ? 'active' : ''}`}
                            onClick={handleNavClick}
                          >
                            <span>{child.label}</span>
                          </NavLink>
                        ))}
                    </div>
                  ) : null}
                  {item.to.startsWith('/reports') && reportsOpen ? (
                    <div className="submenu">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) => `nav-link sub-link ${isActive ? 'active' : ''}`}
                          onClick={handleNavClick}
                        >
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                  {item.to.startsWith('/settings') && settingsOpen ? (
                    <div className="submenu">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) => `nav-link sub-link ${isActive ? 'active' : ''}`}
                          onClick={handleNavClick}
                        >
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={handleNavClick}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              )}
            </div>
          ))}
        </nav>

        <button className="sidebar-logout" type="button" onClick={logout}>
          Logout
        </button>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <button className="menu-toggle" type="button" onClick={() => setMenuOpen((prev) => !prev)} aria-label="Toggle navigation">
            ☰
          </button>

          <h1>{currentTitle}</h1>

          <div className="topbar-user">
            <div className="avatar">{user?.name?.charAt(0) || 'U'}</div>
            <div>
              <p className="user-name">{user?.name || 'User'}</p>
              <p className="user-role">{user?.role || 'Admin'}</p>
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
