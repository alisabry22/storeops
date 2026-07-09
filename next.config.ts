import type { NextConfig } from "next";

const securityHeaders = [
  // Force HTTPS for a year once deployed behind TLS
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // The app talks only to itself (proxy + license routes) — lock everything else down
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // We use no camera/mic/geolocation — say so explicitly
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
