# ShareFlow - High-Quality Screen Sharing Platform

A frictionless, high-quality screen sharing web application that delivers superior quality with minimal latency. Share your screen instantly with up to 10 viewers without registration or complex setup.

## Features

- **Superior Quality**: 1080p @ 60fps screen sharing that surpasses Discord Nitro standards
- **Zero Friction**: No registration, authentication, or downloads required
- **Real-time Chat**: Built-in text chat with WebRTC data channels
- **Adaptive Streaming**: Multiple quality options (360p, 720p, 1080p) with smooth switching
- **Mobile Optimized**: Responsive design that works seamlessly on all devices
- **WebRTC Powered**: Peer-to-peer connections for minimal latency
- **Simple Room System**: Create/join rooms with 6-character codes

## Technology Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Node.js, Socket.io (signaling server)
- **Video Transport**: WebRTC with H.264 codec
- **Deployment**: Netlify (frontend), Railway (backend)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/shareflow.git
cd shareflow
```

2. Install frontend dependencies:
```bash
cd frontend
npm install
```

3. Install server dependencies:
```bash
cd ../server
npm install
```

4. Set up environment variables:

Frontend (.env.local):
```
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

Server (.env):
```
PORT=3001
CLIENT_URL=http://localhost:3000
```

5. Start the development servers:

Terminal 1 - Backend:
```bash
cd server
npm run dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

6. Open http://localhost:3000 in your browser

## Deployment

### Frontend (Netlify)

1. Connect your GitHub repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `.next`
4. Add environment variable: `NEXT_PUBLIC_SERVER_URL` with your Railway server URL

### Backend (Railway)

1. Connect your GitHub repository to Railway
2. Deploy the `/server` directory
3. Set environment variables:
   - `PORT`: 3001 (or Railway's provided port)
   - `CLIENT_URL`: Your Netlify URL

## Usage

### As a Host
1. Enter your name
2. Click "Create New Room"
3. Share the room code with viewers
4. Click "Start Sharing" to begin screen sharing

### As a Viewer
1. Enter your name
2. Enter the room code
3. Click "Join Room"
4. Watch the stream and participate in chat

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14.1+
- Edge 90+

## Performance Tips

- Use a wired connection when possible
- Close unnecessary browser tabs
- Select appropriate quality based on network conditions
- For best results, use Chrome or Edge browsers

## Security

- All connections use secure WebRTC protocols
- No data is stored on servers
- Rooms are automatically cleaned up when empty
- Screen sharing requires explicit user permission

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.