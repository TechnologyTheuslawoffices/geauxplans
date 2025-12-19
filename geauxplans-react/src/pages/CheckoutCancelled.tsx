import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const CheckoutCancelled: React.FC = () => {
  const navigate = useNavigate();

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
            {/* Cancelled Icon */}
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#fff3cd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 30px',
              }}
            >
              <i className="fas fa-times" style={{ fontSize: '40px', color: '#856404' }}></i>
            </div>

            <h1 style={{ marginBottom: '15px' }}>Payment Cancelled</h1>
            <p style={{ color: '#707070', marginBottom: '30px' }}>
              Your payment was cancelled. No charges were made to your account.
            </p>

            <div
              style={{
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '30px',
              }}
            >
              <p style={{ margin: 0, color: '#555', fontSize: '14px' }}>
                If you experienced any issues during checkout, please contact our support team.
                We're here to help!
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <button
                onClick={() => navigate(-1)}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                <i className="fas fa-redo me-2"></i>
                Try Again
              </button>

              <Link to="/" className="btn btn-outline-secondary" style={{ width: '100%' }}>
                Return Home
              </Link>
            </div>

            <p style={{ marginTop: '30px', fontSize: '14px', color: '#707070' }}>
              <strong>Need help?</strong> Call us at +1 (855) 213-6300
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default CheckoutCancelled;
