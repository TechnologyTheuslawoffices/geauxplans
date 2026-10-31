import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getBusinessPlan,
  saveBusinessPlan,
  BusinessPlan,
  BusinessFormData,
  BusinessPerson,
  BusinessManager,
} from '../services/businessPlanService';

/**
 * Company interview for a purchased business set (My Companies).
 *
 * Sections follow what the purchase unlocked (`plan.includes`):
 *   always              company, members, registered agent — needed both to
 *                       file the LLC and to draft the agreement
 *   operatingAgreement  management, voting, tax and transfer terms
 *   ein                 the IRS SS-4 questions
 *   licenses            licensing questions
 * Finishing the interview drafts the Operating Agreement when it is included.
 */

const STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
  'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

// The names OperatingAgreementFormer.docx tests for — not the catalog's stale
// option list. See geauxplans-backend/src/services/businessMapping.js.
const TAX_ELECTIONS = ['Partnership', 'Disregarded Entity', 'S-Corporation', 'C-Corporation'];

const OTHER_MANAGER_OPTIONS = [
  'Anyone',
  'Members',
  'Family Members',
  'Entities wholly owned by a Member',
  'Entity wholly owned by a Family Member',
];

const WHY_EIN = [
  'Starting a new business',
  'Need to hire employees',
  'Banking purposes only',
  'Changing type of organization - from a sole proprietorship to a corporation, etc.',
  'Purchasing an active business',
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// The catalog's WhatDo option names, so the answer maps onto its selection.
const BUSINESS_CATEGORIES = [
  'Accommodations', 'Construction', 'Finance', 'Food Service', 'Health Care', 'Insurance',
  'Manufacturing', 'Real Estate', 'Rental & Leasing', 'Retail', 'Social Assistance',
  'Transportation', 'Warehousing', 'Wholesale', 'Other',
];

const emptyPerson = (): BusinessPerson => ({ type: 'Individual', state: 'Louisiana' });

const emptyForm = (): BusinessFormData => ({
  company: { office_state: 'Louisiana' },
  registered_agent: {},
  members: [emptyPerson()],
  management: {},
  ein: {},
  licenses: {},
});

function personName(p: BusinessPerson, i: number): string {
  if (p.type === 'Entity') return p.entity_name || `Member ${i + 1}`;
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || `Member ${i + 1}`;
}

/** Problems that stop the interview being marked complete. */
function validate(form: BusinessFormData, plan: BusinessPlan): string[] {
  const errors: string[] = [];
  const c = form.company;
  if (!c.llc_name?.trim()) errors.push('Enter the company name.');
  if (!c.office_street?.trim() || !c.office_city?.trim() || !c.office_zip?.trim()) {
    errors.push('Enter the registered office street, city, and ZIP.');
  }
  if (form.members.length === 0) errors.push('Add at least one member.');
  form.members.forEach((m, i) => {
    const named = m.type === 'Entity' ? m.entity_name?.trim() : m.first_name?.trim() && m.last_name?.trim();
    if (!named) errors.push(`Member ${i + 1} needs a name.`);
  });
  const agent = form.registered_agent;
  if (!agent.kind) errors.push('Choose a registered agent.');
  if (agent.kind === 'other') {
    const named = agent.entity_name?.trim() || (agent.first_name?.trim() && agent.last_name?.trim());
    if (!named || !agent.street?.trim()) errors.push('Enter the registered agent\'s name and Louisiana address.');
  }
  if (plan.includes.operatingAgreement) {
    const m = form.management;
    if (!m.only_member_managers) errors.push('Answer whether only members may be managers.');
    if (m.only_member_managers === 'Yes' && !(m.member_managers || []).length) errors.push('Choose at least one manager.');
    if (m.only_member_managers === 'No' && !(m.managers || []).length) errors.push('Add at least one manager.');
    if (!m.voting_type) errors.push('Choose how members vote.');
    if (!m.tax_election) errors.push('Choose the tax election.');
  }
  if (plan.includes.ein && !form.ein.why) errors.push('Choose why you are applying for an EIN.');
  return errors;
}

const YesNo: React.FC<{ name: string; value?: string; onChange: (v: 'Yes' | 'No') => void }> = ({ name, value, onChange }) => (
  <div>
    {(['Yes', 'No'] as const).map((opt) => (
      <div className="form-check form-check-inline" key={opt}>
        <input
          className="form-check-input"
          type="radio"
          id={`${name}-${opt}`}
          name={name}
          checked={value === opt}
          onChange={() => onChange(opt)}
        />
        <label className="form-check-label" htmlFor={`${name}-${opt}`}>{opt}</label>
      </div>
    ))}
  </div>
);

const BusinessInterview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [plan, setPlan] = useState<BusinessPlan | null>(null);
  const [form, setForm] = useState<BusinessFormData>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  const headers: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  useEffect(() => {
    if (!id) return;
    getBusinessPlan(id, headers)
      .then((res) => {
        if (!res.success || !res.data) {
          setErrors([res.error || 'This business plan could not be found.']);
          return;
        }
        const p = res.data;
        setPlan(p);
        const saved = p.formData || {};
        const base = emptyForm();
        setForm({
          company: { ...base.company, ...saved.company, llc_name: saved.company?.llc_name || p.llcName },
          registered_agent: {
            ...(p.includes.registeredAgent ? { kind: 'geauxplans' as const } : {}),
            ...saved.registered_agent,
          },
          members: saved.members?.length ? saved.members : base.members,
          management: { ...saved.management },
          ein: { ...saved.ein },
          licenses: { ...saved.licenses },
        });
      })
      .catch(() => setErrors(['This business plan could not be loaded.']))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.access_token]);

  const setSection = <K extends keyof BusinessFormData>(section: K, patch: Partial<BusinessFormData[K]>) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));

  const setMember = (i: number, patch: Partial<BusinessPerson>) =>
    setForm((f) => ({ ...f, members: f.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  const setManager = (i: number, patch: Partial<BusinessManager>) =>
    setForm((f) => ({
      ...f,
      management: {
        ...f.management,
        managers: (f.management.managers || []).map((m, j) => (j === i ? { ...m, ...patch } : m)),
      },
    }));

  const save = async (status: 'inprogress' | 'completed') => {
    if (!plan || !id) return;
    setNotice('');
    if (status === 'completed') {
      const problems = validate(form, plan);
      setErrors(problems);
      if (problems.length) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    } else {
      setErrors([]);
    }
    setSaving(true);
    try {
      const res = await saveBusinessPlan(id, form, status, headers);
      if (!res.success) {
        setErrors([res.error || 'Your answers could not be saved.']);
      } else if (res.documentError) {
        setErrors([`Your answers are saved, but ${res.documentError}`]);
      } else if (status === 'completed') {
        navigate('/my-account/business-planning');
        return;
      } else {
        setNotice('Your answers are saved. You can come back and finish any time.');
      }
    } catch {
      setErrors(['Your answers could not be saved.']);
    } finally {
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading) {
    return <div className="container py-5"><i className="fas fa-spinner fa-spin me-2"></i>Loading…</div>;
  }

  if (!plan) {
    return (
      <div className="container py-5">
        {errors.map((e) => <div className="alert alert-danger" key={e}>{e}</div>)}
        <Link to="/my-account/business-planning">Back to My Companies</Link>
      </div>
    );
  }

  if (!plan.canEdit) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning">{plan.accessMessage || 'The editing period for this company has ended.'}</div>
        <Link to="/my-account/business-planning">Back to My Companies</Link>
      </div>
    );
  }

  const { includes } = plan;
  const c = form.company;
  const agent = form.registered_agent;
  const m = form.management;

  const personFields = (
    p: Partial<BusinessPerson>,
    onChange: (patch: Partial<BusinessPerson>) => void,
    key: string,
    withSigner: boolean
  ) => (
    <>
      <div className="mb-3">
        {(['Individual', 'Entity'] as const).map((t) => (
          <div className="form-check form-check-inline" key={t}>
            <input
              className="form-check-input"
              type="radio"
              id={`${key}-type-${t}`}
              checked={(p.type || 'Individual') === t}
              onChange={() => onChange({ type: t })}
            />
            <label className="form-check-label" htmlFor={`${key}-type-${t}`}>
              {t === 'Individual' ? 'A person' : 'A company or trust'}
            </label>
          </div>
        ))}
      </div>
      {(p.type || 'Individual') === 'Individual' ? (
        <div className="row g-2 mb-2">
          <div className="col-md-4"><input className="form-control" placeholder="First name" value={p.first_name || ''} onChange={(e) => onChange({ first_name: e.target.value })} /></div>
          <div className="col-md-3"><input className="form-control" placeholder="Middle name" value={p.middle_name || ''} onChange={(e) => onChange({ middle_name: e.target.value })} /></div>
          <div className="col-md-4"><input className="form-control" placeholder="Last name" value={p.last_name || ''} onChange={(e) => onChange({ last_name: e.target.value })} /></div>
          <div className="col-md-1"><input className="form-control" placeholder="Suffix" value={p.suffix || ''} onChange={(e) => onChange({ suffix: e.target.value })} /></div>
        </div>
      ) : (
        <div className="row g-2 mb-2">
          <div className="col-md-6"><input className="form-control" placeholder="Company or trust name" value={p.entity_name || ''} onChange={(e) => onChange({ entity_name: e.target.value })} /></div>
          <div className="col-md-3">
            <select className="form-select" value={p.entity_state || 'Louisiana'} onChange={(e) => onChange({ entity_state: e.target.value })}>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-md-3"><input className="form-control" placeholder="Type (e.g. limited liability company)" value={p.entity_type || ''} onChange={(e) => onChange({ entity_type: e.target.value })} /></div>
          {withSigner && (
            <>
              <div className="col-md-6"><input className="form-control" placeholder="Person signing for it" value={p.signer_name || ''} onChange={(e) => onChange({ signer_name: e.target.value })} /></div>
              <div className="col-md-6"><input className="form-control" placeholder="Their title (e.g. Manager, Trustee)" value={p.signer_role || ''} onChange={(e) => onChange({ signer_role: e.target.value })} /></div>
            </>
          )}
        </div>
      )}
      <div className="row g-2">
        <div className="col-md-8"><input className="form-control" placeholder="Street address" value={p.street || ''} onChange={(e) => onChange({ street: e.target.value })} /></div>
        <div className="col-md-4"><input className="form-control" placeholder="Apt / suite" value={p.street2 || ''} onChange={(e) => onChange({ street2: e.target.value })} /></div>
        <div className="col-md-5"><input className="form-control" placeholder="City" value={p.city || ''} onChange={(e) => onChange({ city: e.target.value })} /></div>
        <div className="col-md-4">
          <select className="form-select" value={p.state || 'Louisiana'} onChange={(e) => onChange({ state: e.target.value })}>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-md-3"><input className="form-control" placeholder="ZIP" value={p.zip || ''} onChange={(e) => onChange({ zip: e.target.value })} /></div>
      </div>
    </>
  );

  return (
    <div className="container py-5" style={{ maxWidth: '900px' }}>
      <p><Link to="/my-account/business-planning">&larr; My Companies</Link></p>
      <h1 className="mb-1">{c.llc_name || plan.llcName || 'Your company'}</h1>
      <p className="text-muted mb-4">{plan.tierLabel}{!includes.registration && ' · Existing LLC'}</p>

      {errors.length > 0 && (
        <div className="alert alert-danger">
          <ul className="mb-0">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* Company */}
      <section className="card mb-4"><div className="card-body">
        <h3 className="h5 mb-3">Company</h3>
        <label className="form-label">Full name of the company, including "LLC" or "L.L.C."</label>
        <input className="form-control mb-3" value={c.llc_name || ''} onChange={(e) => setSection('company', { llc_name: e.target.value })} />
        <label className="form-label">Registered office (a Louisiana street address, not a P.O. box)</label>
        <div className="row g-2 mb-3">
          <div className="col-md-8"><input className="form-control" placeholder="Street address" value={c.office_street || ''} onChange={(e) => setSection('company', { office_street: e.target.value })} /></div>
          <div className="col-md-4"><input className="form-control" placeholder="Suite" value={c.office_street2 || ''} onChange={(e) => setSection('company', { office_street2: e.target.value })} /></div>
          <div className="col-md-4"><input className="form-control" placeholder="City" value={c.office_city || ''} onChange={(e) => setSection('company', { office_city: e.target.value })} /></div>
          <div className="col-md-3"><input className="form-control" placeholder="Parish" value={c.office_parish || ''} onChange={(e) => setSection('company', { office_parish: e.target.value })} /></div>
          <div className="col-md-2">
            <select className="form-select" value={c.office_state || 'Louisiana'} onChange={(e) => setSection('company', { office_state: e.target.value })}>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-md-3"><input className="form-control" placeholder="ZIP" value={c.office_zip || ''} onChange={(e) => setSection('company', { office_zip: e.target.value })} /></div>
        </div>
        <div className="row g-2">
          <div className="col-md-6"><input className="form-control" placeholder="Business phone" value={c.phone || ''} onChange={(e) => setSection('company', { phone: e.target.value })} /></div>
          <div className="col-md-6"><input className="form-control" placeholder="Business email" value={c.email || ''} onChange={(e) => setSection('company', { email: e.target.value })} /></div>
        </div>
      </div></section>

      {/* Members */}
      <section className="card mb-4"><div className="card-body">
        <h3 className="h5 mb-1">Members</h3>
        <p className="text-muted">The owners of the company. Ownership is split equally among them.</p>
        {form.members.map((mem, i) => (
          <div key={i} className="border rounded p-3 mb-3">
            <div className="d-flex justify-content-between mb-2">
              <strong>Member {i + 1}</strong>
              {form.members.length > 1 && (
                <button type="button" className="btn btn-link text-danger p-0" onClick={() => setForm((f) => ({ ...f, members: f.members.filter((_, j) => j !== i) }))}>
                  Remove
                </button>
              )}
            </div>
            {personFields(mem, (patch) => setMember(i, patch), `member-${i}`, true)}
          </div>
        ))}
        <button type="button" className="btn btn-outline-primary" onClick={() => setForm((f) => ({ ...f, members: [...f.members, emptyPerson()] }))}>
          <i className="fas fa-plus me-2"></i>Add a member
        </button>
      </div></section>

      {/* Registered agent */}
      <section className="card mb-4"><div className="card-body">
        <h3 className="h5 mb-3">Registered agent</h3>
        <p className="text-muted">The person or company that accepts legal papers for the LLC at a Louisiana address.</p>
        {includes.registeredAgent && (
          <div className="form-check">
            <input className="form-check-input" type="radio" id="ra-geaux" checked={agent.kind === 'geauxplans'} onChange={() => setSection('registered_agent', { kind: 'geauxplans' })} />
            <label className="form-check-label" htmlFor="ra-geaux">GeauxPlans (included with your purchase)</label>
          </div>
        )}
        <div className="form-check">
          <input className="form-check-input" type="radio" id="ra-member" checked={agent.kind === 'member'} onChange={() => setSection('registered_agent', { kind: 'member', member_index: 0 })} />
          <label className="form-check-label" htmlFor="ra-member">One of the members</label>
        </div>
        {agent.kind === 'member' && (
          <select className="form-select my-2" value={agent.member_index ?? 0} onChange={(e) => setSection('registered_agent', { member_index: parseInt(e.target.value, 10) })}>
            {form.members.map((mem, i) => <option key={i} value={i}>{personName(mem, i)}</option>)}
          </select>
        )}
        <div className="form-check">
          <input className="form-check-input" type="radio" id="ra-other" checked={agent.kind === 'other'} onChange={() => setSection('registered_agent', { kind: 'other', type: 'Individual', state: 'Louisiana' })} />
          <label className="form-check-label" htmlFor="ra-other">Someone else</label>
        </div>
        {agent.kind === 'other' && (
          <div className="mt-2">
            {personFields(agent, (patch) => setSection('registered_agent', patch), 'agent', false)}
          </div>
        )}
      </div></section>

      {/* Operating Agreement terms */}
      {includes.operatingAgreement && (
        <section className="card mb-4"><div className="card-body">
          <h3 className="h5 mb-3">Operating Agreement</h3>

          <label className="form-label">Should only members be able to serve as managers?</label>
          <YesNo name="only-members" value={m.only_member_managers} onChange={(v) => setSection('management', { only_member_managers: v })} />

          {m.only_member_managers === 'Yes' && (
            <div className="mt-3">
              <label className="form-label">Which members are the managers?</label>
              {form.members.map((mem, i) => {
                const picked = (m.member_managers || []).includes(i);
                return (
                  <div className="form-check" key={i}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`mgr-${i}`}
                      checked={picked}
                      onChange={() => setSection('management', {
                        member_managers: picked
                          ? (m.member_managers || []).filter((x) => x !== i)
                          : [...(m.member_managers || []), i],
                      })}
                    />
                    <label className="form-check-label" htmlFor={`mgr-${i}`}>{personName(mem, i)}</label>
                  </div>
                );
              })}
            </div>
          )}

          {m.only_member_managers === 'No' && (
            <div className="mt-3">
              <label className="form-label">Who may serve as a manager in the future?</label>
              {OTHER_MANAGER_OPTIONS.map((opt) => {
                const picked = (m.other_allowed || []).includes(opt);
                return (
                  <div className="form-check" key={opt}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`allowed-${opt}`}
                      checked={picked}
                      onChange={() => setSection('management', {
                        other_allowed: picked
                          ? (m.other_allowed || []).filter((x) => x !== opt)
                          : [...(m.other_allowed || []), opt],
                      })}
                    />
                    <label className="form-check-label" htmlFor={`allowed-${opt}`}>{opt}</label>
                  </div>
                );
              })}

              <label className="form-label mt-3">The first managers</label>
              {(m.managers || []).map((mgr, i) => (
                <div key={i} className="border rounded p-3 mb-2">
                  <div className="d-flex justify-content-between mb-2">
                    <strong>Manager {i + 1}</strong>
                    <button type="button" className="btn btn-link text-danger p-0" onClick={() => setSection('management', { managers: (m.managers || []).filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                  <YesNo name={`mgr-member-${i}`} value={mgr.is_member} onChange={(v) => setManager(i, { is_member: v, member_index: 0 })} />
                  <small className="text-muted">Is this manager one of the members?</small>
                  {mgr.is_member === 'Yes' && (
                    <select className="form-select mt-2" value={mgr.member_index ?? 0} onChange={(e) => setManager(i, { member_index: parseInt(e.target.value, 10) })}>
                      {form.members.map((mem, j) => <option key={j} value={j}>{personName(mem, j)}</option>)}
                    </select>
                  )}
                  {mgr.is_member === 'No' && (
                    <div className="row g-2 mt-2">
                      <div className="col-md-4">
                        <select className="form-select" value={mgr.type || 'Individual'} onChange={(e) => setManager(i, { type: e.target.value as 'Individual' | 'Entity' })}>
                          <option value="Individual">A person</option>
                          <option value="Entity">A company</option>
                        </select>
                      </div>
                      {(mgr.type || 'Individual') === 'Individual' ? (
                        <>
                          <div className="col-md-4"><input className="form-control" placeholder="First name" value={mgr.first_name || ''} onChange={(e) => setManager(i, { first_name: e.target.value })} /></div>
                          <div className="col-md-4"><input className="form-control" placeholder="Last name" value={mgr.last_name || ''} onChange={(e) => setManager(i, { last_name: e.target.value })} /></div>
                        </>
                      ) : (
                        <div className="col-md-8"><input className="form-control" placeholder="Company name" value={mgr.entity_name || ''} onChange={(e) => setManager(i, { entity_name: e.target.value })} /></div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-outline-primary" onClick={() => setSection('management', { managers: [...(m.managers || []), { is_member: 'Yes', member_index: 0 }] })}>
                <i className="fas fa-plus me-2"></i>Add a manager
              </button>
            </div>
          )}

          <label className="form-label mt-4">How should members vote?</label>
          <select className="form-select" value={m.voting_type || ''} onChange={(e) => setSection('management', { voting_type: e.target.value })}>
            <option value="">Choose…</option>
            <option value="Equal voting">Equally, one vote per member</option>
            <option value="Pro rata voting">By ownership, in proportion to units held</option>
          </select>

          <label className="form-label mt-3">How will the company be taxed?</label>
          <select className="form-select" value={m.tax_election || ''} onChange={(e) => setSection('management', { tax_election: e.target.value })}>
            <option value="">Choose…</option>
            {TAX_ELECTIONS.map((t) => <option key={t}>{t}</option>)}
          </select>

          <label className="form-label mt-3">Tax matters agent (who deals with the IRS for the company)</label>
          <input className="form-control" value={m.tax_matters_agent || ''} onChange={(e) => setSection('management', { tax_matters_agent: e.target.value })} />

          <label className="form-label mt-3">Allow members to transfer their interest to their children and grandchildren?</label>
          <YesNo name="family" value={m.permitted_family_transfers} onChange={(v) => setSection('management', { permitted_family_transfers: v })} />
          {m.permitted_family_transfers === 'Yes' && (
            <>
              <label className="form-label mt-3">Include a member's spouse?</label>
              <YesNo name="spouse" value={m.spouse_of_member} onChange={(v) => setSection('management', { spouse_of_member: v })} />
              <label className="form-label mt-3">Include the spouse of a member's descendant?</label>
              <YesNo name="desc-spouse" value={m.spouse_of_descendant} onChange={(v) => setSection('management', { spouse_of_descendant: v })} />
            </>
          )}
        </div></section>
      )}

      {/* EIN */}
      {includes.ein && (
        <section className="card mb-4"><div className="card-body">
          <h3 className="h5 mb-3">EIN application</h3>
          <label className="form-label">Why are you applying for an EIN?</label>
          <select className="form-select mb-3" value={form.ein.why || ''} onChange={(e) => setSection('ein', { why: e.target.value })}>
            <option value="">Choose…</option>
            {WHY_EIN.map((w) => <option key={w}>{w}</option>)}
          </select>
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <label className="form-label">Start month</label>
              <select className="form-select" value={form.ein.start_month || ''} onChange={(e) => setSection('ein', { start_month: e.target.value })}>
                <option value="">Choose…</option>
                {MONTHS.map((mo) => <option key={mo}>{mo}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Start year</label>
              <input className="form-control" value={form.ein.start_year || ''} onChange={(e) => setSection('ein', { start_year: e.target.value })} />
            </div>
          </div>
          <label className="form-label">What does the business do?</label>
          <select className="form-select mb-2" value={form.ein.what_do || ''} onChange={(e) => setSection('ein', { what_do: e.target.value })}>
            <option value="">Choose…</option>
            {BUSINESS_CATEGORIES.map((b) => <option key={b}>{b}</option>)}
          </select>
          {form.ein.what_do === 'Other' && (
            <input className="form-control mb-2" placeholder="Describe the business" value={form.ein.other_what_do || ''} onChange={(e) => setSection('ein', { other_what_do: e.target.value })} />
          )}
          <label className="form-label mt-2">Trade name (DBA), if any</label>
          <input className="form-control mb-3" value={form.ein.dba || ''} onChange={(e) => setSection('ein', { dba: e.target.value })} />
          {([
            ['w2_employees', 'Will you have employees receiving W-2s in the next 12 months?'],
            ['motor_vehicle', 'Does the business own a highway vehicle weighing 55,000 lbs or more?'],
            ['gambling', 'Does the business involve gambling or wagering?'],
            ['quarterly_excise', 'Does the business need to file Form 720 (quarterly federal excise tax)?'],
            ['restricted_items', 'Does the business sell or make alcohol, tobacco, or firearms?'],
          ] as const).map(([field, label]) => (
            <div className="mb-3" key={field}>
              <label className="form-label">{label}</label>
              <YesNo name={field} value={form.ein[field]} onChange={(v) => setSection('ein', { [field]: v })} />
            </div>
          ))}
        </div></section>
      )}

      {/* Licenses */}
      {includes.licenses && (
        <section className="card mb-4"><div className="card-body">
          <h3 className="h5 mb-3">Business licenses</h3>
          <label className="form-label">Is the business address within city limits?</label>
          <YesNo name="city-limits" value={form.licenses.in_city_limits} onChange={(v) => setSection('licenses', { in_city_limits: v })} />
          <label className="form-label mt-3">Anything else we should know for licensing (products sold, permits you already hold)?</label>
          <textarea className="form-control" rows={3} value={form.licenses.licenses_notes || ''} onChange={(e) => setSection('licenses', { licenses_notes: e.target.value })} />
        </div></section>
      )}

      <div className="d-flex gap-2 flex-wrap">
        <button type="button" className="btn btn-primary btn-lg" disabled={saving} onClick={() => save('completed')}>
          {saving ? 'Saving…' : includes.operatingAgreement ? 'Finish and prepare my Operating Agreement' : 'Finish'}
        </button>
        <button type="button" className="btn btn-outline-secondary btn-lg" disabled={saving} onClick={() => save('inprogress')}>
          Save and finish later
        </button>
      </div>
    </div>
  );
};

export default BusinessInterview;
