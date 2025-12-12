import React from 'react';

interface Product {
  id: number;
  name: string;
  price: string;
  description: string;
  features: string[];
}

const products: Product[] = [
  {
    id: 1,
    name: 'Minor Child-Centered Estate Plan',
    price: '$199',
    description: 'The Minor Child-Centered Estate Plan is well suited for families with young children.',
    features: [
      'Last Will and Testament',
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'Living Will / Healthcare Directive',
      'HIPAA Authorization',
    ],
  },
  {
    id: 2,
    name: 'Power of Attorney Supplement',
    price: '$99',
    description: 'Create Financial and Healthcare Power of Attorney documents for your adult child.',
    features: [
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'HIPAA Authorization',
    ],
  },
  {
    id: 3,
    name: 'Will-Based Estate Plan',
    price: '$199',
    description: 'Create a will-based plan to control your legacy.',
    features: [
      'Last Will and Testament',
      'Durable Financial Power of Attorney',
      'Healthcare Power of Attorney',
      'Living Will / Healthcare Directive',
      'HIPAA Authorization',
    ],
  },
  {
    id: 4,
    name: 'Trust-Based Estate Plan',
    price: '$399',
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
  },
];

const Shop: React.FC = () => {
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
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => alert(`Add ${product.name} to cart - Implement checkout functionality`)}
                >
                  Get Started
                </button>
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
    </main>
  );
};

export default Shop;
