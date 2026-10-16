# Integrations registry

| Integration | Status | Verified how |
|---|---|---|
| Greenhouse Job Board API | implemented (`greenhouse`) | mocked responses only; never run against the live API |
| Generic JSON feed | implemented (`json_feed`) | mocked |
| Email | interface + outbox + retries; **console transport only** | unit tests; no real provider chosen/wired |
| AI (Anthropic Messages API) | implemented, off by default | mocked fetch only; never called live |
| Google AdSense | script loader gated by consent + `ADSENSE_CLIENT` | e2e confirms nothing loads pre-consent; no publisher account, so ad serving untested. **The banner is not a Google-certified CMP; serving ads to EEA/UK users requires one.** |
| Analytics | first-party, aggregate | unit + e2e |
| GitHub Actions CI | `.github/workflows/ci.yml` | **never executed** (no remote repo); same commands pass locally |
