import React, { useState } from 'react';
import { Link } from 'react-router-dom';

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'What is GeauxPlans?',
    answer: 'GeauxPlans is a revolutionary online estate planning platform designed exclusively for Louisiana residents. Unlike other online services, GeauxPlans is supported and operated by a Louisiana law firm specializing in estate planning, business law, and asset protection.',
  },
  {
    question: 'Why is GeauxPlans only for Louisiana residents?',
    answer: 'Louisiana has unique legal requirements based on the Napoleonic Code that differ significantly from other states. Our documents are specifically designed to comply with Louisiana law, which is why we only serve Louisiana residents.',
  },
  {
    question: 'How long does the process take?',
    answer: 'The online interview typically takes about 30 minutes to complete. After you submit your interview, your documents will be prepared and delivered within 3 business days.',
  },
  {
    question: 'What documents are included in the estate plans?',
    answer: 'Depending on the plan you choose, your estate plan may include: Last Will and Testament, Revocable Living Trust, Durable Financial Power of Attorney, Healthcare Power of Attorney, Living Will/Healthcare Directive, HIPAA Authorization, and other related documents.',
  },
  {
    question: 'Do I need to have my documents notarized?',
    answer: 'Yes, Louisiana law requires that certain estate planning documents be properly executed with witnesses and notarization. We provide detailed instructions with your documents explaining exactly how to execute them properly.',
  },
  {
    question: 'Can I make changes to my documents after they are prepared?',
    answer: 'Yes, you can request revisions to your documents. If you have a Legal Edge Plan membership, unlimited revisions are included. Otherwise, revision fees may apply. Contact us for more information.',
  },
  {
    question: 'What is the Legal Edge Plan?',
    answer: 'The Legal Edge Plan is our premium membership program that includes unlimited revisions to your GeauxPlans documents, a full 100% credit of your base GeauxPlans fee toward future services, and an annual check-up meeting with an attorney.',
  },
  {
    question: 'Is my information secure?',
    answer: 'Yes, we take security seriously. We use industry-standard encryption and security measures to protect your personal information. Additionally, information shared with us may be protected by attorney-client privilege.',
  },
  {
    question: 'What if I have questions during the interview process?',
    answer: 'Our support team is available Monday through Friday, 8am to 5pm CST. You can call us at +1 (855) 213-6300 for assistance with any questions.',
  },
  {
    question: 'Can I get legal advice through GeauxPlans?',
    answer: 'GeauxPlans offers optional Attorney Review and Attorney Consultation add-ons. With Attorney Review, a Louisiana estate planning attorney reviews and approves your documents. With Attorney Consultation, you get a consultation with an attorney before your documents are prepared.',
  },
  {
    question: 'What happens after I complete the interview?',
    answer: 'After you complete the interview and submit payment, your responses are reviewed by our team. Your documents are then prepared, and if you selected Attorney Review, they are reviewed by a licensed Louisiana attorney. Finally, your documents are delivered to you with execution instructions.',
  },
  {
    question: 'What forms of payment do you accept?',
    answer: 'We accept all major credit cards including Visa, MasterCard, American Express, and Discover. All payments are processed securely through our payment processor.',
  },
];

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <main>
      <section className="plans-section">
        <div className="container">
          <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>Frequently Asked Questions</h1>
          <p style={{ textAlign: 'center', marginBottom: '50px', color: '#707070' }}>
            Find answers to common questions about GeauxPlans and our estate planning services.
          </p>

          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {faqData.map((faq, index) => (
              <div
                key={index}
                style={{
                  marginBottom: '15px',
                  border: '1px solid #eaeaea',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  style={{
                    width: '100%',
                    padding: '20px',
                    textAlign: 'left',
                    backgroundColor: openIndex === index ? '#f8f9fa' : '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: '600', fontSize: '16px', paddingRight: '20px' }}>
                    {faq.question}
                  </span>
                  <i
                    className={`fas fa-chevron-${openIndex === index ? 'up' : 'down'}`}
                    style={{ color: '#004d71', flexShrink: 0 }}
                  ></i>
                </button>
                {openIndex === index && (
                  <div
                    style={{
                      padding: '0 20px 20px 20px',
                      backgroundColor: '#f8f9fa',
                      color: '#707070',
                      lineHeight: '1.6',
                    }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              maxWidth: '800px',
              margin: '50px auto 0',
              padding: '30px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <h3 style={{ marginBottom: '15px' }}>Still Have Questions?</h3>
            <p style={{ color: '#707070', marginBottom: '20px' }}>
              Our team is here to help. Contact us for personalized assistance.
            </p>
            <p style={{ marginBottom: '20px' }}>
              <strong>Call us:</strong> +1 (855) 213-6300 | M-F, 8am-5pm CST
            </p>
            <Link to="/contact" className="btn btn-primary">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default FAQ;
