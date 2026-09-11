import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Flags setState called directly in an effect body (e.g. resetting UI state on
      // route change, or a ticking-clock hook's null-guard reset) even when there's no
      // derived-state alternative. Both existing uses in this codebase are legitimate
      // external-system syncs, not accidental cascading renders.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
