# ShareFlow Deployment Guide

## Current Production URLs
- **Frontend**: https://sharefloww.netlify.app
- **Backend**: https://shareflow-production.up.railway.app

This guide provides step-by-step instructions for deploying ShareFlow to production using Railway (backend) and Netlify (frontend).

## Prerequisites

- Git repository with your ShareFlow code
- GitHub account
- Railway account (https://railway.app)
- Netlify account (https://netlify.com)
- Domain name (optional, for custom domains)

## Part 1: Deploy Backend to Railway

### Step 1: Prepare Railway Account

1. Sign up for Railway at https://railway.app
2. Connect your GitHub account
3. Create a new project

### Step 2: Deploy the Signaling Server

1. In Railway dashboard, click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your ShareFlow repository
4. Configure the deployment:
   ```
   Root Directory: /server
   Build Command: npm install
   Start Command: npm start
   ```

### Step 3: Configure Environment Variables

In Railway project settings, add these environment variables:

```bash
PORT=3001
NODE_ENV=production
CLIENT_URL=https://sharefloww.netlify.app
```

**Important:** Replace the CLIENT_URL with your actual Netlify URL after deployment.

### Step 4: Generate Railway URL

1. Go to Settings → Domains
2. Click "Generate Domain" to get your Railway URL
3. Copy this URL (e.g., `shareflow-server.up.railway.app`)

### Step 5: Verify Deployment

Visit your Railway URL to see the health check:
```
https://your-app.up.railway.app/health
```

You should see a JSON response with server status.

## Part 2: Deploy Frontend to Netlify

### Step 1: Prepare Netlify Account

1. Sign up for Netlify at https://netlify.com
2. Connect your GitHub account

### Step 2: Create New Site

1. Click "Add new site" → "Import an existing project"
2. Choose your ShareFlow repository
3. Configure build settings:
   ```
   Base directory: frontend
   Build command: npm run build
   Publish directory: frontend/.next
   ```

### Step 3: Configure Environment Variables

In Netlify site settings → Environment variables, add:

```bash
NEXT_PUBLIC_SERVER_URL=https://shareflow-production.up.railway.app
NODE_VERSION=18
```

**Important:** Use your actual Railway URL from Part 1, Step 4.

### Step 4: Deploy

1. Click "Deploy site"
2. Wait for the build to complete (3-5 minutes)
3. Your site will be available at `https://[site-name].netlify.app`

### Step 5: Configure Custom Domain (Optional)

1. Go to Domain settings
2. Add custom domain
3. Configure DNS:
   ```
   Type: CNAME
   Name: www
   Value: [site-name].netlify.app
   ```

## Part 3: Production Configuration

### Update CORS Settings

After both services are deployed, update the Railway environment:

1. In Railway, update `CLIENT_URL`:
   ```
   CLIENT_URL=https://your-site.netlify.app,https://www.yourdomain.com
   ```

2. Trigger a new deployment in Railway

### Configure TURN Servers (Recommended)

For better connectivity through firewalls, add TURN server credentials:

#### Frontend (.env in Netlify):
```bash
NEXT_PUBLIC_TURN_URL=turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=username
NEXT_PUBLIC_TURN_CREDENTIAL=password
```

#### Free TURN Server Options:
- Xirsys (https://xirsys.com) - Free tier available
- Metered (https://metered.ca/tools/turn-server) - Free tier available

### Performance Optimizations

1. **Enable Netlify Analytics** (optional):
   - Go to Analytics tab
   - Enable Analytics ($9/month)

2. **Set up CDN caching**:
   Already configured in `netlify.toml`

3. **Monitor Railway metrics**:
   - Check Memory usage
   - Monitor response times
   - Scale if needed (upgrade plan)

## Part 4: Testing Production Deployment

### Basic Functionality Test

1. **Create Room (Host)**:
   - Visit your Netlify URL
   - Enter name and create room
   - Note the room code

2. **Join Room (Viewer)**:
   - Open in another browser/device
   - Enter name and room code
   - Verify connection

3. **Test Screen Sharing**:
   - Host clicks "Start Sharing"
   - Select screen/window/tab
   - Verify viewer sees stream

4. **Test Chat**:
   - Send messages from both sides
   - Verify real-time delivery

### Network Testing

Test with different network conditions:

1. **Same Network**: Should work perfectly
2. **Different Networks**: Tests STUN/TURN
3. **Mobile Networks**: Tests adaptive quality
4. **Corporate Networks**: May need TURN server

### Browser Compatibility

Test on:
- Chrome 90+ ✅
- Edge 90+ ✅
- Firefox 88+ ✅
- Safari 14.1+ ✅
- Mobile browsers ✅

## Part 5: Monitoring & Maintenance

### Health Monitoring

1. **Backend Health Check**:
   ```bash
   curl https://your-server.up.railway.app/health
   ```

2. **Frontend Monitoring**:
   - Check Netlify Analytics
   - Monitor build logs

3. **Connection Stats**:
   ```bash
   curl https://your-server.up.railway.app/stats
   ```

### Debugging Connection Issues

Common issues and solutions:

1. **"Room not found"**:
   - Check if backend is running
   - Verify CORS settings
   - Check room code spelling

2. **"Connection failed"**:
   - Check browser console for errors
   - Verify STUN/TURN servers
   - Test with different network

3. **Poor video quality**:
   - Check network bandwidth
   - Monitor packet loss in console
   - Try lower quality setting

4. **Chat not working**:
   - Check WebRTC data channel
   - Verify peer connection state
   - Check browser compatibility

### Scaling Considerations

#### When to Scale:

- More than 50 concurrent rooms
- Response time > 500ms
- Memory usage > 80%

#### How to Scale:

1. **Railway**:
   - Upgrade to Pro plan
   - Increase memory/CPU
   - Add replica instances

2. **Netlify**:
   - Already auto-scales
   - Consider Enterprise for high traffic

### Security Best Practices

1. **Regular Updates**:
   ```bash
   # Check for updates monthly
   npm audit
   npm update
   ```

2. **Environment Variables**:
   - Never commit `.env` files
   - Rotate credentials regularly
   - Use strong TURN credentials

3. **Rate Limiting**:
   Consider adding rate limiting for production:
   ```javascript
   // In server/index.js
   const rateLimit = require('express-rate-limit')
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests
   })
   app.use(limiter)
   ```

## Part 6: Backup & Recovery

### Database Backup

Since ShareFlow uses in-memory storage, no database backup needed. Rooms are ephemeral.

### Code Backup

1. Use Git tags for releases:
   ```bash
   git tag -a v1.0.0 -m "Production release"
   git push origin v1.0.0
   ```

2. Keep deployment history in Railway/Netlify

### Rollback Procedure

#### Railway:
1. Go to Deployments tab
2. Click on previous deployment
3. Click "Rollback to this deployment"

#### Netlify:
1. Go to Deploys tab
2. Click on previous deploy
3. Click "Publish deploy"

## Troubleshooting Checklist

- [ ] Backend health check responding?
- [ ] Frontend loading properly?
- [ ] CORS configured correctly?
- [ ] Environment variables set?
- [ ] WebSocket connection established?
- [ ] STUN servers accessible?
- [ ] Browser console free of errors?
- [ ] Network allows WebRTC?

## Support Resources

- Railway Documentation: https://docs.railway.app
- Netlify Documentation: https://docs.netlify.com
- WebRTC Troubleshooting: https://webrtc.github.io/webrtc-org/testing
- Socket.io Documentation: https://socket.io/docs

## Cost Estimation

### Monthly Costs (Estimated):

- **Railway Hobby Plan**: $5/month
  - 8GB RAM, 8 vCPU
  - Suitable for ~100 concurrent users

- **Netlify Free Plan**: $0/month
  - 100GB bandwidth
  - 300 build minutes

- **TURN Server (Optional)**: $0-10/month
  - Xirsys free tier: 500MB/month
  - Metered free tier: 50GB/month

**Total**: $5-15/month for production deployment

## Conclusion

Your ShareFlow application is now deployed and production-ready! Monitor the health endpoints regularly and scale resources as needed based on usage patterns.

For additional support or custom deployment scenarios, refer to the main README.md or open an issue on GitHub.