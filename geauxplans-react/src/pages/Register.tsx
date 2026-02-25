import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface DebugInfo {
  timestamp: string;
  action: string;
  details: any;
}

const Register: React.FC = () => {
  const { register, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/my-account';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Debug state
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugInfo[]>([]);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    urlConfigured: boolean;
    keyConfigured: boolean;
    url: string;
  }>({ urlConfigured: false, keyConfigured: false, url: '' });

  const addDebugLog = (action: string, details: any) => {
    setDebugLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      action,
      details,
    }]);
  };

  // Check Supabase configuration on mount
  useEffect(() => {
    const url = process.env.REACT_APP_SUPABASE_URL || '';
    const key = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
    setSupabaseStatus({
      urlConfigured: !!url,
      keyConfigured: !!key,
      url: url ? url.substring(0, 30) + '...' : 'NOT SET',
    });
    addDebugLog('init', {
      supabaseUrl: url ? 'configured' : 'NOT SET',
      supabaseKey: key ? 'configured (length: ' + key.length + ')' : 'NOT SET',
    });
  }, []);

  const handleResendEmail = async () => {
    setIsResending(true);
    setResendStatus('idle');
    addDebugLog('resend_email_start', { email: registeredEmail });
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: registeredEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });
      if (resendError) {
        addDebugLog('resend_email_error', { error: resendError });
        setResendStatus('error');
      } else {
        addDebugLog('resend_email_success', { email: registeredEmail });
        setResendStatus('success');
      }
    } catch (err) {
      addDebugLog('resend_email_exception', { error: String(err) });
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
    addDebugLog('submit_start', {
      email: formData.email,
      firstName: formData.firstName,
      lastName: formData.lastName,
      passwordLength: formData.password.length
    });

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      addDebugLog('validation_error', { type: 'email_format', email: formData.email });
      setRegisterError('Please enter a valid email address');
      return;
    }

    // Validate password length
    if (formData.password.length < 8) {
      addDebugLog('validation_error', { type: 'password_length', length: formData.password.length });
      setRegisterError('Password must be at least 8 characters long');
      return;
    }

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      addDebugLog('validation_error', { type: 'password_mismatch' });
      setRegisterError('Passwords do not match');
      return;
    }

    addDebugLog('calling_register', { email: formData.email });

    const result = await register({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      password: formData.password,
    });

    addDebugLog('register_result', result);

    if (result.success) {
      addDebugLog('register_success', { requiresVerification: result.requiresVerification });
      if (result.requiresVerification) {
        setRegisteredEmail(formData.email);
        setShowVerificationModal(true);
      } else {
        navigate(redirectUrl);
      }
    } else {
      addDebugLog('register_failed', { error: result.error });
      setRegisterError(result.error || 'Registration failed');
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
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
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
                <small style={{ color: '#707070' }}>Minimum 8 characters</small>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Confirm Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
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
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
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
              to={redirectUrl !== '/my-account' ? `/login?redirect=${encodeURIComponent(redirectUrl)}` : '/login'}
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
            <div style={{ fontSize: '60px', marginBottom: '20px' }}>&#9993;</div>
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
              onClick={() => navigate(redirectUrl !== '/my-account' ? `/login?redirect=${encodeURIComponent(redirectUrl)}` : '/login')}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Go to Login
            </button>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#1a1a2e',
          color: '#eee',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 10000,
          maxHeight: showDebug ? '50vh' : '40px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <div
          onClick={() => setShowDebug(!showDebug)}
          style={{
            padding: '10px 15px',
            backgroundColor: '#16213e',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '2px solid #e94560',
          }}
        >
          <span style={{ fontWeight: 'bold', color: '#e94560' }}>
            DEBUG PANEL {showDebug ? '▼' : '▲'}
          </span>
          <span>
            Supabase: {supabaseStatus.urlConfigured && supabaseStatus.keyConfigured ? (
              <span style={{ color: '#4ecca3' }}>Connected</span>
            ) : (
              <span style={{ color: '#e94560' }}>Not Configured</span>
            )}
            {' | '}
            Logs: {debugLogs.length}
            {(registerError || error) && (
              <span style={{ color: '#e94560', marginLeft: '10px' }}>
                ERROR ACTIVE
              </span>
            )}
          </span>
        </div>
        {showDebug && (
          <div style={{ padding: '15px', overflowY: 'auto', maxHeight: 'calc(50vh - 40px)' }}>
            {/* Configuration Status */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#0f3460', borderRadius: '4px' }}>
              <strong style={{ color: '#4ecca3' }}>Configuration Status:</strong>
              <div style={{ marginTop: '5px' }}>
                <div>
                  SUPABASE_URL: {supabaseStatus.urlConfigured ? (
                    <span style={{ color: '#4ecca3' }}>{supabaseStatus.url}</span>
                  ) : (
                    <span style={{ color: '#e94560' }}>NOT SET</span>
                  )}
                </div>
                <div>
                  SUPABASE_ANON_KEY: {supabaseStatus.keyConfigured ? (
                    <span style={{ color: '#4ecca3' }}>Configured</span>
                  ) : (
                    <span style={{ color: '#e94560' }}>NOT SET</span>
                  )}
                </div>
              </div>
            </div>

            {/* Current Error */}
            {(registerError || error) && (
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#5c1a1a', borderRadius: '4px', border: '1px solid #e94560' }}>
                <strong style={{ color: '#e94560' }}>Current Error:</strong>
                <div style={{ marginTop: '5px', wordBreak: 'break-word' }}>
                  {registerError || error}
                </div>
              </div>
            )}

            {/* Auth Context State */}
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#0f3460', borderRadius: '4px' }}>
              <strong style={{ color: '#4ecca3' }}>Auth Context State:</strong>
              <div style={{ marginTop: '5px' }}>
                <div>isLoading: {isLoading ? 'true' : 'false'}</div>
                <div>error: {error || 'null'}</div>
              </div>
            </div>

            {/* Debug Logs */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ color: '#4ecca3' }}>Event Log:</strong>
                <button
                  onClick={() => setDebugLogs([])}
                  style={{
                    background: '#e94560',
                    border: 'none',
                    color: '#fff',
                    padding: '3px 8px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Clear
                </button>
              </div>
              {debugLogs.length === 0 ? (
                <div style={{ color: '#666' }}>No events logged yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
                  {debugLogs.map((log, index) => (
                    <div
                      key={index}
                      style={{
                        marginBottom: '8px',
                        padding: '8px',
                        backgroundColor: log.action.includes('error') || log.action.includes('failed')
                          ? '#5c1a1a'
                          : log.action.includes('success')
                          ? '#1a5c3a'
                          : '#16213e',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${
                          log.action.includes('error') || log.action.includes('failed')
                            ? '#e94560'
                            : log.action.includes('success')
                            ? '#4ecca3'
                            : '#4a90a4'
                        }`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#4ecca3' }}>{log.action}</span>
                        <span style={{ color: '#666', fontSize: '10px' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ccc' }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Register;
