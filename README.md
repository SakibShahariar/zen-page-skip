# Zen Page Skip

A Sine mod for [Zen Browser](https://zen-browser.app) that adds keyboard shortcuts to jump to the next or previous page.

## Shortcuts

| Action | Default shortcut | Preference |
|---|---|---|
| Next page | `Alt+]` | `zen-page-skip.next-shortcut` |
| Previous page | `Alt+[` | `zen-page-skip.previous-shortcut` |

Change these in **Settings → Sine Mods → Zen Page Skip**, or in `about:config`.

Supported shortcut formats include:

- `Alt+]`
- `Alt+[`
- `Ctrl+Alt+Right`
- `Ctrl+Alt+Left`
- `Alt+N`
- `Alt+P`

## How it works

Zen Page Skip first looks for the website’s own pagination control and clicks it. This works with many URL styles, including pages that do not put a page number in the URL.

It looks for:

- `rel="next"` and `rel="prev"` links
- `aria-label` or `title` values such as “Next page” and “Previous page”
- Visible text such as `Next`, `Previous`, `Prev`, `Older`, `Newer`
- Arrow controls such as `›`, `»`, `→`, `‹`, `«`, and `←`
- Controls inside pagination containers

If no pagination control is found, it falls back to changing a numbered URL:

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

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine) in Zen Browser.
2. Open **Settings → Sine Mods** in Zen.
3. Add this repository:

   ```text
   SakibShahariar/zen-page-skip
   ```

4. Install **Zen Page Skip**.
5. Restart Zen or clear its startup cache if needed.

## Notes

- The mod avoids inputs, text areas, selects, and content-editable fields.
- It does not treat every “More” link as pagination.
- It cannot detect pages that use custom pagination with no accessible label, recognizable text, or pagination container.

## License

[MIT](LICENSE)
