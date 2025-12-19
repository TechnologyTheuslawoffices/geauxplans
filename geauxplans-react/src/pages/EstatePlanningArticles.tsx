import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/articles.css';

const EstatePlanningArticles: React.FC = () => {
  const articles = [
    {
      id: 1,
      title: "What is Estate Planning and Why Do You Need It?",
      excerpt: "Estate planning is the process of arranging for the management and disposal of a person's estate during their life and after death...",
      date: "December 15, 2023",
      slug: "what-is-estate-planning"
    },
    {
      id: 2,
      title: "Understanding Wills vs. Trusts in Louisiana",
      excerpt: "When it comes to estate planning in Louisiana, understanding the difference between wills and trusts is crucial for making informed decisions...",
      date: "December 10, 2023",
      slug: "wills-vs-trusts-louisiana"
    },
    {
      id: 3,
      title: "The Importance of Power of Attorney Documents",
      excerpt: "A power of attorney is a legal document that allows you to appoint someone to manage your affairs if you become unable to do so...",
      date: "December 5, 2023",
      slug: "importance-power-of-attorney"
    },
    {
      id: 4,
      title: "Protecting Your Minor Children Through Estate Planning",
      excerpt: "If you have minor children, estate planning is not just about distributing assets—it's about ensuring your children are cared for...",
      date: "November 28, 2023",
      slug: "protecting-minor-children"
    },
    {
      id: 5,
      title: "What Happens If You Die Without a Will in Louisiana?",
      excerpt: "Dying without a will, known as dying 'intestate,' means Louisiana law will determine how your assets are distributed...",
      date: "November 20, 2023",
      slug: "dying-without-will-louisiana"
    },
    {
      id: 6,
      title: "Healthcare Directives: Making Your Wishes Known",
      excerpt: "A healthcare directive, also known as a living will, allows you to express your wishes regarding medical treatment...",
      date: "November 15, 2023",
      slug: "healthcare-directives"
    }
  ];

  return (
    <main className="articles-page">
      {/* Hero Section */}
      <section className="articles-hero">
        <div className="container">
          <h1><em className="text-blue">Estate Planning</em> <strong>Articles</strong></h1>
          <p className="hero-subtitle"><em>Learn about estate planning in Louisiana</em></p>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="articles-section">
        <div className="container">
          <div className="articles-grid">
            {articles.map(article => (
              <article key={article.id} className="article-card">
                <div className="article-content">
                  <span className="article-date">{article.date}</span>
                  <h2><Link to={`/article/${article.slug}`}>{article.title}</Link></h2>
                  <p>{article.excerpt}</p>
                  <Link to={`/article/${article.slug}`} className="read-more">Read More →</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="articles-cta">
        <div className="container">
          <div className="cta-content">
            <h2><strong>Ready to start your </strong><em className="text-blue">Estate Plan</em><strong>?</strong></h2>
            <p><em>Protecting everything you own and everyone you love has never been so simple.</em></p>
            <Link to="/estate-planning" className="btn btn-solid btn-lg">Get Started</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default EstatePlanningArticles;
