import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Mock data for business entities - in a real app, this would come from an API
const mockCompanies: any[] = [];

const BusinessPlanning: React.FC = () => {
  const hasCompanies = mockCompanies.length > 0;
  // Mirrors the estate "Start a New Plan" collapse (ViewPlans): once the user
  // has companies, the plan options tuck behind a single button.
  const [showNewPlanOptions, setShowNewPlanOptions] = useState(false);

  const planOptions = (
    <div className="mt-3">
      <p><span className="gpx_highlight">Choose a plan:</span></p>
      <div className="mb-2">
        <Link to="/start-business-llc" className="plan_not_purchased" style={{ fontWeight: 600 }}>
          Start an LLC
        </Link>
        <span className="ma_starting_at"> from $89</span>
        <br />
        <em style={{ color: '#666' }}>Form a brand-new Louisiana LLC.</em>
      </div>
      <div>
        <Link to="/operating-agreement-llc" className="plan_not_purchased" style={{ fontWeight: 600 }}>
          Operating Agreement for LLC
        </Link>
        <span className="ma_starting_at"> from $149</span>
        <br />
        <em style={{ color: '#666' }}>Add an operating agreement to a company you already run.</em>
      </div>
    </div>
  );

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

          {/* Not empty: a single "Start a New Plan" button that reveals the
              options — same pattern as the estate plans list. */}
          <hr />
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={showNewPlanOptions}
            onClick={() => setShowNewPlanOptions((o) => !o)}
          >
            <i className="fas fa-plus me-2"></i>
            Start a New Plan
          </button>
          {showNewPlanOptions && planOptions}
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
          <i className="fas fa-building" style={{ fontSize: '48px', color: '#1a1acc', marginBottom: '20px', display: 'block' }}></i>
          <h3 style={{ marginBottom: '10px' }}>Start your first business plan</h3>
          <p style={{ color: '#707070', marginBottom: '25px' }}>
            You don't have any companies yet. Form a Louisiana LLC in minutes, or add an
            operating agreement to a company you already run.
          </p>
          {/* Empty: a single primary "Start a Business Plan" button, matching
              the estate empty state's single CTA. */}
          <Link to="/start-business-llc" className="btn btn-primary">
            Start a Business Plan
          </Link>
          <p style={{ marginTop: '15px', marginBottom: 0 }}>
            <Link to="/operating-agreement-llc" style={{ color: '#004d71', fontWeight: 600, fontSize: '14px' }}>
              or add an Operating Agreement &rarr;
            </Link>
          </p>
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
