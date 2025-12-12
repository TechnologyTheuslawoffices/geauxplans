import React, { useState } from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Dashboard from './account/Dashboard';
import ViewPlans from './account/ViewPlans';
import BusinessPlanning from './account/BusinessPlanning';
import Orders from './account/Orders';
import EditProfile from './account/EditProfile';

const MyAccount: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, logout, error, clearError } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loginError, setLoginError] = useState('');
  const location = useLocation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setLoginError('');
    clearError();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const success = await login({
      email: formData.email,
      password: formData.password,
    });

    if (!success) {
      setLoginError(error || 'Invalid email or password');
    }
  };

  const handleLogout = async () => {
    await logout();
    setFormData({ email: '', password: '' });
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
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 text-muted">Loading...</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (isAuthenticated && user) {
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
  }

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <div
            style={{
              maxWidth: '400px',
              margin: '0 auto',
              padding: '40px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
            }}
          >
            <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>My Account</h1>

            {(loginError || error) && (
              <div className="alert alert-danger mb-3">
                {loginError || error}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #eaeaea',
                    borderRadius: '4px',
                    fontSize: '16px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Password *
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #eaeaea',
                    borderRadius: '4px',
                    fontSize: '16px',
                  }}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                Log In
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: '20px' }}>
              <Link to="/forgot-password">Lost your password?</Link>
            </p>

            <hr style={{ margin: '30px 0', borderColor: '#eaeaea' }} />

            <p style={{ textAlign: 'center', color: '#707070' }}>
              Don't have an account yet?
            </p>
            <Link
              to="/register"
              className="btn btn-white"
              style={{
                width: '100%',
                marginTop: '10px',
                border: '1px solid #004d71',
                display: 'block',
                textAlign: 'center',
              }}
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default MyAccount;
