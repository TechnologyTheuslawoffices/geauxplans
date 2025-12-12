import React from 'react';
import { Link } from 'react-router-dom';

interface DashboardProps {
  userEmail?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ userEmail = 'user@example.com' }) => {
  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Welcome back!</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        From your account dashboard you can view your recent orders, manage your estate planning
        documents, and edit your account details.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
        }}
      >
        <div
          style={{
            padding: '30px',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#e8f4f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 15px'
          }}>
            <i className="fas fa-file-alt" style={{ fontSize: '24px', color: '#004d71' }}></i>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>My Estate Plans</h3>
          <p style={{ color: '#707070', fontSize: '14px' }}>
            View and manage your estate planning documents
          </p>
          <Link
            to="/my-account/estate-planning"
            className="btn btn-primary"
            style={{ marginTop: '15px' }}
          >
            View Plans
          </Link>
        </div>

        <div
          style={{
            padding: '30px',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#e8f4f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 15px'
          }}>
            <i className="fas fa-building" style={{ fontSize: '24px', color: '#004d71' }}></i>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>My Companies</h3>
          <p style={{ color: '#707070', fontSize: '14px' }}>
            View and manage your business entities
          </p>
          <Link
            to="/my-account/business-planning"
            className="btn btn-primary"
            style={{ marginTop: '15px' }}
          >
            View Companies
          </Link>
        </div>

        <div
          style={{
            padding: '30px',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#e8f4f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 15px'
          }}>
            <i className="fas fa-shopping-bag" style={{ fontSize: '24px', color: '#004d71' }}></i>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Orders</h3>
          <p style={{ color: '#707070', fontSize: '14px' }}>
            View your order history and status
          </p>
          <Link
            to="/my-account/orders"
            className="btn btn-primary"
            style={{ marginTop: '15px' }}
          >
            View Orders
          </Link>
        </div>

        <div
          style={{
            padding: '30px',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#e8f4f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 15px'
          }}>
            <i className="fas fa-user-edit" style={{ fontSize: '24px', color: '#004d71' }}></i>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Profile</h3>
          <p style={{ color: '#707070', fontSize: '14px' }}>
            Update your account information
          </p>
          <Link
            to="/my-account/edit-account"
            className="btn btn-primary"
            style={{ marginTop: '15px' }}
          >
            Edit Profile
          </Link>
        </div>
      </div>

      {/* Legal Edge Plan Sidebar - shown on dashboard */}
      <div
        style={{
          marginTop: '40px',
          padding: '25px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          border: '1px solid #eaeaea',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '10px', textAlign: 'center' }}>Legal Edge Plan</h3>
        <p style={{ textAlign: 'center', color: '#707070', fontSize: '14px', marginBottom: '20px' }}>
          <em>Premium Membership with Benefits</em>
        </p>
        <hr style={{ borderColor: '#eaeaea', margin: '20px 0' }} />
        <h4 style={{ textAlign: 'center', margin: '20px 0' }}>
          <span style={{ color: '#707070' }}>$</span>
          <span style={{ fontSize: '32px', color: '#004d71' }}>29</span>
          <span style={{ color: '#707070' }}>/month</span>
        </h4>
        <hr style={{ borderColor: '#eaeaea', margin: '20px 0' }} />
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0' }}>
          <li style={{ padding: '8px 0', display: 'flex', alignItems: 'flex-start' }}>
            <i className="fas fa-check" style={{ color: '#28a745', marginRight: '10px', marginTop: '3px' }}></i>
            <span>Unlimited revisions to your GeauxPlan Documents</span>
          </li>
          <li style={{ padding: '8px 0', display: 'flex', alignItems: 'flex-start' }}>
            <i className="fas fa-check" style={{ color: '#28a745', marginRight: '10px', marginTop: '3px' }}></i>
            <span>A full 100% credit of your base GeauxPlans fee</span>
          </li>
          <li style={{ padding: '8px 0', display: 'flex', alignItems: 'flex-start' }}>
            <i className="fas fa-check" style={{ color: '#28a745', marginRight: '10px', marginTop: '3px' }}></i>
            <span>Annual check-up meeting</span>
          </li>
        </ul>
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: '15px' }}>
          Become a Member
        </button>
        <p style={{ textAlign: 'center', fontSize: '14px', margin: 0 }}>
          <Link to="/legal-edge-plan" style={{ color: '#ea3200', textDecoration: 'underline' }}>
            Learn more
          </Link>{' '}
          about membership
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
