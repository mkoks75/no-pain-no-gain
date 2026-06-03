import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'

const NAV = [
  { to: '/',           label: 'Week' },
  { to: '/exercises',  label: 'Oefeningen' },
  { to: '/progress',   label: 'Voortgang' },
]

export default function NavBar() {
  const { user, logout } = useAuth()
  const { pathname }     = useLocation()

  return (
    <nav className="navbar">
      <span className="navbar-brand">No Pain No Gain</span>
      <div className="navbar-links">
        {NAV.map(n => (
          <Link
            key={n.to}
            to={n.to}
            className={`navbar-link ${pathname === n.to ? 'active' : ''}`}
          >
            {n.label}
          </Link>
        ))}
        {user?.is_admin && (
          <Link to="/admin" className={`navbar-link ${pathname === '/admin' ? 'active' : ''}`}>
            Admin
          </Link>
        )}
      </div>
      <button className="navbar-logout" onClick={logout}>Uitloggen</button>
    </nav>
  )
}
