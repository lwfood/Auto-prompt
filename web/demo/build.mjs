// 데모 페이지 빌드: web/demo/dist/index.html (+ assets/). 실행: npm run demo:build
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const web = path.join(here, "..");
const root = path.join(web, "..");
const out = path.join(here, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "assets/references"), { recursive: true });
mkdirSync(path.join(out, "assets/products"), { recursive: true });

// React는 cdnjs UMD 전역(window.React, window.ReactDOM)을 쓴다
const globals = {
  name: "globals",
  setup(b) {
    const map = { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" };
    b.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (a) => ({ path: a.path, namespace: "global" }));
    b.onLoad({ filter: /.*/, namespace: "global" }, (a) => ({ contents: `module.exports = window.${map[a.path]};`, loader: "js" }));
  },
};

const result = await build({
  entryPoints: [path.join(here, "main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "transform",
  // tsconfig의 react-jsx(자동 런타임) 대신 UMD 전역 React.createElement를 쓴다
  tsconfigRaw: { compilerOptions: { jsx: "react" } },
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  alias: { "@": path.join(web, "src") },
  plugins: [globals],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync(path.join(web, "src/app/globals.css"), "utf8")
  .replace(/font-family: Pretendard,/, 'font-family: "Noto Sans KR", Pretendard,');

for (const f of readdirSync(path.join(root, "references/images"))) copyFileSync(path.join(root, "references/images", f), path.join(out, "assets/references", f));
for (const f of readdirSync(path.join(root, "tests/fixtures/products")).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
  copyFileSync(path.join(root, "tests/fixtures/products", f), path.join(out, "assets/products", f));
}

const html = `<meta charset="utf-8">
<title>Reference Image Director</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<noscript>이 데모는 JavaScript가 필요해요.</noscript>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;
writeFileSync(path.join(out, "index.html"), html);
console.log(`demo: ${path.relative(web, out)}/index.html (${Math.round(html.length / 1024)} KB)`);
