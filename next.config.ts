import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Pacchetti Node.js usati solo sul server per inviare notifiche ed email:
  // si caricano con require invece di essere inclusi nel bundle.
  serverExternalPackages: ["web-push", "nodemailer"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
