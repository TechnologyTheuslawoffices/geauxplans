import React from 'react';
import { Link } from 'react-router-dom';

// Mock data for business entities - in a real app, this would come from an API
const mockCompanies: any[] = [];

const BusinessPlanning: React.FC = () => {
  const hasCompanies = mockCompanies.length > 0;

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>My Companies</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        View and manage your business planning documents and company formations below.
      </p>

      {hasCompanies ? (
        <div>
          {mockCompanies.map((company) => (
            <div
              key={company.id}
              style={{
                border: '1px solid #eaeaea',
                borderRadius: '8px',
                padding: '25px',
                marginBottom: '20px',
              }}
            >
              <h3>{company.name}</h3>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #eaeaea',
          }}
        >
          <i className="fas fa-building" style={{ fontSize: '48px', color: '#ccc', marginBottom: '20px', display: 'block' }}></i>
          <h3 style={{ marginBottom: '10px' }}>No Business Entities Yet</h3>
          <p style={{ color: '#707070', marginBottom: '20px' }}>
            You haven't set up any business entities yet.
          </p>
          <Link to="/contact" className="btn btn-primary">
            Contact Us to Get Started
          </Link>
        </div>
      )}

      <div
        style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#e8f4f8',
          borderRadius: '8px',
          borderLeft: '4px solid #004d71',
        }}
      >
        <h4 style={{ marginBottom: '10px', color: '#004d71' }}>
          <i className="fas fa-briefcase" style={{ marginRight: '10px' }}></i>
          Business Planning Services
        </h4>
        <p style={{ marginBottom: '15px', color: '#707070' }}>
          GeauxPlans offers comprehensive business planning services including LLC formation,
          operating agreements, and business succession planning.
        </p>
        <Link to="/contact" style={{ color: '#004d71', fontWeight: '600' }}>
          Learn More About Our Business Services <i className="fas fa-arrow-right" style={{ marginLeft: '5px' }}></i>
        </Link>
      </div>
    </div>
  );
};

export default BusinessPlanning;
