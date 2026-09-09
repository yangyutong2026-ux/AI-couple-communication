import type { NextConfig } from "next";

/** GitHub Pages 是纯静态托管，所以整站导出成 HTML/JS 文件。
 *
 *  项目站点的网址形如 https://<用户名>.github.io/<仓库名>/，
 *  所以资源路径要带上仓库名这一层前缀。
 *  这里直接从 Actions 注入的 GITHUB_REPOSITORY 里取 —— 以后仓库改名，
 *  这个文件不用跟着改。本地开发时该变量为空，前缀自然为空。 */
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const onPages = Boolean(process.env.GITHUB_ACTIONS && repo);

const nextConfig: NextConfig = {
  output: "export",
  basePath: onPages ? `/${repo}` : "",
  assetPrefix: onPages ? `/${repo}/` : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
