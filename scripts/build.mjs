import { build, context } from 'esbuild';

const options = {
  entryPoints: ['plugin/main.ts'],
  outfile: 'main.js',
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const builder = await context(options);
  await builder.watch();
} else {
  await build(options);
}
