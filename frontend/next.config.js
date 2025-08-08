/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Remove output: 'standalone' for Netlify
  // Netlify handles this automatically with the plugin
}

module.exports = nextConfig