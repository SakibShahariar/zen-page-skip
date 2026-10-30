# Zen Page Skip

A Sine mod for [Zen Browser](https://zen-browser.app) that adds keyboard shortcuts to jump to the next or previous page.

## Shortcuts

| Action | Default shortcut | Preference |
|---|---|---|
| Next page | `Alt+]` | `zen-page-skip.next-shortcut` |
| Previous page | `Alt+[` | `zen-page-skip.previous-shortcut` |
| Jump to page | `Alt+Shift+P` | `zen-page-skip.jump-to-page-shortcut` |

Change these in **Settings → Sine Mods → Zen Page Skip**, or in `about:config`. The jump-to-page command prompts for a positive page number and works with the built-in numbered URL patterns.

Shortcut preferences accept modifier combinations such as:

- `Alt+]` and `Alt+[`
- `Ctrl+Alt+Right` and `Ctrl+Alt+Left`
- `Cmd+Alt+Right` and `Cmd+Alt+Left`
- `Super+N`, `Meta+N`, `Alt+N`, and `Alt+P`

`Ctrl` and `Cmd`/`Meta`/`Super` are distinct modifiers. `Option` is an alias for `Alt`. Shortcut preferences are cached and refreshed when either shortcut setting changes.

Set `zen-page-skip.cooldown-ms` to control the minimum time between shortcut actions. It defaults to `400` milliseconds; values are clamped to `0–5000` milliseconds.

## Shortcut conflicts

The mod warns about malformed shortcuts, identical next/previous bindings, and common reserved browser combinations (for example `Ctrl+T`, `Ctrl+W`, and `Alt+Left`). Browser and operating-system bindings vary, so warnings are best-effort rather than a complete conflict detector.

Run `copy(window.zenPageSkipGetShortcutWarnings().join("\\n"))` in the browser console to copy the current warnings.

## How it works

Zen Page Skip first checks for a page-navigation hint in the document head (`<link rel="next">` or `<link rel="prev">`). It then looks for the website’s own pagination control and clicks it. This works with many URL styles, including pages that do not put a page number in the URL.

Visible controls are matched using pagination labels, directional metadata, and pagination containers. Form controls, submit buttons, menu controls, and ambiguous generic links are ignored.

If no usable pagination control is found, it falls back to changing a numbered URL:

- `?page=3` → `?page=4`
- `?p=3` → `?p=4`
- `/page/3/` → `/page/4/`
- `#page=3` → `#page=4`

If neither method works, it shows a toast such as **“No next page found”** or **“No previous page found”**.

## Toast messages

- `Going to next page`
- `Going to previous page`
- `No next page found`
- `No previous page found`
- `No active page`

The mod tries Zen’s native toast system first. If that API is unavailable, it uses Firefox’s in-window notification bar.

## Compatibility

Designed for Zen Browser with Sine. Navigation APIs are feature-detected at runtime; missing URI-navigation methods fail safely with a clear message instead of throwing. Other Firefox-based browsers are best-effort and are not claimed as runtime-verified.

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. Open **Settings → Sine Mods** in Zen.
3. Add this repository:

   ```text
   SakibShahariar/zen-page-skip
   ```

4. Install **Zen Page Skip**.
5. Restart Zen or clear its startup cache if needed.

## Development

Run the automated tests with Node.js:

```sh
node --check script.js
node --test
```

## Settings backup and restore

Export all supported settings from the browser console:

```js
copy(window.zenPageSkipExportSettings())
```

Import a previously exported JSON snapshot:

```js
window.zenPageSkipImportSettings(prompt("Paste Zen Page Skip settings JSON"))
```

Imports are versioned, validate known setting types, clamp numeric values, reject malformed shortcuts and site-rule JSON, and ignore unknown keys. Only settings present in the import are changed.

## Local diagnostics

Enable `zen-page-skip.debug-mode` to record candidate scores, rejection reasons, and navigation decisions in the browser console. Logs remain in memory and in the local console; no telemetry or network requests are made.

To copy the recent diagnostic buffer from the browser console, run:

```js
copy(window.zenPageSkipGetDiagnostics())
```

The buffer is limited to the latest 100 entries. Disable debug mode for quiet normal operation.

## Infinite-scroll pages

Pages marked with common feed or infinite-scroll indicators are not treated as numbered pagination unless an explicit pagination container or a site-specific selector is present. Override this per site with `"infiniteScroll": "allow"` or force the skip with `"infiniteScroll": "block"` in `zen-page-skip.site-rules`.

## Per-site rules

Set `zen-page-skip.site-rules` to a JSON object keyed by a hostname or wildcard subdomain. Example:

```json
{
  "example.com": {
    "nextSelector": "a.pagination-next",
    "previousSelector": "a.pagination-previous",
    "nextWords": ["Load more"],
    "previousWords": ["Newer results"],
    "confidenceThreshold": 85,
    "pageTemplate": "/archive/page/{page}",
    "infiniteScroll": "allow"
  },
  "*.forum.example": {
    "nextSelector": "button[aria-label='Next page']"
  }
}
```

Site selectors take priority over generic detection but still pass the safety and exclusion checks. Invalid JSON or selectors are ignored. Per-site thresholds are clamped to 50–150. A `pageTemplate` must contain exactly one `{page}` placeholder and resolve to the same origin as the current page.

## Language support

The built-in exact-label vocabulary includes common English, Spanish, French, German, Portuguese, Dutch, Polish, Russian, Arabic, Chinese, Japanese, and Korean pagination labels. Generic labels such as “back” and “continue” are intentionally not treated as pagination signals.

Add site-specific wording through `zen-page-skip.next-words` and `zen-page-skip.previous-words`. Values may be comma- or newline-separated and are matched case-insensitively.

## Pagination safety

- `zen-page-skip.confidence-threshold` controls the minimum candidate score (50–150; default 70).
- `zen-page-skip.excluded-selectors` accepts newline-separated CSS selectors for controls that must never be clicked.
- Form buttons, dialogs, menu controls, and common destructive actions are excluded by default. Pagination links inside forms remain eligible.

## Target preview

Enable `zen-page-skip.preview-before-navigation` to confirm the detected destination before navigation. The preview is off by default, and query strings and URL fragments are omitted from displayed destinations. If the confirmation API is unavailable, navigation is cancelled safely.

## Feedback toasts

- `zen-page-skip.toast-enabled` controls whether feedback messages are shown.
- `zen-page-skip.toast-duration-ms` controls the display duration (500–10000 ms; default 1800 ms).

The current Zen native toast API requires Fluent message IDs. Zen Page Skip uses the browser notification bar for its dynamic messages instead of passing unsupported raw text to that API.

## Site exclusions

Set `zen-page-skip.disabled-sites` in **Settings → Sine Mods → Zen Page Skip** or `about:config` to a comma- or newline-separated list of hostnames.

- `example.com` disables only that exact hostname.
- `*.example.com` disables its subdomains, but not the apex `example.com`.
- Invalid entries are ignored.

## Notes

- Shortcut auto-repeat and IME composition events are ignored.
- The mod avoids inputs, text areas, selects, and content-editable regions.
- It cannot detect custom pagination with no accessible label, recognizable metadata, or pagination container.

## License

[MIT](LICENSE)
