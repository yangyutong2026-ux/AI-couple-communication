import type { NextConfig } from "next";

/** GitHub Pages 是纯静态托管，所以整站导出成 HTML/JS 文件。
 *  网址形如 https://<用户名>.github.io/<仓库名>/，所以要设 basePath。 */
const repo = "AI-couple-communication";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.GITHUB_ACTIONS ? `/${repo}` : "",
  assetPrefix: process.env.GITHUB_ACTIONS ? `/${repo}/` : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
