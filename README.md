# Zen Page Skip

[![Tests](https://github.com/SakibShahariar/zen-page-skip/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/SakibShahariar/zen-page-skip/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Navigate paginated websites with keyboard shortcuts.**

Zen Page Skip is a Sine mod for Zen Browser. It provides shortcuts to move between pages or jump to a page number, using a site's pagination controls or recognized numbered URLs.

## Installation

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. Open **Settings → Sine Mods**.
3. Add `SakibShahariar/zen-page-skip` as a mod source.
4. Install **Zen Page Skip** and restart Zen if prompted. If Sine asks for unsafe-script permission, enable `sine.allow-unsafe-js` in `about:config` and restart Zen.

## Shortcuts

| Action | Default shortcut |
|---|---|
| Next page | `Alt + ]` |
| Previous page | `Alt + [` |
| Jump to page | `Alt + Shift + P` |
| Toggle current site | `Alt + Shift + D` |
| Toggle current tab pause | `Alt + Shift + X` |

Change or disable individual shortcuts in **Settings → Sine Mods → Zen Page Skip**. Site pause is saved per hostname; tab pause lasts until resumed or the tab is closed. Advanced shortcut syntax and configuration are covered in the [configuration guide](docs/CONFIGURATION.md).

## Features

- Finds pagination controls through page metadata, labels, and recognizable controls.
- Supports numbered URL patterns such as `?page=3`, `/page/3/`, and `#page=3`.
- Offers per-site selectors, labels, URL templates, and behavior rules.
- Handles updated single-page-app routes and browser-history navigation.
- Provides per-site and per-tab pause controls.
- Applies safety checks to avoid unrelated, disabled, or destructive controls.
- Provides optional local diagnostics and navigation feedback.
- Recognizes common pagination labels in multiple languages.

The mod avoids guessing when it cannot find a safe navigation target.

## Compatibility

Zen Browser with Sine is the intended host. Browser/Sine version support and live-site coverage are tracked in the [compatibility matrix](docs/COMPATIBILITY.md); no unverified version or website is presented as tested.


## Development

Requires Node.js. Edit the ordered source modules in `src/`, then regenerate the single Sine entry point:

```sh
node scripts/build.js
node scripts/build.js --check
node --check script.uc.js
node --test
```

`script.uc.js` is generated output; make implementation changes in `src/`. The numbered module filenames define concatenation order.

GitHub Actions runs these checks on pushes and pull requests to `main`, using Node.js 22.

## Documentation

See the [configuration guide](docs/CONFIGURATION.md) for settings, per-site rules, shortcut formats, diagnostics, and navigation behavior.

## License

[MIT](LICENSE)
