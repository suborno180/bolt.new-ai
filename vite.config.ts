import { vitePlugin as remix } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  build: {
    target: 'esnext',
  },
  plugins: [
    nodePolyfills({
      include: ['path', 'buffer'],
    }),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    UnoCSS(),
    tsconfigPaths(),
    chrome129IssuePlugin(),
    optimizeCssModules(),
  ],
});

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);
        if (raw && parseInt(raw[2], 10) === 129) {
          res.setHeader('content-type', 'text/html');
          res.end(
            '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development.</p></body>',
          );
          return;
        }
        next();
      });
    },
  };
}