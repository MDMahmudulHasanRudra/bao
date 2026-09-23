/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverActions: {
    bodySizeLimit: '10mb',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
