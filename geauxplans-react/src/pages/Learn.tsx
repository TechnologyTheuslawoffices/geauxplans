import React from 'react';
import { Link } from 'react-router-dom';
import heroImage from '../assets/images/field-family.jpg';

const Learn: React.FC = () => {
  return (
    <main>
      {/* Hero Section */}
      <section
        className="process-hero"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="hero-content">
          <div className="container">
            <h2>
              GeauxPlans is a Revolutionary Platform<br />
              Designed Exclusively for residents<br />
              of the Bayou State.
            </h2>
          </div>
        </div>
        <div className="process-hero-text">
          <p>
            Unlike other online sources for simple estate planning documents,
            GeauxPlans&trade; is supported and operated by a Louisiana law firm
            specializing in estate, business and asset protection.
          </p>
        </div>
      </section>

      {/* Documents Section */}
      <section className="documents-section">
        <div className="container">
          <h3 className="section-title">
            GeauxPlans may include the following essential estate planning Documents:
          </h3>

          <div className="document-item">
            <h4>Last Will and Testament</h4>
            <p>
              A Will is essentially a gift that takes place at death. It can be changed at any time prior to death as long as the maker has capacity. A Will directs how debts of a person are to be paid at death, who will receive assets, who will control administration of an estate, and appoints tutors (a/k/a guardian) of minor children. A Will may also include testamentary trusts that provide asset protection for a surviving spouse and children.
            </p>
          </div>

          <div className="document-item">
            <h4>Revocable Living Trust</h4>
            <p>
              A Revocable Living Trust is an agreement regarding the management assets held in trust for the benefit of the person who creates the trust (a/k/a the "Settlor") and the ultimate passing of property from the trust to another person after the death of the Settlor(s). GeauxPlans' Revocable Living Trust will allow your beneficiaries to receive their inheritance outright, without going through the time and expense of court proceedings.
            </p>
          </div>

          <div className="document-item">
            <h4>Durable Financial Power of Attorney</h4>
            <p>
              This document authorized a person (an "agent") to make legal and financial decisions for another person (the "principal") during life.
            </p>
          </div>

          <div className="document-item">
            <h4>Durable Medical Power of Attorney</h4>
            <p>
              This document authorizes a person to make medical decisions for another person if the person is unable to do so.
            </p>
          </div>

          <div className="document-item">
            <h4>Healthcare Advanced Directive (a/k/a Living Will)</h4>
            <p>
              This document is a directive to your attending physician regarding your preference for life-support in the event you are in a terminal and irreversible condition.
            </p>
          </div>

          <div className="document-item">
            <h4>HIPAA Authorization</h4>
            <p>
              This is a document that authorizes another person to receive your protected health information, which otherwise would be sealed under HIPAA (Health Insurance Portability and Accountability Act of 1986).
            </p>
          </div>

          <div className="document-item">
            <h4>Act of Donation to Trust</h4>
            <p>
              This document will effect a transfer or donation of a principal residence to a Revocable Living Trust, which includes a reserved Louisiana usufruct in order to maintain the property tax homestead exemption in Louisiana.
            </p>
          </div>

          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <Link to="/shop" className="btn btn-primary btn-lg">
              Start Your Estate Plan
            </Link>
          </div>
        </div>
      </section>

      {/* Process Steps Section */}
      <section className="process-steps">
        <div className="container">
          <h2>
            The process is simple, quick, affordable and<br />
            can be completed in 3 easy steps!
          </h2>

          <ul>
            <li>Choose your Estate Plan among the available options and submit payment online;</li>
            <li>Complete the GeauxPlans interview online. This should take no more than 30 minutes! That's it! It will be so easy and painless that you will wonder why you waited so long.</li>
          </ul>

          <h2 style={{ fontSize: '22px', textAlign: 'left', marginBottom: '30px' }}>
            Wait...that's only 2 steps. Well, it's just that easy. The third step is on the backend, which makes our process unique and especially secure given the peculiarities of Louisiana law.
          </h2>

          <ul>
            <li>
              The GeauxPlans&trade; interview will be electronically submitted to Theus Law Offices, L.L.C., a Louisiana law firm. A legal specialist will assimilate your interview responses into a series of estate planning documents. If you request an Attorney Review, your estate planning documents will then be reviewed and approved by a Louisiana estate planning attorney. If you request an Attorney Consultation, the documents will be prepared, reviewed, and approved within 72 hours after your consultation with a Louisiana attorney.
            </li>
            <li>
              The estate planning documents will be delivered to the email address or physical mailing address specified in the interview within three (3) business days, which will include very specific and critical instructions for execution.
            </li>
          </ul>

          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <Link to="/shop" className="btn btn-white btn-lg">
              Get Started Today
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Learn;
