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

interface UpsellOffer {
  eligible: boolean;
  productName?: string;
  regularPrice?: number;
  offerPrice?: number;
  interval?: string;
}

const CheckoutSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [offer, setOffer] = useState<UpsellOffer | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [offerAccepted, setOfferAccepted] = useState(false);

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

  // Fetched separately from the order details, and deliberately not awaited
  // alongside them: whether we can advertise an add-on must never delay or
  // block the confirmation of a payment the customer has already made.
  useEffect(() => {
    if (!sessionId) return;
    api
      .get<UpsellOffer>(`/stripe/upsell/${sessionId}`)
      .then(r => {
        if (r.success && r.data?.eligible) setOffer(r.data);
      })
      .catch(() => {
        /* no offer shown */
      });
  }, [sessionId]);

  const acceptOffer = async () => {
    if (!sessionId) return;
    setOfferBusy(true);
    setOfferError('');

    const response = await api.post<{ subscriptionId: string }>(
      `/stripe/upsell/${sessionId}/accept`,
      {}
    );

    if (response.success) {
      setOfferAccepted(true);
    } else {
      setOfferError(response.error || 'We could not add the Legal Edge Plan.');
    }
    setOfferBusy(false);
  };

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

            {/*
              One-click add-on, ported from the WooFunnels upsell. It sits after
              the order confirmation, not before it: the purchase the customer
              made is settled and acknowledged first, and this is plainly a
              separate, optional charge.
            */}
            {offerAccepted ? (
              <div
                style={{
                  backgroundColor: '#d4edda',
                  border: '1px solid #b7dfc2',
                  borderRadius: '8px',
                  padding: '20px 25px',
                  marginBottom: '30px',
                  textAlign: 'left',
                }}
              >
                <h3 style={{ fontSize: '16px', margin: '0 0 8px', color: '#1f7a3f' }}>
                  <i className="fas fa-check-circle me-2"></i>
                  Legal Edge Plan added
                </h3>
                <p style={{ margin: 0, color: '#555', fontSize: '14px' }}>
                  Charged to the same card. You can cancel anytime from My Account.
                </p>
              </div>
            ) : offer ? (
              <div
                style={{
                  border: '2px solid #004d71',
                  borderRadius: '8px',
                  padding: '25px',
                  marginBottom: '30px',
                  textAlign: 'left',
                }}
              >
                <h3 style={{ fontSize: '20px', margin: '0 0 6px' }}>
                  Add the {offer.productName} for{' '}
                  <span style={{ color: '#004d71' }}>${offer.offerPrice?.toFixed(2)}</span>/
                  {offer.interval}
                </h3>
                <p style={{ color: '#707070', fontSize: '14px', margin: '0 0 15px' }}>
                  Normally ${offer.regularPrice?.toFixed(2)}/{offer.interval} — a one-time discount
                  for adding it to this order.
                </p>
                <ul style={{ color: '#555', fontSize: '14px', paddingLeft: '20px', margin: '0 0 20px' }}>
                  <li>Unlimited revisions to your documents, forever</li>
                  <li>100% credit of your GeauxPlans fee toward an Advanced Estate Plan</li>
                  <li>An annual checkup to confirm your plan still fits</li>
                </ul>

                {offerError && (
                  <p style={{ color: '#c0392b', fontSize: '14px', margin: '0 0 12px' }} role="alert">
                    {offerError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={acceptOffer}
                  disabled={offerBusy}
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', padding: '14px', fontSize: '17px' }}
                >
                  {offerBusy ? 'Adding…' : `Yes, add it for $${offer.offerPrice?.toFixed(2)}/${offer.interval}`}
                </button>
                {/*
                  Says what the click does before it happens. The card is
                  already on file, so there is no payment form to make that
                  obvious on its own.
                */}
                <p style={{ color: '#707070', fontSize: '12px', margin: '10px 0 0', textAlign: 'center' }}>
                  Billed to the card you just used. Cancel anytime.
                </p>
              </div>
            ) : null}

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
                    Legal Edge Plan Activated!
                  </h3>
                  <p style={{ margin: 0, color: '#555', fontSize: '14px' }}>
                    Your Legal Edge Plan subscription is now active. You have unlimited revisions to your
                    GeauxPlan, an Advanced Estate Plan upgrade credit, and an annual review with an
                    affiliated law firm. You may cancel anytime.
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
