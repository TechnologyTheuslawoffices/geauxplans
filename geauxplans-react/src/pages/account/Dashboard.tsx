import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

interface Plan {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  documents?: Document[];
}

interface Document {
  id: string;
  name: string;
  type: string;
  url?: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await api.get('/submissions');
        if (response.success && response.data) {
          setPlans(response.data);
        }
      } catch (error) {
        console.error('Error fetching plans:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '10px' }}>Welcome back, {user?.firstName || user?.displayName || 'User'}!</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        From your account dashboard you can view your active plans, access your documents, and manage your account.
      </p>

      {/* Your Documents Section */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{
          fontSize: '20px',
          marginBottom: '20px',
          paddingBottom: '10px',
          borderBottom: '2px solid #004d71'
        }}>
          Your Documents
        </h3>

        {loading ? (
          <p style={{ color: '#707070' }}>Loading your documents...</p>
        ) : plans.length > 0 && plans.some(p => p.documents && p.documents.length > 0) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {plans.flatMap(plan =>
              (plan.documents || []).map(doc => (
                <div
                  key={doc.id}
                  style={{
                    padding: '15px 20px',
                    border: '1px solid #eaeaea',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <i className="fas fa-file-pdf" style={{ fontSize: '24px', color: '#dc3545' }}></i>
                    <div>
                      <p style={{ margin: 0, fontWeight: '600' }}>{doc.name}</p>
                      <p style={{ margin: 0, color: '#707070', fontSize: '12px' }}>{doc.type}</p>
                    </div>
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn_geaux"
                      style={{ fontSize: '14px', padding: '8px 16px' }}
                    >
                      Download
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{
            padding: '30px',
            border: '1px dashed #ccc',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f9f9f9'
          }}>
            <i className="fas fa-folder-open" style={{ fontSize: '40px', color: '#ccc', marginBottom: '15px' }}></i>
            <p style={{ color: '#707070', marginBottom: '0' }}>
              Your documents will appear here once your plans are completed.
            </p>
          </div>
        )}
      </div>

      {/* Start New Plan Section */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{
          fontSize: '20px',
          marginBottom: '20px',
          paddingBottom: '10px',
          borderBottom: '2px solid #004d71'
        }}>
          Start a New Plan
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}>
          {/* Single Person POA */}
          <div style={{
            padding: '25px',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            backgroundColor: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <i className="fas fa-user" style={{ fontSize: '28px', color: '#004d71' }}></i>
              <div>
                <h4 style={{ margin: 0, fontSize: '18px' }}>Power of Attorney</h4>
                <span style={{ fontSize: '14px', color: '#707070' }}>Individual Plan</span>
              </div>
            </div>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '15px' }}>
              Create Financial & Healthcare Power of Attorney documents for one person.
            </p>
            <Link
              to="/checkout?product=614&type=solo"
              className="btn btn_geaux"
              style={{ width: '100%', textAlign: 'center' }}
            >
              Start Plan - $99
            </Link>
          </div>

          {/* Two Person POA */}
          <div style={{
            padding: '25px',
            border: '2px solid #004d71',
            borderRadius: '8px',
            backgroundColor: '#f8fbfc',
            position: 'relative',
          }}>
            <span style={{
              position: 'absolute',
              top: '-12px',
              left: '20px',
              backgroundColor: '#004d71',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
            }}>
              POPULAR
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <i className="fas fa-users" style={{ fontSize: '28px', color: '#004d71' }}></i>
              <div>
                <h4 style={{ margin: 0, fontSize: '18px' }}>Power of Attorney</h4>
                <span style={{ fontSize: '14px', color: '#707070' }}>Married / Couple Plan</span>
              </div>
            </div>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '15px' }}>
              Create POA documents for both spouses/partners with separate agents and directives.
            </p>
            <Link
              to="/checkout?product=614&type=2person"
              className="btn btn_geaux"
              style={{ width: '100%', textAlign: 'center' }}
            >
              Start Plan - $99
            </Link>
          </div>

          {/* Other Plans Link */}
          <div style={{
            padding: '25px',
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <i className="fas fa-th-large" style={{ fontSize: '28px', color: '#004d71', marginBottom: '15px' }}></i>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>More Estate Plans</h4>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '15px', textAlign: 'center' }}>
              Will-based, Trust-based, and Minor Child plans available.
            </p>
            <Link
              to="/estate-planning"
              className="btn btn-outline-primary"
              style={{ width: '100%', textAlign: 'center' }}
            >
              View All Plans
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{
          fontSize: '20px',
          marginBottom: '20px',
          paddingBottom: '10px',
          borderBottom: '2px solid #004d71'
        }}>
          Quick Actions
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '15px',
        }}>
          <Link
            to="/my-account/my-estate-planning"
            style={{
              padding: '20px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
              textAlign: 'center',
              textDecoration: 'none',
              color: 'inherit',
              backgroundColor: '#fff',
              transition: 'box-shadow 0.2s'
            }}
          >
            <i className="fas fa-file-alt" style={{ fontSize: '24px', color: '#004d71', marginBottom: '10px', display: 'block' }}></i>
            <span style={{ fontWeight: '600' }}>My Estate Plans</span>
          </Link>

          <Link
            to="/my-account/business-planning"
            style={{
              padding: '20px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
              textAlign: 'center',
              textDecoration: 'none',
              color: 'inherit',
              backgroundColor: '#fff',
              transition: 'box-shadow 0.2s'
            }}
          >
            <i className="fas fa-building" style={{ fontSize: '24px', color: '#004d71', marginBottom: '10px', display: 'block' }}></i>
            <span style={{ fontWeight: '600' }}>My Companies</span>
          </Link>

          <Link
            to="/my-account/orders"
            style={{
              padding: '20px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
              textAlign: 'center',
              textDecoration: 'none',
              color: 'inherit',
              backgroundColor: '#fff',
              transition: 'box-shadow 0.2s'
            }}
          >
            <i className="fas fa-shopping-bag" style={{ fontSize: '24px', color: '#004d71', marginBottom: '10px', display: 'block' }}></i>
            <span style={{ fontWeight: '600' }}>View Orders</span>
          </Link>

          <Link
            to="/my-account/edit-account"
            style={{
              padding: '20px',
              border: '1px solid #eaeaea',
              borderRadius: '8px',
              textAlign: 'center',
              textDecoration: 'none',
              color: 'inherit',
              backgroundColor: '#fff',
              transition: 'box-shadow 0.2s'
            }}
          >
            <i className="fas fa-user-edit" style={{ fontSize: '24px', color: '#004d71', marginBottom: '10px', display: 'block' }}></i>
            <span style={{ fontWeight: '600' }}>Edit Profile</span>
          </Link>
        </div>
      </div>

      {/* Need Help Section */}
      <div
        style={{
          padding: '25px',
          backgroundColor: '#e8f4f8',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Need Help?</h4>
        <p style={{ color: '#707070', marginBottom: '15px' }}>
          Our support team is here to assist you with any questions.
        </p>
        <p style={{ margin: '0' }}>
          <strong>Call us:</strong> +1 (855) 213-6300<br />
          <span style={{ fontSize: '14px', color: '#707070' }}>M-F, 8am-5pm CST</span>
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
