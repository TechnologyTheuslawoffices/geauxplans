import React, { useState } from 'react';
import { submitLead } from '../services/leads';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
  website: '', // honeypot
};

const Contact: React.FC = () => {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await submitLead({
      source: 'contact',
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      details: { subject: formData.subject, message: formData.message },
      website: formData.website,
    });

    setIsSubmitting(false);

    if (response.success) {
      setIsSubmitted(true);
      setFormData(EMPTY_FORM);
    } else {
      // Keep the user's input so they can retry without retyping.
      setError(response.error || 'Something went wrong. Please try again.');
    }
  };

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>Contact Us</h1>
          <p style={{ textAlign: 'center', marginBottom: '50px', color: '#707070' }}>
            Have questions? We're here to help!
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '50px' }}>
            {/* Contact Form */}
            <div>
              <h2 style={{ marginBottom: '30px' }}>Send Us a Message</h2>

              {isSubmitted && (
                <div
                  role="status"
                  style={{
                    backgroundColor: '#e8f5e9',
                    border: '1px solid #2e7d32',
                    color: '#1b5e20',
                    padding: '20px',
                    borderRadius: '4px',
                    marginBottom: '25px',
                  }}
                >
                  <strong>Thank you for your message!</strong>
                  <p style={{ margin: '8px 0 0' }}>We'll get back to you soon.</p>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    backgroundColor: '#fdecea',
                    border: '1px solid #c62828',
                    color: '#b71c1c',
                    padding: '15px',
                    borderRadius: '4px',
                    marginBottom: '25px',
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Honeypot: hidden from users, tempting to bots. */}
                <input
                  type="text"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-9999px',
                    width: '1px',
                    height: '1px',
                    opacity: 0,
                  }}
                />
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Subject *</label>
                  <select
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                    }}
                  >
                    <option value="">Select a subject</option>
                    <option value="general">General Inquiry</option>
                    <option value="pricing">Pricing Question</option>
                    <option value="support">Technical Support</option>
                    <option value="legal">Legal Question</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Message *</label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={5}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #eaeaea',
                      borderRadius: '4px',
                      fontSize: '16px',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>

            {/* Contact Info */}
            <div>
              <h2 style={{ marginBottom: '30px' }}>Contact Information</h2>

              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>
                  <i className="fas fa-phone" style={{ marginRight: '10px', color: '#004d71' }}></i>
                  Phone
                </h3>
                <p style={{ marginLeft: '30px' }}>
                  <a href="tel:+18552136300">+1 (855) 213-6300</a>
                </p>
              </div>

              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>
                  <i className="fas fa-clock" style={{ marginRight: '10px', color: '#004d71' }}></i>
                  Hours
                </h3>
                <p style={{ marginLeft: '30px' }}>
                  Monday - Friday: 8:00 AM - 5:00 PM CST
                </p>
              </div>

              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>
                  <i className="fab fa-facebook" style={{ marginRight: '10px', color: '#004d71' }}></i>
                  Social Media
                </h3>
                <p style={{ marginLeft: '30px' }}>
                  <a href="https://www.facebook.com/GeauxPlans" target="_blank" rel="noopener noreferrer">
                    Follow us on Facebook
                  </a>
                </p>
              </div>

              <div
                style={{
                  backgroundColor: '#f5f5f5',
                  padding: '30px',
                  borderRadius: '8px',
                  marginTop: '40px',
                }}
              >
                <h3 style={{ marginBottom: '15px' }}>Need Immediate Assistance?</h3>
                <p style={{ color: '#707070' }}>
                  Our support team is available Monday through Friday, 8am to 5pm CST.
                  Call us directly for the fastest response.
                </p>
                <p style={{ marginTop: '15px' }}>
                  <a href="tel:+18552136300" className="btn btn-primary">
                    Call Now
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Contact;
