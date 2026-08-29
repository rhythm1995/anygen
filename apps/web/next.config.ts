import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Next 16 dev origin protection 只默认放行 localhost，补上 IP 形式
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
