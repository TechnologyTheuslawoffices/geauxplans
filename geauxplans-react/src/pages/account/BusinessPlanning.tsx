import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listBusinessPlans, BusinessPlan, BusinessIncludes, BusinessDocument } from '../../services/businessPlanService';

// What each purchase can unlock, in the order the card lists it.
const INCLUDE_LABELS: Array<{ key: keyof BusinessIncludes; label: string }> = [
  { key: 'registration', label: 'LLC registration with the Louisiana Secretary of State' },
  { key: 'operatingAgreement', label: 'Operating Agreement' },
  { key: 'ein', label: 'EIN (federal tax ID)' },
  { key: 'licenses', label: 'Business licenses' },
  { key: 'registeredAgent', label: 'GeauxPlans registered agent' },
];

function openDocument(doc: BusinessDocument) {
  if (doc.storedUrl) {
    window.open(doc.storedUrl, '_blank', 'noopener');
    return;
  }
  if (!doc.base64) return;
  const bytes = Uint8Array.from(atob(doc.base64), (c) => c.charCodeAt(0));
  const type = /\.pdf$/i.test(doc.name)
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A business plan belongs to an entity, so My Companies is organised by the
 * company's name — never by a set number. Every purchase for the same LLC
 * stacks under one company, and the selector shows one company at a time.
 * "Acme Widgets, LLC", "acme widgets llc" and "Acme Widgets L.L.C." are the
 * same company.
 */
function companyKey(plan: BusinessPlan): string {
  const key = (plan.llcName || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+(llc|l l c|limited liability company)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return key || `unnamed-${plan.id}`;
}

interface Company {
  key: string;
  name: string;
  plans: BusinessPlan[];
  includes: BusinessIncludes;
}

function groupByCompany(plans: BusinessPlan[]): Company[] {
  const byKey = new Map<string, Company>();
  for (const plan of plans) {
    const key = companyKey(plan);
    let company = byKey.get(key);
    if (!company) {
      company = {
        key,
        name: plan.llcName || 'Your new LLC',
        plans: [],
        includes: { registration: false, operatingAgreement: false, ein: false, licenses: false, registeredAgent: false },
      };
      byKey.set(key, company);
    }
    company.plans.push(plan);
    for (const k of Object.keys(company.includes) as Array<keyof BusinessIncludes>) {
      company.includes[k] = company.includes[k] || Boolean(plan.includes[k]);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// The last company viewed, remembered per browser. Storage can be blocked
// (private windows), so every access is guarded and the page works without it.
const SELECTED_KEY = 'gpx_selected_company';
function readSelected(): string {
  try { return window.localStorage.getItem(SELECTED_KEY) || ''; } catch { return ''; }
}
function writeSelected(key: string) {
  try { window.localStorage.setItem(SELECTED_KEY, key); } catch { /* ignore */ }
}

const BusinessPlanning: React.FC = () => {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<BusinessPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
    listBusinessPlans(headers)
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setCompanies(res.data);
        else if (!res.success) setError(res.error || 'Could not load your companies.');
      })
      .catch(() => setError('Could not load your companies.'))
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  const grouped = groupByCompany(companies);
  const hasCompanies = grouped.length > 0;
  const [selectedKey, setSelectedKey] = useState<string>(readSelected);
  const selected = grouped.find((c) => c.key === selectedKey) || grouped[0];
  const selectCompany = (key: string) => {
    setSelectedKey(key);
    writeSelected(key);
  };
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

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p style={{ color: '#707070' }}><i className="fas fa-spinner fa-spin me-2"></i>Loading your companies…</p>
      ) : hasCompanies && selected ? (
        <div>
          <div className="mb-4">
            <label htmlFor="company-select" className="form-label" style={{ fontWeight: 600 }}>
              Business
            </label>
            <select
              id="company-select"
              className="form-select"
              value={selected.key}
              onChange={(e) => selectCompany(e.target.value)}
              style={{ maxWidth: '480px' }}
            >
              {grouped.map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
          </div>

          <div
            style={{
              border: '1px solid #eaeaea',
              borderRadius: '8px',
              padding: '25px',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ marginBottom: '4px' }}>{selected.name}</h3>
            <p style={{ color: '#707070', marginBottom: '15px' }}>
              {selected.includes.registration ? 'New LLC' : 'Existing LLC'}
              {` · ${selected.plans.length} purchase${selected.plans.length === 1 ? '' : 's'}`}
            </p>

            <ul style={{ listStyle: 'none', paddingLeft: 0, marginBottom: 0 }}>
              {INCLUDE_LABELS.map(({ key, label }) => (
                <li key={key} style={{ color: selected.includes[key] ? '#1d1d1f' : '#a0a0a0', marginBottom: '4px' }}>
                  <i
                    className={`fas ${selected.includes[key] ? 'fa-check-circle' : 'fa-lock'} me-2`}
                    style={{ color: selected.includes[key] ? '#2e7d32' : '#a0a0a0' }}
                  ></i>
                  {label}
                  {!selected.includes[key] && ' (not included)'}
                </li>
              ))}
            </ul>
          </div>

          {selected.plans.map((plan) => {
            const completed = plan.submissionStatus === 'completed';
            const docs = plan.documents || [];
            const services = [
              plan.includes.registration && 'LLC filing',
              plan.includes.ein && 'EIN',
              plan.includes.licenses && 'licensing',
            ].filter(Boolean);
            return (
              <div
                key={plan.id}
                style={{
                  border: '1px solid #eaeaea',
                  borderLeft: '4px solid #004d71',
                  borderRadius: '8px',
                  padding: '20px 25px',
                  marginBottom: '15px',
                }}
              >
                <h4 style={{ marginBottom: '4px' }}>{plan.tierLabel}</h4>
                <p style={{ color: '#707070', marginBottom: '12px' }}>
                  Purchased {new Date(plan.createdAt).toLocaleDateString()}
                </p>

                <p style={{ marginBottom: '15px' }}>
                  <span className="gpx_highlight">Status:</span>{' '}
                  {completed ? 'Interview complete' : 'Interview not finished'}
                  {plan.canEdit
                    ? ` · ${plan.daysRemaining} day${plan.daysRemaining === 1 ? '' : 's'} left to edit`
                    : ' · Editing period ended'}
                </p>

                {plan.canEdit && (
                  <Link to={`/business-plan/${plan.id}`} className="btn btn-primary">
                    {completed ? 'Review or edit answers' : 'Continue company interview'}
                  </Link>
                )}

                {plan.includes.operatingAgreement && completed && (
                  <div style={{ marginTop: '15px' }}>
                    <span className="gpx_highlight">Documents:</span>
                    {docs.length === 0 ? (
                      <p style={{ color: '#707070', margin: '6px 0 0' }}>
                        {plan.documentStatus === 'failed'
                          ? 'We could not prepare your Operating Agreement. Please reopen the interview and save again, or contact us.'
                          : 'Your Operating Agreement is being prepared.'}
                      </p>
                    ) : (
                      <ol className="gpx_ep_documents_ul" style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                        {docs.map((doc) => (
                          <li key={doc.name}>
                            <button type="button" className="btn btn-link p-0" onClick={() => openDocument(doc)}>
                              {doc.name}
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {services.length > 0 && completed && (
                  <p style={{ color: '#707070', marginTop: '15px', marginBottom: 0 }}>
                    Our team handles your {services.join(', ')} from your answers and will
                    contact you with updates.
                  </p>
                )}
              </div>
            );
          })}

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
