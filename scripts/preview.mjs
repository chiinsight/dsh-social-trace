import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../lib/index.js';
import { dataDirectory } from '../lib/paths.js';

const require = createRequire(import.meta.url);
const directory = process.env.SOCIAL_TRACE_HOME ? dataDirectory() : join(dataDirectory(), 'development-preview');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const runtime = createRuntime(directory);
runtime.start();
const assets = {
  '/react.js': fileURLToPath(new URL('./umd/react.development.js', 'file://' + require.resolve('react'))),
  '/react-dom.js': fileURLToPath(new URL('./umd/react-dom.development.js', 'file://' + require.resolve('react-dom'))),
  '/client.js': fileURLToPath(new URL('../lib/client.js', import.meta.url)),
};
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-Social Trace</title><style>body{margin:0;background:#fff}#root{height:100vh}</style></head><body><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>window.__ModuleLoader__={load(reg){reg.factory(()=>React).apply({slots:{inject:(slot,gen)=>gen().next(),register:(spec,comp)=>{if(spec.name==='main')ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(comp));return()=>{};}}});}};</script><script src="/client.js"></script></body></html>`;
const server = createServer((req, res) => {
  if (req.url.startsWith('/dsh-social-trace/')) return void runtime.handle(req, res);
  if (assets[req.url]) {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(readFileSync(assets[req.url]));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } else { res.writeHead(404); res.end(); }
});
server.listen(Number(process.env.SOCIAL_TRACE_PORT || 8937), '127.0.0.1', () => {
  console.log('Social Trace 已启动：http://127.0.0.1:' + server.address().port);
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await runtime.close();
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
