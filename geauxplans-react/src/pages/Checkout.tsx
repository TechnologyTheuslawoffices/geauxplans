import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

// Product configuration - must match backend
const PRODUCTS: Record<string, { name: string; price: number; price2person: number; description: string; type?: string }> = {
  '606': { name: 'Minor Child-Centered Estate Plan', price: 199, price2person: 299, description: 'Create a will-based plan to appoint a Tutor for minor children.' },
  '614': { name: 'Power of Attorney Supplement', price: 99, price2person: 149, description: 'Financial and Healthcare Power of Attorney documents.' },
  '673': { name: 'Will-Based Estate Plan', price: 199, price2person: 299, description: 'Control your legacy with a comprehensive will-based estate plan.' },
  '676': { name: 'Trust-Based Estate Plan', price: 399, price2person: 599, description: 'Avoid probate and transfer assets smoothly with a trust.' },
  '1367': {
    name: 'Legal Edge Plan',
    price: 9.99,
    price2person: 9.99,
    description: 'Forever revisions and Advanced Estate Plan upgrade credit. Cancel anytime.',
    type: 'subscription',
  },
};

// Easter egg: Type "geaux" to enable test mode
const EASTER_EGG_CODE = 'geaux';

// Maintenance mode - set to true to block new enrollments during upgrades
const MAINTENANCE_MODE = false;

const Checkout: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { cart } = useCart();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [keySequence, setKeySequence] = useState('');

  const returnUrl = '/checkout';
  const hasItems = cart.items.length > 0;
  const firstItem = cart.items[0];

  useEffect(() => {
    if (!hasItems) {
      navigate('/shop');
    }
  }, [hasItems, navigate]);

  // Easter egg: Listen for key sequence "geaux" to enable test mode
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const newSequence = (keySequence + key).slice(-EASTER_EGG_CODE.length);
    setKeySequence(newSequence);

    if (newSequence === EASTER_EGG_CODE) {
      setTestMode(true);
      setKeySequence('');
    }
  }, [keySequence]);

  useEffect(() => {
    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [handleKeyPress]);

  // Also check for ?test=geaux in URL
  useEffect(() => {
    if (searchParams.get('test') === 'geaux') {
      setTestMode(true);
    }
  }, [searchParams]);

  // Map first cart item's product ID + form type to its form URL (test bypass)
  const getFormUrl = () => {
    if (!firstItem) return '/';
    const productId = String(firstItem.productId);
    const formType = firstItem.variationId === 2 ? '2person' : 'solo';
    const formTypeMap: Record<string, Record<string, string>> = {
      '614': { solo: 'powerOfAttorneyForm', '2person': 'powerOfAttorneyForm2Person' },
      '676': { solo: 'trustBasedEstatePlanSolo', '2person': 'trustBasedEstatePlan2Person' },
      '673': { solo: 'willBasedEstatePlan', '2person': 'willBasedEstatePlan2Person' },
      '606': { solo: 'minorChildEstatePlan', '2person': 'minorChildEstatePlan2Person' },
    };
    const productMap = formTypeMap[productId] || formTypeMap['614'];
    const mappedType = productMap[formType] || productMap.solo || 'powerOfAttorneyForm';
    return `/poa-form?product=${productId}&type=${mappedType}`;
  };

  // Bypass checkout and go directly to form (test mode)
  const handleTestBypass = () => {
    navigate(getFormUrl());
  };

  const handleCheckout = async () => {
    setIsLoading(true);
    setError('');

    try {
      const items = cart.items.map(i => ({
        productId: i.productId,
        formType: i.variationId === 2 ? '2person' : 'solo',
      }));

      const response = await api.post<{ sessionId: string; url: string }>(
        '/stripe/create-checkout-session',
        { items }
      );

      if (response.success && response.data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = response.data.url;
      } else {
        setError(response.error || 'Failed to create checkout session');
        setIsLoading(false);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (!hasItems) {
    return null;
  }

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <div
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              padding: '40px',
            }}
          >
            <h1 style={{ textAlign: 'center', marginBottom: '10px' }}>Checkout</h1>
            <p style={{ textAlign: 'center', color: '#707070', marginBottom: '40px' }}>
              Review your order and proceed to payment
            </p>

            {/* Maintenance Mode Banner */}
            {MAINTENANCE_MODE && !testMode && (
              <div
                style={{
                  backgroundColor: '#fff3cd',
                  color: '#856404',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  border: '1px solid #ffc107',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>🚧</div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#856404' }}>
                  Temporarily Unavailable
                </h3>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
                  We apologize for the inconvenience. We're currently making improvements to GeauxPlans,
                  and new enrollments are temporarily paused. Thank you for your understanding.
                </p>
              </div>
            )}

            {/* Test Mode Banner - Easter Egg */}
            {testMode && (
              <div
                style={{
                  backgroundColor: '#fff3cd',
                  color: '#856404',
                  padding: '15px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  border: '2px dashed #ffc107',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '10px' }}>🧪 TEST MODE ENABLED 🧪</div>
                <p style={{ margin: '0 0 15px 0', fontSize: '14px' }}>
                  Bypass payment and go directly to the form for testing.
                </p>
                <button
                  onClick={handleTestBypass}
                  className="btn"
                  style={{
                    backgroundColor: '#ffc107',
                    color: '#000',
                    padding: '12px 30px',
                    fontWeight: 'bold',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  🚀 Skip to Form (Test)
                </button>
              </div>
            )}

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

            {/* Order Summary */}
            <div
              style={{
                border: '1px solid #eaeaea',
                borderRadius: '8px',
                padding: '30px',
                marginBottom: '30px',
                backgroundColor: '#fff',
              }}
            >
              <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>Order Summary</h2>

              {cart.items.map((item) => {
                const productMeta = PRODUCTS[String(item.productId)];
                const isSub = item.type === 'subscription' || productMeta?.type === 'subscription';
                const isMarried = item.variationId === 2;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      paddingBottom: '20px',
                      borderBottom: '1px solid #eaeaea',
                      marginBottom: '20px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '18px', marginBottom: '5px' }}>{item.name}</h3>
                      {productMeta?.description && (
                        <p style={{ color: '#707070', fontSize: '14px', margin: 0 }}>
                          {productMeta.description}
                        </p>
                      )}
                      {isMarried && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: '10px',
                            padding: '4px 10px',
                            backgroundColor: '#e3f2fd',
                            color: '#1976d2',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}
                        >
                          Married Couple Plan
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#004d71' }}>
                      ${item.price.toFixed(2)}{isSub ? '/mo' : ''}
                    </span>
                  </div>
                );
              })}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                <span>Total</span>
                <span style={{ color: '#004d71' }}>${cart.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Checkout Button or Login Prompt */}
            {MAINTENANCE_MODE && !testMode ? (
              <div
                style={{
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  padding: '25px',
                  backgroundColor: '#f8f9fa',
                  textAlign: 'center',
                }}
              >
                <button
                  disabled
                  className="btn btn-secondary btn-lg"
                  style={{
                    width: '100%',
                    padding: '15px',
                    fontSize: '18px',
                    cursor: 'not-allowed',
                    opacity: 0.6,
                  }}
                >
                  <i className="fas fa-pause-circle me-2"></i>
                  Checkout Temporarily Unavailable
                </button>
                <p
                  style={{
                    textAlign: 'center',
                    marginTop: '15px',
                    fontSize: '14px',
                    color: '#707070',
                  }}
                >
                  Please check back soon. We appreciate your patience!
                </p>
              </div>
            ) : authLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>Loading...</p>
              </div>
            ) : isAuthenticated ? (
              <>
                <button
                  onClick={handleCheckout}
                  disabled={isLoading}
                  className="btn btn-primary btn-lg"
                  style={{
                    width: '100%',
                    padding: '15px',
                    fontSize: '18px',
                  }}
                >
                  {isLoading ? (
                    'Processing...'
                  ) : (
                    <>
                      <i className="fas fa-lock me-2"></i>
                      Proceed to Secure Payment
                    </>
                  )}
                </button>

                <p
                  style={{
                    textAlign: 'center',
                    marginTop: '15px',
                    fontSize: '14px',
                    color: '#707070',
                  }}
                >
                  <i className="fas fa-shield-alt me-1"></i>
                  Secure payment powered by Stripe
                </p>
              </>
            ) : (
              <div
                style={{
                  border: '1px solid #e3f2fd',
                  borderRadius: '8px',
                  padding: '25px',
                  backgroundColor: '#f8f9fa',
                  textAlign: 'center',
                }}
              >
                <h3 style={{ marginBottom: '10px', fontSize: '18px' }}>
                  <i className="fas fa-user-circle me-2"></i>
                  Account Required
                </h3>
                <p style={{ color: '#555', marginBottom: '20px' }}>
                  Please log in or create an account to complete your purchase. Your documents will be saved to your account for easy access.
                </p>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                  <Link
                    to={`/login?redirect=${encodeURIComponent(returnUrl)}`}
                    className="btn btn-primary"
                    style={{ padding: '12px 30px' }}
                  >
                    Log In
                  </Link>
                  <Link
                    to={`/register?redirect=${encodeURIComponent(returnUrl)}`}
                    className="btn btn-outline-primary"
                    style={{ padding: '12px 30px' }}
                  >
                    Create Account
                  </Link>
                </div>
              </div>
            )}

            {/* Back Link */}
            <p style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                onClick={() => navigate(-1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#004d71',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                &larr; Go Back
              </button>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Checkout;
