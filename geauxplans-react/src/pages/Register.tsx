import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface DebugLog {
  timestamp: string;
  type: 'info' | 'request' | 'response' | 'error' | 'success';
  message: string;
  data?: any;
}

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Debug state
  const [showDebug, setShowDebug] = useState(true);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [rawResponse, setRawResponse] = useState<any>(null);

  const addDebugLog = (type: DebugLog['type'], message: string, data?: any) => {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data,
    };
    setDebugLogs(prev => [...prev, log]);
    console.log(`[${type.toUpperCase()}] ${message}`, data || '');
  };

  const clearDebugLogs = () => {
    setDebugLogs([]);
    setRawResponse(null);
  };

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
    clearDebugLogs();

    addDebugLog('info', 'Registration form submitted');
    addDebugLog('info', 'Form data validation starting', {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      passwordLength: formData.password.length,
    });

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      addDebugLog('error', 'Email validation failed', { email: formData.email });
      setRegisterError('Please enter a valid email address');
      return;
    }
    addDebugLog('success', 'Email format valid');

    // Validate password length (must match backend requirement of 8 chars)
    if (formData.password.length < 8) {
      addDebugLog('error', 'Password too short', { length: formData.password.length, required: 8 });
      setRegisterError('Password must be at least 8 characters long');
      return;
    }
    addDebugLog('success', 'Password length valid');

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      addDebugLog('error', 'Passwords do not match');
      setRegisterError('Passwords do not match');
      return;
    }
    addDebugLog('success', 'Passwords match');

    // Make direct API call with full debugging
    const apiUrl = '/api/auth/register';
    const requestBody = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      password: formData.password,
    };

    addDebugLog('request', `Making POST request to ${apiUrl}`, {
      url: apiUrl,
      fullUrl: `${window.location.origin}${apiUrl}`,
      method: 'POST',
      body: { ...requestBody, password: '[HIDDEN]' },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const startTime = Date.now();

    try {
      // Direct fetch for debugging
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include',
      });

      const duration = Date.now() - startTime;
      addDebugLog('info', `Response received in ${duration}ms`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });

      let responseData: any;
      const responseText = await response.text();

      addDebugLog('info', 'Raw response text', {
        length: responseText.length,
        preview: responseText.substring(0, 500),
      });

      try {
        responseData = JSON.parse(responseText);
        addDebugLog('response', 'Parsed JSON response', responseData);
        setRawResponse(responseData);
      } catch (parseError) {
        addDebugLog('error', 'Failed to parse response as JSON', {
          error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          responseText: responseText.substring(0, 1000),
        });
        setRegisterError(`Server returned invalid response (Status: ${response.status})`);
        return;
      }

      if (!response.ok) {
        addDebugLog('error', `HTTP error ${response.status}`, {
          status: response.status,
          error: responseData?.error || responseData?.message || 'Unknown error',
          fullResponse: responseData,
        });
        setRegisterError(responseData?.error || responseData?.message || `Server error: ${response.status}`);
        return;
      }

      if (responseData.success) {
        addDebugLog('success', 'Registration successful', responseData);

        if (responseData.requiresVerification) {
          addDebugLog('info', 'Email verification required');
          setRegisteredEmail(formData.email);
          setShowVerificationModal(true);
        } else if (responseData.data?.token) {
          addDebugLog('info', 'Token received, storing and redirecting');
          localStorage.setItem('gpx_auth_token', responseData.data.token);
          navigate('/my-account');
        } else {
          addDebugLog('info', 'Registration complete, redirecting to login');
          navigate('/login');
        }
      } else {
        addDebugLog('error', 'Registration failed', {
          error: responseData.error,
          message: responseData.message,
          fullResponse: responseData,
        });
        setRegisterError(responseData.error || responseData.message || 'Registration failed');
      }
    } catch (fetchError) {
      const duration = Date.now() - startTime;
      addDebugLog('error', `Network error after ${duration}ms`, {
        error: fetchError instanceof Error ? {
          name: fetchError.name,
          message: fetchError.message,
          stack: fetchError.stack,
        } : 'Unknown error',
      });
      setRegisterError(
        fetchError instanceof Error
          ? `Network error: ${fetchError.message}`
          : 'Network error occurred'
      );
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

          {/* Debug Panel */}
          <div
            style={{
              maxWidth: '800px',
              margin: '30px auto 0',
              border: '2px solid #dc3545',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: '#dc3545',
                color: '#fff',
                padding: '10px 15px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 'bold' }}>Debug Panel (Registration)</span>
              <div>
                <button
                  onClick={clearDebugLogs}
                  style={{
                    background: '#fff',
                    color: '#dc3545',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    marginRight: '10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Clear Logs
                </button>
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  style={{
                    background: '#fff',
                    color: '#dc3545',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {showDebug ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {showDebug && (
              <div style={{ padding: '15px', background: '#1e1e1e', color: '#fff' }}>
                {/* Environment Info */}
                <div style={{ marginBottom: '15px', padding: '10px', background: '#2d2d2d', borderRadius: '4px' }}>
                  <h4 style={{ margin: '0 0 10px', color: '#ffc107' }}>Environment</h4>
                  <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
{JSON.stringify({
  origin: window.location.origin,
  pathname: window.location.pathname,
  apiEndpoint: '/api/auth/register',
  fullApiUrl: `${window.location.origin}/api/auth/register`,
  userAgent: navigator.userAgent.substring(0, 100),
  timestamp: new Date().toISOString(),
}, null, 2)}
                  </pre>
                </div>

                {/* Debug Logs */}
                <div style={{ marginBottom: '15px' }}>
                  <h4 style={{ margin: '0 0 10px', color: '#ffc107' }}>
                    Request/Response Logs ({debugLogs.length})
                  </h4>
                  <div
                    style={{
                      maxHeight: '300px',
                      overflow: 'auto',
                      background: '#2d2d2d',
                      borderRadius: '4px',
                      padding: '10px',
                    }}
                  >
                    {debugLogs.length === 0 ? (
                      <p style={{ color: '#888', margin: 0, fontStyle: 'italic' }}>
                        No logs yet. Submit the form to see debug information.
                      </p>
                    ) : (
                      debugLogs.map((log, index) => (
                        <div
                          key={index}
                          style={{
                            marginBottom: '10px',
                            padding: '8px',
                            borderRadius: '4px',
                            background:
                              log.type === 'error' ? 'rgba(220, 53, 69, 0.2)' :
                              log.type === 'success' ? 'rgba(40, 167, 69, 0.2)' :
                              log.type === 'request' ? 'rgba(0, 123, 255, 0.2)' :
                              log.type === 'response' ? 'rgba(111, 66, 193, 0.2)' :
                              'rgba(108, 117, 125, 0.2)',
                            borderLeft: `3px solid ${
                              log.type === 'error' ? '#dc3545' :
                              log.type === 'success' ? '#28a745' :
                              log.type === 'request' ? '#007bff' :
                              log.type === 'response' ? '#6f42c1' :
                              '#6c757d'
                            }`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span
                              style={{
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                fontSize: '10px',
                                color:
                                  log.type === 'error' ? '#dc3545' :
                                  log.type === 'success' ? '#28a745' :
                                  log.type === 'request' ? '#007bff' :
                                  log.type === 'response' ? '#6f42c1' :
                                  '#6c757d',
                              }}
                            >
                              {log.type}
                            </span>
                            <span style={{ fontSize: '10px', color: '#888' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', marginBottom: log.data ? '5px' : 0 }}>
                            {log.message}
                          </div>
                          {log.data && (
                            <pre
                              style={{
                                margin: 0,
                                fontSize: '11px',
                                color: '#aaa',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                              }}
                            >
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Raw Response */}
                {rawResponse && (
                  <div>
                    <h4 style={{ margin: '0 0 10px', color: '#ffc107' }}>Raw API Response</h4>
                    <pre
                      style={{
                        margin: 0,
                        padding: '10px',
                        background: '#2d2d2d',
                        borderRadius: '4px',
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: '200px',
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(rawResponse, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Current State */}
                <div style={{ marginTop: '15px' }}>
                  <h4 style={{ margin: '0 0 10px', color: '#ffc107' }}>Current State</h4>
                  <pre
                    style={{
                      margin: 0,
                      padding: '10px',
                      background: '#2d2d2d',
                      borderRadius: '4px',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
{JSON.stringify({
  isLoading,
  registerError: registerError || null,
  contextError: error || null,
  formData: {
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    passwordLength: formData.password.length,
  },
}, null, 2)}
                  </pre>
                </div>

                {/* Quick Test */}
                <div style={{ marginTop: '15px' }}>
                  <h4 style={{ margin: '0 0 10px', color: '#ffc107' }}>Quick API Test</h4>
                  <button
                    onClick={async () => {
                      addDebugLog('info', 'Running quick API health check...');
                      try {
                        const healthRes = await fetch('/api/health');
                        const healthData = await healthRes.text();
                        addDebugLog('response', 'Health check response', {
                          status: healthRes.status,
                          data: healthData,
                        });
                      } catch (err) {
                        addDebugLog('error', 'Health check failed', {
                          error: err instanceof Error ? err.message : 'Unknown',
                        });
                      }
                    }}
                    style={{
                      background: '#ffc107',
                      color: '#000',
                      border: 'none',
                      padding: '8px 15px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      marginRight: '10px',
                    }}
                  >
                    Test /api/health
                  </button>
                  <button
                    onClick={async () => {
                      addDebugLog('info', 'Testing OPTIONS preflight to /api/auth/register...');
                      try {
                        const optRes = await fetch('/api/auth/register', { method: 'OPTIONS' });
                        addDebugLog('response', 'OPTIONS preflight response', {
                          status: optRes.status,
                          headers: Object.fromEntries(optRes.headers.entries()),
                        });
                      } catch (err) {
                        addDebugLog('error', 'OPTIONS request failed', {
                          error: err instanceof Error ? err.message : 'Unknown',
                        });
                      }
                    }}
                    style={{
                      background: '#17a2b8',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 15px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Test OPTIONS /api/auth/register
                  </button>
                </div>
              </div>
            )}
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
