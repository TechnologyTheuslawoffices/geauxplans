import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/authService';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await requestPasswordReset(email);
      if (response.success) {
        setSuccess(true);
      } else {
        setError(response.error || 'Failed to send reset link');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
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
                textAlign: 'center',
              }}
            >
              <h1 style={{ marginBottom: '20px' }}>Check Your Email</h1>
              <p style={{ color: '#707070', marginBottom: '20px' }}>
                If an account exists with the email <strong>{email}</strong>, we've sent a password reset link.
              </p>
              <p style={{ color: '#707070', marginBottom: '30px' }}>
                The link will expire in 1 hour.
              </p>
              <Link to="/login" className="btn btn-primary">
                Return to Login
              </Link>
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
            <h1 style={{ textAlign: 'center', marginBottom: '10px' }}>Forgot Password</h1>
            <p style={{ textAlign: 'center', color: '#707070', marginBottom: '30px' }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {error && (
              <div
                style={{
                  backgroundColor: '#f8d7da',
                  color: '#721c24',
                  padding: '12px 15px',
                  borderRadius: '4px',
                  marginBottom: '20px',
                  border: '1px solid #f5c6cb',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: '20px' }}>
              <Link to="/login">Back to Login</Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ForgotPassword;
