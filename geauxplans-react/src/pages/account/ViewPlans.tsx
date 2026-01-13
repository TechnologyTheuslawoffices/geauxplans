import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './ViewPlans.css';

// Form type configurations
const FORM_TYPES: Record<string, { name: string; description: string }> = {
  powerOfAttorneyForm: { name: 'Power of Attorney', description: 'Individual POA documents' },
  powerOfAttorneyForm2Person: { name: 'Power of Attorney 2 Persons', description: 'Couple POA documents' },
  trustBasedEstatePlanSolo: { name: 'Trust-Based Estate Plan', description: 'Individual trust documents' },
  trustBasedEstatePlan2Person: { name: 'Trust-Based Estate Plan for 2 Persons', description: 'Couple trust documents' },
  willBasedEstatePlan: { name: 'Will-Based Estate Plan', description: 'Will and related documents' },
  minorChildEstatePlan: { name: 'Minor-Child Centered Estate Plan', description: 'Guardian and trust provisions' },
};

// Status colors matching WordPress
const STATUS_COLORS: Record<string, string> = {
  'Not Started': '#999',
  'In Progress': '#ff9900',
  'Submitted': '#666',
  'Processing': '#ff9900',
  'Complete': '#0000ff',
};

interface Document {
  id: number;
  name: string;
  downloadUrl: string;
}

interface KnacklyDocument {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface ApiSubmission {
  id: number;
  formType: string;
  submissionStatus: 'inprogress' | 'completed';
  formData: any;
  knacklyRecordId?: string;
  knacklyStatus?: string;
  knacklyDocuments?: KnacklyDocument[];
  createdAt: string;
  updatedAt: string;
}

interface AllProducts {
  id: number;
  name: string;
  price: number;
  shortDescription: string;
  url: string;
  formType: string;
}

const allProducts: AllProducts[] = [
  { id: 614, name: 'Power of Attorney Plan', price: 299, shortDescription: 'Financial and healthcare POA documents', url: '/estate-planning', formType: 'powerOfAttorneyForm' },
  { id: 676, name: 'Trust-Based Estate Plan', price: 899, shortDescription: 'Comprehensive trust-based planning for individuals', url: '/estate-planning', formType: 'trustBasedEstatePlanSolo' },
  { id: 677, name: 'Trust-Based Estate Plan for 2 Persons', price: 1299, shortDescription: 'Comprehensive trust-based planning for couples', url: '/estate-planning', formType: 'trustBasedEstatePlan2Person' },
  { id: 673, name: 'Will-Based Estate Plan', price: 399, shortDescription: 'Essential will and POA documents', url: '/estate-planning', formType: 'willBasedEstatePlan' },
  { id: 606, name: 'Minor Child-Centered Estate Plan', price: 599, shortDescription: 'Guardian nominations and children\'s trusts', url: '/estate-planning', formType: 'minorChildEstatePlan' },
];

const ViewPlans: React.FC = () => {
  const { session } = useAuth();
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  useEffect(() => {
    if (session) {
      fetchSubmissions();
    }
  }, [session]);

  // Auto-refresh documents that are still processing
  useEffect(() => {
    const autoRefreshPending = async () => {
      for (const sub of submissions) {
        // Skip if not completed submission
        if (sub.submissionStatus !== 'completed') continue;

        // If has knacklyRecordId but not complete, or has documents missing storedUrl
        const needsRefresh =
          (sub.knacklyRecordId && sub.knacklyStatus !== 'complete') ||
          (sub.knacklyStatus === 'complete' && sub.knacklyDocuments?.some((doc: any) => !doc.storedUrl));

        if (needsRefresh && refreshing !== sub.id) {
          console.log(`Auto-refreshing documents for submission ${sub.id}...`);
          await refreshDocuments(sub.id);
        }
      }
    };

    // Run immediately if we have submissions
    if (submissions.length > 0 && !loading) {
      autoRefreshPending();
    }
  }, [submissions, loading]);

  // Poll every 10 seconds if any submission is still processing
  useEffect(() => {
    const hasProcessing = submissions.some(sub =>
      sub.submissionStatus === 'completed' &&
      ((sub.knacklyRecordId && sub.knacklyStatus !== 'complete') ||
       (sub.knacklyStatus === 'complete' && sub.knacklyDocuments?.some((doc: any) => !doc.storedUrl)))
    );

    if (hasProcessing && !refreshing) {
      const intervalId = setInterval(() => {
        console.log('Polling for document updates...');
        fetchSubmissions();
      }, 10000); // Poll every 10 seconds

      return () => clearInterval(intervalId);
    }
  }, [submissions, refreshing]);

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
        setSubmissions(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  };

  const refreshDocuments = async (submissionId: number) => {
    setRefreshing(submissionId);
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
        console.error('Refresh documents failed:', response.error);
        // Only show alert for manual refresh errors
      }
    } catch (error) {
      console.error('Failed to refresh documents:', error);
    } finally {
      setRefreshing(null);
    }
  };

  // Download document with authentication
  const downloadDocument = async (submissionId: number, docIndex: number, filename: string) => {
    const headers = getAuthHeaders();
    console.log('Download - Session:', session?.access_token ? 'exists' : 'missing');
    console.log('Download - Headers:', headers);

    try {
      const API_BASE = process.env.REACT_APP_API_URL || '/api';
      const url = `${API_BASE}/submissions/${submissionId}/download/${docIndex}`;
      console.log('Download URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });

      console.log('Download response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download error response:', errorText);
        try {
          const error = JSON.parse(errorText);
          alert(error.error || 'Failed to download document');
        } catch {
          alert('Failed to download document: ' + response.status);
        }
        return;
      }

      // Create blob and trigger download
      const blob = await response.blob();
      console.log('Blob size:', blob.size, 'type:', blob.type);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download document: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // View document in new tab with authentication
  const viewDocument = async (submissionId: number, docIndex: number) => {
    const headers = getAuthHeaders();
    console.log('View - Session:', session?.access_token ? 'exists' : 'missing');
    console.log('View - Headers:', headers);

    try {
      const API_BASE = process.env.REACT_APP_API_URL || '/api';
      const url = `${API_BASE}/submissions/${submissionId}/download/${docIndex}`;
      console.log('View URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });

      console.log('View response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('View error response:', errorText);
        try {
          const error = JSON.parse(errorText);
          alert(error.error || 'Failed to load document');
        } catch {
          alert('Failed to load document: ' + response.status);
        }
        return;
      }

      // Create blob URL and open in new tab
      const blob = await response.blob();
      console.log('Blob size:', blob.size, 'type:', blob.type);
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (error) {
      console.error('View error:', error);
      alert('Failed to load document: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const getSubmissionForFormType = (formType: string): ApiSubmission | undefined => {
    return submissions.find(s => s.formType === formType);
  };

  const getStatus = (submission: ApiSubmission | undefined): { text: string; color: string } => {
    if (!submission) {
      return { text: 'Not Started', color: STATUS_COLORS['Not Started'] };
    }

    if (submission.submissionStatus === 'completed') {
      if (submission.knacklyStatus === 'complete') {
        return { text: 'Complete', color: STATUS_COLORS['Complete'] };
      } else if (submission.knacklyRecordId) {
        return { text: 'Processing', color: STATUS_COLORS['Processing'] };
      } else {
        return { text: 'Complete', color: STATUS_COLORS['Complete'] };
      }
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
    if (submission.knacklyStatus === 'complete') {
      const documents = submission.knacklyDocuments || [];

      if (documents.length > 0) {
        return (
          <>
            <p className="mb-0" style={{ lineHeight: '14px' }}>
              <span style={{ color: '#0000ff' }}><strong>Your documents:</strong></span>
            </p>
            <ol className="gpx_ep_documents_ul" style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              {documents.map((doc: any, index: number) => {
                const pdfName = (doc.name || `Document ${index + 1}`).replace(/\.docx$/i, '.pdf');
                // Use storedUrl (public Supabase URL) - just like WordPress used wp_get_attachment_url()
                const downloadUrl = doc.storedUrl;

                if (downloadUrl) {
                  return (
                    <li key={doc.id || index}>
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {pdfName}
                      </a>
                    </li>
                  );
                }

                // No storedUrl yet - documents still processing
                return (
                  <li key={doc.id || index} style={{ color: '#999' }}>
                    {pdfName} <em>(converting to PDF...)</em>
                  </li>
                );
              })}
            </ol>
            <button
              onClick={() => refreshDocuments(submission.id)}
              disabled={refreshing === submission.id}
              className="btn btn-sm btn-outline-warning mt-2"
              style={{ fontSize: '12px' }}
            >
              {refreshing === submission.id ? 'Converting...' : '🔄 Retry PDF Conversion'}
            </button>
          </>
        );
      } else {
        // Complete but no documents array yet
        return (
          <>
            <p className="mb-0" style={{ lineHeight: '14px' }}>
              <span style={{ color: '#0000ff' }}><strong>Your documents:</strong></span>
            </p>
            <p className="mb-0 mt-0">
              <strong style={{ color: '#28a745' }}>
                Documents ready - refreshing...
              </strong>
            </p>
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

    // Completed but pending Knackly processing (not yet sent to Knackly)
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
  const activePlans = submissions.map(s => {
    const product = allProducts.find(p => p.formType === s.formType);
    return { submission: s, product };
  }).filter(p => p.product);

  // Get not purchased products (no submission exists)
  const submittedFormTypes = submissions.map(s => s.formType);
  const notPurchasedProducts = allProducts.filter(p => !submittedFormTypes.includes(p.formType));

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
                  </h6>
                  <small style={{ color: '#999' }}>{formConfig?.description}</small>
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
          <Link to="/poa-form" className="btn btn-primary mt-3">
            Start Your First Plan
          </Link>
        </div>
      )}

      {/* Not Purchased Yet Section */}
      {notPurchasedProducts.length > 0 && (
        <>
          <hr />
          <div>
            <p><span className="gpx_highlight gpx_warning">Not purchased yet:</span></p>
          </div>

          {notPurchasedProducts.map((product) => (
            <div key={product.id} className="mb-2">
              <Link className="plan_not_purchased" to={`/poa-form?type=${product.formType}`}>
                {product.name}
              </Link>
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
    </div>
  );
};

export default ViewPlans;
