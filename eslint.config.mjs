import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // Indentation
      "indent": ["error", 2, { SwitchCase: 1 }],

      // Spacing
      "space-before-blocks": "error",                        // space before { }
      "space-before-function-paren": ["error", "never"],     // no space before fn()
      "space-in-parens": ["error", "never"],                 // no space inside ( )
      "space-infix-ops": "error",                            // spaces around = + - etc
      "space-unary-ops": ["error", { words: true, nonwords: false }],
      "keyword-spacing": ["error", { before: true, after: true }], // space around if/else/return
      "key-spacing": ["error", { beforeColon: false, afterColon: true }], // { key: value }
      "object-curly-spacing": ["error", "always"],           // { key: value }
      "array-bracket-spacing": ["error", "never"],           // [1, 2, 3]
      "computed-property-spacing": ["error", "never"],       // obj[key]
      "template-curly-spacing": ["error", "never"],          // ${var}
      "arrow-spacing": ["error", { before: true, after: true }], // => spacing

      // Blank lines
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
      "padded-blocks": ["error", "never"],                   // no padding inside blocks
      "lines-between-class-members": ["error", "always", { exceptAfterSingleLine: true }],

      // Semicolons & commas
      "semi": ["error", "always"],
      "comma-spacing": ["error", { before: false, after: true }],
      "comma-dangle": ["error", "always-multiline"],         // trailing commas in multiline

      // Quotes
      "quotes": ["error", "single", { avoidEscape: true }],
      "jsx-quotes": ["error", "prefer-double"],

      // Line length
      "max-len": ["warn", { code: 100, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }],

      // EOL & trailing spaces
      "eol-last": ["error", "always"],
      "no-trailing-spaces": "error",
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;