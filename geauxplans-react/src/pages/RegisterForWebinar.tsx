import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/register-for-webinar.css';

const RegisterForWebinar: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalFormData, setModalFormData] = useState({
    eventDate: '',
    eventTime: '',
    fullName: '',
    email: '',
    countryCode: '+1',
    phone: '',
    zipCode: '',
  });
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);

  // Available event dates and times
  const eventDates = [
    { value: '2026-01-15', label: 'January 15, 2026' },
    { value: '2026-01-22', label: 'January 22, 2026' },
    { value: '2026-01-29', label: 'January 29, 2026' },
    { value: '2026-02-05', label: 'February 5, 2026' },
  ];

  const eventTimes = [
    { value: '10:00', label: '10:00 AM CST' },
    { value: '14:00', label: '2:00 PM CST' },
    { value: '18:00', label: '6:00 PM CST' },
  ];

  const countryCodes = [
    { value: '+1', label: '+1 (US)' },
    { value: '+44', label: '+44 (UK)' },
    { value: '+63', label: '+63 (PH)' },
    { value: '+61', label: '+61 (AU)' },
    { value: '+33', label: '+33 (FR)' },
    { value: '+49', label: '+49 (DE)' },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setModalFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalSubmitting(true);

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsModalSubmitting(false);
    setShowModal(false);
    navigate('/thank-you-for-your-reservation');
  };

  return (
    <main className="webinar-page">
      {/* Hero Section */}
      <section className="webinar-hero">
        <div className="container">
          <p className="webinar-intro">Join Us! The next webinar begins soon:</p>
          <h1>Get A GeauxPlan!</h1>
          <h2>How to Create Your Own Estate Plan<br />Without an Attorney (or Attorney Fees)!</h2>
          <h3 className="save-spot">Save your spot for this (free) webinar!</h3>
          <button className="btn-register-now" onClick={() => setShowModal(true)}>
            Register Now
          </button>
        </div>
      </section>

      {/* About Section */}
      <section className="webinar-about">
        <div className="container">
          <div className="webinar-about-content">
            <h2>Hello, we are GeauxPlans! Estate planning made simple and affordable - exclusively for Louisiana!</h2>
            <p>
              If you are looking for a budget-friendly estate planning solution for Louisiana residents,
              you've come to the right place.
            </p>
            <p>
              Please join us for a complimentary webinar and discover basic must-know estate planning
              concepts that will enable you to create your own estate plan -- without an Attorney (or Attorney Fees)!
            </p>
          </div>
          <div className="webinar-image">
            <img
              src="/wp-content/uploads/2023/02/GeauxPlans-Webinar-Title-Page-720-x-720.jpg"
              alt="GeauxPlans Webinar"
            />
          </div>
        </div>
      </section>

      {/* RSVP Form Section */}
      <section className="webinar-rsvp">
        <div className="container">
          <div className="arrows-decoration">
            <img src="/wp-content/uploads/2021/12/arrows-300x281.png" alt="" />
          </div>

          {!isSubmitted ? (
            <div className="rsvp-form-container">
              <h2>RSVP NOW to Secure Your Spot!</h2>
              <p className="rsvp-subtitle">
                Learn how to protect everything you own and everyone you love...THE RIGHT WAY!
              </p>
              <div className="stars">
                <img src="/wp-content/uploads/2021/12/email-header-5-star-review-600-x-200.png" alt="5 stars" />
              </div>
              <form onSubmit={handleSubmit} className="rsvp-form">
                <div className="form-group">
                  <input
                    type="text"
                    name="name"
                    placeholder="Your Name *"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="email"
                    name="email"
                    placeholder="Your Email *"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="tel"
                    name="phone"
                    placeholder="Your Phone Number"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <button type="submit" className="btn-reserve" disabled={isSubmitting}>
                  {isSubmitting ? 'Reserving...' : 'Reserve My Seat Now!'}
                </button>
              </form>
            </div>
          ) : (
            <div className="rsvp-success">
              <h2>Thank You for Registering!</h2>
              <p>We've sent a confirmation email with the webinar details. See you there!</p>
            </div>
          )}
        </div>
      </section>

      {/* What We'll Cover Section */}
      <section className="webinar-topics">
        <div className="container">
          <h2>What We'll Cover In This Online Event</h2>
          <h3>With skilled guidance from your host, you will also discover:</h3>

          <ul className="topics-list">
            <li>The difference between a revocable and irrevocable trust</li>
            <li>How to avoid the expense and delay of probate with a revocable trust from GeauxPlans</li>
            <li>Why it is essential to "fund" a revocable trust and how to do it properly</li>
            <li>How to actually create your own estate plan with GeauxPlans at a fraction of the cost of an attorney-prepared estate plan</li>
            <li>And so much more....</li>
          </ul>

          <div className="arrows-decoration center">
            <img src="/wp-content/uploads/2021/12/arrows-300x281.png" alt="" />
          </div>
        </div>
      </section>

      {/* Highlights Section */}
      <section className="webinar-highlights">
        <div className="container">
          <h2>More Highlights From This Online Event</h2>
          <h3>Attend this webinar and discover:</h3>

          <div className="highlights-grid">
            <div className="highlight-card">
              <img
                src="/wp-content/uploads/2021/12/protect-savings-image-only-897-x-600.png"
                alt="Protect Savings"
              />
              <h4>Discovery #1</h4>
              <p>How to protect your home, savings, and family from costly mistakes</p>
            </div>

            <div className="highlight-card">
              <img
                src="/wp-content/uploads/2021/12/control-image-only-897-x-600-768x514.png"
                alt="Stay In Control"
              />
              <h4>Discovery #2</h4>
              <p>How to control who gets what, when, and how</p>
            </div>

            <div className="highlight-card">
              <img
                src="/wp-content/uploads/2021/12/signing-3-897-x-600-768x514.png"
                alt="Will vs Trust"
              />
              <h4>Discovery #3</h4>
              <p>The difference between a will and a trust, and which one may be right for you</p>
            </div>
          </div>
        </div>
      </section>

      {/* Presenter Section */}
      <section className="webinar-presenter">
        <div className="container">
          <h2>About Your Presenter</h2>
          <div className="presenter-content">
            <div className="presenter-image">
              <img
                src="/wp-content/uploads/2021/12/jfc8962-2-1024x977-1-768x733.jpg"
                alt="J. Graves Theus, Jr."
              />
            </div>
            <div className="presenter-bio">
              <h3>J. Graves Theus, Jr.</h3>
              <p className="title">Attorney at Law</p>
              <p>
                Hi, my name is Graves Theus. I'm a premier-rated Louisiana attorney and
                I've been practicing law for over 25 years. I specialize in estate planning &amp;
                asset protection. It's my passion to help individuals make the right personalized
                decisions about how to protect their home, savings, and family.
              </p>
              <p>
                There are many options for online estate planning. None are Louisiana specific.
                Choosing the wrong source or improperly answering questions can render a self-prepared
                estate plan legally invalid, especially in Louisiana. Having litigated many "bad will"
                cases, I know this for a fact, which is why I created GeauxPlans!
              </p>
              <p>
                A little bit of knowledge and the right set of tools will help you avoid costly mistakes,
                so you can rest easy knowing all is right in the world - and you can get back to that gumbo.
                Let's Geaux!
              </p>
            </div>
          </div>
          <blockquote className="presenter-quote">
            "The trouble is, you think you have time." ~Jack Kornfield
          </blockquote>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="webinar-testimonials">
        <div className="container">
          <div className="stars-review">
            <img
              src="/wp-content/uploads/2021/12/email-header-5-star-review-600-x-200.png"
              alt="5 Star Reviews"
            />
          </div>
          <h2>"Exceptionally competent and patiently answers questions..."</h2>
          <div className="testimonials-list">
            <p>
              <span className="arrow">&#10148;</span> We started by attending an Estate Planning Workshop led by Graves Theus.
              That was about the wisest decision we have made in some time. <strong>~Doyle</strong>
            </p>
            <p>
              <span className="arrow">&#10148;</span> The Estate Planning Seminar is a must from my perspective. <strong>~Mark</strong>
            </p>
            <p>
              <span className="arrow">&#10148;</span> I attended an Estate Planning Workshop and was extremely impressed.
              The entire staff made every step of this process very easy. <strong>~Dianne</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <section className="webinar-footer">
        <div className="container">
          <img
            src="/wp-content/uploads/2020/11/GeauxPlansLogo-07-1.png"
            alt="GeauxPlans Logo"
            className="footer-logo"
          />
          <p>&copy; Copyright GeauxPlans.com, L.L.C. All Rights Reserved.</p>
        </div>
      </section>

      {/* Registration Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>
              &times;
            </button>
            <div className="modal-header">
              <p>Get a GeauxPlan!</p>
              <h2>Register for our free estate planning webinar</h2>
            </div>
            <form onSubmit={handleModalSubmit} className="modal-form">
              <div className="form-section">
                <h3>Event Schedule</h3>
                <div className="form-group">
                  <label htmlFor="eventDate">Select event date</label>
                  <select
                    id="eventDate"
                    name="eventDate"
                    value={modalFormData.eventDate}
                    onChange={handleModalChange}
                    required
                  >
                    <option value="">Select a date...</option>
                    {eventDates.map((date) => (
                      <option key={date.value} value={date.value}>
                        {date.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="eventTime">Select event time</label>
                  <select
                    id="eventTime"
                    name="eventTime"
                    value={modalFormData.eventTime}
                    onChange={handleModalChange}
                    required
                  >
                    <option value="">Select a time...</option>
                    {eventTimes.map((time) => (
                      <option key={time.value} value={time.value}>
                        {time.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="fullName">Enter your full name</label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  placeholder="Full Name"
                  value={modalFormData.fullName}
                  onChange={handleModalChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="modalEmail">Enter your E-mail</label>
                <input
                  type="email"
                  id="modalEmail"
                  name="email"
                  placeholder="Email Address"
                  value={modalFormData.email}
                  onChange={handleModalChange}
                  required
                />
              </div>

              <div className="form-group phone-group">
                <label htmlFor="modalPhone">Enter your phone number</label>
                <div className="phone-input-wrapper">
                  <select
                    name="countryCode"
                    value={modalFormData.countryCode}
                    onChange={handleModalChange}
                    className="country-code-select"
                  >
                    {countryCodes.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    id="modalPhone"
                    name="phone"
                    placeholder="Phone Number"
                    value={modalFormData.phone}
                    onChange={handleModalChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="zipCode">Zip Code</label>
                <input
                  type="text"
                  id="zipCode"
                  name="zipCode"
                  placeholder="Zip Code"
                  value={modalFormData.zipCode}
                  onChange={handleModalChange}
                  required
                />
              </div>

              <button type="submit" className="btn-reserve-modal" disabled={isModalSubmitting}>
                {isModalSubmitting ? 'Reserving...' : 'YES! RESERVE MY SEAT NOW'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

export default RegisterForWebinar;
