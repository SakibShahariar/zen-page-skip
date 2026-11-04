# Compatibility

Zen Page Skip is a Sine mod intended for Zen Browser. This matrix separates the intended installation target from environments that have not been validated.

## Host compatibility

| Host environment | Status | Notes |
|---|---|---|
| Zen Browser with Sine | Intended target | Install and load through Sine. Minimum Zen/Sine versions have not yet been established by recorded live tests. |
| Zen Browser without Sine | Not supported by the documented installation path | The mod depends on Sine to load its script and expose mod preferences. |
| Other Firefox-based browsers | Unverified | Similar browser APIs do not establish Sine compatibility. No support claim is made. |
| Chromium-based browsers | Out of scope | No Chromium extension package or host integration is provided. |

## Feature verification matrix

| Feature | Automated regression coverage | Live Zen/Sine verification |
|---|---|---|
| Next/previous control detection | Yes | Pending |
| Relative, encoded, query, and fragment URLs | Yes | Pending |
| Numbered URL patterns and jump-to-page | Yes | Pending |
| Hash-based pagination | Yes | Pending |
| SPA route and browser-history updates | Yes | Pending |
| Late-added/replaced pagination controls | Yes | Pending |
| Shortcut configuration and pause toggles | Yes | Pending |
| Settings import/export and confirmation | Yes | Pending |
| Per-site selectors and URL templates | Yes | Pending |

Automated tests use mocked browser/document APIs. They verify deterministic logic, not compatibility with a particular installed Zen or Sine release.

## Version policy

No minimum supported Zen Browser or Sine version is published yet. A version range will be added only after a live test records both versions and checks the core navigation, settings, and lifecycle behaviors.

## Site coverage

No real website is currently claimed as live-tested in this maintenance pass. Site pagination changes frequently, so a site should be listed here only after its current pagination flow has been checked in Zen/Sine.

When automatic detection fails, use the [configuration guide](CONFIGURATION.md) to add a per-site selector, exact label, or same-origin page template. Treat custom rules as site-specific configuration, not a guarantee that the site will keep the same markup.
