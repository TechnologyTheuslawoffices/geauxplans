import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'pending' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      // Check for Supabase token in URL hash (Supabase uses hash for tokens)
      const hash = location.hash;

      // Supabase sends tokens in the hash like #access_token=xxx&type=signup
      if (hash && hash.includes('access_token')) {
        // Token verification successful - Supabase already verified it
        // Try to refresh user session
        await refreshUser();
        setStatus('success');
        setMessage('Your email has been verified successfully! You can now log in.');
        return;
      }

      // Check for error in hash
      if (hash && hash.includes('error')) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorDesc = hashParams.get('error_description');
        setStatus('error');
        setMessage(errorDesc || 'Verification failed. The link may have expired.');
        return;
      }

      // Check for query params
      const verified = searchParams.get('verified');
      const error = searchParams.get('error');
      const emailParam = searchParams.get('email');
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (emailParam) {
        setEmail(emailParam);
      }

      // If we have token_hash and type, verify via Supabase
      if (tokenHash && type === 'email') {
        try {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'email',
          });

          if (verifyError) {
            setStatus('error');
            setMessage(verifyError.message || 'Verification failed. Please try again.');
          } else {
            await refreshUser();
            setStatus('success');
            setMessage('Your email has been verified successfully! You can now log in.');
          }
        } catch {
          setStatus('error');
          setMessage('Verification failed. The link may have expired.');
        }
        return;
      }

      // Check simple verified flag
      if (verified === 'true') {
        setStatus('success');
        setMessage('Your email has been verified successfully! You can now log in.');
        return;
      }

      if (error) {
        setStatus('error');
        setMessage(error || 'Verification failed. Please try again.');
        return;
      }

      // No verification params - show pending state
      setStatus('pending');
    };

    verifyToken();
  }, [searchParams, location.hash, refreshUser]);

  const handleResendVerification = async () => {
    if (!email) {
      setResendMessage('Please enter your email address.');
      return;
    }

    setIsResending(true);
    setResendMessage('');

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });

      if (resendError) {
        setResendMessage(resendError.message || 'Failed to send verification email.');
      } else {
        setResendMessage('Verification email sent! Please check your inbox.');
      }
    } catch (err) {
      setResendMessage('Failed to send verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  if (status === 'loading') {
    return (
      <main>
        <section className="plans-section">
          <div className="container">
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Verifying...</span>
              </div>
              <p style={{ marginTop: '20px', color: '#707070' }}>Verifying your email...</p>
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
                <div style={{ fontSize: '60px', marginBottom: '20px', color: '#28a745' }}>&#10003;</div>
                <h1 style={{ color: '#28a745', marginBottom: '20px' }}>Email Verified!</h1>
                <p style={{ color: '#707070', marginBottom: '30px' }}>{message}</p>
                <Link
                  to="/my-account"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                >
                  Go to Your Account
                </Link>
              </>
            ) : status === 'error' ? (
              <>
                <div style={{ fontSize: '60px', marginBottom: '20px' }}>&#10007;</div>
                <h1 style={{ color: '#dc3545', marginBottom: '20px' }}>Verification Failed</h1>
                <p style={{ color: '#707070', marginBottom: '30px' }}>{message}</p>

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

                <Link to="/login" style={{ color: '#004d71' }}>
                  Back to Login
                </Link>
              </>
            ) : (
              <>
                <div style={{ fontSize: '60px', marginBottom: '20px' }}>&#9993;</div>
                <h1 style={{ marginBottom: '20px' }}>Check Your Email</h1>
                <p style={{ color: '#707070', marginBottom: '30px' }}>
                  We sent a verification link to <strong>{email || 'your email'}</strong>.
                  Click the link to verify your account.
                </p>

                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '30px',
                  textAlign: 'left'
                }}>
                  <p style={{ marginBottom: '10px', fontWeight: '600' }}>
                    Didn't receive the email?
                  </p>
                  <ul style={{ color: '#707070', paddingLeft: '20px', marginBottom: '15px' }}>
                    <li>Check your spam or junk folder</li>
                    <li>Wait a few minutes</li>
                  </ul>
                  {email ? (
                    <button
                      onClick={handleResendVerification}
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
                  ) : (
                    <>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email to resend"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px',
                          marginBottom: '10px',
                        }}
                      />
                      <button
                        onClick={handleResendVerification}
                        className="btn btn-sm btn-outline-primary"
                        disabled={isResending}
                      >
                        {isResending ? 'Sending...' : 'Resend'}
                      </button>
                    </>
                  )}
                  {resendMessage && (
                    <p style={{
                      color: resendMessage.includes('sent') ? '#28a745' : '#dc3545',
                      marginTop: '10px',
                      marginBottom: 0,
                      fontSize: '14px'
                    }}>
                      {resendMessage}
                    </p>
                  )}
                </div>

                <Link
                  to="/login"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Go to Login
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
