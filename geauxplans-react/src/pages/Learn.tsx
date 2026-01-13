import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/learn.css';

const Learn: React.FC = () => {
  const businessArticles = [
    {
      id: 1,
      title: "The Top 3 Reasons You Absolutely Need an Operating Agreement for an LLC in Louisiana",
      excerpt: "Without an operating agreement, Louisiana's default LLC rules apply, which have significant limitations and potential legal exposure for owners.",
      slug: "operating-agreement-reasons"
    },
    {
      id: 2,
      title: "Do I Need an LLC?",
      excerpt: "Learn whether forming an LLC is right for your business situation and understand the key benefits and requirements.",
      slug: "do-i-need-an-llc"
    },
    {
      id: 3,
      title: "Guide to Starting a Business in Louisiana",
      excerpt: "A comprehensive guide covering everything you need to know about starting a business in the Bayou State.",
      slug: "guide-to-starting-a-business"
    },
    {
      id: 4,
      title: "Does an LLC Provide Asset Protection?",
      excerpt: "Understanding how an LLC can protect your personal assets from business liabilities and creditors.",
      slug: "llc-provide-asset-protection"
    },
    {
      id: 5,
      title: "Start an LLC in Louisiana",
      excerpt: "Step-by-step instructions for forming your Louisiana Limited Liability Company.",
      slug: "start-an-llc-in-louisiana"
    }
  ];

  const estateArticles = [
    {
      id: 1,
      title: "The Best Solution for Online Estate Planning in Louisiana",
      excerpt: "GeauxPlans is a 100% safe source for online estate planning forms in Louisiana, backed by licensed Louisiana attorneys.",
      slug: "online-estate-planning-in-louisiana"
    },
    {
      id: 2,
      title: "What is Estate Planning?",
      excerpt: "Estate planning is the process of arranging for the management and disposal of a person's estate during their life and after death.",
      slug: "what-is-estate-planning"
    },
    {
      id: 3,
      title: "Essential Estate Planning Documents",
      excerpt: "Learn about the key documents every Louisiana resident should have in their estate plan.",
      slug: "essential-estate-planning-documents"
    },
    {
      id: 4,
      title: "Estate Planning Mistakes to Avoid",
      excerpt: "Common errors that can derail your estate plan and how to avoid them.",
      slug: "estate-planning-mistakes"
    },
    {
      id: 5,
      title: "Power of Attorney in Louisiana",
      excerpt: "Understanding power of attorney documents and their importance in Louisiana estate planning.",
      slug: "power-of-attorney-louisiana"
    },
    {
      id: 6,
      title: "Durable Power of Attorney",
      excerpt: "What makes a power of attorney 'durable' and why it matters for your planning.",
      slug: "power-of-attorney-durable"
    },
    {
      id: 7,
      title: "Limited Power of Attorney",
      excerpt: "When and why you might use a limited power of attorney in Louisiana.",
      slug: "power-of-attorney-limited"
    },
    {
      id: 8,
      title: "Make a Will Online",
      excerpt: "How to create a valid Louisiana will online with GeauxPlans.",
      slug: "make-a-will-online"
    },
    {
      id: 9,
      title: "How Much Does a Trust Cost?",
      excerpt: "Understanding the costs involved in creating a revocable living trust in Louisiana.",
      slug: "how-much-does-a-trust-cost"
    },
    {
      id: 10,
      title: "Wealth Inheritance and the $40 Trillion Tsunami",
      excerpt: "The largest wealth transfer in history is underway. Are you prepared?",
      slug: "wealth-inheritance-and-the-40-trillion-tsunami"
    }
  ];

  return (
    <main className="learn-page">
      {/* Hero Section */}
      <section className="learn-hero">
        <div className="container">
          <h1><em className="text-blue">Learning</em> <strong>Center</strong></h1>
          <p className="hero-tagline"><em>Protecting everything you own and everyone you love has never been so simple. Whether planning your estate, your future, or your business, we are here to make your experience simple, smooth, and affordable. Your peace of mind is our business.</em></p>
        </div>
      </section>

      {/* Business Planning Section */}
      <section className="learn-category-section">
        <div className="container">
          <div className="category-header">
            <h2><strong>Business Planning</strong></h2>
            <span className="article-count">{businessArticles.length} articles</span>
          </div>
          <div className="articles-list">
            {businessArticles.map(article => (
              <article key={article.id} className="article-item">
                <h3><Link to={`/business-planning-articles/${article.slug}`}>{article.title}</Link></h3>
                <p>{article.excerpt}</p>
                <Link to={`/business-planning-articles/${article.slug}`} className="read-more">Read More →</Link>
              </article>
            ))}
          </div>
          <div className="category-cta">
            <Link to="/category/business-planning-articles" className="btn btn-outline">View All Business Planning Articles</Link>
          </div>
        </div>
      </section>

      {/* Estate Planning Section */}
      <section className="learn-category-section alt-bg">
        <div className="container">
          <div className="category-header">
            <h2><strong>Estate Planning</strong></h2>
            <span className="article-count">{estateArticles.length} articles</span>
          </div>
          <div className="articles-list">
            {estateArticles.map(article => (
              <article key={article.id} className="article-item">
                <h3><Link to={`/estate-planning-articles/${article.slug}`}>{article.title}</Link></h3>
                <p>{article.excerpt}</p>
                <Link to={`/estate-planning-articles/${article.slug}`} className="read-more">Read More →</Link>
              </article>
            ))}
          </div>
          <div className="category-cta">
            <Link to="/category/estate-planning-articles" className="btn btn-outline">View All Estate Planning Articles</Link>
          </div>
        </div>
      </section>

      {/* Webinar Section */}
      <section className="learn-webinar-section">
        <div className="container">
          <div className="webinar-promo">
            <div className="webinar-content">
              <h2><strong>Free Estate Planning Webinar</strong></h2>
              <p><em>Join us for a complimentary webinar and discover basic must-know estate planning concepts that will enable you to create your own estate plan.</em></p>
              <Link to="/register-for-webinar" className="btn btn-solid">Register for Webinar</Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="learn-cta-section">
        <div className="container">
          <div className="cta-content">
            <h2><strong>Ready to get started?</strong></h2>
            <p><em>Protecting everything you own and everyone you love has never been so simple.</em></p>
            <div className="cta-buttons">
              <Link to="/estate-planning" className="btn btn-solid">Start Estate Plan</Link>
              <Link to="/start-business-llc" className="btn btn-outline-white">Start Your LLC</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Learn;
