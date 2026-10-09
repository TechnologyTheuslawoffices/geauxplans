import React, { useEffect, useState } from 'react';
import { Link, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Dashboard from './account/Dashboard';
import ViewPlans from './account/ViewPlans';
import BusinessPlanning from './account/BusinessPlanning';
import Orders from './account/Orders';
import EditProfile from './account/EditProfile';
import ScheduleAppointment from './account/ScheduleAppointment';

// The account sections. On desktop these are sidebar links to routed sub-pages;
// on mobile each one is an accordion whose body renders the section inline, so a
// tap opens that content directly under its own button instead of pushing it
// far down the page beneath a tall stacked menu.
interface AccountSection {
  key: string;
  label: string;
  icon: string;
  path: string;
  element: React.ReactNode;
}

const MyAccount: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Accordion on phones, sidebar + routed panel on desktop.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/my-account') {
      return location.pathname === '/my-account' || location.pathname === '/my-account/';
    }
    return location.pathname.startsWith(path);
  };

  const sections: AccountSection[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-tachometer-alt', path: '/my-account', element: <Dashboard /> },
    { key: 'estate', label: 'Estate Plan', icon: 'fa-file-alt', path: '/my-account/my-estate-planning', element: <ViewPlans /> },
    { key: 'companies', label: 'My Companies', icon: 'fa-building', path: '/my-account/business-planning', element: <BusinessPlanning /> },
    { key: 'meeting', label: 'Schedule Meeting', icon: 'fa-calendar-alt', path: '/my-account/interview', element: <ScheduleAppointment /> },
    { key: 'orders', label: 'View Orders', icon: 'fa-shopping-bag', path: '/my-account/orders', element: <Orders /> },
    { key: 'profile', label: 'Edit Profile', icon: 'fa-user-edit', path: '/my-account/edit-account', element: <EditProfile /> },
  ];

  // On mobile, open the section matching the current URL (so a deep link opens
  // the right panel); otherwise the dashboard. The array is reversed so a more
  // specific path (e.g. /orders) is matched before the catch-all dashboard.
  const [openKey, setOpenKey] = useState<string>(() => {
    const match = [...sections].reverse().find((s) => isActive(s.path));
    return match ? match.key : 'dashboard';
  });

  const navLinkStyle = (path: string): React.CSSProperties => ({
    display: 'block',
    padding: '10px 15px',
    backgroundColor: isActive(path) ? '#1a1acc' : 'transparent',
    color: isActive(path) ? '#fff' : '#707070',
    borderRadius: '4px',
    border: isActive(path) ? 'none' : '1px solid #eaeaea',
    textDecoration: 'none',
  });

  if (isLoading) {
    return (
      <main>
        <section className="plans-section">
          <div className="container">
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p style={{ marginTop: '20px', color: '#707070' }}>Loading...</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect via useEffect
  }

  const header = (
    <>
      <h1 style={{ marginBottom: '4px' }}>My Account</h1>
      <p style={{ marginBottom: '28px', color: '#707070', fontSize: '14px' }}>
        Signed in as <strong style={{ color: '#1a1acc' }}>{user.email}</strong>
      </p>
    </>
  );

  const helpCard = (
    <div
      style={{
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
      }}
    >
      <p style={{ fontWeight: '600', marginBottom: '10px' }}>Need Help or Advice?</p>
      <p style={{ fontSize: '14px', color: '#707070', marginBottom: 0 }}>
        <strong>Call us:</strong><br />
        +1 (855) 213-6300<br />
        M-F, 8am-5pm CST
      </p>
    </div>
  );

  const logoutButton = (fullWidth: boolean) => (
    <button
      onClick={handleLogout}
      className={fullWidth ? 'btn btn_geaux' : undefined}
      style={
        fullWidth
          ? { width: '100%', marginTop: '16px' }
          : {
              display: 'block',
              width: '100%',
              padding: '10px 15px',
              color: '#707070',
              border: '1px solid #eaeaea',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }
      }
    >
      <i className="fas fa-sign-out-alt" style={{ marginRight: '10px', width: '16px' }}></i>
      Logout
    </button>
  );

  // ---- Mobile: each section is its own accordion ----
  if (isMobile) {
    return (
      <main>
        <section className="plans-section">
          <div className="container">
            {header}
            <div className="account-accordion">
              {sections.map((s) => {
                const open = openKey === s.key;
                return (
                  <div key={s.key} className="account-acc-item">
                    <button
                      type="button"
                      className={`account-acc-header ${open ? 'open' : ''}`}
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? '' : s.key)}
                    >
                      <span>
                        <i className={`fas ${s.icon}`} style={{ marginRight: '10px', width: '16px' }}></i>
                        {s.label}
                      </span>
                      <i className={`fas fa-chevron-${open ? 'up' : 'down'}`}></i>
                    </button>
                    {open && <div className="account-acc-body">{s.element}</div>}
                  </div>
                );
              })}
            </div>

            {logoutButton(true)}
            {helpCard}
          </div>
        </section>
      </main>
    );
  }

  // ---- Desktop: sidebar + routed content ----
  return (
    <main>
      <section className="plans-section">
        <div className="container">
          {header}

          <div className="my-account-grid">
            <div>
              <nav>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {sections.map((s) => (
                    <li key={s.key} style={{ marginBottom: '10px' }}>
                      <Link to={s.path} style={navLinkStyle(s.path)}>
                        <i className={`fas ${s.icon}`} style={{ marginRight: '10px', width: '16px' }}></i>
                        {s.label}
                      </Link>
                    </li>
                  ))}
                  <li>{logoutButton(false)}</li>
                </ul>
              </nav>
              {helpCard}
            </div>

            {/* Main Content */}
            <div>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="estate-planning" element={<ViewPlans />} />
                <Route path="my-estate-planning" element={<ViewPlans />} />
                <Route path="view-plans" element={<ViewPlans />} />
                <Route path="business-planning" element={<BusinessPlanning />} />
                <Route path="orders" element={<Orders />} />
                <Route path="edit-account" element={<EditProfile />} />
                <Route path="interview" element={<ScheduleAppointment />} />
                {/*
                  WooCommerce registered a long tail of My Account endpoints
                  (customer-logout, get-start-interview, ...). The common ones
                  are redirected in vercel.json; without this fallback anything
                  left over renders the account chrome around an empty panel,
                  which reads as a broken page rather than a missing one.
                */}
                <Route path="*" element={<Navigate to="/my-account" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default MyAccount;
