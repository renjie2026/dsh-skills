---
name: dsh-theme-skin-author
description: >
  Author a theme skin for the DeepSeek Harness desktop app in the style of the
  "RJ" skins (山青婷彩 / 梦海游鱼) — a brand palette ported from an existing web
  system into a dsh theme plugin.

  Covers the skin JSON format, the token contract, the sidebar scenery ported from
  the source admin system, the active-workspace marker colour, the two-region colour
  rule (pale content area, themed chrome), the register-vs-overrideTokens data-model
  split that silently paints nothing when confused, and the reading-state easing.

  Use when the user wants to create, port, tune, or debug a dsh theme or skin;
  when a skin registers and selects but shows no colour; when a ported palette
  "just looks white"; or when they ask to build a theme like 山青婷彩 / 梦海游鱼.
origin: dsh-theme-gallery
version: 0.1.0
---

# Authoring an RJ-style dsh theme skin

A dsh theme is **data, not UI code**. A theme plugin contributes a list of token
maps to the official theme service; the service and its presenter do all the
painting. That means the hard part is never the code — it is the **data model** and
the **colour assignment**.

This skill encodes both, plus the two faults that make a skin register, select,
report a correct id and token count, and still paint absolutely nothing.

## When to Activate

- Porting a palette from an existing web system into a dsh theme
- Creating a new skin alongside 山青婷彩 / 梦海游鱼
- A skin is selected and "applied" but the UI shows no theme
- **A skin's colours appear and then vanish; clicking it once does not bring them back**
  (§4.3 — the service's `adopt()` reverts the preference; the fix is a token layer)
- **The artwork appears but the colours never do** (§12 — the presenter subscribes after mount)
- A ported palette reads as plain white
- Tuning token values or the reading-state easing
- A skin seems fine but the app's memory climbs or the UI repaints constantly — sample the
  process, not just the window (a skin can look perfect while spinning the renderer)

---

## 1. Where a skin lives

```
dsh-theme-gallery/
├── lib/themes/shan-qing-ting-cai.json   ← one file per skin
├── lib/themes/meng-hai-you-yu.json
├── schema/theme.schema.json             ← the contract, incl. x-required-tokens
├── scripts/embed-themes.mjs             ← validates then inlines into lib/client.js
└── tools/theme-bench/index.html         ← live tuning bench
```

Skins are **inlined into the browser bundle** by `embed-themes.mjs`. That is not an
optimisation: settings scopes return the *user document section*, and a built-in
skin is a fallback beneath it, so a clean install resolves to **no section at all**.
The host half cannot read the JSON, so the browser half must carry it. After adding
a skin, always re-run the embed step.

## 2. Skin JSON shape

```jsonc
[
  {
    "id": "shan-qing-ting-cai",          // stable; becomes the theme id users select
    "label": "山青婷彩",                  // card title
    "description": "青山叠翠，起舞生姿 —— 复刻自电商新零售系统管理后台同合同主题",
    "colorScheme": "light",              // "light" | "dark" — picks the base palette
    "tokens": {
      "--dsw-alias-brand-primary": { "light": "#2F7D5E", "dark": "#2F7D5E" },
      "--dsw-specific-sidebar-fill": {
        "light": "linear-gradient(to bottom,#EAF7F0 0%,#DCEFE5 34%,#CFE7DA 68%,#90C0A8 100%)",
        "dark":  "linear-gradient(to bottom,#EAF7F0 0%,#DCEFE5 34%,#CFE7DA 68%,#90C0A8 100%)"
      }
      // … 65 more
    },
    "reading": { "colorScheme": "light", "bg": "#FFFFFF", "alpha": 0.62, "blur": 3, "maxWidth": 640 },
    "accent": "#E88BB0",                          // the active workspace / conversation marker
    "ambient": { "kind": "shan", "petals": 6 }    // sidebar scenery
  }
]
```

**The `{ light, dark }` pair is the AUTHORING format.** Converting it to what the
service consumes is the plugin's job — and getting that conversion wrong is failure
mode §4.1.

### `accent` and `ambient` are where a skin's identity actually lives

| Field | What it does | Omit it and |
|---|---|---|
| `accent` | 6-digit hex. The marker colour for the states that answer *which workspace / which conversation is active* | the theme keeps the base palette's selection colour |
| `ambient` | `{ kind, petals? , bubbles? }`. Scenery drawn inside the sidebar column | nothing is drawn |

Both are optional, but a ported skin without them is only a recolour. Every source
palette this skill ports carries both — that is the difference between a skin that is
recognisable and one that is merely tinted.

### Why both palettes are identical in an RJ skin

A ported brand palette has one look. The skin is declared `colorScheme: "light"`, so
whichever desktop theme the user runs, the same values apply and the brand survives.
Do **not** hand-author a darker variant "for dark mode" — that is a different skin.

### The contract the validator enforces

| Rule | Detail |
|---|---|
| `id` | non-empty, unique across providers, **not** `system` (reserved for the preference) |
| `label`, `description` | non-empty strings |
| `colorScheme` | `light` or `dark` |
| tokens | every token must carry **both** `light` and `dark` |
| `accent` | if present, `#rrggbb` exactly — it is composed with an alpha suffix |
| `ambient.kind` | if present, one of the kinds the plugin ships artwork for |
| **12 required tokens** | see §3 — missing one fails registration |
| recommended tokens | ~55 more alias tokens; absence degrades gracefully |

`--dsw-static-*` are fixed primitives: **reference them with `var()` rather than
hard-coding their hex values.**

## 3. The token contract

### Required (12)

```
--dsw-alias-bg-base            --dsw-alias-label-primary        --dsw-alias-border-l2
--dsw-alias-bg-layer-1         --dsw-alias-label-secondary      --dsw-alias-border-l3
--dsw-alias-brand-primary      --dsw-alias-label-tertiary       --dsw-alias-state-error-primary
--dsw-alias-label-primary-foreground                           --dsw-alias-state-success-primary
--dsw-alias-state-warn-primary
```

### The families worth thinking about

| Family | Examples | Role |
|---|---|---|
| Ground | `bg-base`, `bg-layer-1..3`, `bg-overlay`, `bg-skeleton` | page, cards, popovers |
| **Chrome** | `--dsw-specific-sidebar-fill` | **sidebar + Windows titlebar — the brand lives here** |
| Text | `label-primary`, `-secondary`, `-tertiary`, `-caption`, `-dimmed` | 4–5 steps of contrast |
| Brand | `brand-primary`, `brand-text`, `button-primary-fill/-hover` | actions |
| Accent | `state-business-primary/-tertiary` | the secondary brand hue |
| Status | `state-{error,success,warn}-primary/-secondary/-tertiary` | keep semantically sane |
| Interaction | `interactive-bg-hover/-active/-hover-solid` | derive from the brand with alpha |
| Surfaces | `markdown-*`, `scrollbar-*`, `tooltip-bg`, `toast-bg` | derive, do not invent |

**Derive translucent values from the brand hex** rather than guessing greys:
`#2F7D5E14` (hover), `#2F7D5E0F` (hairline border), `#2F7D5E29` (scrollbar).

## 4. The three failures that make a skin paint nothing

### 4.1 Pair-shaped tokens handed to `register`

```js
register(def)      { this.themes = [...this.themes, def] }         // stored BY REFERENCE
composeActive(act) { if (this.overrides.size === 0) return act }   // passed through untouched
```

`ThemeDefinition.tokens` is `Record<string, string>`. The `{ light, dark }` **pair
format belongs to `overrideTokens` layers only.** Feeding pairs to `register` writes
the literal string `[object Object]` into every CSS variable.

What makes this failure so expensive: **every other signal looks correct.** The skin
is in the picker, selecting it sets the preference, `active.id` is your id,
`active.tokens` has 67 entries — and the UI simply keeps the built-in palette.

**Fix — flatten at the registration boundary, to the theme's own `colorScheme`:**

```js
function flatten(definition) {
  const tokens = {}
  for (const [name, value] of Object.entries(definition.tokens ?? {})) {
    tokens[name] = typeof value === 'string' ? value : value[definition.colorScheme]
  }
  return { ...definition, tokens }
}
ctx.theme.register(flatten(definition))
```

**Guard it with a test**: assert every token on every registered theme is a
`typeof === 'string'`. That single assertion catches the whole class.

### 4.2 The plugin paints over its own skin

A plugin stylesheet rule covering a themed region wins over the theme. A real
example, from an injected reading-state rule:

```css
/* WRONG — makes the themed column transparent, so the app's default ground shows
   through and the selected skin appears to do nothing at all */
.centerCol { background: var(--dsh-reading-bg, transparent); }
```

**Rule:** a plugin must never paint a region that carries a theme. Express any
adjustment as a token layer and let the theme own the paint.

### 4.3 The skin's colours appear, then VANISH — and one click is not enough

**Symptom, exactly as reported by a user:** on startup the theme colours show for a moment,
then disappear and leave the built-in palette. Clicking the skin **once** does not bring
them back; only switching to another skin and back does.

**Cause.** `setTheme(id)` writes the service's **in-memory** `preference` — and that is all
it does. The service *also* adopts the **persisted** preference whenever the settings
document changes:

```js
adopt() {
  const section = this.host.getSnapshot().value
  if (this.preference === section.preference && this.fontSize === section.fontSize) return
  this.preference = section.preference     // ← overwrites the skin you just set
  this.publish()                           // ← and republishes the built-in palette
}

ctx.effect(() => host.subscribe(() => { this.adopt() }),
  'ui-theme: settings scope adoption')
```

**The persisted preference can only ever be a built-in id** (`light` / `dark` / `system`)
— the service stores no others, and it must not (see the warning below). So that adoption
**always reverts an active skin.**

That single mechanism explains both halves of the symptom: the colours appear (your
`setTheme` landed), then vanish (adoption overwrote it), and a single click is not enough
because one change can be followed immediately by an adoption — only **two** changes
produce a repaint late enough to survive.

**Fix — do not rely on keeping the service's active id pointed at your skin. Stack the
palette as an OVERRIDE LAYER, which `adopt()` never touches.**

```js
// overrideTokens keeps layers in their own map, keyed by source:
overrideTokens(source, tokens) { this.overrides.set(source, layer); this.publish() }
// and buildSnapshot composes them OVER whatever theme is active:
composeActive(active) { /* overrides applied on top of `active` */ }
```

`adopt()` only moves `preference`. It never reads or writes `this.overrides`. So a layer
survives the revert and the colours stay.

```js
function stackSkinTokens(id) {
  if (id === stackedSkin) return                  // ← re-entrancy guard, see below
  const definition = bundledTheme(id)
  const tokens = {}
  for (const [name, value] of Object.entries(flatten(definition).tokens)) {
    // Layer format IS the pair — the opposite of `register` (see §4.1).
    // Both arms carry the same value: these palettes are single-scheme by design, and
    // an absent arm renders as the literal `undefined` inside the variable.
    tokens[name] = { light: value, dark: value }
  }
  stackedSkinDispose = ctx.theme.overrideTokens('my-plugin: palette', tokens)
  stackedSkin = id
}
```

**Four details that are each load-bearing:**

1. **The layer must follow the REMEMBERED skin, not `snapshot.active`.** `active` is exactly
   what `adopt()` reverts, so following it would tear the layer down moments after it
   appears — reproducing the original symptom.

2. **Re-entrancy guard.** `overrideTokens` **emits `theme/change` itself**, and you almost
   certainly subscribe to that event. Registering unconditionally drives `publish` from
   inside `publish` — **a synchronous spin** that took this project's renderer to 11 GB and
   2.7 cores, with no exception and no crash log. Guard by remembering which layer is
   stacked, and additionally mark your own emissions (see the plugin-author skill, §3.12).

3. **Never put a skin id in `ui-theme.preference`.** The persisted value is read at boot and
   `buildSnapshot()` **throws** `theme registry lost` when `preference` names a theme that is
   not registered yet — so the app refuses to start, and the only way out is the profile's
   composition layer. **Store the skin id in `localStorage`** under your own key.

4. **Hand the disposer to the plugin's fiber** (`ctx.effect(() => stackedSkinDispose, …)`)
   so the layer is withdrawn when the plugin unloads, not only when you re-stack.

**Verification:** assert that the layer is still present **after** you simulate an adoption.
That assertion, not "does the colour show up", is the one that catches this class.


## 5. The colour-assignment rule (RJ skins)

This is the design lesson that took the longest to learn, and it is what makes an RJ
skin recognisable instead of merely tinted.

**DSH paints the ENTIRE main column with `--dsw-alias-bg-base`.** Setting it to a
saturated colour produces one flat wash that covers the whole screen — the skin
reads as "the app changed colour" and none of its character survives.

The source systems these skins are ported from put the brand on the **left menu and
the top bar**, and leave the wide working area **white**.

So, for every RJ skin:

| Region | Token | Value |
|---|---|---|
| Main work area | `--dsw-alias-bg-base` | **very pale**, optionally a very gentle vertical gradient |
| Layer 1 (slight raise) | `--dsw-alias-bg-layer-1` | near-white, faintly tinted |
| Layers 2–3, cards, buttons | `--dsw-alias-bg-layer-2/-3`, `button-elevated-fill` | `#FFFFFF` — cards stay white |
| Overlay | `--dsw-alias-bg-overlay` | tinted, one step below `bg-base` |
| **Sidebar + Windows titlebar** | **`--dsw-specific-sidebar-fill`** | **the brand gradient — the skin's character** |

`--dsw-specific-sidebar-fill` is genuinely load-bearing in the desktop app: it paints
`.sidebarCol`, and under `[data-windows-titlebar]` it also paints `.frame` and the
titlebar's `:before`. Verified present in the shipped app.

Two properties that keep a pale work area from looking washed out:

- a **gradient** on `bg-base` (even a 3-stop, 4 % spread) reads as considered where a
  flat fill reads as an accident;
- **white cards** on the pale ground create the depth the flat fill destroys.

## 6. Sidebar scenery (`ambient`)

A ported admin system puts artwork behind its left menu, and that artwork is most of
what makes the skin recognisable. `ambient` carries the *request*; the plugin carries
the artwork:

```jsonc
"ambient": { "kind": "shan", "petals": 6 }   // 山青婷彩: mountains, mist, water, ripples, dragonflies, petals
"ambient": { "kind": "dream", "bubbles": 9 } // 梦海游鱼: corner glow, light washes, bubbles, seaweed
```

`kind` is a **data key, not an asset path** — only scenes the plugin actually draws
are addressable, so a typo fails at build time instead of silently rendering nothing.
The numeric field is just a seed count; each element derives its own size, duration
and phase from a deterministic formula, so a count is the only knob needed.

Four rules the ported scenes follow, each learned the hard way:

1. **Size in percentages and `em`, never pixels.** The source system hard-codes its
   sidebar at 223 px, but a dsh sidebar is draggable. A fixed-pixel port truncates or
   floats at any other width.
2. **`pointer-events:none`, positioned behind the navigation.** A ported scene must
   never intercept a click or cover a menu item — the source project has a recorded
   bug where opaque mountains hid its bottom menu rows.
3. **The scenery belongs to the skin, not the app.** Switching to a theme without
   `ambient` must *remove* the scene, not leave the last one behind.
4. **Decoration must not be able to break the plugin.** Locate the sidebar with
   fallbacks (the shell's class names are CSS-module hashes and not a contract), and
   wrap the whole thing so a failure logs and continues.

Preview it before installing: build the plugin's own preview page (which reads the
stylesheet straight out of the bundle, so it cannot drift) and look at the scene at
**two sidebar widths**. Automated checks can confirm the data is well-formed; only
your eyes can confirm the artwork reads correctly.

## 7. The active marker (`accent`)

The states that answer *which workspace / which conversation am I in* read from
`--dsw-alias-button-ghost-active-fill` / `-border` / `-hover` in this shell. An
`accent` is stacked over exactly those three by `overrideTokens`, so the sidebar
entry and the selected conversation row become the marker colour together.

> **Scope limit, learned the hard way.** Those three tokens colour the marker's *fill and
> border*. They do **not** reach the row's **text**, which shares
> `--dsw-alias-label-primary` with all body text. Tinting that would tint the whole
> interface, and a token layer cannot separate two elements that share a variable.
> Reaching for a stylesheet instead has been tried and reverted — **read §13 before
> attempting it.** Do not assume the accent layer is working because the active folder icon
> is the accent colour: the skin's own `--dsw-alias-state-business-primary` paints that icon,
> and it has nothing to do with the layer.

The source project's design rules are explicit, and they are worth following rather
than inventing around:

> 强调色：激活态（顶部菜单激活、侧边栏激活、徽标），通常取第一区域的特征色
> （暖色系主题用金/琥珀，冷色系主题用主题主色亮化）
>
> **禁止**引入第一区域中不存在的色相

So an accent is **the skin's own characteristic colour**, not a favourite colour:

| Skin | Accent | Where it comes from |
|---|---|---|
| 山青婷彩 | `#E88BB0` | the dragonfly pink of its first region |
| 梦海游鱼 | `#FFD166` | the sunset gold of its first region |

Two constraints matter more than the values:

- **Only the active theme may contribute.** An `overrideTokens` layer composes over
  *whatever* theme is active, so reading a fixed accent would paint 山青婷彩's pink
  onto 梦海游鱼 and onto the built-in themes too. Withdraw the layer the moment the
  active theme is not yours.
- **Leave `brand-primary` alone.** Repointing it at a warm accent also repoints
  links, primary buttons and status chips — far more than the marker.

Alpha is composed onto the accent (`#E88BB0` + `29` → a 16 % fill), because a token
needs one colour value where the source stored `rgba(...,0.15)`.

## 8. Worked example — 山青婷彩

Palette: `#2F7D5E` 青山绿 (brand), `#E88BB0` 蜻蜓粉 (accent). Both palettes identical,
`colorScheme: "light"`.

```jsonc
{
  "id": "shan-qing-ting-cai",
  "label": "山青婷彩",
  "colorScheme": "light",
  "tokens": {
    // ── ground: pale, gently graded; the brand is NOT here
    "--dsw-alias-bg-base":        { "light": "linear-gradient(to bottom,#F7FCF9 0%,#EDF7F1 55%,#E4F2EA 100%)", "dark": "…same…" },
    "--dsw-alias-bg-layer-1":     { "light": "#FBFEFC", "dark": "#FBFEFC" },
    "--dsw-alias-bg-layer-2":     { "light": "#FFFFFF", "dark": "#FFFFFF" },
    "--dsw-alias-bg-layer-3":     { "light": "#FFFFFF", "dark": "#FFFFFF" },
    "--dsw-alias-bg-overlay":     { "light": "#E3F1E8", "dark": "#E3F1E8" },
    "--dsw-alias-bg-skeleton":    { "light": "#2F7D5E14", "dark": "#2F7D5E14" },

    // ── chrome: the skin's character
    "--dsw-specific-sidebar-fill": {
      "light": "linear-gradient(to bottom,#EAF7F0 0%,#DCEFE5 34%,#CFE7DA 68%,#90C0A8 100%)",
      "dark":  "linear-gradient(to bottom,#EAF7F0 0%,#DCEFE5 34%,#CFE7DA 68%,#90C0A8 100%)"
    },

    // ── text: four steps, all reading on the pale ground
    "--dsw-alias-label-primary":  { "light": "#1F4638", "dark": "#1F4638" },
    "--dsw-alias-label-secondary":{ "light": "#3C6B57", "dark": "#3C6B57" },
    "--dsw-alias-label-tertiary": { "light": "#5C8474", "dark": "#5C8474" },
    "--dsw-alias-label-caption":  { "light": "#5C8474", "dark": "#5C8474" },
    "--dsw-alias-label-dimmed":   { "light": "#8AA79B", "dark": "#8AA79B" },

    // ── brand and its derived states
    "--dsw-alias-brand-primary":  { "light": "#2F7D5E", "dark": "#2F7D5E" },
    "--dsw-alias-brand-text":     { "light": "#2F7D5E", "dark": "#2F7D5E" },
    "--dsw-alias-link":           { "light": "#D97BA4", "dark": "#D97BA4" },
    "--dsw-alias-state-business-primary": { "light": "#E88BB0", "dark": "#E88BB0" },

    // ── interaction: brand hue with alpha, never a grey
    "--dsw-alias-interactive-bg-hover":        { "light": "#3E9B7A14", "dark": "#3E9B7A14" },
    "--dsw-alias-interactive-bg-active":       { "light": "#E88BB02E", "dark": "#E88BB02E" },
    "--dsw-alias-interactive-bg-hover-solid":  { "light": "#E4F3EA", "dark": "#E4F3EA" },

    // ── borders: brand-tinted with alpha, so they sit on any layer
    "--dsw-alias-border-l2":      { "light": "#2F7D5E21", "dark": "#2F7D5E21" },
    "--dsw-alias-border-l3":      { "light": "#2F7D5E2E", "dark": "#2F7D5E2E" }

    // … full skin carries 67 tokens; see lib/themes/shan-qing-ting-cai.json
  },
  "reading": { "colorScheme": "light", "bg": "#FFFFFF", "alpha": 0.62, "blur": 3, "maxWidth": 640 },
  "accent": "#E88BB0",
  "ambient": { "kind": "shan", "petals": 6 }
}
```

## 9. Method — turning a brief into a token map

Ten steps, in order. Steps 1–2 decide whether the skin reads at all; the rest is
craft.

1. **Pick the base scheme first.** An RJ / light brand port is `light`; a
   developer/terminal mood is `dark`.
2. **Set the two anchors**: `bg-base` and `label-primary`. Keep them **far apart in
   luminance** — this single relationship decides whether the theme reads at all.
3. **Build the surface ladder** from `bg-base`: `bg-layer-1` slightly toward the
   text colour, then `-2`, `-3`, then `bg-overlay` furthest. Keep the steps small —
   2–6 % luminance. (For an RJ skin, steps 2–3 land on `#FFFFFF`.)
4. **Borders are usually alpha, not solid**: `#…0a`…`#…33`. The shipped palettes do
   exactly this. Tint the alpha with the brand hue for an RJ skin
   (`#2F7D5E0F`), not with black.
5. **Design the sidebar gradient** from the same hue family, light stop first — this
   is the skin's signature, see §5.
6. **Pick ONE accent** and use it for `brand-primary`, `link`, and
   `button-primary-fill`. One accent looks designed; three look accidental.
7. **Check contrast**: `label-primary` over `bg-base` ≥ **7:1** for body text;
   `label-secondary` over `bg-layer-1` ≥ **4.5:1**.
8. **Fill the derived states** from the `--dsw-static-{red,green,amber}-*` families,
   keeping them semantically sane.
9. **Set `reading`** per §7 above.
10. **Re-run `embed-themes.mjs`**, then judge the result in the bench before
    writing anything down as done.

Use literal hex only for the two or three colours that *are* the skin's identity;
reference `var(--dsw-static-*)` for everything that merely has to be consistent.

## 10. The reading state (阅读态)

Two states, and the skin participates in both:

| State | Look |
|---|---|
| **Empty conversation** | the full skin — sidebar gradient, titlebar gradient, graded work area |
| **Messages present** | the transcript area eases toward a lighter ground so long text stays comfortable; **the sidebar and titlebar keep the gradient** so the skin stays recognisable |

Implement the easing as an **`overrideTokens` layer**, never as a stylesheet rule:

```js
ctx.theme.overrideTokens('my-plugin: reading', {
  '--dsw-alias-bg-base': { light: lightened, dark: darkLightened },
})
```

`overrideTokens(source, tokens)` composes a `{ light, dark }`-shaped layer over the
**active** theme, so the easing follows whichever skin *and* palette is in play, and
the source string is the layer's identity — calling again with the same source
replaces it, which is what makes toggling idempotent. Retract it by calling the
returned disposer.

Detecting the state: the shell exposes no contract for "the transcript has messages",
so read the DOM and **degrade safely**. Mark it clearly as an undocumented
dependency, isolate it in one function, and fall back to the idle look when it stops
matching. Never let it throw.

## 11. Verification

### Automated

| Step | What it catches |
|---|---|
| `embed-themes.mjs` | shape, unique ids, **both palettes present**, all 12 required tokens, schema drift — then inlines |
| schema tests | positive case plus ~10 negative cases (`schemastery` object fields are **optional by default**, so an un-`.required()` field silently accepts garbage) |
| **string-token assertion** | the §4.1 class: every token on every registered theme is a string |
| `tsc` against the host's type packages | registration contract drift |

### Visual

`tools/theme-bench/index.html` renders a mock of the shell with both states and live
sliders for alpha / blur / max-width, scoring each combination on two axes:
*does the skin still read as itself* and *is the text still plain*. Run it before
touching the JSON, so tuning is judged by eye rather than by reasoning.

**A caveat worth remembering:** a bench that paints the work area with the brand
colour will make an incorrect assignment look intentional. Keep the bench's region
assignment identical to the real shell's, or it will validate the wrong design.

### Manual acceptance

1. skin appears in the picker with the right label, description and swatch strip
2. selecting it changes preference and shows "已应用"
3. the **sidebar and titlebar carry the gradient** — the skin is recognisable
4. the main column is pale, **cards are white**, text is comfortable
5. with messages present, the transcript eases but chrome keeps the gradient
6. switching between two skins changes both chrome and accent, not just the ground

## 12. Diagnosing "the skin does nothing"

Read the service's belief against the live document — this contrast is what splits
the failure modes, and it resolved a month of guessing in one reading:

```js
// service belief
const active = ctx.theme.getTheme().active          // { id, tokens }
// live effect
getComputedStyle(document.body).getPropertyValue('--dsw-alias-brand-primary')
getComputedStyle(document.body).backgroundColor
```

| Reading | Cause |
|---|---|
| `active.id` is a built-in (`light` / `dark` / `system`) | the selection never took — or §4.3's adoption reverted it |
| `active.tokens = 0` | registration lost the tokens |
| token value is `[object Object]` | §4.1 — pairs handed to `register` |
| service shows the token, DOM shows `(unset)` | the presenter never applied it |
| both agree, but the screen is white | §4.2 — a stylesheet is covering it |
| both agree and the DOM has the colour | §5 — the assignment, not the mechanism |
| colours show, then **vanish**; active id reverts | §4.3 — `adopt()` overwrote the preference; stack a layer |
| colours only appear after clicking the skin **twice** | §4.3 — one change is not late enough to survive |
| colours never appear at all, artwork does | the restore ran before the presenter subscribed — see below |

**"Artwork appears, colours do not" is a distinct and very confusing case.** The scenery a
plugin draws itself needs no presenter; the palette does. The layout package's presenter
does this on mount:

```js
const presenter = new ThemePresenter()
presenter.apply(ctx.theme.getTheme())      // paints whatever is active NOW
const off = ctx.on('theme/change', …)      // and only THEN starts listening
```

So a change made before that subscription is **observed by nobody** — while the service still
records the skin as active, which makes a later `setTheme` of the same id a no-op that emits
nothing. Two consequences for your plugin:

- restore the skin **after** the shell is ready, not during mount;
- **confirm by reading the tokens back off the document** (`body.style.getPropertyValue`),
  and retry while the confirmation is missing — do not assume the change was seen.

Gate the probe behind a switch (`location.hash`), so it stays available without
occupying the surface.

## 13. Do NOT reach the UI with framework CSS class names

**This was attempted and failed twice. Read this before trying it again.**

The request was reasonable: colour the text of the *active* workspace row and the *current*
conversation row with the skin's accent. The reasoning that led to a stylesheet was sound —
both rows use `--dsw-alias-label-primary`, the token for essentially all body text, so a token
change would tint the whole interface; and layers are keyed by variable name, so two elements
sharing a variable cannot be tinted separately. `overrideTokens` and `register` are both
structurally unable to express it.

The implementation was:

```js
const css = '.YDXeBa_projectRow:has(.YDXeBa_folderActive),'
  + '.YDXeBa_sessionRow.YDXeBa_selected { color: var(--dsh-accent-text) !important }'
```

**The class names came from the wrong build.** They were read out of
`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-workspace`, where the CSS module
exports them as a map:

```js
var Rows_module_css_default = { "folderActive": "YDXeBa_folderActive", … }
```

That map is real, and those names are real **in that build**. But the running app loads its own
bundle from `app.asar`, and the two builds hash the module differently — so the selector matched
**zero elements**. Measured on the live page, via the panel's own reading:

```
激活行[色=#E88BB0 表=在 命中=0/0]
        ↑ set         ↑ mounted  ↑ matched nothing
```

### The rule

> **`app.asar` is the authority for anything you match against the DOM.**
> `profiles/node_modules` is a different build and its hashed class names are not a contract.

Class names like `YDXeBa_*` are **build artifacts**. They change between releases, and their
failure mode is **silent** — the selector simply matches nothing, with no error and no warning.
That makes any such rule a maintenance liability for a workspace whose whole value is stability.

### If you must style framework-owned DOM

1. **Verify the selectors against the running page**, not against `node_modules`. Print
   `document.querySelectorAll(yourSelector).length` on the real app — if it is 0, the names are
   from the wrong build.
2. **Address structure, not hashes.** Match on stable, semantic hooks instead:
   `[role="treeitem"][aria-selected="true"]` and `[role="treeitem"]` are attributes the framework
   sets deliberately, and they survive a rebuild. The measured example above has an
   `aria-selected="true"` on the selected conversation row, and `role="treeitem"` on both rows —
   those are far better anchors than `YDXeBa_*`.
3. **Print a hit count on your own surface, unconditionally.** This is what turned a two-round
   guessing exercise into a single reading. Without it, "the rule is malformed", "the sheet did
   not mount" and "the selectors matched nothing" are **visually identical**.
4. **Prefer not to.** If a token cannot express the intent, that is often a signal the intent is
   outside the theme's contract. Staying inside tokens keeps a skin forward-compatible across app
   upgrades; reaching into the DOM trades that away for one visual detail.

### Two failure modes from that attempt, worth remembering on their own

**A malformed CSS string assembled in JS fails completely and silently.** The first version built
an array and joined it with `','`, declaration block included:

```js
['.a', '.a .b', '{color:var(--x)!important}'].join(',')
//  → ".a,.a .b,{color:var(--x)!important}"   ← trailing comma: the WHOLE rule is discarded
```

The `<style>` was in the document and the custom property was set, so every observable part
reported success. **Assert the assembled STRING** (no `,{`, balanced braces), because nothing
else in the stack — types, stubs, or the browser console — reports it.

**A diagnostic that only prints when things are healthy is useless.** The first version of the
hit-count reading was appended to just one of four return paths, so in the failing case it would
not have appeared at all. Append diagnostics to **every** path.

## 14. Open work — the skins are still being optimised
Recorded here so the next round has a starting point. **This skill is expected to be
upgraded alongside them.** Dated notes say what has since been settled, so this stays
a live list rather than a wish list.

- **The chrome gradient is now the accepted carrier of the brand** (settled): §5.
  A stronger ramp is still worth trying, but the assignment itself is no longer open.
- **`accent` now carries the active marker** (settled): §7. Remaining question is
  whether the 16 % fill reads as clearly in the sidebar entry as in the conversation
  row, where the surrounding surface is paler.
- **`ambient` now carries the sidebar scenery** (settled): §6. Remaining questions:
  does the 山青婷彩 scene still read at the narrowest sidebar width, and does the
  梦海游鱼 corner glow stay subtle enough not to wash out the nav text?
- **Re-tune the easing.** `alpha: 0.62`, `blur: 3`, `maxWidth: 640` were chosen for
  readability on a *saturated* ground. The ground is now pale, so the ease may be
  doing less than it should — or too much.
- **Verify `description` and `label` copy** against the source systems' own wording.
- **Check status colours under the new ground.** `state-*-tertiary` tints were picked
  against a white page and now sit on a tinted one.
- **Decide whether `dark` should diverge.** Today both palettes are identical, which
  keeps the brand intact on a dark desktop but gives no dark adaptation at all.
- **Audit the remaining ~55 recommended tokens** for leftovers that were derived from
  the old saturated ground rather than the new pale one.
- **Consider the rest of the source theme set.** The source project defines **seven** skins in
  `admin-modular/src/utils/themes.js` — the two ported here, plus
  **营慕彩云 / 江畔冬云 / 徐山军月 / 佩安杰心 / 光彩凤晨** (5 remaining). Each carries an animation
  component with artwork this plugin has no `ambient.kind` for yet: today only `shan`
  (山青婷彩) and `dream` (梦海游鱼) exist, so porting the rest means **adding kinds and their
  artwork**, not just palettes. Source of the artwork: one `*Animation.vue` per theme under
  `admin-modular/src/components/`.

## 15. Checklist for a new RJ skin

**The palette**

- [ ] unique id, not `system`; `label` and `description` non-empty
- [ ] exactly one `colorScheme`; both palette slots filled
- [ ] all 12 required tokens present
- [ ] `bg-base` pale, with at most a gentle gradient
- [ ] `sidebar-fill` carries the **gradient** — the brand
- [ ] layers 2–3 are `#FFFFFF`
- [ ] interaction and border values derived from the brand with alpha
- [ ] status colours still semantically correct
- [ ] `reading` block present
- [ ] `accent` is the skin's OWN characteristic colour, not a borrowed hue

**Scenery**

- [ ] `ambient.kind` is one the plugin draws; its count field is tuned
- [ ] scenery checked at **two sidebar widths**, and it does not cover any nav item
- [ ] the scene is rendered into **exactly one** container (two copies = duplicated
      animated elements — the dragonflies were visibly doubled by this)

**Persistence — the part that fails silently**

- [ ] the skin id is stored in **`localStorage`**, never in `ui-theme.preference`
- [ ] the palette is stacked as an **`overrideTokens` layer**, not left to `setTheme` (§4.3)
- [ ] the layer follows the **remembered** skin, not `snapshot.active` (§4.3)
- [ ] stacking is guarded against its own `theme/change` emission (§4.3, and the
      plugin-author skill's §3.12 — an unguarded version spins the renderer)
- [ ] the layer disposer is handed to `ctx.effect` so unload withdraws it
- [ ] restore happens **after** the shell is ready, and is **confirmed** by reading the
      tokens back off the document
- [ ] asserted: the layer is **still present after a simulated `adopt()`**

**Build and judgement**

- [ ] the accent layer is withdrawn for other themes (verified by switching away)
- [ ] `embed-themes.mjs` re-run, bundle regenerated
- [ ] string-token assertion green
- [ ] judged in the bench with the real region assignment
- [ ] accepted manually against the six-point list in §11
- [ ] **verified at runtime with a renderer sampler**: CPU peak < 0.5 core, RSS not
      climbing — a skin that repaints in a loop looks perfect and eats the process

> **A visual check cannot detect §4.3's opposite**: a skin can look right on the screen
> while spinning the renderer, and it can look wrong while being perfectly healthy.
> Sample the process, do not only look at the window.
