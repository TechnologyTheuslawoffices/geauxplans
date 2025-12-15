import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Register: React.FC = () => {
  const { register, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [registerError, setRegisterError] = useState('');
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleResendEmail = async () => {
    setIsResending(true);
    setResendStatus('idle');
    try {
      const response = await api.post('/auth/verify-email', { email: registeredEmail });
      if (response.success) {
        setResendStatus('success');
      } else {
        setResendStatus('error');
      }
    } catch {
      setResendStatus('error');
    }
    setIsResending(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setRegisterError('');
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (formData.password !== formData.confirmPassword) {
      setRegisterError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setRegisterError('Password must be at least 6 characters');
      return;
    }

    const result = await register({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      password: formData.password,
    });

    if (result.success) {
      if (result.requiresVerification) {
        // Show verification modal
        setRegisteredEmail(formData.email);
        setShowVerificationModal(true);
      } else {
        navigate('/my-account');
      }
    } else {
      setRegisterError(error || 'Registration failed. Please try again.');
    }
  };

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <div
            style={{
              maxWidth: '450px',
              margin: '0 auto',
              padding: '40px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
            }}
          >
            <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Create Account</h1>

            {(registerError || error) && (
              <div className="alert alert-danger mb-3">
                {registerError || error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
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
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
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
              </div>

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
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #eaeaea',
                    borderRadius: '4px',
                    fontSize: '16px',
                  }}
                />
                <small style={{ color: '#707070' }}>Minimum 6 characters</small>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Confirm Password *
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
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

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={isLoading}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>

            <hr style={{ margin: '30px 0', borderColor: '#eaeaea' }} />

            <p style={{ textAlign: 'center', color: '#707070' }}>
              Already have an account?
            </p>
            <Link
              to="/login"
              className="btn btn-white"
              style={{
                width: '100%',
                marginTop: '10px',
                border: '1px solid #004d71',
                display: 'block',
                textAlign: 'center',
              }}
            >
              Log In
            </Link>
          </div>
        </div>
      </section>

      {/* Email Verification Modal */}
      {showVerificationModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '40px',
              maxWidth: '450px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: '60px', marginBottom: '20px' }}>✉️</div>
            <h2 style={{ marginBottom: '15px', color: '#004d71' }}>Check Your Email!</h2>
            <p style={{ color: '#707070', marginBottom: '10px' }}>
              We've sent a verification link to:
            </p>
            <p style={{ fontWeight: '600', marginBottom: '20px', color: '#000' }}>
              {registeredEmail}
            </p>
            <p style={{ color: '#707070', marginBottom: '25px', fontSize: '14px' }}>
              Please click the link in the email to verify your account and complete your registration.
            </p>
            <div
              style={{
                backgroundColor: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '14px',
                color: '#707070',
              }}
            >
              <p style={{ marginBottom: '10px' }}>
                <strong>Didn't receive the email?</strong> Check your spam folder.
              </p>
              <button
                onClick={handleResendEmail}
                disabled={isResending}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#004d71',
                  textDecoration: 'underline',
                  cursor: isResending ? 'wait' : 'pointer',
                  padding: 0,
                  fontSize: '14px',
                }}
              >
                {isResending ? 'Sending...' : 'Resend verification email'}
              </button>
              {resendStatus === 'success' && (
                <p style={{ color: '#28a745', marginTop: '10px', marginBottom: 0 }}>
                  Email sent! Check your inbox.
                </p>
              )}
              {resendStatus === 'error' && (
                <p style={{ color: '#dc3545', marginTop: '10px', marginBottom: 0 }}>
                  Failed to send. Please try again.
                </p>
              )}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Go to Login
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Register;
