import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';

interface SessionData {
  productId: string;
  productName: string;
  formType: string;
  paymentStatus: string;
  customerEmail: string;
  amountTotal: number;
}

const CheckoutSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const fetchSession = async () => {
      if (!sessionId) {
        setError('Invalid session');
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<SessionData>(`/stripe/session/${sessionId}`);
        if (response.success && response.data) {
          setSessionData(response.data);
        } else {
          setError('Could not retrieve order details');
        }
      } catch (err) {
        setError('An error occurred');
      }
      setIsLoading(false);
    };

    fetchSession();
  }, [sessionId]);

  if (isLoading) {
    return (
      <main>
        <section className="plans-section">
          <div className="container">
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p style={{ marginTop: '20px', color: '#707070' }}>Loading your order details...</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (error || !sessionData) {
    return (
      <main>
        <section className="plans-section">
          <div className="container">
            <div
              style={{
                maxWidth: '500px',
                margin: '0 auto',
                padding: '60px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '60px', marginBottom: '20px' }}>⚠️</div>
              <h1 style={{ marginBottom: '15px' }}>Something went wrong</h1>
              <p style={{ color: '#707070', marginBottom: '30px' }}>
                {error || 'We could not find your order details.'}
              </p>
              <Link to="/" className="btn btn-primary">
                Return Home
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const formUrl = `/poa-form?product=${sessionData.productId}&type=${sessionData.formType}`;
  const isSubscription = sessionData.productId === '1367';

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <div
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              padding: '40px 20px',
              textAlign: 'center',
            }}
          >
            {/* Success Icon */}
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#d4edda',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 30px',
              }}
            >
              <i className="fas fa-check" style={{ fontSize: '40px', color: '#28a745' }}></i>
            </div>

            <h1 style={{ marginBottom: '10px', color: '#28a745' }}>Payment Successful!</h1>
            <p style={{ color: '#707070', marginBottom: '30px', fontSize: '18px' }}>
              Thank you for your purchase. Your order has been confirmed.
            </p>

            {/* Order Details */}
            <div
              style={{
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '25px',
                marginBottom: '30px',
                textAlign: 'left',
              }}
            >
              <h2 style={{ fontSize: '18px', marginBottom: '20px', textAlign: 'center' }}>
                Order Details
              </h2>
              <div style={{ marginBottom: '15px' }}>
                <strong>Product:</strong>
                <p style={{ margin: '5px 0 0', color: '#333' }}>{sessionData.productName}</p>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <strong>Plan Type:</strong>
                <p style={{ margin: '5px 0 0', color: '#333' }}>
                  {sessionData.formType === '2person' ? 'Married Couple' : 'Individual'}
                </p>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <strong>Amount Paid:</strong>
                <p style={{ margin: '5px 0 0', color: '#333', fontSize: '20px', fontWeight: 'bold' }}>
                  ${sessionData.amountTotal.toFixed(2)}
                </p>
              </div>
              {sessionData.customerEmail && (
                <div>
                  <strong>Confirmation sent to:</strong>
                  <p style={{ margin: '5px 0 0', color: '#333' }}>{sessionData.customerEmail}</p>
                </div>
              )}
            </div>

            {/* Next Steps */}
            <div
              style={{
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                padding: '25px',
                marginBottom: '30px',
              }}
            >
              {isSubscription ? (
                <>
                  <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#1565c0' }}>
                    <i className="fas fa-check-circle me-2"></i>
                    Subscription Activated!
                  </h3>
                  <p style={{ margin: 0, color: '#555', fontSize: '14px' }}>
                    You can now edit your estate planning forms anytime. Your subscription is valid for 1 year.
                    Go to your dashboard to continue editing your forms.
                  </p>
                </>
              ) : (
                <>
                  <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#1565c0' }}>
                    <i className="fas fa-arrow-right me-2"></i>
                    Next Step: Complete Your Questionnaire
                  </h3>
                  <p style={{ margin: 0, color: '#555', fontSize: '14px' }}>
                    Answer a few questions about your situation to customize your documents.
                    This typically takes 15-20 minutes.
                  </p>
                </>
              )}
            </div>

            {/* Action Buttons */}
            {isSubscription ? (
              <Link
                to="/my-account/my-estate-planning"
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%',
                  padding: '15px',
                  fontSize: '18px',
                  marginBottom: '15px',
                }}
              >
                <i className="fas fa-folder-open me-2"></i>
                Go to My Estate Planning
              </Link>
            ) : (
              <Link
                to={formUrl}
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%',
                  padding: '15px',
                  fontSize: '18px',
                  marginBottom: '15px',
                }}
              >
                <i className="fas fa-edit me-2"></i>
                Start Your Questionnaire
              </Link>
            )}

            <Link
              to="/my-account"
              style={{
                display: 'block',
                color: '#707070',
                textDecoration: 'underline',
              }}
            >
              Or go to My Account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default CheckoutSuccess;
