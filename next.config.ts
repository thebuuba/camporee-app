import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Local bindings use isolated Wrangler storage; no production R2 access.
initOpenNextCloudflareForDev({ remoteBindings: false });

const nextConfig: NextConfig = {};

export default nextConfig;
