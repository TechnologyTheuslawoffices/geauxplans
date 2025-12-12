-- GeauxPlans Supabase Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- POA Submissions table (main form submissions)
CREATE TABLE IF NOT EXISTS public.poa_submissions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  form_schema JSONB,
  form_data JSONB,
  form_type TEXT DEFAULT 'powerOfAttorneyForm',
  submission_status TEXT DEFAULT 'inprogress',
  knackly_record_id TEXT,
  knackly_client_id TEXT,
  knackly_spouse_id TEXT,
  knackly_status TEXT DEFAULT 'pending',
  knackly_sent_at TIMESTAMPTZ,
  knackly_documents JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  regular_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  description TEXT,
  short_description TEXT,
  type TEXT DEFAULT 'simple',
  form_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  billing_address JSONB,
  shipping_address JSONB,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES public.products(id),
  variation_id INTEGER,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL
);

-- Estate plans table
CREATE TABLE IF NOT EXISTS public.estate_plans (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  order_id INTEGER REFERENCES public.orders(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  purchase_date TIMESTAMPTZ DEFAULT NOW(),
  completed_date TIMESTAMPTZ,
  knackly_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan documents table
CREATE TABLE IF NOT EXISTS public.plan_documents (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.estate_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  file_path TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  plan_type TEXT DEFAULT 'legal-edge',
  status TEXT DEFAULT 'active',
  price DECIMAL(10,2) DEFAULT 29.00,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  next_billing_date TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- Addresses table
CREATE TABLE IF NOT EXISTS public.addresses (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  type TEXT DEFAULT 'billing',
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  state TEXT DEFAULT 'LA',
  postcode TEXT,
  country TEXT DEFAULT 'US',
  phone TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_poa_submissions_user_id ON public.poa_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_poa_submissions_form_type ON public.poa_submissions(form_type);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_estate_plans_user_id ON public.estate_plans(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poa_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for poa_submissions
CREATE POLICY "Users can view own submissions" ON public.poa_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own submissions" ON public.poa_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions" ON public.poa_submissions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own submissions" ON public.poa_submissions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for orders
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for order_items (through orders)
CREATE POLICY "Users can view own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

-- RLS Policies for estate_plans
CREATE POLICY "Users can view own estate plans" ON public.estate_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own estate plans" ON public.estate_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own estate plans" ON public.estate_plans
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for plan_documents (through estate_plans)
CREATE POLICY "Users can view own plan documents" ON public.plan_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.estate_plans WHERE estate_plans.id = plan_documents.plan_id AND estate_plans.user_id = auth.uid())
  );

-- RLS Policies for subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for addresses
CREATE POLICY "Users can view own addresses" ON public.addresses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own addresses" ON public.addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own addresses" ON public.addresses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own addresses" ON public.addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Products are public (anyone can view)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view products" ON public.products
  FOR SELECT USING (true);

-- Function to handle new user signup (creates profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_poa_submissions_updated_at
  BEFORE UPDATE ON public.poa_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_estate_plans_updated_at
  BEFORE UPDATE ON public.estate_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default products
INSERT INTO public.products (name, slug, price, short_description, form_type) VALUES
  ('Power of Attorney Plan', 'power-of-attorney', 299.00, 'Financial and healthcare POA documents', 'powerOfAttorneyForm'),
  ('Trust-Based Estate Plan', 'trust-based-estate-plan', 899.00, 'Comprehensive trust-based planning for individuals', 'trustBasedEstatePlanSolo'),
  ('Trust-Based Estate Plan for 2 Persons', 'trust-based-estate-plan-couple', 1299.00, 'Comprehensive trust-based planning for couples', 'trustBasedEstatePlan2Person'),
  ('Will-Based Estate Plan', 'will-based-estate-plan', 399.00, 'Essential will and POA documents', 'willBasedEstatePlan'),
  ('Minor Child-Centered Estate Plan', 'minor-child-estate-plan', 599.00, 'Guardian nominations and children''s trusts', 'minorChildEstatePlan')
ON CONFLICT (slug) DO NOTHING;
