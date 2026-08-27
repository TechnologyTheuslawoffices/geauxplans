import React from 'react';
import { Link } from 'react-router-dom';
import { articles } from '../data/articles';
import '../styles/learn.css';

/**
 * Listed straight off the article data rather than from a second hand-written
 * list. The copy that used to live here had drifted: it linked the Operating
 * Agreement piece as "operating-agreement-reasons", a slug that does not exist,
 * so the first link on the page was a 404 — and it omitted five articles that
 * had been written since.
 */
const byCategory = (category: string) =>
  articles
    .filter((a) => a.category === category)
    .sort((a, b) => b.date.localeCompare(a.date));

const Learn: React.FC = () => {
  const businessArticles = byCategory('business-planning-articles');
  const estateArticles = byCategory('estate-planning-articles');

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
              <article key={article.slug} className="article-item">
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
              <article key={article.slug} className="article-item">
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
