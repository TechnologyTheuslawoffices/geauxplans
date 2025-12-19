import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const { login, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

    try {
      const result = await login({
        email: formData.email,
        password: formData.password,
      });

      if (result.success) {
        navigate('/my-account');
      } else {
        if (result.requiresVerification) {
          navigate(`/verify-email?email=${encodeURIComponent(formData.email)}`);
        } else {
          setLoginError(result.error || error || 'Invalid email or password');
        }
      }
    } catch (err) {
      setLoginError('An error occurred during login. Please try again.');
    }
  };

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
            <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Login</h1>

            {(loginError || error) && (
              <div style={{
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '12px 15px',
                borderRadius: '4px',
                marginBottom: '20px',
                border: '1px solid #f5c6cb'
              }}>
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
                  autoComplete="email"
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
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    autoComplete="current-password"
                    style={{
                      width: '100%',
                      padding: '12px',
                      paddingRight: '50px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0',
                      color: '#707070',
                      fontSize: '14px',
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Log In'}
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

export default Login;
