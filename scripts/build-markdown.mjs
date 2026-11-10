import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['src/chat-markdown.js'], bundle: true, write: false, format: 'cjs', platform: 'browser',
  external: ['react'], minify: true, legalComments: 'inline',
  plugins: [{ name: 'host-react-jsx', setup(builder) {
    builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'host' }));
    builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `import React from 'react'; export const Fragment=React.Fragment; export function jsx(type,props,key){return React.createElement(type,key===undefined?props:{...props,key});} export const jsxs=jsx;`, loader: 'js' }));
  } }],
});
const path = new URL('../lib/client.js', import.meta.url), source = await readFile(path, 'utf8');
const renderer = `/* MARKDOWN_VENDOR_START */\n    function loadChatMarkdown(require) {\n      const module = { exports: {} };\n      ${result.outputFiles[0].text}\n      return module.exports;\n    }\n    /* MARKDOWN_VENDOR_END */`;
await writeFile(path, source.replace(/\/\* MARKDOWN_VENDOR_START \*\/[\s\S]*?\/\* MARKDOWN_VENDOR_END \*\//, () => renderer));
