import { build } from 'esbuild'

await build({
  entryPoints: ['src/client.jsx'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  external: ['react'],
  loader: { '.css': 'text' },
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-plugin-simworld", factory: (require) => { const module = { exports: {} };' },
  footer: { js: 'return module.exports; } });' },
})

