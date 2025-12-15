import React, { useEffect } from 'react';
import { Link, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Dashboard from './account/Dashboard';
import ViewPlans from './account/ViewPlans';
import BusinessPlanning from './account/BusinessPlanning';
import Orders from './account/Orders';
import EditProfile from './account/EditProfile';

const MyAccount: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const navLinkStyle = (path: string): React.CSSProperties => ({
    display: 'block',
    padding: '10px 15px',
    backgroundColor: isActive(path) ? '#004d71' : 'transparent',
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

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ marginBottom: '40px' }}>My Account</h1>

          <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '40px' }}>
            {/* Sidebar */}
            <div>
              <nav>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: '10px' }}>
                    <Link to="/my-account" style={navLinkStyle('/my-account')}>
                      <i className="fas fa-tachometer-alt" style={{ marginRight: '10px', width: '16px' }}></i>
                      Dashboard
                    </Link>
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <Link to="/my-account/my-estate-planning" style={navLinkStyle('/my-account/my-estate-planning')}>
                      <i className="fas fa-file-alt" style={{ marginRight: '10px', width: '16px' }}></i>
                      My Estate Plans
                    </Link>
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <Link to="/my-account/business-planning" style={navLinkStyle('/my-account/business-planning')}>
                      <i className="fas fa-building" style={{ marginRight: '10px', width: '16px' }}></i>
                      My Companies
                    </Link>
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <Link to="/my-account/orders" style={navLinkStyle('/my-account/orders')}>
                      <i className="fas fa-shopping-bag" style={{ marginRight: '10px', width: '16px' }}></i>
                      View Orders
                    </Link>
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <Link to="/my-account/edit-account" style={navLinkStyle('/my-account/edit-account')}>
                      <i className="fas fa-user-edit" style={{ marginRight: '10px', width: '16px' }}></i>
                      Edit Profile
                    </Link>
                  </li>
                  <li>
                    <button
                      onClick={handleLogout}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 15px',
                        color: '#707070',
                        border: '1px solid #eaeaea',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <i className="fas fa-sign-out-alt" style={{ marginRight: '10px', width: '16px' }}></i>
                      Logout
                    </button>
                  </li>
                </ul>
              </nav>

              <div
                style={{
                  marginTop: '30px',
                  padding: '20px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                }}
              >
                <p style={{ fontWeight: '600', marginBottom: '10px' }}>Welcome, {user.firstName || user.displayName}!</p>
                <p style={{ fontSize: '14px', color: '#707070', marginBottom: '15px' }}>
                  {user.email}
                </p>
                <p style={{ fontWeight: '600', marginBottom: '10px' }}>Need Help or Advice?</p>
                <p style={{ fontSize: '14px', color: '#707070', marginBottom: 0 }}>
                  <strong>Call us:</strong><br />
                  +1 (855) 213-6300<br />
                  M-F, 8am-5pm CST
                </p>
              </div>
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
              </Routes>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default MyAccount;
