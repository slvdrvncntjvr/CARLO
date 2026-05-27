import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, '..'),
  },

  // Optimize images
  images: {
    unoptimized: true,
  },

  async rewrites() {
    const backendUrl = process.env.AGENT_BACKEND_URL?.replace(/\/$/, '')
    if (!backendUrl) {
      return []
    }

    return [
      {
        source: '/api/get_config',
        destination: `${backendUrl}/get_config`,
      },
      {
        source: '/api/startAgent',
        destination: `${backendUrl}/startAgent`,
      },
      {
        source: '/api/stopAgent',
        destination: `${backendUrl}/stopAgent`,
      },
      {
        source: '/api/inventory',
        destination: `${backendUrl}/api/inventory`,
      },
      {
        source: '/api/leads',
        destination: `${backendUrl}/api/leads`,
      },
      {
        source: '/api/calls',
        destination: `${backendUrl}/api/calls`,
      },
      {
        source: '/api/webhook/agent',
        destination: `${backendUrl}/api/webhook/agent`,
      },
      {
        source: '/api/inventory_status',
        destination: `${backendUrl}/api/inventory/status`,
      },
    ]
  },
}

export default nextConfig
