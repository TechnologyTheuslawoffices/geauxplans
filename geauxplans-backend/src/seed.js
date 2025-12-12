/**
 * Seed Database with Initial Data
 * Run with: node src/seed.js
 */

const { initializeDatabase, db, saveDatabase } = require('./config/database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  console.log('🌱 Seeding database...');

  // Initialize tables first
  await initializeDatabase();

  // Seed Products (matching WordPress WooCommerce products)
  const products = [
    {
      id: 606,
      name: 'Single Estate Plan',
      slug: 'single-estate-plan',
      price: 599.00,
      regular_price: 599.00,
      description: 'Complete estate planning package for individuals. Includes Last Will and Testament, Power of Attorney, Healthcare Directive, and Living Will.',
      short_description: 'Comprehensive estate plan for one person',
      type: 'simple',
    },
    {
      id: 614,
      name: 'Married Estate Plan',
      slug: 'married-estate-plan',
      price: 899.00,
      regular_price: 899.00,
      description: 'Complete estate planning package for married couples. Includes coordinated Wills, Powers of Attorney, Healthcare Directives, and Living Wills for both spouses.',
      short_description: 'Comprehensive estate plan for married couples',
      type: 'simple',
    },
    {
      id: 673,
      name: 'Single Estate Plan (No Trust)',
      slug: 'single-estate-plan-no-trust',
      price: 399.00,
      regular_price: 399.00,
      description: 'Basic estate planning package for individuals without trust provisions. Includes Last Will and Testament, Power of Attorney, and Healthcare Directive.',
      short_description: 'Basic estate plan without trust for one person',
      type: 'simple',
    },
    {
      id: 676,
      name: 'Married Estate Plan (No Trust)',
      slug: 'married-estate-plan-no-trust',
      price: 599.00,
      regular_price: 599.00,
      description: 'Basic estate planning package for married couples without trust provisions. Includes coordinated Wills, Powers of Attorney, and Healthcare Directives.',
      short_description: 'Basic estate plan without trust for couples',
      type: 'simple',
    },
    {
      id: 700,
      name: 'LLC Formation Package',
      slug: 'llc-formation-package',
      price: 299.00,
      regular_price: 299.00,
      description: 'Complete Louisiana LLC formation package. Includes Articles of Organization filing, Operating Agreement, EIN application assistance, and registered agent service for first year.',
      short_description: 'Louisiana LLC formation service',
      type: 'simple',
    },
    {
      id: 701,
      name: 'Legal Edge Plan',
      slug: 'legal-edge-plan',
      price: 29.00,
      regular_price: 29.00,
      description: 'Monthly subscription providing ongoing legal support, document updates, and priority access to estate planning attorneys.',
      short_description: 'Monthly legal support subscription',
      type: 'subscription',
    },
  ];

  // Insert products
  console.log('  Adding products...');
  products.forEach((product) => {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO products (id, name, slug, price, regular_price, sale_price, description, short_description, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.id,
        product.name,
        product.slug,
        product.price,
        product.regular_price,
        product.sale_price || null,
        product.description,
        product.short_description,
        product.type
      );
      console.log(`    ✓ ${product.name}`);
    } catch (e) {
      console.log(`    ℹ ${product.name} (already exists or error: ${e.message})`);
    }
  });

  // Create demo user
  console.log('\n  Creating users...');
  const hashedPassword = await bcrypt.hash('demo123', 10);

  try {
    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@geauxplans.com');
    if (!existingUser) {
      db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, display_name, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('demo@geauxplans.com', hashedPassword, 'Demo', 'User', 'Demo User', 'customer');
      console.log('    ✓ demo@geauxplans.com (password: demo123)');
    } else {
      console.log('    ℹ demo@geauxplans.com already exists');
    }
  } catch (e) {
    console.log('    ℹ Demo user error:', e.message);
  }

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);

  try {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@geauxplans.com');
    if (!existingAdmin) {
      db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, display_name, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('admin@geauxplans.com', adminPassword, 'Admin', 'User', 'Admin', 'admin');
      console.log('    ✓ admin@geauxplans.com (password: admin123)');
    } else {
      console.log('    ℹ admin@geauxplans.com already exists');
    }
  } catch (e) {
    console.log('    ℹ Admin user error:', e.message);
  }

  saveDatabase();

  console.log('\n✅ Database seeded successfully!');
  console.log('\n📝 Demo credentials:');
  console.log('   Email: demo@geauxplans.com');
  console.log('   Password: demo123');
  console.log('\n🔑 Admin credentials:');
  console.log('   Email: admin@geauxplans.com');
  console.log('   Password: admin123');
}

seedDatabase().catch(console.error);
