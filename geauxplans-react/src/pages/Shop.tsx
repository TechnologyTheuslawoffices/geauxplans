import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PurchaseModal from '../components/PurchaseModal';

interface Product {
  id: number;
  name: string;
  price: string;
  priceSolo: number;
  priceCouple: number;
  description: string;
  features: string[];
  url: string;
}

const products: Product[] = [
  {
    id: 606,
    name: 'Minor Child-Centered Estate Plan',
    price: '$199',
    priceSolo: 199,
    priceCouple: 299,
    description: 'The Minor Child-Centered Estate Plan is well suited for families with young children.',
    features: [
      'Last Will and Testament',
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'Living Will / Healthcare Directive',
      'HIPAA Authorization',
    ],
    url: '/minor-child-centered-estate-plan',
  },
  {
    id: 614,
    name: 'Power of Attorney Supplement',
    price: '$99',
    priceSolo: 99,
    priceCouple: 149,
    description: 'Create Financial and Healthcare Power of Attorney documents for your adult child.',
    features: [
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'HIPAA Authorization',
    ],
    url: '/power-of-attorney-plan',
  },
  {
    id: 673,
    name: 'Will-Based Estate Plan',
    price: '$199',
    priceSolo: 199,
    priceCouple: 299,
    description: 'Create a will-based plan to control your legacy.',
    features: [
      'Last Will and Testament',
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'Living Will / Healthcare Directive',
      'HIPAA Authorization',
    ],
    url: '/will-based-estate-plan',
  },
  {
    id: 676,
    name: 'Trust-Based Estate Plan',
    price: '$399',
    priceSolo: 399,
    priceCouple: 599,
    description: 'Create a trust-based plan to avoid probate and transfer assets to your loved ones.',
    features: [
      'Revocable Living Trust',
      'Pourover Will',
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'Living Will / Healthcare Directive',
      'HIPAA Authorization',
      'Certificate of Trust',
      'Trust Funding Instructions',
    ],
    url: '/trust-based-estate-plan',
  },
];

const Shop: React.FC = () => {
  const [selected, setSelected] = useState<Product | null>(null);

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>Choose Your Estate Plan</h1>
          <p style={{ textAlign: 'center', marginBottom: '50px', color: '#707070' }}>
            Select the package that best fits your needs
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px' }}>
            {products.map((product) => (
              <div
                key={product.id}
                style={{
                  border: '1px solid #eaeaea',
                  borderRadius: '8px',
                  padding: '30px',
                  backgroundColor: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                <h3 style={{ marginBottom: '10px' }}>{product.name}</h3>
                <p style={{ fontSize: '24px', color: '#004d71', fontWeight: 'bold', marginBottom: '15px' }}>
                  {product.price}
                </p>
                <p style={{ marginBottom: '20px', color: '#707070' }}>{product.description}</p>
                <h4 style={{ fontSize: '14px', marginBottom: '10px', color: '#004d71' }}>Includes:</h4>
                <ul style={{ paddingLeft: '20px', marginBottom: '25px' }}>
                  {product.features.map((feature, index) => (
                    <li key={index} style={{ marginBottom: '8px', color: '#707070' }}>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 'auto' }}>
                  <button
                    onClick={() => setSelected(product)}
                    className="btn btn-primary"
                    style={{ width: '100%', display: 'block', textAlign: 'center' }}
                  >
                    Get Started
                  </button>
                  <Link
                    to={product.url}
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      marginTop: '12px',
                      fontSize: '14px',
                      color: '#004d71',
                      textDecoration: 'underline',
                    }}
                  >
                    Learn more
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '60px', padding: '40px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>Need Help Choosing?</h3>
            <p style={{ textAlign: 'center', color: '#707070', marginBottom: '20px' }}>
              Our team is here to help you select the right estate planning package for your needs.
            </p>
            <p style={{ textAlign: 'center' }}>
              <strong>Call us:</strong> +1 (855) 213-6300 | M-F, 8am-5pm CST
            </p>
          </div>
        </div>
      </section>

      {selected && (
        <PurchaseModal
          product={{
            id: selected.id,
            name: selected.name,
            description: selected.description,
            priceSolo: selected.priceSolo,
            priceCouple: selected.priceCouple,
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
};

export default Shop;
