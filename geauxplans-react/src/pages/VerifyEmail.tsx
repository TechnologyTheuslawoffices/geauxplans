import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    // Check for verification result from URL params
    const verified = searchParams.get('verified');
    const error = searchParams.get('error');
    const emailParam = searchParams.get('email');

    if (emailParam) {
      setEmail(emailParam);
    }

    if (verified === 'true') {
      setStatus('success');
      setMessage('Your email has been verified successfully! You can now log in.');
    } else if (error) {
      setStatus('error');
      setMessage(error || 'Verification failed. Please try again.');
    }
  }, [searchParams]);

  const handleResendVerification = async () => {
    if (!email) {
      setResendMessage('Please enter your email address.');
      return;
    }

    setIsResending(true);
    setResendMessage('');

    try {
      const response = await api.post('/auth/verify-email', { email });
      if (response.success) {
        setResendMessage('Verification email sent! Please check your inbox.');
      } else {
        setResendMessage(response.error || 'Failed to send verification email.');
      }
    } catch (err) {
      setResendMessage('Failed to send verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <div
            style={{
              maxWidth: '500px',
              margin: '0 auto',
              padding: '40px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            {status === 'success' ? (
              <>
                <div style={{ fontSize: '60px', marginBottom: '20px' }}>✓</div>
                <h1 style={{ color: '#28a745', marginBottom: '20px' }}>Email Verified!</h1>
                <p style={{ color: '#707070', marginBottom: '30px' }}>{message}</p>
                <Link
                  to="/my-account"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                >
                  Log In to Your Account
                </Link>
              </>
            ) : status === 'error' ? (
              <>
                <div style={{ fontSize: '60px', marginBottom: '20px' }}>✗</div>
                <h1 style={{ color: '#dc3545', marginBottom: '20px' }}>Verification Failed</h1>
                <p style={{ color: '#707070', marginBottom: '30px' }}>{message}</p>

                <div style={{ marginBottom: '20px' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                      marginBottom: '15px',
                    }}
                  />
                  <button
                    onClick={handleResendVerification}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={isResending}
                  >
                    {isResending ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>

                {resendMessage && (
                  <p style={{ color: resendMessage.includes('sent') ? '#28a745' : '#dc3545' }}>
                    {resendMessage}
                  </p>
                )}

                <Link to="/my-account" style={{ color: '#004d71' }}>
                  Back to Login
                </Link>
              </>
            ) : (
              <>
                <div style={{ fontSize: '60px', marginBottom: '20px' }}>✉️</div>
                <h1 style={{ marginBottom: '20px' }}>Verify Your Email</h1>
                <p style={{ color: '#707070', marginBottom: '30px' }}>
                  Please check your email inbox and click the verification link to activate your account.
                </p>

                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '30px'
                }}>
                  <p style={{ marginBottom: '10px', fontWeight: '600' }}>
                    Didn't receive the email?
                  </p>
                  <ul style={{ textAlign: 'left', color: '#707070', paddingLeft: '20px' }}>
                    <li>Check your spam or junk folder</li>
                    <li>Make sure you entered the correct email</li>
                    <li>Wait a few minutes and try again</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email to resend"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                      marginBottom: '15px',
                    }}
                  />
                  <button
                    onClick={handleResendVerification}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={isResending}
                  >
                    {isResending ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>

                {resendMessage && (
                  <p style={{ color: resendMessage.includes('sent') ? '#28a745' : '#dc3545' }}>
                    {resendMessage}
                  </p>
                )}

                <hr style={{ margin: '30px 0', borderColor: '#eaeaea' }} />

                <Link to="/my-account" style={{ color: '#004d71' }}>
                  Back to Login
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default VerifyEmail;
