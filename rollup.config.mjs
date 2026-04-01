import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

const globals = {
  'opentool-ts': 'OpenToolTS',
  'opentool-ts/opentool-schema': 'OpenToolTS',
  'opentool-ts/opentool-tool': 'OpenToolTS',
  'opentool-ts/opentool-llm': 'OpenToolTS',
  'opentool-ts/opentool-daemon': 'OpenToolTS'
};

function createConfig(input, name, includeUmd = false) {
  const output = [
    {
      file: `dist/${name}.js`,
      format: 'esm',
      sourcemap: true
    },
    {
      file: `dist/${name}.cjs`,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    }
  ];

  if (includeUmd) {
    output.push({
      file: `dist/${name}.umd.js`,
      format: 'umd',
      name: 'AgentOSSDK',
      sourcemap: true,
      exports: 'named',
      globals
    });
  }

  return {
    input,
    external: (id) => id === 'opentool-ts' || id.startsWith('opentool-ts/'),
    output,
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
  };
}

export default [
  createConfig('src/index.ts', 'index', true),
  createConfig('src/opentool.ts', 'opentool'),
  createConfig('src/third_party.ts', 'third_party')
];
