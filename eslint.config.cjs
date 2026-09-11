const js = require("@eslint/js");
const globals = require("globals");

const webApiGlobals = {
  AbortController: "readonly",
  Blob: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
  structuredClone: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "MiaoxunRN/**",
      "avatar-web/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["backend/**/*.js", "agents/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...webApiGlobals,
      },
    },
  },
  {
    files: ["admin/admin.js", "admin/admin-core.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        __MIAOXUN_ADMIN_API_TARGET__: "readonly",
      },
    },
  },
  {
    files: ["admin/vite.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["admin/test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...webApiGlobals,
      },
    },
  },
  {
    files: ["media-retrieval-web/src/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...webApiGlobals,
        __MIAOXUN_MEDIA_RETRIEVAL_API_TARGET__: "readonly",
      },
    },
  },
  {
    files: ["media-retrieval-web/vite.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["media-retrieval-web/test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...webApiGlobals,
      },
    },
  },
];
