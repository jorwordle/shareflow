# ShareFlow Deployment URLs Configuration

## Current Production URLs

### Backend (Railway)
- **URL**: `https://screenshare-signaling-production.up.railway.app`
- **Health Check**: `https://screenshare-signaling-production.up.railway.app/health`
- **Stats**: `https://screenshare-signaling-production.up.railway.app/stats`

### Frontend (Netlify)
- **URL**: Your Netlify app URL (e.g., `https://your-app-name.netlify.app`)
- Replace `your-app-name` with your actual Netlify subdomain

## Environment Variables Configuration

### For Netlify (Frontend)

In Netlify Dashboard → Site Settings → Environment Variables:

```bash
NEXT_PUBLIC_SERVER_URL=https://screenshare-signaling-production.up.railway.app
```

Or in netlify.toml:
```toml
[build.environment]
  NEXT_PUBLIC_SERVER_URL = "https://screenshare-signaling-production.up.railway.app"
```

### For Railway (Backend)

In Railway Dashboard → Variables:

```bash
PORT=3001
NODE_ENV=production
CLIENT_URL=https://your-app-name.netlify.app
```

**Important**: Replace `your-app-name` with your actual Netlify subdomain.

For multiple allowed origins (if you have a custom domain):
```bash
CLIENT_URL=https://your-app-name.netlify.app,https://www.yourdomain.com,https://yourdomain.com
```

## Testing the Connection

1. **Test Backend Health**:
   ```bash
   curl https://screenshare-signaling-production.up.railway.app/health
   ```
   
   Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "...",
     "uptime": ...,
     "connections": 0,
     "rooms": 0,
     "users": 0
   }
   ```

2. **Test Frontend-Backend Connection**:
   - Open browser console on your Netlify app
   - Check for WebSocket connection to the Railway URL
   - Should see: "Connected to server" in console

3. **Test Room Creation**:
   - Create a room as host
   - Join from another browser/device
   - Verify WebSocket messages are exchanged

## Common Issues and Fixes

### CORS Errors
If you see CORS errors in the browser console:
1. Verify `CLIENT_URL` in Railway includes your exact Netlify URL
2. Don't include trailing slashes in URLs
3. Restart Railway deployment after changing environment variables

### WebSocket Connection Failed
If WebSocket won't connect:
1. Ensure Railway app is running (check health endpoint)
2. Verify `NEXT_PUBLIC_SERVER_URL` is using `https://` (not `http://`)
3. Check Railway logs for connection attempts

### 404 Errors on Netlify
If you get 404 errors for Next.js routes:
1. Ensure `@netlify/plugin-nextjs` is installed
2. Verify netlify.toml is in the repository root
3. Clear cache and redeploy on Netlify

## Updating URLs

When URLs change:

1. **Update Frontend (Netlify)**:
   - Go to Site Settings → Environment Variables
   - Update `NEXT_PUBLIC_SERVER_URL`
   - Trigger redeploy

2. **Update Backend (Railway)**:
   - Go to Variables tab
   - Update `CLIENT_URL`
   - Railway will auto-redeploy

3. **Update Local Development**:
   - Edit `frontend/.env.local`
   - Edit `server/.env`
   - Restart development servers

## Verification Checklist

- [ ] Backend health check returns 200 OK
- [ ] Frontend loads without console errors
- [ ] WebSocket connects successfully
- [ ] Room creation works
- [ ] Room joining works
- [ ] Screen sharing initiates
- [ ] Chat messages send/receive
- [ ] Multiple viewers can connect

## Support

If issues persist after following this guide:
1. Check Railway logs: `railway logs`
2. Check Netlify build logs in dashboard
3. Verify all environment variables are set correctly
4. Ensure both services are deployed and running