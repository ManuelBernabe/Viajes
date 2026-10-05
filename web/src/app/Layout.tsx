import { NavLink, Outlet } from 'react-router-dom';
import { t } from '../i18n';

export function Layout() {
  return (
    <>
      <Outlet />
      <nav className="tabs">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon">🧳</span>
          {t('Inicio')}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon">⚙️</span>
          {t('Ajustes')}
        </NavLink>
      </nav>
    </>
  );
}

export function BackLink({ to, label = t('Atrás') }: { to: string | number; label?: string }) {
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
