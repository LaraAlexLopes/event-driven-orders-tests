## Summary

<!-- What does this PR change, and why? -->

## Type of change

- [ ] New test scenarios
- [ ] Fix for a failing or flaky test
- [ ] Framework change (clients, validations, test data)
- [ ] Change to the system under test (`system/`)
- [ ] CI, tooling or documentation

## Scenarios

<!-- One line per scenario added or changed. Delete this section if there are none. -->

| Test | Scenario | Checked in events, database or queue |
| ---- | -------- | ------------------------------------ |
|      |          |                                      |

## Test data

- [ ] Products are created with `createProduct`, so they are deleted after the test file
- [ ] Assertions that something must not happen use `consistently()`, not a single check

## How it was verified

- [ ] `npm run lint`, `npm run typecheck` and `npm run format:check` pass
- [ ] `npm test` passes against a fresh stack (`npm run system:down && npm run system:up`)
- [ ] Tests that stop or kill services restore them in `afterEach`
- [ ] Defects are covered with `it.fails` and documented in the README, not skipped

**CI run:**

## Flakiness and risks

<!-- Waits added, retries, known unstable areas, anything the reviewer should look at closely. -->

## Screenshots or report

<!-- Allure report link, screenshots or the screen dump of a failure, when relevant. -->
