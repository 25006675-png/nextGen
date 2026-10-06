import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "6mb" }, // waste photos up to 5 MB plus form overhead
  },
  // The LarvaLoop landing page (static HTML in public/larvaloop) is the front door at "/";
  // its "Open the app" button leads into the app.
  async rewrites() {
    return [{ source: "/", destination: "/larvaloop/index.html" }];
  },
  async redirects() {
    return [{ source: "/larvaloop", destination: "/", permanent: false }];
  },
};

export default nextConfig;
