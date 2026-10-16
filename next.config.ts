import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // treasury/delegation.json is read with fs at runtime; ship it with every serverless function.
  outputFileTracingIncludes: { "/**": ["./treasury/**"] },
};

export default nextConfig;
