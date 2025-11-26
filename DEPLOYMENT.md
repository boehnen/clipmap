# Deployment Guide: Render (Backend) + Cloudflare Pages (Frontend)

This guide covers deploying ClipMap using Render.com for the backend and Cloudflare Pages for the frontend.

## Architecture

- **Backend**: Render.com (Node.js API)
- **Frontend**: Cloudflare Pages (Static React app)
- **Total Cost**: Free tier available, $7/month for always-on backend

## Prerequisites

- GitHub account (for connecting repos)
- Render account ([render.com](https://render.com))
- Cloudflare account ([cloudflare.com](https://cloudflare.com))

---

## Step 1: Deploy Backend to Render

### 1.1 Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Create a new account

### 1.2 Deploy Backend Service

1. Click **"New"** → **"Web Service"**
2. Connect your GitHub account and select the ClipMap repository
3. Configure the service:

   **Settings:**
   - **Name**: `clipmap-backend`
   - **Environment**: `Docker` (or `Node` if not using Dockerfile)
   - **Root Directory**: `backend`
   - **Build Command**: (Leave empty if using Docker, or `npm install && npm run build` if using Node)
   - **Start Command**: (Leave empty if using Docker, or `npm start` if using Node)
   - **Plan**: Free (or $7/month for always-on)
   
   > **Note**: Render can use either Docker (recommended) or build directly from source. If using Docker, ensure your Dockerfile is in the `backend` directory.

   **Environment Variables** (add in Environment tab):
   ```
   NODE_ENV=production
   PORT=10000
   LOG_LEVEL=info
   CORS_ORIGINS=https://your-frontend-domain.pages.dev
   ```

   > **Note**: We'll update `CORS_ORIGINS` after deploying the frontend.

4. Click **"Create Web Service"**
5. Render will automatically:
   - Build your application
   - Deploy the service
   - Generate a public URL (e.g., `clipmap-backend.onrender.com`)

### 1.3 Get Backend URL

After deployment, Render provides a public URL. Copy this URL - you'll need it for the frontend.

Example: `https://clipmap-backend.onrender.com`

**Note**: On the free tier, the service spins down after 15 minutes of inactivity. The first request after spin-down will take ~30 seconds (cold start). Upgrade to $7/month for always-on service.

---

## Step 2: Deploy Frontend to Cloudflare Pages

### 2.1 Create Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Pages** → **Create a project**
3. Select **"Connect to Git"**
4. Connect your GitHub account and select the ClipMap repository

### 2.2 Configure Build Settings

**Build Configuration:**
- **Framework preset**: Vite (or None if not available)
- **Root directory**: `frontend`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Deploy command**: `echo "Static site deployment"` (or leave empty if not required)

> **Important**: 
> - If "Deploy command" is marked as required, use a simple no-op command like `echo "Static site deployment"` or `true`
> - Cloudflare Pages automatically deploys the built static files from the `dist` directory
> - The deploy command is typically not needed for static sites, but some Cloudflare Pages configurations may require it
> - Do NOT use `npx wrangler deploy` - that's for Cloudflare Workers, not Pages

**Environment Variables** (add in Settings → Environment Variables):
```
VITE_API_BASE_URL=https://clipmap-backend.onrender.com
```

> Replace `clipmap-backend.onrender.com` with your actual Render backend URL from Step 1.3

### 2.3 Deploy

1. Click **"Save and Deploy"**
2. Cloudflare will build and deploy your frontend
3. You'll get a URL like: `https://clipmap.pages.dev`

### 2.4 Update CORS in Render

1. Go back to Render dashboard
2. Navigate to your backend service → Environment
3. Update the `CORS_ORIGINS` environment variable:
   ```
   CORS_ORIGINS=https://clipmap.pages.dev,https://clipmap.boehnen.net
   ```
   > **Note**: You can include multiple origins separated by commas. Trailing slashes are automatically removed, but it's best to include them without slashes.
4. Render will automatically redeploy

### 2.5 (Optional) Custom Domain

1. In Cloudflare Pages, go to **Custom domains**
2. Add your domain
3. Update `CORS_ORIGINS` in Render to include your custom domain:
   ```
   CORS_ORIGINS=https://clipmap.pages.dev,https://yourdomain.com
   ```

---

## Step 3: Verify Deployment

1. **Backend Health Check**: Visit `https://clipmap-backend.onrender.com/healthz`
   - Should return: `{"status":"ok","timestamp":"..."}`

2. **Frontend**: Visit your Cloudflare Pages URL
   - Should load the map interface
   - Try exporting a map to verify backend connection

---

## Environment Variables Reference

### Render (Backend)

| Variable | Value | Description |
|---------|-------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `10000` | Port (Render sets this automatically, but specify for clarity) |
| `LOG_LEVEL` | `info` | Logging level |
| `CORS_ORIGINS` | `https://your-frontend.pages.dev` | Allowed frontend origins (comma-separated) |
| `OVERPASS_TIMEOUT_MS` | `25000` | (Optional) Overpass API timeout |
| `RATE_LIMIT_MAX_REQUESTS` | `60` | (Optional) Requests per hour per IP |

### Cloudflare Pages (Frontend)

| Variable | Value | Description |
|---------|-------|-------------|
| `VITE_API_BASE_URL` | `https://clipmap-backend.onrender.com` | Backend API URL |

---

## Monitoring & Logs

### Render

- **Logs**: View in Render dashboard → Service → Logs
- **Metrics**: Available in Render dashboard
- **Health Checks**: Monitor `/healthz` endpoint

### Cloudflare Pages

- **Analytics**: Available in Cloudflare dashboard
- **Build Logs**: View in Pages → Deployments
- **Performance**: Cloudflare CDN provides global edge caching

---

## Troubleshooting

### Backend Issues

**Service won't start:**
- Check Render logs for errors
- Verify `PORT` is set correctly
- Ensure `npm run build` completes successfully
- Check that land tiles are included in deployment (they should be in `src/data`)

**CORS errors:**
- Verify `CORS_ORIGINS` includes your Cloudflare Pages URL
- Check for trailing slashes in URLs
- Ensure frontend `VITE_API_BASE_URL` matches backend URL exactly

**Cold starts (free tier):**
- First request after 15 min inactivity takes ~30 seconds
- Upgrade to $7/month for always-on service
- Consider adding a health check ping service to keep it warm

**Memory issues:**
- Render free tier: 512MB RAM
- Upgrade to paid plan for more resources
- Monitor via `/readyz` endpoint

### Frontend Issues

**Build fails:**
- Check Cloudflare build logs
- Verify `VITE_API_BASE_URL` is set correctly
- Ensure all dependencies are in `package.json`
- Make sure "Deploy command" is empty (not `npx wrangler deploy`)

**API connection fails:**
- Verify `VITE_API_BASE_URL` matches Render backend URL
- Check browser console for CORS errors
- Test backend URL directly: `https://clipmap-backend.onrender.com/healthz`
- Wait for cold start if on free tier (~30s first request)

**Configuration Issues:**
- **"Deploy command" should be EMPTY** - Cloudflare Pages automatically deploys static sites
- If you see `npx wrangler deploy` in the deploy command field, remove it
- The "Deploy command" field is only for Cloudflare Workers, not Pages

---

## Cost Breakdown

- **Render Backend**: 
  - Free tier: $0/month (spins down after inactivity)
  - Starter plan: $7/month (always-on, 512MB RAM)
- **Cloudflare Pages**: Free (unlimited requests, 500 builds/month)
- **Total**: $0-7/month depending on Render plan

---

## Updating Deployment

### Backend Updates

1. Push changes to GitHub
2. Render automatically detects and redeploys
3. Monitor logs in Render dashboard

### Frontend Updates

1. Push changes to GitHub
2. Cloudflare Pages automatically builds and deploys
3. Preview deployments available for pull requests

---

## Production Checklist

- [ ] Backend deployed to Render
- [ ] Frontend deployed to Cloudflare Pages
- [ ] `CORS_ORIGINS` set correctly in Render
- [ ] `VITE_API_BASE_URL` set correctly in Cloudflare
- [ ] Health checks passing (`/healthz` and `/readyz`)
- [ ] Test map export functionality
- [ ] (Optional) Custom domain configured
- [ ] (Optional) Upgrade to always-on Render plan if needed

---

## Need Help?

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Cloudflare Pages Docs**: [developers.cloudflare.com/pages](https://developers.cloudflare.com/pages)
- **Backend Logs**: Render dashboard → Service → Logs
- **Frontend Build Logs**: Cloudflare dashboard → Pages → Deployments
