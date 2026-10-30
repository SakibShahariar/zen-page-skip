# Zen Page Skip

[![Tests](https://github.com/SakibShahariar/zen-page-skip/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/SakibShahariar/zen-page-skip/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Navigate paginated websites with keyboard shortcuts.**

Zen Page Skip is a Sine mod for Zen Browser. It provides shortcuts to move between pages or jump to a page number, using a site's pagination controls or recognized numbered URLs.

## Installation

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. Open **Settings → Sine Mods**.
3. Add `SakibShahariar/zen-page-skip` as a mod source.
4. Install **Zen Page Skip** and restart Zen if prompted.

## Shortcuts

| Action | Default shortcut |
|---|---|
| Next page | `Alt + ]` |
| Previous page | `Alt + [` |
| Jump to page | `Alt + Shift + P` |

Change shortcuts in **Settings → Sine Mods → Zen Page Skip**. Advanced shortcut syntax and configuration are covered in the [configuration guide](docs/CONFIGURATION.md).

## Features

- Finds pagination controls through page metadata, labels, and recognizable controls.
- Supports numbered URL patterns such as `?page=3`, `/page/3/`, and `#page=3`.
- Offers per-site selectors, labels, URL templates, and behavior rules.
- Handles updated single-page-app routes and browser-history navigation.
- Applies safety checks to avoid unrelated, disabled, or destructive controls.
- Provides optional local diagnostics and navigation feedback.
- Recognizes common pagination labels in multiple languages.

The mod avoids guessing when it cannot find a safe navigation target.

## Compatibility

- Designed for Zen Browser with Sine.
- Other Firefox-based browsers may work, but are not runtime-verified.
- Custom or inaccessible pagination controls may not be detectable.
- Infinite-scroll feeds are not treated as numbered pagination by default.

## Development

Requires Node.js. Run the checks with:

```sh
node --check script.js
node --test
```

GitHub Actions runs these checks on pushes and pull requests to `main`, using Node.js 22.

## Documentation

See the [configuration guide](docs/CONFIGURATION.md) for settings, per-site rules, shortcut formats, diagnostics, and navigation behavior.

## License

[MIT](LICENSE)
