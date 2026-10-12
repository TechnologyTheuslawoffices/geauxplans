import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Order history.
 *
 * There is no server-side order store in production yet (purchases are recorded
 * as plans/subscriptions, not as "orders"), so rather than show fabricated rows
 * with a dead "View" button this points the customer to where their real
 * purchases live — their plans and document downloads under Estate Plan.
 */
const Orders: React.FC = () => {
  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Order History</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        Your purchased plans and document downloads live under Estate Plan.
      </p>

      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #eaeaea',
        }}
      >
        <i className="fas fa-shopping-bag" style={{ fontSize: '48px', color: '#1a1acc', marginBottom: '20px', display: 'block' }}></i>
        <h3 style={{ marginBottom: '10px' }}>No orders to show here</h3>
        <p style={{ color: '#707070', marginBottom: '25px' }}>
          When you buy a plan, it&rsquo;s added to your account with its documents. You can view and
          download everything under Estate Plan.
        </p>
        <Link to="/my-account/my-estate-planning" className="btn btn-primary">
          Go to My Plans
        </Link>
      </div>

      <div
        style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
        }}
      >
        <h4 style={{ marginBottom: '15px' }}>
          <i className="fas fa-question-circle" style={{ marginRight: '10px', color: '#004d71' }}></i>
          Need Help With an Order?
        </h4>
        <p style={{ color: '#707070', marginBottom: '0' }}>
          If you have questions about a purchase, please{' '}
          <Link to="/contact" style={{ color: '#004d71', fontWeight: '600' }}>
            contact our support team
          </Link>
          . We&rsquo;re here Monday through Friday, 8am&ndash;5pm CST.
        </p>
      </div>
    </div>
  );
};

export default Orders;
