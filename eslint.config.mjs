import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * Flat ESLint config for the whole monorepo.
 *
 * Type-aware linting is deliberately off: `pnpm typecheck` already runs
 * `tsc --noEmit` over every package, so this gate stays fast and can never
 * disagree with the compiler about types. Its job is the class of bug tsc
 * cannot see — coercing globals, unused code, React hook misuse.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/*.tsbuildinfo",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared rules for every source file, TypeScript and CommonJS alike.
  {
    files: ["**/*.{ts,tsx,js,cjs,mjs}"],
    rules: {
      // `isFinite`/`isNaN` coerce their argument, so isFinite("5") is true.
      // Network input is validated with these — see audit P1-20.
      "no-restricted-globals": [
        "error",
        {
          name: "isFinite",
          message: "Use Number.isFinite — the global coerces its argument.",
        },
        {
          name: "isNaN",
          message: "Use Number.isNaN — the global coerces its argument.",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // AGENTS.md allows `any` only when unavoidable and documented.
      // Warn rather than error so the existing 13 uses are visible without
      // blocking this gate; tracked as audit P3-54.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Browser client.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Node services and shared packages.
  {
    files: ["apps/api/src/**/*.ts", "apps/game-server/src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Services log to stdout by design.
      "no-console": "off",
    },
  },

  // Vitest suites.
  {
    files: ["**/*.test.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },

  // CommonJS test harnesses and build scripts.
  {
    files: ["**/*.cjs", "**/*.mjs"],
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs",
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Playwright harness: Node scope, but `page.evaluate` callbacks are
  // serialized and run inside the browser, so both global sets are in play.
  // Must follow the generic .cjs block so these globals win.
  {
    files: ["apps/web/scripts/test-browser-gate.cjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
