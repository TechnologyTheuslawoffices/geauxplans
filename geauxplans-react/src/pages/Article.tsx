import React from 'react';
import { Link, useParams, Navigate, useLocation } from 'react-router-dom';
import { articles } from '../data/articles';
import '../styles/article.css';

const Article: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();

  // Extract category from the URL path
  const pathParts = location.pathname.split('/');
  const category = pathParts[1] as 'estate-planning-articles' | 'business-planning-articles';

  const article = articles.find(
    (a) => a.slug === slug && a.category === category
  );

  if (!article) {
    return <Navigate to="/learn" replace />;
  }

  const relatedArticles = articles
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  return (
    <main className="article-page">
      {/* Breadcrumb */}
      <div className="article-breadcrumb">
        <div className="container">
          <Link to="/learn">Learn</Link>
          <span> / </span>
          <Link to={`/category/${article.category}`}>
            {article.category === 'estate-planning-articles' ? 'Estate Planning' : 'Business Planning'}
          </Link>
          <span> / </span>
          <span>{article.title}</span>
        </div>
      </div>

      {/* Article Header */}
      <header className="article-header">
        <div className="container">
          <h1>{article.title}</h1>
          {article.excerpt && <p className="article-excerpt">{article.excerpt}</p>}
        </div>
      </header>

      {/* Article Content */}
      <article className="article-content">
        <div className="container">
          <div className="article-body" dangerouslySetInnerHTML={{ __html: article.content }} />

          {/* CTA Section */}
          <div className="article-cta">
            <h3>Ready to get started?</h3>
            <p>Protecting everything you own and everyone you love has never been so simple.</p>
            <div className="cta-buttons">
              {article.category === 'estate-planning-articles' ? (
                <Link to="/estate-planning" className="btn btn-solid">Start My Estate Plan</Link>
              ) : (
                <Link to="/start-business-llc" className="btn btn-solid">Start My LLC</Link>
              )}
            </div>
          </div>
        </div>
      </article>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <section className="related-articles">
          <div className="container">
            <h2>Related Articles</h2>
            <div className="related-grid">
              {relatedArticles.map((related) => (
                <article key={related.slug} className="related-card">
                  <h3>
                    <Link to={`/${related.category}/${related.slug}`}>{related.title}</Link>
                  </h3>
                  <p>{related.excerpt}</p>
                  <Link to={`/${related.category}/${related.slug}`} className="read-more">
                    Read More →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section className="article-contact">
        <div className="container">
          <h2><strong>Do you have </strong><em className="text-blue">any</em><strong> questions?</strong></h2>
          <div className="contact-grid">
            <div className="contact-info">
              <p><strong>Support team:</strong> M-F, 8am-5pm CST</p>
              <p><strong>Call us:</strong> +1 (855) 213-6300</p>
            </div>
            <div className="contact-btn">
              <Link to="/about" className="btn btn-solid">Drop us a message</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Article;
