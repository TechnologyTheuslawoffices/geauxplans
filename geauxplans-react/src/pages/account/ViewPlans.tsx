import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import api from '../../services/api';
import './ViewPlans.css';

// Product configurations for modal
const PRODUCT_CONFIG: Record<string, {
  name: string;
  description: string;
  productId: number;
  soloPrice: number;
  couplePrice: number;
  avgTime: string;
}> = {
  powerOfAttorneyForm: {
    name: 'Power of Attorney Plan',
    description: 'Create durable powers of attorney and other important documents for your college student, an aging parent, or any other person you need to assist if something happens.',
    productId: 614,
    soloPrice: 99,
    couplePrice: 149,
    avgTime: '5 minutes',
  },
  trustBasedEstatePlanSolo: {
    name: 'Trust-Based Estate Plan',
    description: 'Create a comprehensive trust-based estate plan to avoid probate and ensure your assets are distributed according to your wishes.',
    productId: 676,
    soloPrice: 399,
    couplePrice: 499,
    avgTime: '15 minutes',
  },
  willBasedEstatePlan: {
    name: 'Will-Based Estate Plan',
    description: 'Create a will-based estate plan with essential documents to protect your family and control your legacy.',
    productId: 673,
    soloPrice: 199,
    couplePrice: 299,
    avgTime: '10 minutes',
  },
  minorChildEstatePlan: {
    name: 'Minor Child-Centered Estate Plan',
    description: 'Protect your children with guardian nominations and children\'s trusts to ensure they are cared for if something happens to you.',
    productId: 606,
    soloPrice: 199,
    couplePrice: 299,
    avgTime: '10 minutes',
  },
};

// Form type configurations
const FORM_TYPES: Record<string, { name: string; description: string }> = {
  powerOfAttorneyForm: { name: 'Power of Attorney Plan', description: 'Financial and healthcare POA documents' },
  powerOfAttorneyForm2Person: { name: 'Power of Attorney Plan', description: 'Financial and healthcare POA documents' },
  trustBasedEstatePlanSolo: { name: 'Trust-Based Estate Plan', description: 'Comprehensive trust-based planning' },
  trustBasedEstatePlan2Person: { name: 'Trust-Based Estate Plan', description: 'Comprehensive trust-based planning' },
  willBasedEstatePlan: { name: 'Will-Based Estate Plan', description: 'Essential will and POA documents' },
  willBasedEstatePlan2Person: { name: 'Will-Based Estate Plan', description: 'Essential will and POA documents' },
  minorChildEstatePlan: { name: 'Minor Child-Centered Estate Plan', description: 'Guardian nominations and children\'s trusts' },
  minorChildEstatePlan2Person: { name: 'Minor Child-Centered Estate Plan', description: 'Guardian nominations and children\'s trusts' },
};

// Status colors matching WordPress
const STATUS_COLORS: Record<string, string> = {
  'Not Started': '#999',
  'In Progress': '#ff9900',
  'Submitted': '#666',
  'Processing': '#ff9900',
  'Action Needed': '#c0392b',
  'Complete': '#0000ff',
};

interface KnacklyDocument {
  id?: string;
  name: string;
  url?: string;         // Direct URL from Knackly
  publicUrl?: string;   // Public URL from Knackly
  type?: string;
  base64?: string;      // Full base64 data (only when fetching individual docs)
  storedUrl?: string;   // External storage URL (Supabase)
  hasData?: boolean;    // Summary flag from list endpoint
}

interface ApiSubmission {
  id: number;
  formType: string;
  submissionStatus: 'inprogress' | 'completed';
  formData: any;
  knacklyRecordId?: string;
  knacklyStatus?: string;
  knacklyDocuments?: KnacklyDocument[];
  knacklyZipUrl?: string;
  // Answers the server still needs before it will draft. Recomputed on every
  // read from the stored form data, so it always describes the plan as it
  // currently stands rather than as it stood at the last save.
  documentBlockers?: string[];
  createdAt: string;
  updatedAt: string;
  firstSubmittedAt?: string;
  // Access control fields
  canEdit?: boolean;
  daysRemaining?: number;
  accessMessage?: string;
  hasSubscription?: boolean;
}

interface AllProducts {
  id: number;
  name: string;
  price: number;
  shortDescription: string;
  url: string;
  formType: string;
}

// Available products - users can purchase multiple times
// Users select 1 or 2 persons on the product page before checkout
const allProducts: AllProducts[] = [
  { id: 614, name: 'Power of Attorney Plan', price: 99, shortDescription: 'Financial and healthcare POA documents', url: '/power-of-attorney-plan', formType: 'powerOfAttorneyForm' },
  { id: 676, name: 'Trust-Based Estate Plan', price: 399, shortDescription: 'Comprehensive trust-based planning', url: '/trust-based-estate-plan', formType: 'trustBasedEstatePlanSolo' },
  { id: 673, name: 'Will-Based Estate Plan', price: 199, shortDescription: 'Essential will and POA documents', url: '/will-based-estate-plan', formType: 'willBasedEstatePlan' },
  { id: 606, name: 'Minor Child-Centered Estate Plan', price: 199, shortDescription: 'Guardian nominations and children\'s trusts', url: '/minor-child-centered-estate-plan', formType: 'minorChildEstatePlan' },
];

// Form type mapping for matching submissions to products
const PRODUCT_FORM_TYPES: Record<string, string[]> = {
  powerOfAttorneyForm: ['powerOfAttorneyForm', 'powerOfAttorneyForm2Person'],
  trustBasedEstatePlanSolo: ['trustBasedEstatePlanSolo', 'trustBasedEstatePlan2Person'],
  willBasedEstatePlan: ['willBasedEstatePlan', 'willBasedEstatePlan2Person'],
  minorChildEstatePlan: ['minorChildEstatePlan', 'minorChildEstatePlan2Person'],
};

const ViewPlans: React.FC = () => {
  const { session } = useAuth();
  const { addEstatePlan } = useCart();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  // Keyed by submission id: this page lists every plan the client owns, so an
  // unkeyed message would appear under all of them at once.
  const [refreshError, setRefreshError] = useState<{ id: number; message: string } | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [numPersons, setNumPersons] = useState<'1' | '2'>('1');
  const [subscribeLEP, setSubscribeLEP] = useState<'1' | '0'>('1');
  // Cache for full document data (fetched on demand)
  const [documentCache, setDocumentCache] = useState<Record<number, KnacklyDocument[]>>({});

  useEffect(() => {
    if (session) {
      fetchSubmissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // No auto-refresh - let user click the button to avoid flickering
  // Poll every 30 seconds ONLY if there are submissions with knacklyStatus === 'processing'
  useEffect(() => {
    const hasProcessing = submissions.some(sub => {
      return sub.submissionStatus === 'completed' &&
        sub.knacklyRecordId && sub.knacklyStatus === 'processing';
    });

    if (hasProcessing && !refreshing && !loading) {
      const intervalId = setInterval(() => {
        console.log('Polling for document updates...');
        fetchSubmissions();
      }, 30000); // Poll every 30 seconds

      return () => clearInterval(intervalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, refreshing, loading]);

  // Get auth headers using the session token from context
  const getAuthHeaders = (): Record<string, string> => {
    if (session?.access_token) {
      return { 'Authorization': `Bearer ${session.access_token}` };
    }
    return {};
  };

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      // Pass token from context directly in headers
      const response = await api.get('/submissions', getAuthHeaders());
      if (response.success && response.data) {
        // Ensure data is an array
        const data = Array.isArray(response.data) ? response.data :
                     (response.data.submissions ? response.data.submissions : []);
        setSubmissions(data);
      }
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
      setSubmissions([]); // Reset to empty array on error
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  };

  const refreshDocuments = async (submissionId: number) => {
    setRefreshing(submissionId);
    setRefreshError(null);
    try {
      // Pass token from context directly in headers
      const response = await api.post(`/submissions/${submissionId}/refresh-documents`, {}, getAuthHeaders());
      console.log('Refresh response:', response);

      if (response.success) {
        // Show debug info
        const data = response.data as any;
        if (data?.debug) {
          console.log('Debug info:', data.debug);
        }
        // Re-fetch all submissions to get updated data
        await fetchSubmissions();

        // Log the message but don't show an alert (too disruptive for auto-refresh)
        if (response.message) {
          console.log('Refresh result:', response.message);
        }
      } else {
        // /refresh-documents answers 200 with success:false and a real
        // explanation when generation is refused. Logging it to the console was
        // the only place that explanation went, so pressing Generate Documents
        // appeared to do nothing at all.
        console.error('Refresh documents failed:', response.error);
        setRefreshError({
          id: submissionId,
          message: response.error || 'Documents could not be generated.',
        });
      }
    } catch (error) {
      console.error('Failed to refresh documents:', error);
      setRefreshError({
        id: submissionId,
        message: 'Could not reach the document service. Please try again.',
      });
    } finally {
      setRefreshing(null);
    }
  };

  // Download all documents as ZIP from our backend
  const downloadAllDocuments = async (submissionId: number, clientName: string) => {
    setDownloading(submissionId);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiUrl}/submissions/${submissionId}/download-all`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to download documents');
      }

      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clientName}_EstatePlan_${submissionId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download documents:', error);
      alert('Failed to download documents. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  // Fetch full documents with base64 data for a specific submission
  const fetchDocuments = async (submissionId: number): Promise<KnacklyDocument[]> => {
    // Check cache first
    if (documentCache[submissionId]) {
      return documentCache[submissionId];
    }

    try {
      const response = await api.get(`/submissions/${submissionId}/documents`, getAuthHeaders());
      if (response.success && response.data?.knacklyDocuments) {
        const docs = response.data.knacklyDocuments;
        setDocumentCache(prev => ({ ...prev, [submissionId]: docs }));
        return docs;
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
    return [];
  };

  // Download a document (fetches full data if needed)
  const downloadDocument = async (submissionId: number, docIndex: number, docName: string) => {
    try {
      const docs = await fetchDocuments(submissionId);
      const doc = docs[docIndex];

      if (doc?.base64) {
        const byteCharacters = atob(doc.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = docName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Try any available URL (storedUrl from Supabase, publicUrl/url from Knackly)
        const directUrl = doc?.storedUrl || doc?.publicUrl || doc?.url;
        if (directUrl) {
          window.open(directUrl, '_blank');
        } else {
          alert('Document not available yet. Please try refreshing.');
        }
      }
    } catch (error) {
      console.error('Failed to download document:', error);
      alert('Failed to download document. Please try again.');
    }
  };

  const getStatus = (submission: ApiSubmission | undefined): { text: string; color: string } => {
    if (!submission) {
      return { text: 'Not Started', color: STATUS_COLORS['Not Started'] };
    }

    if (submission.submissionStatus === 'completed') {
      if (submission.knacklyStatus === 'completed') {
        return { text: 'Complete', color: STATUS_COLORS['Complete'] };
      }
      // Answers are in, but the server would not draft from them. Reporting this
      // as 'Complete' — which is what both remaining branches used to do — is how
      // will-, minor- and trust-based plans came to sit on the dashboard looking
      // finished with no documents behind them.
      if ((submission.documentBlockers || []).length > 0 || submission.knacklyStatus === 'blocked') {
        return { text: 'Action Needed', color: STATUS_COLORS['Action Needed'] };
      }
      return { text: 'Processing', color: STATUS_COLORS['Processing'] };
    }

    return { text: 'In Progress', color: STATUS_COLORS['In Progress'] };
  };

  const renderDocumentsSection = (submission: ApiSubmission | undefined) => {
    if (!submission) {
      return (
        <>
          <p className="mb-0" style={{ lineHeight: '14px' }}>
            <span style={{ color: '#666' }}><em>Your documents:</em></span>
          </p>
          <p className="mb-0 mt-0"><strong>Not started</strong></p>
        </>
      );
    }

    if (submission.submissionStatus !== 'completed') {
      return (
        <>
          <p className="mb-0" style={{ lineHeight: '14px' }}>
            <span style={{ color: '#666' }}><em>Your documents:</em></span>
          </p>
          <p className="mb-0 mt-0"><strong>Interview Not Complete</strong></p>
        </>
      );
    }

    // Completed submission - show documents or processing message
    if (submission.knacklyStatus === 'completed') {
      const documents = submission.knacklyDocuments || [];

      if (documents.length > 0) {
        return (
          <>
            <p className="mb-0" style={{ lineHeight: '14px' }}>
              <span style={{ color: '#0000ff' }}><strong>Your documents:</strong></span>
            </p>
            <ol className="gpx_ep_documents_ul" style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              {documents.map((doc: any, index: number) => {
                const docName = doc.name || `Document ${index + 1}.docx`;
                // Check for any available URL (storedUrl from Supabase, publicUrl/url from Knackly)
                const directUrl = doc.storedUrl || doc.publicUrl || doc.url;

                // Use direct URL if available - direct link
                if (directUrl) {
                  return (
                    <li key={doc.id || index}>
                      <a
                        href={directUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {docName}
                      </a>
                    </li>
                  );
                }

                // Document has data (base64) - fetch on demand
                if (doc.hasData || doc.base64) {
                  return (
                    <li key={doc.id || index}>
                      <button
                        onClick={() => downloadDocument(submission.id, index, docName)}
                        style={{
                          cursor: 'pointer',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#0000ff',
                          textDecoration: 'underline',
                          font: 'inherit'
                        }}
                      >
                        {docName}
                      </button>
                    </li>
                  );
                }

                // No data yet - documents still processing
                return (
                  <li key={doc.id || index} style={{ color: '#999' }}>
                    {docName} <em>(processing...)</em>
                  </li>
                );
              })}
            </ol>
            <div className="mt-2 d-flex gap-2 flex-wrap">
              {submission.knacklyDocuments && submission.knacklyDocuments.length > 0 && (
                <button
                  onClick={() => downloadAllDocuments(
                    submission.id,
                    submission.formData?.personal_info?.first_name || 'Documents'
                  )}
                  disabled={downloading === submission.id}
                  className="btn btn-sm btn-primary"
                  style={{ fontSize: '12px' }}
                >
                  {downloading === submission.id ? '⏳ Downloading...' : '📦 Download All'}
                </button>
              )}
              <button
                onClick={() => refreshDocuments(submission.id)}
                disabled={refreshing === submission.id}
                className="btn btn-sm btn-outline-secondary"
                style={{ fontSize: '12px' }}
              >
                {refreshing === submission.id ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>
          </>
        );
      } else {
        // Complete but no documents array yet - need to fetch them
        const isRefreshing = refreshing === submission.id;
        return (
          <>
            <p className="mb-0" style={{ lineHeight: '14px' }}>
              <span style={{ color: '#0000ff' }}><strong>Your documents:</strong></span>
            </p>
            <p className="mb-0 mt-0">
              <strong style={{ color: '#ff9900' }}>
                Documents generated - click to download
              </strong>
            </p>
            <button
              onClick={() => refreshDocuments(submission.id)}
              disabled={isRefreshing}
              className="btn btn-sm btn-primary mt-2"
              style={{ fontSize: '12px' }}
            >
              {isRefreshing ? 'Fetching...' : '📥 Fetch Documents'}
            </button>
          </>
        );
      }
    }

    if (submission.knacklyRecordId) {
      const isRefreshing = refreshing === submission.id;
      return (
        <>
          <p className="mb-0" style={{ lineHeight: '14px' }}>
            <span style={{ color: '#666' }}><em>Your documents:</em></span>
          </p>
          <p className="mb-0 mt-0">
            <strong>
              Processing documents...<br />
              <span style={{ fontSize: '14px', color: '#ff9900', fontWeight: 'bold', lineHeight: '1.2' }}>
                Click refresh to check if documents are ready.<br />
              </span>
              <span style={{ fontSize: '14px', color: '#666', fontWeight: 'normal', lineHeight: '1' }}>
                Last checked: {lastRefreshed.toLocaleString()}
              </span>
            </strong>
          </p>
          <button
            onClick={() => refreshDocuments(submission.id)}
            disabled={isRefreshing}
            className="btn btn-sm btn-outline-primary mt-2"
            style={{ fontSize: '12px' }}
          >
            {isRefreshing ? 'Checking...' : '🔄 Refresh Documents'}
          </button>
        </>
      );
    }

    // Completed interview, no documents. Distinguish "not drafted yet" from
    // "we will not draft this" — both used to render the green "Interview
    // Complete - Ready to generate documents", so a plan the server had already
    // refused invited the client to press Generate and watch nothing happen.
    const blockers = submission.documentBlockers || [];
    if (blockers.length > 0) {
      return (
        <>
          <p className="mb-0" style={{ lineHeight: '14px' }}>
            <span style={{ color: '#0000ff' }}><strong>Your documents:</strong></span>
          </p>
          <p className="mb-0 mt-0">
            <strong style={{ color: '#c0392b' }}>
              A few answers are still needed
            </strong>
          </p>
          <ul style={{ fontSize: '13px', color: '#666', margin: '4px 0 0 0', paddingLeft: '20px' }}>
            {blockers.map((blocker, i) => (
              <li key={i}>{blocker}</li>
            ))}
          </ul>
          {submission.canEdit !== false && (
            <Link
              to={`/poa-form?type=${submission.formType}`}
              className="btn btn-sm btn-primary mt-2"
              style={{ fontSize: '12px' }}
            >
              Complete my plan
            </Link>
          )}
        </>
      );
    }

    return (
      <>
        <p className="mb-0" style={{ lineHeight: '14px' }}>
          <span style={{ color: '#0000ff' }}><strong>Your documents:</strong></span>
        </p>
        <p className="mb-0 mt-0">
          <strong style={{ color: '#28a745' }}>
            Interview Complete - Ready to generate documents
          </strong>
        </p>
        {refreshError?.id === submission.id && (
          <p className="mb-0 mt-1" style={{ fontSize: '13px', color: '#c0392b' }}>
            {refreshError.message}
          </p>
        )}
        <button
          onClick={() => refreshDocuments(submission.id)}
          disabled={refreshing === submission.id}
          className="btn btn-sm btn-primary mt-2"
          style={{ fontSize: '12px' }}
        >
          {refreshing === submission.id ? 'Starting...' : '📄 Generate Documents'}
        </button>
      </>
    );
  };

  const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  );

  // Get active plans (submissions that exist)
  // Match both solo and 2-person form types to the consolidated product
  const activePlans = submissions.map(s => {
    // Find product where this submission's form type is in the product's form types
    const product = allProducts.find(p => {
      const relatedFormTypes = PRODUCT_FORM_TYPES[p.formType] || [p.formType];
      return relatedFormTypes.includes(s.formType);
    });
    return { submission: s, product };
  }).filter(p => p.product);

  // Show all available products (users can purchase multiple times)
  const availableProducts = allProducts;

  if (loading) {
    return (
      <div className="view-plans-page">
        <h3 className="mb-4">Estate Planning</h3>
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2 text-muted">Loading your plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-plans-page">
      <h3 className="mb-4">Estate Planning</h3>

      {/* Active Plans Section */}
      <div>
        <p><span className="gpx_highlight">Active Plans:</span></p>
      </div>

      {activePlans.length > 0 ? (
        activePlans.map(({ submission, product }) => {
          const formConfig = FORM_TYPES[submission.formType];
          const status = getStatus(submission);

          return (
            <div key={submission.id} className="mb-4 mt-4">
              {/* Product Header */}
              <h5 className="mb-3">
                {product?.name || formConfig?.name}
              </h5>

              {/* Form Type Row */}
              <div
                className="d-block d-sm-flex flex-row align-items-center justify-content-between mb-3"
                style={{ paddingLeft: '20px', borderLeft: '3px solid #e0e0e0' }}
              >
                {/* Left Column - Plan Info */}
                <div className="col-12 col-sm-4">
                  <h6 className="mb-0">
                    {submission.canEdit !== false ? (
                      <>
                        <Link to={`/poa-form?type=${submission.formType}`}>
                          {formConfig?.name || submission.formType}
                        </Link>
                        <Link
                          to={`/poa-form?type=${submission.formType}`}
                          className="poa-edit-icon"
                          title="Edit/Start Form"
                          style={{ color: '#0000ff', textDecoration: 'none', marginLeft: '8px' }}
                        >
                          <EditIcon />
                        </Link>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#666' }}>
                          {formConfig?.name || submission.formType}
                        </span>
                        <span
                          style={{ color: '#999', marginLeft: '8px', cursor: 'not-allowed' }}
                          title="Edit period expired"
                        >
                          <EditIcon />
                        </span>
                      </>
                    )}
                  </h6>
                  <small style={{ color: '#999' }}>{formConfig?.description}</small>

                  {/* Access Warning */}
                  {submission.submissionStatus === 'completed' && submission.canEdit === false && (
                    <div className="mt-2" style={{ fontSize: '12px' }}>
                      <span style={{ color: '#dc3545' }}>
                        <i className="fas fa-lock me-1"></i>
                        Edit period expired
                      </span>
                      <Link
                        to="/checkout?product=1367"
                        className="ms-2"
                        style={{ color: '#007bff', fontSize: '12px' }}
                      >
                        Extend Access
                      </Link>
                    </div>
                  )}
                  {submission.submissionStatus === 'completed' && submission.canEdit !== false && submission.daysRemaining !== undefined && submission.daysRemaining <= 7 && submission.daysRemaining > 0 && (
                    <div className="mt-2" style={{ fontSize: '12px' }}>
                      <span style={{ color: '#ffc107' }}>
                        <i className="fas fa-clock me-1"></i>
                        {submission.daysRemaining} day{submission.daysRemaining !== 1 ? 's' : ''} left to edit
                      </span>
                    </div>
                  )}
                </div>

                {/* Middle Column - Status */}
                <div className="col-12 col-sm-2 text-start text-sm-end mt-2 mb-2 mt-sm-0 mb-sm-0" style={{ paddingRight: '20px' }}>
                  <p className="mb-0" style={{ lineHeight: '14px' }}>
                    <span style={{ color: '#666' }}><em>Status:</em></span>
                  </p>
                  <p className="mb-0 mt-0">
                    <strong style={{ color: status.color }}>{status.text}</strong>
                  </p>
                </div>

                {/* Right Column - Documents */}
                <div className="col-12 col-sm-6 text-start text-sm-end" style={{ paddingLeft: '20px', borderLeft: '1px solid #e0e0e0' }}>
                  {renderDocumentsSection(submission)}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="mb-4 p-4" style={{ backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <p className="text-muted mb-0">You haven't started any estate plans yet.</p>
          <Link to="/estate-planning" className="btn btn-primary mt-3">
            Browse Estate Plans
          </Link>
        </div>
      )}

      {/* Available Plans Section */}
      {availableProducts.length > 0 && (
        <>
          <hr />
          <div>
            <p><span className="gpx_highlight">Start a New Plan:</span></p>
          </div>

          {availableProducts.map((product, index) => (
            <div key={`${product.formType}-${index}`} className="mb-2">
              <button
                className="plan_not_purchased"
                onClick={() => {
                  setSelectedProduct(product.formType);
                  setNumPersons('1');
                  setSubscribeLEP('1');
                  setShowPurchaseModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {product.name}
              </button>
              <span className="ma_starting_at"> from ${product.price}</span>
              <br />
              <em style={{ color: '#666' }}>{product.shortDescription}</em>
            </div>
          ))}
        </>
      )}

      {/* Help Section */}
      <div className="mt-4 p-3" style={{ backgroundColor: '#e8f4f8', borderRadius: '8px', borderLeft: '4px solid #004d71' }}>
        <h6 style={{ color: '#004d71' }}>
          <i className="fas fa-info-circle me-2"></i>
          Need Help?
        </h6>
        <p className="mb-2 small text-muted">
          Questions about your estate plan? Our team is here to help.
        </p>
        <Link to="/contact" style={{ color: '#004d71', fontWeight: '600', fontSize: '14px' }}>
          Contact Support <i className="fas fa-arrow-right ms-1"></i>
        </Link>
      </div>

      {/* Purchase Modal */}
      {showPurchaseModal && selectedProduct && PRODUCT_CONFIG[selectedProduct] && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowPurchaseModal(false)}
        >
          <div
            className="modal-content purchase-modal"
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowPurchaseModal(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
              }}
            >
              &times;
            </button>

            <div className="text-center mb-4">
              <img
                src="https://geauxplans.com/wp-content/uploads/2022/01/Plan-Builder-Icon.png"
                alt="Plan Builder"
                style={{ width: '48px', marginBottom: '20px' }}
              />
              <h2 style={{ color: '#0000ff' }}>{PRODUCT_CONFIG[selectedProduct].name}</h2>
              <p className="text-muted fst-italic">
                {PRODUCT_CONFIG[selectedProduct].description}
              </p>
              <p className="mb-4">
                Average time to build a plan: <strong style={{ color: '#0000ff' }}>{PRODUCT_CONFIG[selectedProduct].avgTime}</strong>
              </p>
            </div>

            <h4 className="mb-3">Build your plan</h4>
            <p className="text-muted fst-italic mb-4">
              After the purchase at your convenience, you will answer a series of questions to prepare your documents.
            </p>

            <div className="mb-3">
              <label className="form-label"><strong>1.</strong> For how many people do you want to prepare documents?</label>
              <select
                className="form-select"
                value={numPersons}
                onChange={(e) => setNumPersons(e.target.value as '1' | '2')}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '16px',
                }}
              >
                <option value="1">For one person</option>
                <option value="2">For two people</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">
                <strong>2.</strong> Would you like to subscribe to the{' '}
                <a href="/legal-edge-plan" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                  Legal Edge Plan
                </a>{' '}
                for $9.99/month to be protected from any mistakes?
              </label>
              <select
                className="form-select"
                value={subscribeLEP}
                onChange={(e) => setSubscribeLEP(e.target.value as '1' | '0')}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '16px',
                }}
              >
                <option value="1">Yes, sure!</option>
                <option value="0">No, thank you</option>
              </select>
            </div>

            <div className="mb-4">
              <strong>Final Price:</strong>{' '}
              <strong style={{ fontSize: '1.25rem' }}>
                ${numPersons === '1' ? PRODUCT_CONFIG[selectedProduct].soloPrice : PRODUCT_CONFIG[selectedProduct].couplePrice}
                {subscribeLEP === '1' ? ' + $9.99/mo' : ''}
              </strong>
            </div>

            <button
              onClick={async () => {
                const config = PRODUCT_CONFIG[selectedProduct];
                const formType = numPersons === '1' ? 'solo' : '2person';
                await addEstatePlan(config.productId, formType, subscribeLEP === '1');
                setShowPurchaseModal(false);
                navigate('/checkout');
              }}
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
            >
              Purchase
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewPlans;
