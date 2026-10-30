# Zen Page Skip

[![Tests](https://github.com/SakibShahariar/zen-page-skip/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/SakibShahariar/zen-page-skip/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Move through paginated websites without reaching for the mouse.**

Zen Page Skip is a [Sine](https://github.com/CosmoCreeper/Sine) mod for [Zen Browser](https://zen-browser.app). It adds configurable keyboard shortcuts for next page, previous page, and jumping directly to a page number. It works with recognizable pagination controls as well as common numbered URL patterns.

## Get started

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. Open **Settings → Sine Mods**.
3. Add this repository as a mod source:
   `SakibShahariar/zen-page-skip`
4. Install **Zen Page Skip** and restart Zen if prompted.

## Shortcuts

| Action | Default shortcut |
|---|---|
| Next page | `Alt + ]` |
| Previous page | `Alt + [` |
| Jump to page | `Alt + Shift + P` |

Change shortcuts in **Settings → Sine Mods → Zen Page Skip**. You can also edit the corresponding `zen-page-skip.*-shortcut` preferences in `about:config`.

Shortcuts support modifier combinations such as `Ctrl+Alt+Right`, `Cmd+Shift+N`, `Super+N`, and `Option+P`. Modifier names are case-insensitive. `Ctrl` and `Cmd`/`Meta`/`Super` are distinct; `Option` is an alias for `Alt`.

Supported modifier names: `Ctrl`/`Control`, `Alt`/`Option`, `Shift`, and `Meta`/`Cmd`/`Command`/`Super`/`Win`/`Windows`. Arrow aliases include `Left`, `Right`, `Up`, and `Down`; key aliases include `Esc`, `Return`, and `Space`.

The mod warns about invalid shortcuts, duplicate bindings, and common browser-shortcut conflicts. These checks are best-effort because browser and operating-system bindings vary. To copy the current warnings from the browser console:

```js
copy(window.zenPageSkipGetShortcutWarnings().join("\\n"))
```

## What it can do

- **Find site pagination:** checks `rel="next"`/`rel="prev"` hints and recognizable next/previous controls.
- **Handle numbered URLs:** supports common `?page=3`, `?p=3`, `/page/3/`, and `#page=3` patterns.
- **Adapt per site:** configure selectors, labels, URL templates, and action behavior for individual websites.
- **Respect dynamic pages:** reads the selected tab's current URL and document for each action, so updated SPA routes and browser-history navigation are not tied to stale cached candidates.
- **Avoid risky clicks:** filters out form controls, menu controls, destructive actions, disabled controls, and user-excluded selectors.
- **Give useful feedback:** uses Zen's native toast when available and falls back to the browser notification bar.
- **Support multilingual labels:** includes common pagination wording in English, Spanish, French, German, Portuguese, Dutch, Polish, Russian, Arabic, Chinese, Japanese, and Korean.

If no safe pagination target is found, the mod reports that it could not find the requested page rather than guessing.

## How navigation works

Zen Page Skip prefers the website's own pagination control. It checks document navigation hints first, then looks for a suitable visible control using its label, directional metadata, and pagination context. If no control is available, it can use a recognized numbered URL pattern.

Before using a numbered URL fallback, it checks same-origin numbered page links already present in the document. If those links show that the requested page is not available, the fallback is rejected. If no numbered links are present, the normal fallback remains available. The mod does not send HEAD or OPTIONS requests for this check.

Hash-only navigation is treated separately. The default `verify` mode checks whether visible page content changes after the fragment changes; a fragment update by itself is not treated as proof that pagination succeeded.

## Settings

The settings are available in **Settings → Sine Mods → Zen Page Skip**. Advanced users can edit the matching `zen-page-skip.*` preferences in `about:config`.

| Setting | What it controls |
|---|---|
| Next / previous / jump shortcuts | Keyboard bindings for the three actions |
| Disabled sites | Hostnames where the mod should not run |
| Shortcut cooldown | Minimum delay between shortcut actions (default: 400 ms; range: 0–5000 ms) |
| Feedback toasts | Whether feedback is shown and how long it remains visible (500–10000 ms; default: 1800 ms) |
| Confidence threshold | Minimum score for generic pagination candidates (50–150; default: 70) |
| Excluded control selectors | Newline-separated CSS selectors for controls that must not be clicked |
| Local diagnostics | Opt-in candidate and navigation logging |
| Additional next / previous labels | Comma- or newline-separated exact labels |
| Confirm before navigating | Show a confirmation dialog before activating a target |
| Per-site pagination rules | JSON rules for site-specific behavior |

### Per-site rules

Set `zen-page-skip.site-rules` to a JSON object keyed by a hostname or wildcard subdomain:

```json
{
  "example.com": {
    "enabled": true,
    "action": "auto",
    "nextSelector": "a.pagination-next",
    "previousSelector": "a.pagination-previous",
    "nextWords": ["Load more"],
    "previousWords": ["Newer results"],
    "confidenceThreshold": 85,
    "pageTemplate": "/archive/page/{page}",
    "infiniteScroll": "allow",
    "hashMode": "verify"
  },
  "*.forum.example": {
    "nextSelector": "button[aria-label='Next page']"
  }
}
```

Available options:

| Option | Values | Description |
|---|---|---|
| `enabled` | `true` / `false` | Enable or disable the mod for this host |
| `action` | `auto` / `click` / `url` | Automatically choose, require a matching control, or prefer URL navigation |
| `nextSelector`, `previousSelector` | CSS selectors | Identify the site's pagination controls |
| `nextWords`, `previousWords` | Arrays of strings | Add exact labels recognized on this site |
| `confidenceThreshold` | 50–150 | Override generic candidate scoring |
| `pageTemplate` | URL containing `{page}` | Define a custom numbered URL pattern |
| `infiniteScroll` | `allow` / `block` | Override infinite-scroll detection |
| `hashMode` | `verify` / `allow` / `disable` | Verify hash updates, trust the site's fragment behavior, or disable hash pagination |

A `pageTemplate` must contain exactly one `{page}` placeholder and resolve to the current page's origin. Wildcard rules such as `*.example.com` apply to subdomains, not the apex `example.com`. Site-specific selectors still pass the mod's safety and exclusion checks. Invalid JSON, selectors, and unsupported values are ignored.

### Site exclusions

Use `zen-page-skip.disabled-sites` for a comma- or newline-separated list of hostnames:

- `example.com` disables the exact hostname.
- `*.example.com` disables its subdomains, but not `example.com` itself.

Invalid entries are ignored.

### Settings backup and restore

Export the supported settings from the browser console:

```js
copy(window.zenPageSkipExportSettings())
```

Import a previously exported snapshot:

```js
window.zenPageSkipImportSettings(prompt("Paste Zen Page Skip settings JSON"))
```

Exports include a schema version. Imports validate known setting types, clamp supported numeric values, reject malformed shortcuts and site-rule JSON, and ignore unknown keys. Only settings included in the import are changed.

### Local diagnostics

Enable `zen-page-skip.debug-mode` to log candidate scores, rejection reasons, and navigation decisions in the browser console. The diagnostic buffer is kept in memory and limited to the latest 100 entries. Copy it with:

```js
copy(window.zenPageSkipGetDiagnostics())
```

Diagnostics are off by default. The mod does not send telemetry or diagnostic data to a server.

## Compatibility and limitations

- Designed for **Zen Browser with Sine**.
- Browser navigation APIs are feature-detected; unavailable methods fail safely where possible.
- Other Firefox-based browsers may work, but are not claimed as runtime-verified.
- Sites with custom pagination that has no accessible label, recognizable metadata, or pagination container may not be detectable.
- Infinite-scroll feeds are not treated as numbered pagination unless an explicit pagination container or site-specific selector is present.
- SPA and history changes are reflected when the site updates its URL and document. The mod does not replace or intercept the site's own router or history APIs.

## Development

Requires Node.js. Run the syntax check and automated regression tests:

```sh
node --check script.js
node --test
```

GitHub Actions runs the same checks on pushes and pull requests to `main`, using Node.js 22.

## License

[MIT](LICENSE)
