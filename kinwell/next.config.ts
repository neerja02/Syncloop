import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** Legacy screens that are outside the patient-first MVP. Their code stays, but nothing routes to them. */
const hiddenRoutes: [string, string][] = [
  ["/health", "/app"],
  ["/health/:path*", "/app"],
  ["/appointments", "/app"],
  ["/appointments/:path*", "/app"],
  ["/providers", "/app"],
  ["/emergency", "/app"],
  ["/search", "/app"],
  ["/help", "/profile"],
  ["/care", "/my-doctor"],
  ["/settings", "/profile"],
  ["/settings/privacy", "/profile/privacy"],
  ["/settings/:path*", "/profile"],
  ...(process.env.ENABLE_DOCTOR_PORTAL === "true" ? [] : ([["/doctor", "/"], ["/doctor/:path*", "/"]] as [string, string][])),
];

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same Wi-Fi open the dev server by the Mac's local address.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "pg", "sharp", "mammoth", "unpdf"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  async redirects() {
    return hiddenRoutes.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
