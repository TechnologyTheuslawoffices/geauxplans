import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { cartUtils } from '../services/cartService';
import '../styles/cart.css';

/**
 * Shopping cart.
 *
 * WordPress had a WooCommerce cart at /cart; the rewrite went straight from a
 * product page to /checkout, so there was no way to review a purchase, change
 * quantities, or drop a line before paying. Old links and bookmarks to /cart
 * landed on a blank page.
 *
 * Quantity controls are deliberately limited to subscriptions being fixed at
 * one: the Legal Edge Plan is a recurring membership, and two of them is not a
 * thing a customer can want.
 */
const Cart: React.FC = () => {
  const { cart, updateItem, removeItem, clearCart, isLoading } = useCart();
  const navigate = useNavigate();

  const isEmpty = cart.items.length === 0;

  if (isEmpty) {
    return (
      <main className="cart-page">
        <section className="cart-hero">
          <div className="container">
            <h1><em className="text-blue">Your</em> <strong>Cart</strong></h1>
          </div>
        </section>
        <section className="cart-section">
          <div className="container">
            <div className="cart-empty">
              <p>Your cart is empty.</p>
              <div className="cart-empty-actions">
                <Link to="/estate-planning" className="btn btn-solid">Browse Estate Plans</Link>
                <Link to="/start-business-llc" className="btn btn-outline">Start an LLC</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="cart-page">
      <section className="cart-hero">
        <div className="container">
          <h1><em className="text-blue">Your</em> <strong>Cart</strong></h1>
        </div>
      </section>

      <section className="cart-section">
        <div className="container">
          <div className="cart-layout">
            <div className="cart-items">
              {cart.items.map(item => {
                const isSubscription = item.type === 'subscription';
                return (
                  <div key={item.id} className="cart-item">
                    <div className="cart-item-main">
                      <h2>{item.name}</h2>
                      {isSubscription && <span className="cart-item-badge">Monthly subscription</span>}
                      {item.metadata?.formType === '2person' && (
                        <span className="cart-item-badge">Two-person plan</span>
                      )}
                    </div>

                    <div className="cart-item-qty">
                      {isSubscription ? (
                        <span className="cart-qty-fixed">1</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name}`}
                            disabled={isLoading || item.quantity <= 1}
                            onClick={() => updateItem(item.id, item.quantity - 1)}
                          >
                            &minus;
                          </button>
                          <span aria-live="polite">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name}`}
                            disabled={isLoading}
                            onClick={() => updateItem(item.id, item.quantity + 1)}
                          >
                            +
                          </button>
                        </>
                      )}
                    </div>

                    <div className="cart-item-price">
                      {cartUtils.formatPrice(cartUtils.getItemSubtotal(item))}
                      {isSubscription && <span className="cart-item-period">/mo</span>}
                    </div>

                    <button
                      type="button"
                      className="cart-item-remove"
                      aria-label={`Remove ${item.name} from cart`}
                      disabled={isLoading}
                      onClick={() => removeItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                className="cart-clear"
                disabled={isLoading}
                onClick={() => clearCart()}
              >
                Empty cart
              </button>
            </div>

            <aside className="cart-summary">
              <h2>Order Summary</h2>
              <div className="cart-summary-row">
                <span>Subtotal</span>
                <span>{cartUtils.formatPrice(cart.subtotal)}</span>
              </div>
              {/*
                Tax is not shown as a line here. It is calculated by Stripe at
                payment time, and printing "Tax $0.00" would read as a promise
                that there is none.
              */}
              <div className="cart-summary-row cart-summary-total">
                <span>Total</span>
                <span>{cartUtils.formatPrice(cart.total)}</span>
              </div>
              <p className="cart-summary-note">Taxes are calculated at checkout.</p>

              <button
                type="button"
                className="btn btn-solid btn-lg cart-checkout"
                disabled={isLoading}
                onClick={() => navigate('/checkout')}
              >
                Proceed to Checkout
              </button>

              <Link to="/estate-planning" className="cart-continue">Continue shopping</Link>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Cart;
