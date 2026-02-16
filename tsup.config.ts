import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { daemon: 'src/daemon/index.ts' },
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    target: 'node18',
    clean: true,
    minify: false,
    sourcemap: true,
    dts: false,
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    target: 'node18',
    clean: false,
    minify: false,
    sourcemap: true,
    dts: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
