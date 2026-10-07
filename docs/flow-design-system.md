# Flow: Design system (Bedtime Midnight)

## What
One set of colors, sizes and small components, so every screen looks the same.

## Values (`mobile/src/theme.ts`)
| Name | Value |
|---|---|
| background | `#0f172a` (deep midnight) |
| surface (cards) | `#1e293b` (slate) |
| indigo (main accent) | `#6366f1` |
| amber (soft accent) | `#fbbf24` |
| text / muted text | `#f1f5f9` / `#94a3b8` |
| text on indigo / on amber | `#ffffff` / `#0f172a` |
| danger (errors, delete) | `#f87171` |
| card radius | 16 px |
| min touch size | 48 px |

`glow(color, strength)` gives a soft glowing shadow on iOS, Android and web.

## Components (`mobile/src/ui/`)
- `Logo`: moon, soundwave and glowing star, drawn with SVG in code (`react-native-svg`). Any size.
- `Header`: logo and title, a language button (shows the other language, one tap switches), plus a Settings button (signed in) or a Back button.
- `LanguageButton`: the one-tap English / עברית button in the `Header`. See [flow-i18n-rtl.md](flow-i18n-rtl.md).
- `Screen`: midnight background, safe area, scrolling, the header, max width 720 px on wide screens. `header={false}` hides the header, `back` shows Back.
- `Card`: slate card with 16 px corners and a soft glow.
- `Button`: variants `primary` (indigo, white text), `accent` (amber, dark text), `secondary` (outline), `danger` (red outline). At least 48 px tall.
- `RequireAuth`: guard for screens that need a user. See [flow-mobile-app.md](flow-mobile-app.md).
- `confirm(...)`: "are you sure?" box for phones and web.
- `LanguageSwitch`: see [flow-i18n-rtl.md](flow-i18n-rtl.md).

## Rules
- Never write a color code inside a screen. Use `colors.*` from `theme.ts`.
- Use `spacing.*`, `fonts.*` and `radius.*` for sizes.
- Only the dark theme exists now. The light theme (the `theme` setting) comes later.

## Test
By hand: `npm run web` in `mobile/`. Check the colors, the rounded cards, the glow, and that buttons are easy to tap.
