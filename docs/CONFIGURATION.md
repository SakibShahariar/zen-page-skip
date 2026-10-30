# Configuration

Zen Page Skip settings are available in **Settings → Sine Mods → Zen Page Skip**. Advanced users can also edit the matching `zen-page-skip.*` preferences in `about:config`.

## Keyboard shortcuts

Default bindings:

| Action | Shortcut |
|---|---|
| Next page | `Alt + ]` |
| Previous page | `Alt + [` |
| Jump to page | `Alt + Shift + P` |

Shortcuts accept modifier combinations such as `Ctrl+Alt+Right`, `Cmd+Shift+N`, `Super+N`, and `Option+P`. Modifier names are case-insensitive.

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

Import a previously exported snapshot:

```js
window.zenPageSkipImportSettings(prompt("Paste Zen Page Skip settings JSON"))
```

Exports include a schema version. Imports validate known setting types, clamp supported numeric values, reject malformed shortcuts and site-rule JSON, and ignore unknown keys. Only settings included in the import are changed.

## Navigation behavior

Zen Page Skip prefers the website's own pagination control. It checks document navigation hints first, then looks for a suitable visible control using its label, directional metadata, and pagination context. If no control is available, it can use a recognized numbered URL pattern.

Before using a numbered URL fallback, it checks same-origin numbered page links already present in the document. If those links show that the requested page is not available, the fallback is rejected. If no numbered links are present, the normal fallback remains available. The mod does not send HEAD or OPTIONS requests for this check.

Hash-only navigation is treated separately. The default `verify` mode checks whether visible page content changes after the fragment changes; a fragment update by itself is not treated as proof that pagination succeeded.

For each action, the mod reads the selected tab's current URL and document. This allows updated SPA routes and browser-history navigation without relying on stale cached candidates. The mod does not replace or intercept the site's own router or history APIs.

## Local diagnostics

Enable `zen-page-skip.debug-mode` to log candidate scores, rejection reasons, and navigation decisions in the browser console. The diagnostic buffer is kept in memory and limited to the latest 100 entries.

Copy it with:

```js
copy(window.zenPageSkipGetDiagnostics())
```

Diagnostics are off by default. The mod does not send telemetry or diagnostic data to a server.

## Compatibility and limitations

- Designed for Zen Browser with Sine.
- Browser navigation APIs are feature-detected; unavailable methods fail safely where possible.
- Other Firefox-based browsers may work, but are not runtime-verified.
- Sites with custom pagination that has no accessible label, recognizable metadata, or pagination container may not be detectable.
- Infinite-scroll feeds are not treated as numbered pagination unless an explicit pagination container or site-specific selector is present.
