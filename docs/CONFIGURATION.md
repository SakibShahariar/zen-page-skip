# Configuration

Zen Page Skip settings are available in **Settings → Sine Mods → Zen Page Skip**. Advanced users can also edit the matching `zen-page-skip.*` preferences in `about:config`.

## Keyboard shortcuts

Default bindings:

| Action | Shortcut |
|---|---|
| Next page | `Alt + ]` |
| Previous page | `Alt + [` |
| Jump to page | `Alt + Shift + P` |
| Toggle current site | `Alt + Shift + D` |
| Toggle current tab pause | `Alt + Shift + X` |

Shortcuts accept modifier combinations such as `Ctrl+Alt+Right`, `Cmd+Shift+N`, `Super+N`, and `Option+P`. Modifier names are case-insensitive. Set an individual shortcut to an empty value to disable that action's keyboard binding. The toggle shortcut pauses or re-enables pagination for the current hostname while preserving its other site-rule settings; it creates an exact-host override when a wildcard rule applies. The separate current-tab shortcut pauses only the selected tab until resumed or that tab is closed; it does not modify saved site rules.

Supported modifiers:

- `Ctrl` / `Control`
- `Alt` / `Option`
- `Shift`
- `Meta` / `Cmd` / `Command` / `Super` / `Win` / `Windows`

`Ctrl` and `Cmd`/`Meta`/`Super` are distinct. Arrow aliases include `Left`, `Right`, `Up`, and `Down`; key aliases include `Esc`, `Return`, and `Space`.

The mod warns about invalid shortcuts, duplicate bindings, and common browser-shortcut conflicts. These checks are best-effort because browser and operating-system bindings vary. Copy the current warnings from the browser console:

```js
copy(window.zenPageSkipGetShortcutWarnings().join("\n"))
```

## Settings reference

| Setting | What it controls |
|---|---|
| Next / previous / jump shortcuts | Keyboard bindings for the three actions |
| Disabled sites | Hostnames where the mod should not run |
| Shortcut cooldown | Minimum delay between actions (default: 400 ms; range: 0–5000 ms) |
| Feedback toasts | Whether feedback is shown and its duration (500–10000 ms; default: 1800 ms) |
| Confidence threshold | Minimum score for generic pagination candidates (50–150; default: 70) |
| Excluded control selectors | Newline-separated CSS selectors for controls that must not be clicked |
| Local diagnostics | Opt-in candidate and navigation logging |
| Additional next / previous labels | Comma- or newline-separated exact labels |
| Confirm before navigating | Show a confirmation dialog before activating a target |
| Per-site pagination rules | JSON rules for site-specific behavior |

## Per-site rules

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

| Option | Values | Description |
|---|---|---|
| `enabled` | `true` / `false` | Enable or disable the mod for this host |
| `action` | `auto` / `click` / `url` | Automatically choose, require a matching control, or prefer URL navigation |
| `nextSelector`, `previousSelector` | CSS selectors | Identify the site's pagination controls |
| `nextWords`, `previousWords` | Arrays of strings | Add exact labels recognized on this site |
| `confidenceThreshold` | 50–150 | Override generic candidate scoring |
| `pageTemplate` | URL containing `{page}` | Define a custom numbered URL pattern |
| `infiniteScroll` | `allow` / `block` | Override infinite-scroll detection |
| `hashMode` | `verify` / `allow` / `disable` | Verify hash updates, trust fragment behavior, or disable hash pagination |

A `pageTemplate` must contain exactly one `{page}` placeholder and resolve to the current page's origin. Wildcard rules such as `*.example.com` apply to subdomains, not the apex `example.com`. Site-specific selectors still pass the mod's safety and exclusion checks. Invalid JSON, selectors, and unsupported values are ignored.

## Site exclusions

Use `zen-page-skip.disabled-sites` for a comma- or newline-separated list of hostnames:

- `example.com` disables the exact hostname.
- `*.example.com` disables its subdomains, but not `example.com` itself.

Invalid entries are ignored.

## Settings backup and restore

Export supported settings from the browser console:

```js
copy(window.zenPageSkipExportSettings())
```

Preview a snapshot without changing preferences:
 
```js
window.zenPageSkipPreviewSettings(prompt("Paste Zen Page Skip settings JSON"))
```

Import a previously exported snapshot. Zen Page Skip shows a confirmation summary before applying validated changes; cancelling leaves preferences untouched:

```js
window.zenPageSkipImportSettings(prompt("Paste Zen Page Skip settings JSON"))
```

Exports include a schema version. Imports validate known setting types, clamp supported numeric values, reject malformed shortcuts and site-rule JSON, and ignore unknown keys. Only settings included in the import are changed.

## Navigation behavior

Zen Page Skip prefers the website's own pagination control. It checks document navigation hints first, then looks for a suitable visible control using its label, directional metadata, and pagination context. If no control is available, it can use a recognized numbered URL pattern.

Before using a numbered URL fallback, it checks same-origin numbered page links already present in the document. If those links show that the requested page is not available, the fallback is rejected. If no numbered links are present, the normal fallback remains available. The mod does not send HEAD or OPTIONS requests for this check.

Hash-only navigation is treated separately. The default `verify` mode checks whether visible page content changes after the fragment changes; a fragment update by itself is not treated as proof that pagination succeeded.

Automatic detection ignores hidden or aria-hidden controls and controls inside carousels, sliders, recommendation widgets, and article/post navigation. A generic site-wide navigation bar is not treated as a pagination landmark by itself. Explicit per-site selectors can opt a known control back in, but disabled, destructive, dialog, menu, and user-excluded controls remain blocked.

For each action, the mod reads the selected tab's current URL and document. This allows updated SPA routes and browser-history navigation without relying on stale cached candidates. The mod does not replace or intercept the site's own router or history APIs. It also queries the live document when each shortcut is used instead of running a permanent whole-page mutation observer, so controls inserted or replaced after initial load are considered on the next action without continuous DOM scanning.

## Local diagnostics

Enable `zen-page-skip.debug-mode` to log candidate scores, rejection reasons, and navigation decisions in the browser console. The diagnostic buffer is kept in memory and limited to the latest 100 entries. Diagnostics include generic rule/method names, control tags, scores, and rejection reasons, but omit page labels, page text, hostnames, URLs, query parameters, fragments, and raw error messages.

Copy it with:

```js
copy(window.zenPageSkipGetDiagnostics())

Generate a privacy-filtered troubleshooting report and copy it explicitly:

```js
copy(window.zenPageSkipCreateTroubleshootingReport())
```

The report includes the mod version, browser name/version when available, and the latest 50 local diagnostic entries. It omits page content, control labels, hostnames, URLs, query parameters, and fragments. No report is sent automatically; inspect it before sharing.
```

Diagnostics are off by default. Rule authors can inspect selector outcomes such as selected, not found, rejected, or syntactically invalid, alongside generic candidate rejection reasons. Custom page-template failures are classified by reason without including the rejected destination. The mod does not send telemetry or diagnostic data to a server.

## Compatibility and limitations

- Designed for Zen Browser with Sine.
- Browser navigation APIs are feature-detected; unavailable methods fail safely where possible.
- Other Firefox-based browsers may work, but are not runtime-verified.
- Sites with custom pagination that has no accessible label, recognizable metadata, or pagination container may not be detectable.
- Infinite-scroll feeds are not treated as numbered pagination unless an explicit pagination container or site-specific selector is present.

## Security boundaries

Site rules are local preferences. Imported rule sets must be a JSON object with at most 100 hostname entries. Host keys accept exact hostnames or a `*.` subdomain prefix; wildcard rules do not match the apex hostname. When multiple rules match, the longest matching key takes precedence.

Imports validate rule fields and types before changing preferences. Unknown rule fields, invalid host keys, malformed selector syntax, oversized selectors, invalid label arrays, unsupported option values, and malformed or cross-origin page templates reject the affected settings import. Selectors are limited to 512 characters; custom labels are limited to 80 characters each (up to 50 per direction); page templates are limited to 512 characters. Confidence thresholds must be integers from 50–150. Site-rule JSON in a preference is limited to 8192 characters. Rules already present in preferences are still sanitized and bounded when read.

Custom page templates must contain exactly one `{page}` placeholder and resolve to the rule host's origin. Generated page numbers must be positive safe integers no greater than 1,000,000. Built-in numbered URL patterns reject page numbers below 1.

Navigation destinations are normalized against the current page URL. Only HTTP and HTTPS URLs are accepted; embedded username/password credentials are rejected, hostnames are canonicalized, and default ports are removed before self-navigation checks. Document-level `rel=next/prev` destinations are resolved against the document base URL. Hash-only navigation is handled separately according to the site's `hashMode`.

The mod rejects canonical self-navigation, repeated in-flight destinations, and an immediate return to the source of an unfinished navigation. This pending-navigation guard expires after 10 seconds and is cleared when the destination page is shown, so ordinary next/previous navigation remains available after load. The browser still controls network redirects; the mod does not rewrite server responses.

Automatically selected controls exclude disabled, download, submit, dialog/menu, and commonly destructive controls. User-configured selectors still pass through the same safety and exclusion checks. The extension does not fetch candidate URLs for validation; numbered fallback validation uses same-origin numbered links already present in the page.

Settings import accepts schema version 1 only, with a 65,536-character input limit. Unknown setting keys are ignored; known values are type-checked, string values are limited to 8,192 characters, shortcut strings are parsed, and supported numeric settings are clamped. All known values are validated before writes begin. Existing preference values are snapshotted, and earlier writes are rolled back if a later preference write fails. If rollback itself fails, the import reports the failed restoration rather than claiming success.

Diagnostics are opt-in, stored only in memory, and limited to the latest 100 entries. The mod does not send telemetry or diagnostic data to a server.

These checks reduce accidental or unsafe navigation but do not guarantee that a website's controls are benign. Site-specific rules are user-supplied configuration and should be trusted only when you understand their effect.
