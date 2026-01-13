import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/confirmation-pages.css';

const ThankYouResources: React.FC = () => {
  return (
    <main className="confirmation-page thank-you-resources">
      <div className="container">
        <div className="confirmation-content">
          <h1 className="text-blue">
            <span className="wave-emoji">&#128075;</span> <em>Thank You For Your Request</em>
          </h1>
          <h2 className="subtitle">Check Your Inbox Now For Your Free Download</h2>

          <p className="intro-text">
            We've sent an email with the free resource you requested. It is our hope that
            this complimentary download will help you protect your home, savings, and family
            from costly mistakes!
          </p>
        </div>

        {/* Hello Section */}
        <section className="hello-section">
          <div className="hello-content">
            <h2>
              <strong><em>Hello, We Are </em></strong>
              <em className="text-blue"><strong>GeauxPlans</strong></em>
            </h2>
            <h3>
              <em className="text-gray">Estate Planning Made Easy &amp; Affordable for Louisiana!</em>
            </h3>

            <p>
              Protecting everything you own and everyone you love has never been so
              <em> simple with plans starting at <strong>$99</strong>.</em>
            </p>

            <p>
              A well-designed Estate Plan will determine who controls your affairs and who gets
              to benefit if something happens to you. Choose guardians or tutors for minor children.
              Avoid the burden and expense of probate. Authorize someone to act for you in a
              medical emergency. Minimize disputes and ensure your final wishes are carried out
              exactly as you want. Support is available at every step of the way.
            </p>

            <Link to="/estate-planning" className="btn btn-secondary">
              View All Plans
            </Link>
          </div>
        </section>

        {/* Stats Section */}
        <section className="stats-section">
          <div className="stats-grid">
            <div className="stat-card">
              <h2 className="stat-number text-blue"><em>140</em></h2>
              <p><em>Years total experience of our specialists in the field of law</em></p>
            </div>
            <div className="stat-card featured">
              <h2 className="stat-number">
                <span className="text-gray">#</span><span className="text-blue">1</span>
              </h2>
              <p><em>Online Estate and Business planning company in Louisiana</em></p>
            </div>
            <div className="stat-card">
              <h2 className="stat-number text-blue"><em>5k</em></h2>
              <p><em>Happy clients across the United States</em></p>
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="process-section">
          <h2>The <em className="text-blue">simplest</em> process</h2>
          <p className="text-gray"><em>Quick, affordable and can be completed in 3 easy steps!</em></p>

          <div className="steps">
            <div className="step">
              <span className="step-number">#1</span>
              <p><em>Choose your Estate Plan among the available options and submit payment online</em></p>
            </div>
            <div className="step">
              <span className="step-number">#2</span>
              <p>
                <em>Complete the GeauxPlans interview online. This should take no more than 30 minutes!
                That's it! It will be so easy and painless that you will wonder why you waited so long.</em>
              </p>
            </div>
            <div className="step">
              <span className="step-number">#3</span>
              <p>
                <em>Your responses will be electronically submitted to GeauxPlans. A document specialist
                will assimilate your interview responses into a series of estate planning documents.</em>
              </p>
              <p className="alert-note">
                Your documents will be available for immediate download after you complete your
                questionnaire, or you may request professional printing and shipping at checkout.
              </p>
            </div>
          </div>

          <Link to="/estate-planning" className="btn btn-primary">
            Help me choose the right plan
          </Link>
        </section>

        {/* Plans Section */}
        <section className="plans-section">
          <h2>Simply, <em className="text-blue">pick the plan</em> that is right for you</h2>
          <p className="text-gray"><em>Practical, affordable, and complete solutions for every occasion</em></p>

          <div className="plans-grid">
            <div className="plan-card">
              <img
                src="/wp-content/uploads/2022/01/Minor-Child-Centered-Estate-Plan-icon.png"
                alt="Minor Child Plan"
              />
              <h5><strong>Minor Child-Centered Estate Plan</strong></h5>
              <p>
                Create a will-based plan to appoint a Tutor for a minor child to act as a
                surrogate parent for you if something should ever happen to you.
              </p>
              <Link to="/minor-child-centered-estate-plan" className="btn btn-primary btn-sm">
                Start My Minor Child Plan
              </Link>
              <Link to="/minor-child-centered-estate-plan" className="learn-more">Learn More &rarr;</Link>
            </div>

            <div className="plan-card">
              <img
                src="/wp-content/uploads/2022/01/Power-of-Attorney-Plan-icon.png"
                alt="Power of Attorney Plan"
              />
              <h5><strong>Power of Attorney Plan</strong></h5>
              <p>
                The Power of Attorney Supplement to your estate plan is well suited for families
                with a young adult child or student, or with an aging parent or family member.
              </p>
              <Link to="/power-of-attorney-plan" className="btn btn-primary btn-sm">
                Start My Power of Attorney
              </Link>
              <Link to="/power-of-attorney-plan" className="learn-more">Learn More &rarr;</Link>
            </div>

            <div className="plan-card">
              <img
                src="/wp-content/uploads/2022/01/Will-Based-Estate-Plan-icon.png"
                alt="Will-Based Plan"
              />
              <h5><strong>Will-Based Estate Plan</strong></h5>
              <p>
                The Will-Based Estate Plan includes a Last Will and Testament, Financial Power
                of Attorney, Medical Power of Attorney, as well as an Advance Healthcare Directive.
              </p>
              <Link to="/will-based-estate-plan" className="btn btn-primary btn-sm">
                Start My Will
              </Link>
              <Link to="/will-based-estate-plan" className="learn-more">Learn More &rarr;</Link>
            </div>

            <div className="plan-card">
              <img
                src="/wp-content/uploads/2022/01/Trust-Based-Estate-Plan-icon.png"
                alt="Trust-Based Plan"
              />
              <h5><strong>Trust-Based Estate Plan</strong></h5>
              <p>
                The Trust-Based Estate Plan includes a Revocable Living Trust, Pourover Will,
                Financial Power of Attorney, Medical Power of Attorney, and Healthcare Directive.
              </p>
              <Link to="/trust-based-estate-plan" className="btn btn-primary btn-sm">
                Start My Trust
              </Link>
              <Link to="/trust-based-estate-plan" className="learn-more">Learn More &rarr;</Link>
            </div>
          </div>

          <div className="quiz-section">
            <h5><strong>Don't know what to choose?</strong></h5>
            <p><em className="text-blue">We can help!</em></p>
            <p>
              <em><strong>Answer a few simple questions</strong> to find out which of our plans
              is right for your unique life situation.</em>
            </p>
            <Link to="/estate-planning" className="btn btn-secondary">
              Take the quiz
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
};

export default ThankYouResources;
