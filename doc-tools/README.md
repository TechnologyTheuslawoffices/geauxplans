# GeauxDrafter Private

Private document automation tool. For your eyes only.

## Quick Deploy to Vercel

1. **Create new Vercel account** (use personal email)
   - Go to https://vercel.com/signup
   - Sign up with GitHub or email

2. **Push to GitHub** (private repo)
   ```bash
   cd GeauxDrafterPrivate
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create geaux-drafter-private --private --source=. --push
   ```
   Or create manually on GitHub and push.

3. **Deploy on Vercel**
   - Import the GitHub repo
   - Add environment variables:
     - `NEXT_PUBLIC_SUPABASE_URL` = (from .env.local)
     - `SUPABASE_SERVICE_ROLE_KEY` = (from .env.local)
   - Deploy!

4. **Access your private URL**
   - Vercel will give you a URL like: `geaux-drafter-private-xyz.vercel.app`
   - Only you know this URL

## Local Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Security Notes

- Keep the URL private
- Don't share the Vercel dashboard access
- Consider enabling Vercel password protection (Pro feature)
