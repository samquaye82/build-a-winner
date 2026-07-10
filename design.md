# Design Reference: Sporting Director Game

Derived from liverpoolfc.com/team/mens (captured 10/07/2026). This document is the
visual contract for M4 (game UI) and M5 (end screen). Where the club site and the
game's needs diverge, the game-specific mapping in each section wins.

> **Licensing note:** LFC Sans, the liver bird, and the club crest are Liverpool FC
> property. The game must not embed them. Fonts below are free substitutes chosen
> for closeness of feel; no trademarked assets anywhere.

---

## 1. Palette

Taken directly from the site's design tokens (`--theme-ui-colors-*`).

| Token | Value | Site usage | Game usage |
|---|---|---|---|
| `--ink` | `#0C0C0C` | Body text, section pills | Body text, headings, kit numbers |
| `--surface` | `#FFFFFF` | Page background | Page background |
| `--surface-muted` | `#F6F6F6` | Player cards | Player cards, panels, dashboard tiles |
| `--red` | `#E31B23` | Masthead, active-tab underline, primary buttons | Masthead, primary buttons, active tab underline, spend figures |
| `--red-deep` | `#400000` | Dark red accents | Hover state on red, end-screen backdrop |
| `--ink-70` | `rgba(12,12,12,0.7)` | Secondary text (position labels) | Secondary text, metadata (age, HG status) |
| `--ink-17` | `rgba(12,12,12,0.17)` | Hairline dividers | Dividers, disabled borders |
| `--gold` | `#FFD700` | Accent | Squad rating badge, U21 tags |
| `--green` | `#009982` | Accent | Money in (sales, funds), valid-state ticks |
| `--white-88` | `rgba(255,255,255,0.88)` | Text on red | Text on red surfaces |
| `--white-40` | `rgba(255,255,255,0.4)` | Muted text on red | Muted text on red surfaces |

Semantic mapping for game states:

- **Funds in / valid**: `--green`. **Funds out**: `--ink` (never green/red confusion for spend).
- **Violations** (over budget, quota, SCR breach): `--red` text on an 8% red tint panel.
- **Locked players**: `--ink-70` with a padlock; card at 60% opacity, not clickable for sale.
- **SCR meter**: green below 70% of cap, gold 70–85%, red above 85% (the limit).
- **Squad rating**: gold badge, ink text, exactly like the original game's rating chip.

## 2. Typography

Site uses proprietary "LFC Sans" (headings 700 uppercase; body regular). Substitutes:

- **UI + body**: `Figtree` (Google Fonts), fallback `system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`. Matches LFC Sans' rounded, friendly geometry.
- **Kit numbers / big stats**: `Archivo Black` for the oversized shirt-number aesthetic on player cards and the end-screen rating.
- **Money and data columns**: Figtree with `font-variant-numeric: tabular-nums`.

Scale and treatment (from the site):

- Page title: 40px/700, uppercase.
- Section labels: **black pill** (`--ink` background, fully rounded), 14px/700 uppercase white text. Used for position groups: GOALKEEPERS, DEFENDERS, and in-game groups (CURRENT SQUAD, TRANSFER MARKET).
- Player name on card: 28px/400 (regular weight, large size, sentence case).
- Metadata labels (position, HG status): 12px/700 uppercase `--ink-70`.
- Micro-actions ("View Profile" → our "Sell" / "Renew" / "Undo"): 12px/700 uppercase, red underline on hover.

## 3. Components

### Masthead
Full-width `--red` bar, white wordmark ("SPORTING DIRECTOR" replaces the crest),
white nav items, thin white divider hairlines between nav groups. Window context
(e.g. "SUMMER 2026 · WINDOW 1 OF 3") lives here in `--white-88`.

### Tabs
Horizontal text tabs (Mens/Womens/Academy → Squad / Market / Renewals / XI),
`--ink` text, active tab gets a 3px `--red` underline; hairline `--ink-17` rule
under the whole row.

### Player card (signature component)
- `--surface-muted` background, **square corners, no border, no shadow**.
- White **diagonal notch clipped from the top-right corner** (`clip-path`), the
  site's most distinctive card detail; keep it.
- Oversized kit number top-left in Archivo Black `--ink` (we use quality rating
  or fee where numbers aren't relevant).
- Headshot top-right (we have no photos: use a neutral silhouette or initials
  roundel; never scrape real player imagery).
- Name large and regular-weight; metadata row beneath in 12px caps.
- Action row at the bottom (Sell / Renew / Buy), 12px/700 uppercase.
- Selected-for-sale state: 2px `--red` inset outline + red tick. Bought state:
  2px `--green` outline + tick.

### Buttons
Primary: solid `--red`, white 700 text, 4px radius, generous padding (site's
cookie CTAs). Hover: `--red-deep`. Secondary: white with 1px `--ink` border.
Disabled: `--ink-17` border, `--ink-70` text.

### Constraint dashboard
Row of `--surface-muted` tiles (square, like cards): Budget, Non-HG count,
Over-21 count, SCR meter, Squad size. Tile label 12px caps `--ink-70`, value
28px Archivo Black. Violating tiles flip to the red-tint treatment.

### Pitch (pick-your-XI)
Keep the original artifact's green pitch, but restyle furniture to this system:
formation chips as black pills (gold when active), empty slots as dashed
`--white-40` circles, filled slots as white roundels with ink initials + name
label. Rating chip in gold.

## 4. Layout

- Max content width ~1200px, centred, white background, generous vertical air.
- Position-grouped sections, each opened by a black pill label: the game lists
  groups vertically in a responsive grid (no carousels; the site's horizontal
  scrollers hide information a puzzle game needs visible).
- Mobile: single-column cards, dashboard tiles 2-up, masthead condenses.

## 5. Motion & feel

- Quiet and quick: 150–200ms ease-out on hovers, tab underline slide, tile
  value changes. No bounces, no parallax.
- Money changes tick via a brief colour pulse (`--green` in, `--ink` out).
- Window advance: full-screen `--red` wipe with the next window's name in
  white caps, ~600ms, once per window (it should feel like a chapter turn).

## 6. Accessibility

- `#E31B23` on white is ~4:1: acceptable for large/bold text and accents only;
  body copy stays `--ink`. White on `--red` passes for the masthead sizes used.
- Never encode meaning in colour alone: violations get icons + text, locked
  players get the padlock glyph, HG/U21 status is always written.
- All cards and slots are keyboard-focusable with a visible `--red` focus ring.

## 7. End screen (M5 direction)

Invert the scheme: `--red-deep` backdrop, white text, gold rating number in
Archivo Black at hero size, component-score bars in white/gold, share button in
solid `--red`. The one screen that goes dark and dramatic, built to screenshot.
