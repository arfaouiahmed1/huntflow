## Summary
<!-- Describe the changes in this pull request and problem solved -->

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature / connector (non-breaking change adding functionality)
- [ ] Source adapter update / drift fix
- [ ] Performance / optimization
- [ ] Documentation / governance

## Verification Checklist
- [ ] `npm run check` (ESLint + TypeScript typecheck) passes with 0 errors
- [ ] `npm run test:crawler` (Crawler unit, registry, normalizer, and dedup tests) passes
- [ ] `npm run test:sidecar` (Python connector tests via pytest) passes
- [ ] `npm run sources:validate` (Source registry schema check) passes
- [ ] `npm run check:env` (.env.example parity) passes
- [ ] No secret or `.env` files tracked in git

## Source Policy & Licensing (If adding/modifying sources)
- [ ] Connector uses public ATS API, open RSS/XML feed, or approved terms
- [ ] Source attribution and termsUrl are provided
- [ ] No unauthorized authenticated scraping or CAPTCHA/WAF bypass logic introduced
