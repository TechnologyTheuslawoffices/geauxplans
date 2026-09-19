import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import '../../styles/estate-plan-page.css';

interface PlanCard {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  productId: number;
  priceSolo: number;
  priceCouple: number;
}

const PLANS: PlanCard[] = [
  {
    title: 'Power of Attorney',
    subtitle: 'POA Supplement Plan',
    description:
      'Legal documents for your college student or aging family members to handle financial and healthcare decisions.',
    icon: 'fas fa-file-signature',
    productId: 614,
    priceSolo: 99,
    priceCouple: 149,
  },
  {
    title: 'Minor Child-Centered',
    subtitle: 'Will-Based Plan',
    description:
      'Create a Will-Based estate plan to appoint a Tutor to act as a surrogate parent for your children if something should ever happen to you. Specify your final wishes for possessions and arrangements, as well as decide who will control your affairs if you become incapacitated.',
    icon: 'fas fa-child',
    productId: 606,
    priceSolo: 199,
    priceCouple: 299,
  },
  {
    title: 'Will-Based Estate Plan',
    subtitle: 'Comprehensive Will',
    description:
      'Control your legacy with a comprehensive will-based estate plan that directs how your assets are distributed and who manages your affairs.',
    icon: 'fas fa-scroll',
    productId: 673,
    priceSolo: 199,
    priceCouple: 299,
  },
  {
    title: 'Trust-Based Estate Plan',
    subtitle: 'Avoid Probate',
    description:
      'Avoid probate and transfer assets smoothly with a trust-based estate plan that keeps your affairs private and organized.',
    icon: 'fas fa-landmark',
    productId: 676,
    priceSolo: 399,
    priceCouple: 599,
  },
];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { addEstatePlan } = useCart();
  const navigate = useNavigate();

  const [selectedPlan, setSelectedPlan] = useState<PlanCard | null>(null);
  const [numPersons, setNumPersons] = useState<'1' | '2'>('1');
  const [subscribeLEP, setSubscribeLEP] = useState<'1' | '0'>('1');

  const openModal = (plan: PlanCard) => {
    setSelectedPlan(plan);
    setNumPersons('1');
    setSubscribeLEP('1');
  };

  const closeModal = () => setSelectedPlan(null);

  const getPrice = () =>
    selectedPlan ? (numPersons === '1' ? selectedPlan.priceSolo : selectedPlan.priceCouple) : 0;

  const handlePurchase = async () => {
    if (!selectedPlan) return;
    const formType = numPersons === '1' ? 'solo' : '2person';
    await addEstatePlan(selectedPlan.productId, formType, subscribeLEP === '1');
    navigate('/checkout');
  };

  return (
    <div>
      <h2 style={{ marginBottom: '10px' }}>Welcome back, {user?.firstName || user?.displayName || 'User'}!</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        From your account dashboard you can view your active plans and manage your account.
      </p>

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
          {PLANS.map((plan) => (
            <div
              key={plan.productId}
              style={{
                padding: '25px',
                border: '1px solid #eaeaea',
                borderRadius: '8px',
                backgroundColor: '#fff',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                <i className={plan.icon} style={{ fontSize: '28px', color: '#004d71' }}></i>
                <div>
                  <h4 style={{ margin: 0, fontSize: '18px' }}>{plan.title}</h4>
                  <span style={{ fontSize: '14px', color: '#707070' }}>{plan.subtitle}</span>
                </div>
              </div>
              <p style={{ color: '#555', fontSize: '14px', marginBottom: '20px', flexGrow: 1 }}>
                {plan.description}
              </p>
              <button
                type="button"
                onClick={() => openModal(plan)}
                className="btn btn_geaux"
                style={{ width: '100%', textAlign: 'center' }}
              >
                Start my Plan
              </button>
            </div>
          ))}
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

      {/* Purchase Modal */}
      {selectedPlan && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content purchase-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>&times;</button>

            <div className="text-center mb-4">
              <img
                src="https://geauxplans.com/wp-content/uploads/2022/01/Plan-Builder-Icon.png"
                alt="Plan Builder"
                style={{ width: '48px', marginBottom: '20px' }}
              />
              <h2 style={{ color: '#0000ff' }}>{selectedPlan.title}</h2>
              <p className="text-muted fst-italic">{selectedPlan.description}</p>
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
              >
                <option value="1">For one person</option>
                <option value="2">For two people</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">
                <strong>2.</strong> Would you like to subscribe to the <a href="/legal-edge-plan" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Legal Edge Plan</a> for $9.99/month to be protected from any mistakes?
              </label>
              <select
                className="form-select"
                value={subscribeLEP}
                onChange={(e) => setSubscribeLEP(e.target.value as '1' | '0')}
              >
                <option value="1">Yes, sure!</option>
                <option value="0">No, thank you</option>
              </select>
            </div>

            <div className="mb-4">
              <strong>Final Price:</strong>{' '}
              <strong style={{ fontSize: '1.25rem' }}>
                ${getPrice()}{subscribeLEP === '1' ? ' + $9.99/mo' : ''}
              </strong>
            </div>

            <button
              onClick={handlePurchase}
              className="btn btn-solid btn-lg w-100"
            >
              Purchase
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
