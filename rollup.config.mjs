import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

const input = 'src/index.ts';

export default [
  {
    input,
    external: (id) => id === 'opentool-ts' || id.startsWith('opentool-ts/'),
    output: [
      {
        file: 'dist/index.js',
        format: 'esm',
        sourcemap: true
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      },
      {
        file: 'dist/index.umd.js',
        format: 'umd',
        name: 'AgentOSSDK',
        sourcemap: true,
        exports: 'named',
        globals: {
          'opentool-ts': 'OpenToolTS',
          'opentool-ts/opentool-schema': 'OpenToolTS',
          'opentool-ts/opentool-tool': 'OpenToolTS',
          'opentool-ts/opentool-llm': 'OpenToolTS',
          'opentool-ts/opentool-daemon': 'OpenToolTS'
        }
      }
    ],
    plugins: [
      nodeResolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist'
      })
    ]
  }
];
