# Zen Page Skip

A Sine mod for [Zen Browser](https://zen-browser.app) that adds keyboard shortcuts to jump to the next or previous numbered page.

For example, if you are on:

```text
https://example.com/search?q=zen&page=3
```

pressing **Next Page** takes you to:

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

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. In Zen, open **Settings → Sine Mods**.
3. Add this repository:

   ```text
   SakibShahariar/zen-page-skip
   ```

4. Install **Zen Page Skip**.
5. Reload Zen or clear its startup cache if needed.

## Notes

- The mod only changes the page number in the current URL.
- It does not detect the final page of a website.
- If a page has no recognizable page number, it shows a toast and does nothing.

## License

MIT
