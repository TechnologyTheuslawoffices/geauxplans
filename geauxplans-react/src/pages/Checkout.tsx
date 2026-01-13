import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

// Product configuration - must match backend
const PRODUCTS: Record<string, { name: string; price: number; description: string }> = {
  '606': { name: 'Minor Child-Centered Estate Plan', price: 199, description: 'Create a will-based plan to appoint a Tutor for minor children.' },
  '614': { name: 'Power of Attorney Supplement', price: 99, description: 'Financial and Healthcare Power of Attorney documents.' },
  '673': { name: 'Will-Based Estate Plan', price: 199, description: 'Control your legacy with a comprehensive will-based estate plan.' },
  '676': { name: 'Trust-Based Estate Plan', price: 399, description: 'Avoid probate and transfer assets smoothly with a trust.' },
};

const Checkout: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const productId = searchParams.get('product') || '';
  const formType = searchParams.get('type') || 'solo';
  const product = PRODUCTS[productId];

  useEffect(() => {
    if (!product) {
      navigate('/');
    }
  }, [product, navigate]);

  const handleCheckout = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.post<{ sessionId: string; url: string }>('/stripe/create-checkout-session', {
        productId: parseInt(productId),
        formType,
      });

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

  if (!product) {
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

              <div
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
                  <h3 style={{ fontSize: '18px', marginBottom: '5px' }}>{product.name}</h3>
                  <p style={{ color: '#707070', fontSize: '14px', margin: 0 }}>{product.description}</p>
                  {formType === '2person' && (
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
                  ${product.price}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '18px',
                  fontWeight: 'bold',
                }}
              >
                <span>Total</span>
                <span style={{ color: '#004d71' }}>${product.price}</span>
              </div>
            </div>

            {/* What's Included */}
            <div
              style={{
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '30px',
              }}
            >
              <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>What's Included:</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#555' }}>
                <li style={{ marginBottom: '8px' }}>Professionally drafted legal documents</li>
                <li style={{ marginBottom: '8px' }}>Easy online questionnaire</li>
                <li style={{ marginBottom: '8px' }}>Documents ready within 3 business days</li>
                <li style={{ marginBottom: '8px' }}>Download from your account dashboard</li>
                <li style={{ marginBottom: '0' }}>30-day money-back guarantee</li>
              </ul>
            </div>

            {/* Checkout Button */}
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
