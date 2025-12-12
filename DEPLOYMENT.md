# GeauxPlans Deployment Guide

This guide walks you through deploying GeauxPlans to Vercel with Supabase and connecting your GoDaddy domain.

## Prerequisites

- Vercel account (https://vercel.com)
- Supabase account (https://supabase.com)
- GoDaddy domain: geauxplans.com
- Git repository (GitHub, GitLab, or Bitbucket)

---

## Step 1: Set Up Supabase Database

### 1.1 Create a new Supabase project

1. Go to https://supabase.com and log in
2. Click "New Project"
3. Choose your organization
4. Enter project name: `geauxplans`
5. Set a strong database password (save this!)
6. Select a region close to your users (e.g., "East US")
7. Click "Create new project"

### 1.2 Run the database schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the contents of `supabase/schema.sql` from this repository
4. Paste it into the SQL editor
5. Click "Run" to execute
6. You should see "Success. No rows returned" - this is expected

### 1.3 Get your Supabase credentials

1. Go to **Project Settings** > **API**
2. Copy these values (you'll need them for Vercel):
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (keep this secret!)

---

## Step 2: Push Code to Git Repository

### 2.1 Initialize Git (if not already done)

```bash
cd C:\Users\Arman\Documents\Geauxplans
git init
git add .
git commit -m "Initial commit: GeauxPlans with Vercel + Supabase"
```

### 2.2 Create a GitHub repository

1. Go to https://github.com/new
2. Create a new repository named `geauxplans`
3. Keep it private if you prefer
4. Don't initialize with README (we already have code)

### 2.3 Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/geauxplans.git
git branch -M main
git push -u origin main
```

---

## Step 3: Deploy to Vercel

### 3.1 Import project to Vercel

1. Go to https://vercel.com/new
2. Click "Import" next to your GitHub repository
3. Select the `geauxplans` repository

### 3.2 Configure environment variables

In the Vercel deployment setup, add these environment variables:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase Project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |
| `KNACKLY_KEY_ID` | `6113e4d42bd0c544e84e4892` |
| `KNACKLY_SECRET` | (the long Knackly secret key) |
| `CONVERTAPI_SECRET` | `secret_RfaXEH6hpm9xPkKL` |
| `REACT_APP_API_URL` | `/api` |
| `REACT_APP_SUPABASE_URL` | Your Supabase Project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | Your Supabase anon public key |

### 3.3 Deploy

1. Click "Deploy"
2. Wait for the build to complete (usually 2-3 minutes)
3. Once deployed, you'll get a URL like `https://geauxplans-xxx.vercel.app`
4. Test that the site works

---

## Step 4: Connect GoDaddy Domain

### 4.1 Add domain in Vercel

1. In your Vercel project dashboard, go to **Settings** > **Domains**
2. Add `geauxplans.com`
3. Also add `www.geauxplans.com`
4. Vercel will show you the DNS records you need

### 4.2 Configure GoDaddy DNS

1. Log in to GoDaddy: https://dcc.godaddy.com
2. Go to **My Products** > **Domains** > **geauxplans.com** > **DNS**
3. Delete any existing A or CNAME records for @ and www

**Add these records:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 600 |
| CNAME | www | cname.vercel-dns.com | 600 |

### 4.3 Wait for propagation

- DNS changes can take up to 48 hours to propagate
- Usually it's much faster (15-30 minutes)
- You can check status at https://dnschecker.org

### 4.4 Verify in Vercel

1. Go back to Vercel **Settings** > **Domains**
2. Both domains should show green checkmarks when verified
3. SSL certificates are automatically provisioned

---

## Step 5: Test the Deployment

### 5.1 Test the frontend

1. Go to https://geauxplans.com
2. You should see the GeauxPlans homepage

### 5.2 Test user registration

1. Click "Sign Up" or navigate to registration
2. Create a test account
3. Verify you can log in

### 5.3 Test form submission

1. Log in with your test account
2. Start a Power of Attorney form
3. Fill out and submit
4. Verify documents are generated

---

## Troubleshooting

### Build fails on Vercel

- Check the build logs for specific errors
- Ensure all environment variables are set correctly
- Try rebuilding by clicking "Redeploy"

### API routes return 500 errors

- Check Vercel function logs (Project > Functions tab)
- Verify Supabase credentials are correct
- Check that the database schema was created successfully

### Domain not working

- Verify DNS records in GoDaddy match Vercel requirements
- Use https://dnschecker.org to verify propagation
- Check Vercel domains page for any errors

### Documents not generating

- Verify Knackly credentials in environment variables
- Check function logs for Knackly API errors
- Ensure ConvertAPI secret is correct

---

## Updating the Application

To deploy updates:

```bash
git add .
git commit -m "Description of changes"
git push origin main
```

Vercel will automatically detect the push and redeploy.

---

## Support

For issues specific to:
- **Vercel**: https://vercel.com/docs
- **Supabase**: https://supabase.com/docs
- **GoDaddy DNS**: https://www.godaddy.com/help
