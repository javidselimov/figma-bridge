export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // scope = FSD slice name: feat(add-to-cart): disable button while pending
    "scope-case": [2, "always", "kebab-case"],
  },
};
