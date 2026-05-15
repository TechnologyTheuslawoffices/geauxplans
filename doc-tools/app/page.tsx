'use client';

/**
 * GeauxDrafter V3 - Knackly-style Document Automation
 * Connected to real database via API
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import './styles.css';
import { processKnacklyTemplate } from '@/lib/docauto/knackly-parser';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types
interface Catalog {
  id: string;
  name: string;
  label?: string;
  summary_template?: string;
}

interface Variable {
  id: string;
  name: string;
  type: string;
  label?: string;
  help_text?: string;
  relevance?: string;
  config?: Record<string, unknown>;
  options?: { id: string; name: string }[];
}

interface Model {
  id: string;
  name: string;
  knackly_id?: string;
  variables: Variable[];
}

interface Template {
  id: string;
  name: string;
  type: string;
  content?: string;
}

interface Formula {
  id: string;
  name: string;
  expression: string;
  return_type?: string;
  is_list?: boolean;
  notes?: string;
}

interface App {
  id: string;
  name: string;
  description?: string;
  template_ids: string[];
  is_active: boolean;
  config?: {
    label?: string;
    app_template?: string;
    generateDocs?: boolean;
    showDocs?: boolean;
    extUsers?: boolean;
    extAutoClose?: boolean;
    extInstruct?: string;
    extUseURLs?: boolean;
    extCompletionURL?: string;
    extExitURL?: string;
    metadata?: Record<string, unknown>;
  };
}

interface DocRecord {
  id: string;
  catalog_id: string;
  app_id?: string;
  data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

interface LayoutCell {
  id: string;
  content: string;
  class: 'question' | 'static';
  list?: string[];
  offset?: number;
  span?: number;
  expr?: string;
}

interface Layout {
  id: string;
  catalog_id: string;
  column_count: number;
  rows: LayoutCell[][];
}

type ViewMode = 'home' | 'catalog' | 'designer' | 'interview';
type DesignerTab = 'variables' | 'templates' | 'formulas' | 'layouts' | 'apps';

export default function GeauxDrafterV3Page() {
  const router = useRouter();

  // View state - start with home/workspace view
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [designerTab, setDesignerTab] = useState<DesignerTab>('variables');

  // Data state
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [records, setRecords] = useState<DocRecord[]>([]);

  // Selection state
  const [selectedRecord, setSelectedRecord] = useState<DocRecord | null>(null);
  const [selectedVariable, setSelectedVariable] = useState<Variable | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedFormula, setSelectedFormula] = useState<Formula | null>(null);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<'catalog' | 'model'>('catalog');

  // Interview state
  const [interviewData, setInterviewData] = useState<Record<string, unknown>>({});
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAppSelection, setShowAppSelection] = useState(false);
  const [variableSearch, setVariableSearch] = useState('');
  const [appSearch, setAppSearch] = useState('');
  const [formulaSearch, setFormulaSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  // Layout editor state
  const [layoutRows, setLayoutRows] = useState<LayoutCell[][]>([]);
  const [layoutColumnCount, setLayoutColumnCount] = useState(4);
  const [layoutHasChanges, setLayoutHasChanges] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [activeLayoutDragId, setActiveLayoutDragId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Load catalogs on mount
  useEffect(() => {
    loadCatalogs();
  }, []);

  // Load catalog details when selected
  useEffect(() => {
    if (selectedCatalog) {
      loadCatalogDetails(selectedCatalog.id);
    }
  }, [selectedCatalog?.id]);

  // Sync layout editor state when layouts change
  useEffect(() => {
    if (layouts[0]) {
      setLayoutRows(layouts[0].rows || []);
      setLayoutColumnCount(layouts[0].column_count || 4);
      setLayoutHasChanges(false);
    }
  }, [layouts]);

  const loadCatalogs = async () => {
    try {
      const response = await fetch('/api/docauto/catalogs');
      if (response.ok) {
        const data = await response.json();
        // Set default label for first catalog if not set
        const catalogsWithLabels = (data.catalogs || []).map((c: Catalog, index: number) => {
          if (index === 0 && !c.label) {
            return { ...c, label: 'Estate Planning' };
          }
          return c;
        });
        setCatalogs(catalogsWithLabels);
        if (catalogsWithLabels.length > 0) {
          setSelectedCatalog(catalogsWithLabels[0]);
        }
      }
    } catch (error) {
      console.error('Error loading catalogs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCatalogDetails = async (catalogId: string) => {
    try {
      const response = await fetch(`/api/docauto/catalogs/${catalogId}`);
      if (response.ok) {
        const { catalog } = await response.json();
        setVariables(catalog.variables || []);
        setModels(catalog.models || []);
        setTemplates(catalog.templates || []);
        setFormulas(catalog.formulas || []);
        setApps(catalog.apps || []);
        setLayouts(catalog.layouts || []);

        // Load records for this catalog
        const recordsResponse = await fetch(`/api/docauto/records?catalogId=${catalogId}`);
        if (recordsResponse.ok) {
          const recordsData = await recordsResponse.json();
          setRecords(recordsData.records || []);
          if (recordsData.records?.length > 0) {
            setSelectedRecord(recordsData.records[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading catalog details:', error);
    }
  };

  const createRecord = async () => {
    if (!selectedCatalog) return;

    try {
      const response = await fetch('/api/docauto/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogId: selectedCatalog.id,
          appId: selectedApp?.id,
          data: {},
        }),
      });

      if (response.ok) {
        const { record } = await response.json();
        setCurrentRecordId(record.id);
        setInterviewData({});
        setViewMode('interview');
      }
    } catch (error) {
      console.error('Error creating record:', error);
    }
  };

  const saveRecord = async () => {
    if (!currentRecordId) return;
    setIsSaving(true);

    try {
      await fetch(`/api/docauto/records/${currentRecordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: interviewData, status: 'in_progress' }),
      });
    } catch (error) {
      console.error('Error saving record:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateInterviewValue = (name: string, value: unknown) => {
    setInterviewData(prev => ({ ...prev, [name]: value }));
  };

  // Render functions
  const renderTopNav = () => (
    <header className="top-nav">
      <div className="nav-left">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#1e40af">
            <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4zm0 2.18l6 3v5.82c0 4.53-3.2 8.79-6 9.82-2.8-1.03-6-5.29-6-9.82V7.18l6-3z"/>
          </svg>
        </div>
        <nav className="catalog-tabs">
          {/* Show catalogs - use label if available, otherwise use name */}
          {catalogs.slice(0, 4).map(catalog => (
            <button
              key={catalog.id}
              className={`catalog-tab ${selectedCatalog?.id === catalog.id && viewMode === 'catalog' ? 'active' : ''}`}
              onClick={() => {
                setSelectedCatalog(catalog);
                setViewMode('catalog'); // Go to records view
              }}
            >
              {(catalog.label?.trim() || catalog.name || 'Catalog').toUpperCase()}
            </button>
          ))}
        </nav>
      </div>
      <div className="nav-right">
        <button
          className={`mode-btn ${viewMode === 'designer' ? 'active' : ''}`}
          onClick={() => setViewMode('designer')}
        >
          DESIGNER
        </button>
        <button
          className={`mode-btn ${viewMode === 'home' || viewMode === 'catalog' ? 'active' : ''}`}
          onClick={() => setViewMode('home')}
        >
          CATALOG
        </button>
      </div>
    </header>
  );

  const renderCatalogView = () => (
    <div className="catalog-view">
      <div className="records-panel">
        <div className="records-toolbar">
          <button className="create-record-btn" onClick={() => setShowAppSelection(true)}>
            CREATE RECORD <span>+</span>
          </button>
          <div className="search-box">
            <input type="text" placeholder="Search..." />
          </div>
        </div>
        <div className="records-header">
          <span>RECORDS</span>
          <span>LAST MODIFIED</span>
          <span>STATUS</span>
        </div>
        <div className="records-list">
          {records.map(record => (
            <div
              key={record.id}
              className={`record-row ${selectedRecord?.id === record.id ? 'selected' : ''}`}
              onClick={() => setSelectedRecord(record)}
            >
              <span className="record-name">
                {(record.data as any)?.BusinessNameTX ||
                 (record.data as any)?.Client?.NameCO ||
                 `Record ${record.id.slice(0, 8)}`}
              </span>
              <span className="record-date">
                {new Date(record.updated_at).toLocaleDateString()}
              </span>
              <span className="record-status">
                {record.status === 'completed' ? '✓' : '○'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="details-panel">
        <div className="details-header">
          <h2>DETAILS</h2>
        </div>
        {selectedRecord ? (
          <div className="details-content">
            <h1 className="record-title">
              {(selectedRecord.data as any)?.BusinessNameTX ||
               (selectedRecord.data as any)?.Client?.NameCO ||
               `Record ${selectedRecord.id.slice(0, 8)}`}
            </h1>

            <div className="record-meta">
              <div className="meta-item">
                <div className="meta-label">Status:</div>
                <div className={`meta-value ${selectedRecord.status === 'completed' ? 'available' : ''}`}>
                  {selectedRecord.status}
                </div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Last modified:</div>
                <div className="meta-value">
                  {new Date(selectedRecord.updated_at).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="select-app-section">
              <div className="select-app-label">Continue or update this record...</div>
              <button
                className="action-btn primary"
                onClick={() => {
                  setCurrentRecordId(selectedRecord.id);
                  setInterviewData(selectedRecord.data as Record<string, unknown>);
                  setViewMode('interview');
                }}
              >
                Review or Update
              </button>
            </div>
          </div>
        ) : (
          <div className="details-content">
            <p>Select a record to view details</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderDesignerView = () => (
    <div className="designer-view">
      <div className="elements-panel">
        <div className="panel-header">
          <span>ELEMENTS</span>
        </div>
        <div className="elements-list">
          {catalogs.map(catalog => (
            <div
              key={catalog.id}
              className={`element-item ${selectedElementType === 'catalog' && selectedCatalog?.id === catalog.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedCatalog(catalog);
                setSelectedElementType('catalog');
                setSelectedModel(null);
              }}
            >
              <span className="element-icon catalog">C</span>
              <span>{catalog.name}</span>
            </div>
          ))}
          {models.map(model => (
            <div
              key={model.id}
              className={`element-item ${selectedElementType === 'model' && selectedModel?.id === model.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedModel(model);
                setSelectedElementType('model');
              }}
            >
              <span className="element-icon">M</span>
              <span>{model.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="designer-details">
        <div className="panel-header" style={{ background: '#1e3a5f', color: '#fff' }}>
          <span>DETAILS</span>
        </div>

        <div className="details-top">
          <div className="detail-row">
            <div className="detail-group">
              <label className="detail-label">
                {selectedElementType === 'model' ? 'MODEL NAME' : 'CATALOG NAME'}
              </label>
              <input
                className="detail-input"
                value={selectedElementType === 'model' ? selectedModel?.name || '' : selectedCatalog?.name || ''}
                readOnly
              />
            </div>
            <div className="detail-group">
              <label className="detail-label">SUMMARY TEMPLATE</label>
              <input
                className="detail-input code"
                value={selectedCatalog?.summary_template || ''}
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="designer-tabs">
          {(['variables', 'templates', 'formulas', 'layouts', 'apps'] as DesignerTab[]).map(tab => (
            <button
              key={tab}
              className={`designer-tab ${designerTab === tab ? 'active' : ''}`}
              onClick={() => setDesignerTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {designerTab === 'variables' && renderVariablesTab()}
          {designerTab === 'templates' && renderTemplatesTab()}
          {designerTab === 'apps' && renderAppsTab()}
          {designerTab === 'formulas' && renderFormulasTab()}
          {designerTab === 'layouts' && renderLayoutsTab()}
        </div>
      </div>
    </div>
  );

  const renderVariablesTab = () => {
    // Show model variables if a model is selected, otherwise show catalog variables
    const baseVariables = selectedElementType === 'model' && selectedModel
      ? selectedModel.variables || []
      : variables.filter(v => !v.config?.model_id);

    // Filter by search term
    const displayVariables = variableSearch
      ? baseVariables.filter(v => v.name.toLowerCase().includes(variableSearch.toLowerCase()))
      : baseVariables;

    return (
    <>
      <div className="variables-list-panel">
        <div className="var-search">
          <input
            type="text"
            placeholder="Search..."
            value={variableSearch}
            onChange={(e) => setVariableSearch(e.target.value)}
          />
        </div>
        <div className="variables-list">
          {displayVariables.map(v => (
            <div
              key={v.id}
              className={`variable-item ${selectedVariable?.id === v.id ? 'selected' : ''}`}
              onClick={() => setSelectedVariable(v)}
            >
              <span className="var-icon">{getVarIcon(v.type)}</span>
              <span className="var-name">{v.name}</span>
              <span className="var-type">{v.type}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="variable-editor">
        {selectedVariable ? (
          <>
            <div className="editor-row">
              <div className="editor-group">
                <label className="editor-label">VARIABLE NAME</label>
                <input className="editor-input" value={selectedVariable.name} readOnly />
              </div>
              <div className="editor-group small">
                <label className="editor-label">TYPE</label>
                <select className="editor-select" value={selectedVariable.type} disabled>
                  <option>text</option>
                  <option>number</option>
                  <option>date</option>
                  <option>boolean</option>
                  <option>selection</option>
                  <option>object</option>
                </select>
              </div>
            </div>
            <div className="editor-row">
              <div className="editor-group">
                <label className="editor-label">QUESTION PROMPT</label>
                <input className="editor-input" value={selectedVariable.label || ''} readOnly />
              </div>
            </div>
            <div className="editor-row">
              <div className="editor-group">
                <label className="editor-label">RELEVANCE</label>
                <input
                  className="editor-input"
                  value={selectedVariable.relevance || 'automatic'}
                  readOnly
                />
              </div>
            </div>
          </>
        ) : (
          <p>Select a variable to edit</p>
        )}
      </div>
    </>
    );
  };

  const renderTemplatesTab = () => (
    <>
      <div className="variables-list-panel">
        <div className="var-search">
          <input type="text" placeholder="Search..." />
        </div>
        <div className="templates-list">
          {templates.map(t => (
            <div
              key={t.id}
              className={`template-item ${selectedTemplate?.id === t.id ? 'selected' : ''}`}
              onClick={() => setSelectedTemplate(t)}
            >
              <span className="template-icon">{t.type === 'text' ? 'T' : 'D'}</span>
              <span className="template-name">{t.name}</span>
              <span className="template-type">{t.type}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="template-editor">
        {selectedTemplate ? (
          <>
            <div className="editor-row">
              <div className="editor-group">
                <label className="editor-label">TEMPLATE NAME</label>
                <input className="editor-input" value={selectedTemplate.name} readOnly />
              </div>
              <div className="editor-group small">
                <label className="editor-label">TYPE</label>
                <select className="editor-select" value={selectedTemplate.type} disabled>
                  <option>text</option>
                  <option>docx</option>
                  <option>pdf</option>
                </select>
              </div>
            </div>
            <div className="template-text-container">
              <label className="editor-label">TEMPLATE CONTENT</label>
              <textarea className="template-text" value={selectedTemplate.content || ''} readOnly />
            </div>
          </>
        ) : (
          <p>Select a template to view</p>
        )}
      </div>
    </>
  );

  const renderAppsTab = () => {
    const filteredApps = appSearch
      ? apps.filter(a => a.name.toLowerCase().includes(appSearch.toLowerCase()))
      : apps;

    return (
      <>
        {/* Left panel - Apps list */}
        <div className="variables-list-panel">
          <div className="var-search">
            <input
              type="text"
              placeholder="Search..."
              value={appSearch}
              onChange={(e) => setAppSearch(e.target.value)}
            />
          </div>
          <div className="variables-list">
            {filteredApps.map(app => (
              <div
                key={app.id}
                className={`variable-item ${selectedApp?.id === app.id ? 'selected' : ''}`}
                onClick={() => setSelectedApp(app)}
              >
                <span className="var-icon">📱</span>
                <span className="var-name">{app.name}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px', borderTop: '1px solid #e2e8f0' }}>
            <button className="add-var-btn">+ Add a new app</button>
          </div>
        </div>

        {/* Right panel - App details */}
        <div className="variable-editor">
          {selectedApp ? (
            <>
              <div className="editor-row">
                <div className="editor-group">
                  <label className="editor-label">NAME</label>
                  <input className="editor-input" value={selectedApp.name} readOnly />
                </div>
                <div className="editor-group">
                  <label className="editor-label">LABEL</label>
                  <input
                    className="editor-input"
                    value={selectedApp.config?.label || selectedApp.name}
                    readOnly
                  />
                </div>
              </div>

              <div className="editor-group" style={{ marginTop: '16px' }}>
                <label className="editor-label">APP TEMPLATE</label>
                <textarea
                  className="editor-input"
                  style={{
                    height: '400px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                  }}
                  value={selectedApp.config?.app_template || ''}
                  readOnly
                />
              </div>

              <div className="editor-row" style={{ marginTop: '16px' }}>
                <div className="editor-group">
                  <label className="editor-label">OPTIONS</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="checkbox" checked={selectedApp.config?.generateDocs || false} readOnly />
                      App <strong>generates a document</strong> for each template referenced above
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="checkbox" checked={selectedApp.config?.extUsers || false} readOnly />
                      App is designed for access by <strong>external users</strong>
                    </label>
                  </div>
                </div>
              </div>

              {selectedApp.config?.extUsers && (
                <div className="editor-group" style={{ marginTop: '16px' }}>
                  <label className="editor-label">INSTRUCTIONS FOR EXTERNAL USERS</label>
                  <textarea
                    className="editor-input"
                    style={{ height: '80px' }}
                    value={selectedApp.config?.extInstruct || ''}
                    readOnly
                  />
                </div>
              )}

              <div style={{ marginTop: '24px' }}>
                <button
                  style={{
                    padding: '10px 20px',
                    background: '#1e3a5f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                  onClick={() => createRecord()}
                >
                  ▶ Start Interview
                </button>
              </div>
            </>
          ) : (
            <div className="no-selection">Select an app to view details</div>
          )}
        </div>
      </>
    );
  };

  // Helper to parse formula return type from expression
  const getFormulaReturnType = (formula: Formula): string => {
    if (formula.return_type) return formula.return_type;
    // Infer from expression content
    const expr = formula.expression.toLowerCase();
    if (expr.includes('true') || expr.includes('false') || expr.includes('==') || expr.includes('&&') || expr.includes('||')) {
      return 'true/false';
    }
    if (expr.includes('[') && expr.includes(']')) {
      return 'object list';
    }
    return 'text';
  };

  // Helper to highlight formula syntax
  const highlightFormulaSyntax = (expression: string) => {
    // Split into lines and process each
    const lines = expression.split('\n');
    return lines.map((line, idx) => {
      // Highlight keywords and operators
      const highlighted = line
        .replace(/(\?)/g, '<span style="color: #2563eb">$1</span>')
        .replace(/(:)/g, '<span style="color: #2563eb">$1</span>')
        .replace(/(&&|\|\|)/g, '<span style="color: #dc2626">$1</span>')
        .replace(/(==|!=|>=|<=|>|<)/g, '<span style="color: #dc2626">$1</span>')
        .replace(/(".*?")/g, '<span style="color: #059669">$1</span>')
        .replace(/(\[\])/g, '<span style="color: #7c3aed">$1</span>')
        .replace(/(_app\.\w+)/g, '<span style="color: #0891b2">$1</span>');
      return (
        <div key={idx} dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }} />
      );
    });
  };

  const renderFormulasTab = () => {
    const filteredFormulas = formulaSearch
      ? formulas.filter(f => f.name.toLowerCase().includes(formulaSearch.toLowerCase()))
      : formulas;

    // Parse expressions into numbered blocks
    const parseExpressions = (expression: string): string[] => {
      // Simple split by line breaks that separate ternary expressions
      const parts = expression.split(/\n\n+/).filter(p => p.trim());
      return parts.length > 0 ? parts : [expression];
    };

    const expressions = selectedFormula ? parseExpressions(selectedFormula.expression) : [];
    const returnType = selectedFormula ? getFormulaReturnType(selectedFormula) : 'text';

    return (
      <>
        {/* Left panel - Formula list */}
        <div className="variables-list-panel">
          <div className="var-search">
            <input
              type="text"
              placeholder="Search..."
              value={formulaSearch}
              onChange={(e) => setFormulaSearch(e.target.value)}
            />
            <button className="search-btn" style={{ marginLeft: '4px', padding: '6px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}>
              🔍
            </button>
          </div>
          <div className="variables-list" style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
            {filteredFormulas.map(formula => (
              <div
                key={formula.id}
                className={`variable-item ${selectedFormula?.id === formula.id ? 'selected' : ''}`}
                onClick={() => setSelectedFormula(formula)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <span className="var-icon" style={{ color: '#6366f1', fontStyle: 'italic', fontWeight: 'bold' }}>fx</span>
                  <span className="var-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formula.name}
                  </span>
                </div>
                <span style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                  {getFormulaReturnType(formula)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px', borderTop: '1px solid #e2e8f0' }}>
            <button className="add-var-btn">+ Add a new formula</button>
          </div>
        </div>

        {/* Right panel - Formula editor */}
        <div className="variable-editor" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedFormula ? (
            <>
              {/* Formula Name and Type */}
              <div className="editor-row" style={{ display: 'flex', gap: '24px' }}>
                <div className="editor-group" style={{ flex: 2 }}>
                  <label className="editor-label">FORMULA NAME</label>
                  <input className="editor-input" value={selectedFormula.name} readOnly />
                </div>
                <div className="editor-group" style={{ flex: 1 }}>
                  <label className="editor-label">FORMULA TYPE</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="formulaType"
                        checked={!selectedFormula.is_list}
                        readOnly
                      />
                      Single
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="formulaType"
                        checked={selectedFormula.is_list === true}
                        readOnly
                      />
                      List of
                    </label>
                  </div>
                </div>
                <div className="editor-group" style={{ flex: 1 }}>
                  <label className="editor-label">&nbsp;</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      className="editor-select"
                      value={returnType}
                      disabled
                      style={{ flex: 1 }}
                    >
                      <option value="true/false">true/false</option>
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="object list">object list</option>
                      <option value="text list">text list</option>
                    </select>
                    <button
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#1e3a5f',
                        color: '#fff',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      ≡
                    </button>
                  </div>
                </div>
              </div>

              {/* Expressions */}
              <div className="editor-group">
                <label className="editor-label">EXPRESSIONS</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {expressions.map((expr, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                      }}
                    >
                      <span style={{ color: '#94a3b8', fontSize: '12px', minWidth: '20px', paddingTop: '8px' }}>
                        {idx + 1}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          padding: '12px',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          overflowX: 'auto',
                        }}
                      >
                        {highlightFormulaSyntax(expr)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                          style={{
                            width: '24px',
                            height: '24px',
                            background: 'transparent',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          style={{
                            width: '24px',
                            height: '24px',
                            background: 'transparent',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          style={{
                            width: '24px',
                            height: '24px',
                            background: 'transparent',
                            border: '1px solid #e2e8f0',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#ef4444',
                          }}
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '12px',
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '4px',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ color: '#3b82f6', fontSize: '16px' }}>+</span>
                  Add expression
                </button>
              </div>

              {/* Notes */}
              <div className="editor-group">
                <label className="editor-label">NOTES</label>
                <input
                  className="editor-input"
                  value={selectedFormula.notes || ''}
                  placeholder="Add notes about this formula..."
                  readOnly
                  style={{ marginTop: '8px' }}
                />
              </div>
            </>
          ) : (
            <div className="no-selection">Select a formula to view details</div>
          )}
        </div>
      </>
    );
  };

  // Sortable Cell Component for drag-and-drop
  const SortableCell = ({ cell, rowIndex, cellIndex }: { cell: LayoutCell; rowIndex: number; cellIndex: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `${rowIndex}-${cell.id || cellIndex}` });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      gridColumn: (cell.offset || 0) > 0 ? `${(cell.offset || 0) + 1} / span ${cell.span || 1}` : `span ${cell.span || 1}`,
      padding: '8px 12px',
      background: cell.class === 'question' ? '#eff6ff' : '#f8fafc',
      border: `2px solid ${cell.class === 'question' ? '#3b82f6' : '#e2e8f0'}`,
      borderRadius: '4px',
      fontSize: '12px',
      overflow: 'hidden',
      cursor: 'grab',
      userSelect: 'none' as const,
    };

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        {cell.class === 'question' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#3b82f6' }}>📋</span>
            <strong style={{ color: '#1e40af' }}>{cell.content}</strong>
          </div>
        ) : (
          <div style={{ color: '#64748b' }}>
            {cell.content?.slice(0, 100)}{(cell.content?.length || 0) > 100 ? '...' : ''}
          </div>
        )}
      </div>
    );
  };

  // DnD sensors for layout editor
  const layoutSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleLayoutDragStart = (event: DragStartEvent) => {
    setActiveLayoutDragId(event.active.id as string);
  };

  const renderLayoutsTab = () => {
    const layout = layouts[0];

    const handleLayoutDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveLayoutDragId(null);

      if (!over || active.id === over.id) return;

      const [activeRowIdx, activeCellId] = (active.id as string).split('-');
      const [overRowIdx, overCellId] = (over.id as string).split('-');

      const activeRowIndex = parseInt(activeRowIdx);
      const overRowIndex = parseInt(overRowIdx);

      if (activeRowIndex === overRowIndex) {
        // Same row - reorder within row
        const row = [...layoutRows[activeRowIndex]];
        const activeCellIndex = row.findIndex((c, i) => (c.id || i.toString()) === activeCellId);
        const overCellIndex = row.findIndex((c, i) => (c.id || i.toString()) === overCellId);

        if (activeCellIndex !== -1 && overCellIndex !== -1) {
          const newRow = arrayMove(row, activeCellIndex, overCellIndex);
          const newRows = [...layoutRows];
          newRows[activeRowIndex] = newRow;
          setLayoutRows(newRows);
          setLayoutHasChanges(true);
        }
      } else {
        // Different rows - move cell between rows
        const sourceRow = [...layoutRows[activeRowIndex]];
        const targetRow = [...layoutRows[overRowIndex]];
        const activeCellIndex = sourceRow.findIndex((c, i) => (c.id || i.toString()) === activeCellId);

        if (activeCellIndex !== -1) {
          const [movedCell] = sourceRow.splice(activeCellIndex, 1);
          const overCellIndex = targetRow.findIndex((c, i) => (c.id || i.toString()) === overCellId);
          targetRow.splice(overCellIndex + 1, 0, movedCell);

          const newRows = [...layoutRows];
          newRows[activeRowIndex] = sourceRow;
          newRows[overRowIndex] = targetRow;
          // Remove empty rows
          const filteredRows = newRows.filter(row => row.length > 0);
          setLayoutRows(filteredRows);
          setLayoutHasChanges(true);
        }
      }
    };

    const saveLayout = async () => {
      if (!layout?.id) return;
      setIsSavingLayout(true);
      try {
        const response = await fetch(`/api/docauto/layouts/${layout.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: layoutRows, column_count: layoutColumnCount }),
        });
        if (response.ok) {
          setLayoutHasChanges(false);
          // Update the layouts state
          setLayouts(prev => prev.map(l => l.id === layout.id ? { ...l, rows: layoutRows, column_count: layoutColumnCount } : l));
        }
      } catch (error) {
        console.error('Failed to save layout:', error);
      }
      setIsSavingLayout(false);
    };

    const handleColumnCountChange = (newCount: number) => {
      setLayoutColumnCount(newCount);
      setLayoutHasChanges(true);
    };

    const addNewRow = () => {
      setLayoutRows(prev => [...prev, []]);
      setLayoutHasChanges(true);
    };

    if (!layout) {
      return (
        <div className="layouts-panel" style={{ padding: '20px' }}>
          <p>No layout defined for this catalog.</p>
        </div>
      );
    }

    // Get all cell IDs for the current visible rows
    const visibleRows = layoutRows.slice(0, 100);

    return (
      <div className="layouts-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#64748b', fontSize: '13px' }}>LAYOUT</span>
            <input type="text" placeholder="Search..." style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', width: '200px' }} />
            <button style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px' }}>🔍</button>
            <button
              onClick={addNewRow}
              style={{ padding: '6px 12px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              + Add Row
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#64748b', fontSize: '13px' }}>GRID COLUMNS</span>
            <select
              value={layoutColumnCount}
              onChange={(e) => handleColumnCountChange(parseInt(e.target.value))}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
            >
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>
            {layoutHasChanges && (
              <button
                onClick={saveLayout}
                disabled={isSavingLayout}
                style={{
                  padding: '6px 16px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {isSavingLayout ? 'Saving...' : '💾 Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Layout grid with drag-and-drop */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <DndContext
            sensors={layoutSensors}
            collisionDetection={closestCenter}
            onDragStart={handleLayoutDragStart}
            onDragEnd={handleLayoutDragEnd}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visibleRows.map((row, rowIndex) => (
                <SortableContext
                  key={rowIndex}
                  items={row.map((cell, i) => `${rowIndex}-${cell.id || i}`)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${layoutColumnCount}, 1fr)`,
                      gap: '8px',
                      minHeight: '50px',
                      padding: '4px',
                      background: rowIndex % 2 === 0 ? '#fafafa' : '#fff',
                      borderRadius: '4px',
                      border: '1px dashed #e2e8f0',
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      left: '-24px',
                      color: '#94a3b8',
                      fontSize: '11px',
                      width: '20px',
                      textAlign: 'right',
                    }}>
                      {rowIndex + 1}
                    </div>
                    {row.map((cell, cellIndex) => (
                      <SortableCell
                        key={cell.id || cellIndex}
                        cell={cell}
                        rowIndex={rowIndex}
                        cellIndex={cellIndex}
                      />
                    ))}
                  </div>
                </SortableContext>
              ))}
            </div>

            <DragOverlay>
              {activeLayoutDragId ? (
                <div style={{
                  padding: '8px 12px',
                  background: '#dbeafe',
                  border: '2px solid #3b82f6',
                  borderRadius: '4px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                  Dragging...
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {layoutRows.length > 100 && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
              Showing first 100 of {layoutRows.length} rows
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderInterviewView = () => {
    // Filter to show only catalog-level variables (not model variables)
    // Model variables are shown through their parent object variables
    const catalogVars = variables.filter(v => !v.config?.model_id);

    return (
      <div className="interview-view">
        <div className="interview-header">
          <button
            className="back-btn"
            onClick={() => {
              saveRecord();
              setViewMode('catalog');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              marginRight: '12px',
              fontSize: '18px',
            }}
          >
            ← Back
          </button>
          <div className="interview-tabs">
            <button className="interview-tab">{selectedCatalog?.label || selectedCatalog?.name}</button>
            <button className="interview-tab active">{selectedApp?.name || 'Interview'}</button>
          </div>
        </div>

        <div className="interview-content">
          {catalogVars.map((variable, index) => (
            <div key={variable.id}>
              {index > 0 && index % 5 === 0 && (
                <div className="section-divider">
                  <div className="section-divider-icon">*</div>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {(() => {
                      // Helper: Format variable name into readable question
                      const formatVariableName = (name: string, type: string): string => {
                        // Check if it ends with TF (boolean indicator)
                        const isBoolean = name.endsWith('TF') || type === 'boolean';
                        // Remove common Knackly suffixes
                        // TF=boolean, TX=text, NU=number, CO=computed, PB=principal bene
                        let cleaned = name.replace(/(TF|TX|NU|CO|PB|Select|List|Model)$/, '');
                        // Add spaces before capitals
                        cleaned = cleaned.replace(/([A-Z])/g, ' $1').trim();
                        // Capitalize first letter
                        let result = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                        // Add question mark for booleans
                        if (isBoolean && !result.endsWith('?')) {
                          result = result + '?';
                        }
                        return result;
                      };

                      // Check if variable has a real label (not empty/whitespace)
                      const hasLabel = variable.label && variable.label.trim().length > 0;

                      if (!hasLabel) {
                        // No label stored - use formatted variable name
                        return formatVariableName(variable.name, variable.type);
                      }

                      // Has a label - check if it contains Knackly syntax
                      const rawLabel = variable.label!; // Already checked above
                      const hasKnacklySyntax = rawLabel.includes('{[') || rawLabel.includes('[if') ||
                                               rawLabel.includes('[') && rawLabel.includes('?');

                      if (!hasKnacklySyntax) {
                        // Plain text label - use as-is
                        return rawLabel;
                      }

                      // Try to process Knackly syntax
                      try {
                        const processed = processKnacklyTemplate(rawLabel, interviewData as Record<string, unknown>, false);
                        // If result is empty or still has unprocessed syntax, use formatted name
                        if (!processed.trim() || processed.includes('{[') || processed.includes('[if')) {
                          return formatVariableName(variable.name, variable.type);
                        }
                        return processed;
                      } catch {
                        return formatVariableName(variable.name, variable.type);
                      }
                    })()}
                  </label>
                  {renderInterviewInput(variable)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="interview-footer">
          <div className="footer-left">
            <span style={{ color: '#64748b', fontSize: '12px' }}>
              {selectedApp?.name || selectedCatalog?.name}
            </span>
          </div>
          <div className="footer-right">
            <button
              className="footer-btn secondary"
              onClick={() => {
                saveRecord();
                setViewMode('catalog');
              }}
            >
              {isSaving ? 'Saving...' : 'Finish Later'}
            </button>
            <button
              className="footer-btn primary"
              onClick={() => {
                saveRecord();
                alert('Document generation coming soon!');
              }}
            >
              Create Docs
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderInterviewInput = (variable: Variable) => {
    const value = interviewData[variable.name];

    switch (variable.type) {
      case 'text':
        return (
          <input
            type="text"
            className="form-input"
            value={(value as string) || ''}
            onChange={(e) => updateInterviewValue(variable.name, e.target.value)}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            className="form-input"
            value={(value as number) ?? ''}
            onChange={(e) => updateInterviewValue(variable.name, parseFloat(e.target.value) || 0)}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            className="form-input"
            value={(value as string) || ''}
            onChange={(e) => updateInterviewValue(variable.name, e.target.value)}
          />
        );

      case 'boolean':
        return (
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            <label className="form-checkbox">
              <input
                type="radio"
                name={variable.name}
                checked={value === true}
                onChange={() => updateInterviewValue(variable.name, true)}
              />
              Yes
            </label>
            <label className="form-checkbox">
              <input
                type="radio"
                name={variable.name}
                checked={value === false}
                onChange={() => updateInterviewValue(variable.name, false)}
              />
              No
            </label>
          </div>
        );

      case 'selection':
        return (
          <select
            className="form-select"
            value={(value as any)?.Name || ''}
            onChange={(e) => updateInterviewValue(variable.name, { Name: e.target.value })}
          >
            <option value="">Select...</option>
            {variable.options?.map(opt => (
              <option key={opt.id} value={opt.name}>{opt.name}</option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type="text"
            className="form-input"
            value={(value as string) || ''}
            onChange={(e) => updateInterviewValue(variable.name, e.target.value)}
          />
        );
    }
  };

  const getVarIcon = (type: string) => {
    const icons: Record<string, string> = {
      text: 'A',
      number: '#',
      date: 'D',
      boolean: '?',
      selection: 'S',
      object: 'O',
    };
    return icons[type] || 'A';
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  // Render the Home/Workspace view (catalog management + apps)
  const renderHomeView = () => (
    <div className="home-view">
      {/* Left Sidebar - Data Catalogs */}
      <div className="catalogs-sidebar">
        <div className="sidebar-header">DATA CATALOGS</div>
        <div className="catalog-search">
          <input type="text" placeholder="Search..." />
          <button className="search-btn">🔍</button>
        </div>
        <div className="catalogs-list">
          {catalogs.map(catalog => (
            <div
              key={catalog.id}
              className={`catalog-item ${selectedCatalog?.id === catalog.id ? 'selected' : ''}`}
              onClick={() => setSelectedCatalog(catalog)}
            >
              <span className="catalog-icon">📁</span>
              <span>{catalog.name}</span>
            </div>
          ))}
        </div>
        <button className="add-catalog-btn">
          <span>+</span> Add a new catalog
        </button>
        <button
          className="add-catalog-btn"
          style={{ marginTop: '8px', background: '#1e40af' }}
          onClick={() => setShowImportModal(true)}
        >
          <span>↑</span> Import Knackly
        </button>
      </div>

      {/* Right Panel - Catalog Details */}
      <div className="catalog-details-panel">
        <div className="details-header-bar">DETAILS</div>

        {selectedCatalog && (
          <div className="catalog-settings">
            {/* Top row - name, label, type */}
            <div className="settings-row">
              <div className="setting-group">
                <label>CATALOG NAME</label>
                <input type="text" value={selectedCatalog.name} readOnly />
              </div>
              <div className="setting-group">
                <label>LABEL (PLURAL)</label>
                <input
                  type="text"
                  value={selectedCatalog.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    // Update selected catalog
                    setSelectedCatalog(prev => prev ? { ...prev, label: newLabel } : null);
                    // Update in catalogs list
                    setCatalogs(prev => prev.map(c =>
                      c.id === selectedCatalog.id ? { ...c, label: newLabel } : c
                    ));
                  }}
                  placeholder="Enter label for top nav..."
                />
              </div>
              <div className="setting-group">
                <label>CATALOG ITEM TYPE</label>
                <input type="text" value={selectedCatalog.name} readOnly className="readonly-field" />
              </div>
            </div>

            {/* Columns and filters */}
            <div className="settings-row">
              <div className="setting-group">
                <label>COLUMNS</label>
                <div className="checkbox-group">
                  <label><input type="checkbox" defaultChecked /> Item Summary template</label>
                  <label><input type="checkbox" defaultChecked /> Last Modified date</label>
                  <label><input type="checkbox" /> Created By</label>
                </div>
              </div>
              <div className="setting-group">
                <label>ITEM DETAIL TEMPLATE</label>
                <input type="text" value={selectedCatalog.summary_template || ''} readOnly />
              </div>
            </div>

            <div className="settings-row">
              <div className="setting-group">
                <label>DEFAULT FILTERS</label>
                <div className="checkbox-group">
                  <label><input type="checkbox" /> My records</label>
                </div>
              </div>
              <div className="setting-group">
                <label>CREATE RECORD LABEL</label>
                <input type="text" placeholder="Create record" />
              </div>
            </div>

            <div className="settings-row">
              <div className="setting-group full-width">
                <label>GLOBAL INFO LABEL</label>
                <input type="text" placeholder="Firm Info" />
              </div>
            </div>

            {/* Apps on this catalog */}
            <div className="apps-section">
              <div className="apps-header">
                <span className="apps-title">APPS ON THIS CATALOG</span>
                <span className="version-title">"LIVE" VERSION</span>
                <span className="settings-title">APP SETTINGS (PER CATALOG)</span>
              </div>

              {apps.map(app => (
                <div key={app.id} className="app-row">
                  <div className="app-name-col">
                    <span className="app-name">{app.name}</span>
                    <label className="enabled-checkbox">
                      <input
                        type="checkbox"
                        checked={app.is_active}
                        onChange={() => {
                          // Toggle app enabled status
                          setApps(prev => prev.map(a =>
                            a.id === app.id ? { ...a, is_active: !a.is_active } : a
                          ));
                        }}
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="app-version-col">
                    <select defaultValue="latest">
                      <option value="latest">Latest</option>
                      <option value="release">Release 01/29/2026</option>
                    </select>
                    <button className="edit-btn">✏️</button>
                  </div>
                  <div className="app-settings-col">
                    <label>
                      <input type="checkbox" /> Send documents to:
                    </label>
                    <select>
                      <option>Select a provider</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="geaux-drafter-v3">
      {renderTopNav()}
      <div className="app-container">
        {viewMode === 'home' && renderHomeView()}
        {viewMode === 'catalog' && renderCatalogView()}
        {viewMode === 'designer' && renderDesignerView()}
        {viewMode === 'interview' && renderInterviewView()}
      </div>

      {/* App Selection Modal */}
      {showAppSelection && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAppSelection(false)}
        >
          <div
            className="modal-content"
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '16px', color: '#1e40af' }}>Select Document Type</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
              {apps.filter(app => app.is_active).map(app => (
                <button
                  key={app.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    background: selectedApp?.id === app.id ? '#1e3a5f' : '#f8fafc',
                    color: selectedApp?.id === app.id ? '#fff' : '#1e293b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onClick={() => setSelectedApp(app)}
                >
                  <span style={{ flex: 1, fontWeight: 500 }}>{app.name}</span>
                  {app.description && (
                    <span style={{ fontSize: '12px', opacity: 0.7 }}>{app.description}</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '10px 20px',
                  background: '#f1f5f9',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => setShowAppSelection(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '10px 20px',
                  background: selectedApp ? '#1e3a5f' : '#94a3b8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedApp ? 'pointer' : 'not-allowed',
                }}
                disabled={!selectedApp}
                onClick={() => {
                  if (selectedApp) {
                    setShowAppSelection(false);
                    createRecord();
                  }
                }}
              >
                Start Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Knackly Modal */}
      {showImportModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !isImporting && setShowImportModal(false)}
        >
          <div
            className="modal-content"
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '500px',
              maxWidth: '600px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '16px', color: '#1e40af' }}>Import Knackly Export</h2>
            <p style={{ marginBottom: '16px', color: '#64748b', fontSize: '14px' }}>
              Upload a Knackly JSON export file to import variables, formulas, templates, and apps.
            </p>

            <input
              type="file"
              accept=".json"
              id="knackly-import-file"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                setIsImporting(true);
                setImportStatus('Reading file...');

                try {
                  const text = await file.text();
                  const exportData = JSON.parse(text);

                  setImportStatus(`Importing ${exportData.name}...`);
                  setImportStatus(`Found: ${exportData.properties?.length || 0} variables, ${exportData.formulas?.length || 0} formulas`);

                  const response = await fetch('/api/docauto/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      exportData,
                      dryRun: false,
                      skipTemplates: false,
                    }),
                  });

                  const result = await response.json();

                  if (result.success) {
                    setImportStatus(`✅ Success! Imported ${result.stats.variables} variables, ${result.stats.formulas} formulas, ${result.stats.apps} apps`);
                    // Reload catalogs
                    setTimeout(() => {
                      loadCatalogs();
                      setShowImportModal(false);
                      setImportStatus(null);
                    }, 2000);
                  } else {
                    setImportStatus(`❌ Import failed: ${result.errors?.slice(0, 3).join(', ')}`);
                  }
                } catch (err) {
                  setImportStatus(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
                } finally {
                  setIsImporting(false);
                }
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button
                style={{
                  padding: '16px 24px',
                  background: isImporting ? '#94a3b8' : '#1e3a5f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                }}
                disabled={isImporting}
                onClick={() => document.getElementById('knackly-import-file')?.click()}
              >
                {isImporting ? 'Importing...' : 'Select JSON File'}
              </button>

              {importStatus && (
                <div
                  style={{
                    padding: '12px',
                    background: importStatus.startsWith('✅') ? '#d1fae5' : importStatus.startsWith('❌') ? '#fee2e2' : '#f1f5f9',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  {importStatus}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '10px 20px',
                  background: '#f1f5f9',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                }}
                disabled={isImporting}
                onClick={() => {
                  setShowImportModal(false);
                  setImportStatus(null);
                }}
              >
                {isImporting ? 'Please wait...' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
