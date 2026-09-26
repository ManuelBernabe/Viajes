import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <>
      <Outlet />
      <nav className="tabs">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon">🧳</span>
          Inicio
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon">⚙️</span>
          Ajustes
        </NavLink>
      </nav>
    </>
  );
}

export function BackLink({ to, label = 'Atrás' }: { to: string | number; label?: string }) {
  if (typeof to === 'number') {
    return (
      <a className="back" href="#" aria-label={label} onClick={(e) => { e.preventDefault(); history.go(to); }}>
        ‹
      </a>
    );
  }
  return (
    <NavLink className="back" to={to} aria-label={label}>
      ‹
    </NavLink>
  );
}
