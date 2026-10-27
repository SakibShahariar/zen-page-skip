# Zen Page Skip

A Sine mod for [Zen Browser](https://zen-browser.app) that adds keyboard shortcuts to jump to the next or previous numbered page.

For example, on:

```text
https://example.com/search?q=zen&page=3
```

pressing **Next Page** opens:

```text
https://example.com/search?q=zen&page=4
```

## Shortcuts

| Action | Default shortcut |
|---|---|
| Next page | `Alt+]` |
| Previous page | `Alt+[` |

## Supported URL formats

- `?page=3`
- `?p=3`
- `/page/3/`
- `#page=3`

## Toast messages

The mod shows an in-browser toast when possible:

- `Jumped to page 4`
- `Already on page 1`
- `No numbered page found`

It first tries Zen’s native toast system. If that API is unavailable in your Zen version, it falls back to Firefox’s in-window notification bar.

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. Open **Settings → Sine Mods** in Zen.
3. Add this repository:

   ```text
   SakibShahariar/zen-page-skip
   ```

4. Install **Zen Page Skip**.
5. Restart Zen or clear its startup cache if the mod does not load immediately.

## Notes

- This mod changes only the page number in the current URL.
- It cannot know a website’s final page, so it will attempt the next URL even on the last page.
- If a site uses another pagination format, add a pattern to `PAGE_PATTERNS` in `script.js`.

## License

[MIT](LICENSE)
