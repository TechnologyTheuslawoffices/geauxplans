import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import '../styles/estate-plan-page.css';

interface PurchaseModalProduct {
  id: number;
  name: string;
  description: string;
  priceSolo: number;
  priceCouple: number;
}

interface PurchaseModalProps {
  product: PurchaseModalProduct;
  onClose: () => void;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({ product, onClose }) => {
  const [subscribeLEP, setSubscribeLEP] = useState<'1' | '0'>('1');
  const navigate = useNavigate();
  const { addEstatePlan } = useCart();

  // Everyone buys the solo plan. Including a second person is now a paid add-on
  // offered inside the interview (POAForm personal-info step), not a choice at
  // checkout, so this modal no longer asks "for how many people".
  const price = product.priceSolo;

  const handlePurchase = async () => {
    await addEstatePlan(product.id, 'solo', subscribeLEP === '1');
    navigate('/checkout');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content purchase-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>

        <div className="text-center mb-4">
          <img
            src="https://geauxplans.com/wp-content/uploads/2022/01/Plan-Builder-Icon.png"
            alt="Plan Builder"
            style={{ width: '48px', marginBottom: '20px' }}
          />
          <h2 style={{ color: '#1a1acc' }}>{product.name}</h2>
          <p className="text-muted fst-italic">{product.description}</p>
          <p className="mb-4">Average time to build a plan: <strong style={{ color: '#1a1acc' }}>20 minutes</strong></p>
        </div>

        <h4 className="mb-3">Build your plan</h4>
        <p className="text-muted fst-italic mb-4">
          After the purchase at your convenience, you will answer a series of questions to prepare your documents.
        </p>

        <div className="mb-3">
          <label className="form-label">
            Would you like to subscribe to the <a href="/legal-edge-plan" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Legal Edge Plan</a> for $9.99/month to be protected from any mistakes?
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
            ${price}{subscribeLEP === '1' ? ' + $9.99/mo' : ''}
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
  );
};

export default PurchaseModal;
