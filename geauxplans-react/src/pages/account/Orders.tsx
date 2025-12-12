import React from 'react';
import { Link } from 'react-router-dom';

// Mock data for orders - in a real app, this would come from an API
const mockOrders = [
  {
    id: '1042',
    date: '2024-01-15',
    status: 'Completed',
    total: 299.00,
    items: 1,
    products: ['Will-Based Estate Plan'],
  },
  {
    id: '1038',
    date: '2023-11-20',
    status: 'Completed',
    total: 99.00,
    items: 1,
    products: ['Power of Attorney Supplement'],
  },
];

const getStatusStyle = (status: string) => {
  switch (status.toLowerCase()) {
    case 'completed':
      return { backgroundColor: '#d4edda', color: '#155724' };
    case 'processing':
      return { backgroundColor: '#cce5ff', color: '#004085' };
    case 'pending':
      return { backgroundColor: '#fff3cd', color: '#856404' };
    case 'cancelled':
      return { backgroundColor: '#f8d7da', color: '#721c24' };
    default:
      return { backgroundColor: '#e2e3e5', color: '#383d41' };
  }
};

const Orders: React.FC = () => {
  const hasOrders = mockOrders.length > 0;

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Order History</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        View your past orders and their status below.
      </p>

      {hasOrders ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eaeaea' }}>
                <th style={{ textAlign: 'left', padding: '15px 10px', color: '#707070', fontSize: '14px', fontWeight: '600' }}>
                  Order
                </th>
                <th style={{ textAlign: 'left', padding: '15px 10px', color: '#707070', fontSize: '14px', fontWeight: '600' }}>
                  Date
                </th>
                <th style={{ textAlign: 'left', padding: '15px 10px', color: '#707070', fontSize: '14px', fontWeight: '600' }}>
                  Status
                </th>
                <th style={{ textAlign: 'left', padding: '15px 10px', color: '#707070', fontSize: '14px', fontWeight: '600' }}>
                  Total
                </th>
                <th style={{ textAlign: 'right', padding: '15px 10px', color: '#707070', fontSize: '14px', fontWeight: '600' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {mockOrders.map((order) => (
                <tr key={order.id} style={{ borderBottom: '1px solid #eaeaea' }}>
                  <td style={{ padding: '20px 10px' }}>
                    <span style={{ fontWeight: '600', color: '#004d71' }}>#{order.id}</span>
                  </td>
                  <td style={{ padding: '20px 10px' }}>
                    {new Date(order.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </td>
                  <td style={{ padding: '20px 10px' }}>
                    <span
                      style={{
                        padding: '5px 15px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        ...getStatusStyle(order.status),
                      }}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td style={{ padding: '20px 10px' }}>
                    <span style={{ fontWeight: '600' }}>
                      ${order.total.toFixed(2)}
                    </span>
                    <span style={{ color: '#707070', fontSize: '14px' }}>
                      {' '}for {order.items} item{order.items !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '20px 10px', textAlign: 'right' }}>
                    <button
                      className="btn btn-sm"
                      style={{
                        backgroundColor: '#004d71',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 15px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <i className="fas fa-shopping-bag" style={{ fontSize: '48px', color: '#ccc', marginBottom: '20px', display: 'block' }}></i>
          <h3 style={{ marginBottom: '10px' }}>No Orders Yet</h3>
          <p style={{ color: '#707070', marginBottom: '20px' }}>
            You haven't placed any orders yet.
          </p>
          <Link to="/shop" className="btn btn-primary">
            Browse Products
          </Link>
        </div>
      )}

      <div
        style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
        }}
      >
        <h4 style={{ marginBottom: '15px' }}>
          <i className="fas fa-question-circle" style={{ marginRight: '10px', color: '#004d71' }}></i>
          Need Help With an Order?
        </h4>
        <p style={{ color: '#707070', marginBottom: '0' }}>
          If you have questions about an order, please{' '}
          <Link to="/contact" style={{ color: '#004d71', fontWeight: '600' }}>
            contact our support team
          </Link>
          . We're here to help Monday through Friday, 8am-5pm CST.
        </p>
      </div>
    </div>
  );
};

export default Orders;
