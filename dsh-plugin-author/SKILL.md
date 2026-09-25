---
name: dsh-plugin-author
description: >
  Develop a DeepSeek Harness (dsh) plugin that actually loads and activates in the
  Windows desktop app, and instrument it so any failure names its own root cause.

  Covers the full contract — the package.json declarations, the host half, the
  browser half, Cordis service injection, slot registration, store semantics — and
  eight failure modes that each cost a full reinstall-and-restart cycle to
  discover, with the exact error text each one produces.

  Use when the user wants to build, scaffold, debug, or publish a dsh plugin; when
  a plugin will not activate; when the app refuses to start after installing a
  plugin; when a plugin's UI renders empty; or when they ask how to add a panel,
  tool, sidebar entry, or settings row to the dsh desktop app.
origin: dsh-theme-gallery
---

# Authoring a dsh plugin that actually runs

DeepSeek Harness is plugin-composed: the UI, the agent loop, the tools and the
theme system are all plugins on the Cordis framework. A plugin is a package that
declares itself in `package.json` and exports an `apply(ctx)` on each half.

This skill exists because a working plugin and a plugin that *looks* right are
very different things. Eight distinct failure modes were hit while building one
real plugin, and **none of them were visible without a full reinstall-and-restart
cycle**. Each one is documented here with its symptom and its fix, so the next
author does not pay that cost.

## When to Activate

- Building or scaffolding a dsh plugin
- A plugin does not activate, or activates but renders nothing
- `web boot: 1 entry did not activate` after installing a plugin
- A panel, sidebar entry, settings row or tool needs adding to the dsh UI
- `cannot get property "X" without inject`, `Cannot access 'X' before initialization`
- **`X is not defined` in a plugin whose code looks correct** (§3.14 — scope reach)
- **The renderer's memory climbs and the UI sticks, with no exception and no crash log**
  (§3.12 — a plugin that writes an event it also subscribes to; this is the expensive one)
- **A retry / re-apply loop runs forever or the app repaints constantly** (§3.13, §3.15)
- Writing tests or audits for a plugin whose bundle cannot be imported under Node
- Preparing a plugin for GitHub / a skill store

---

## 1. Shape of a plugin

```
my-plugin/
├── package.json          # the three declarations that make it a plugin
├── cordis.patch.yml      # the config layer a profile applies when it selects you
├── lib/
│   ├── index.js          # host half  — Node side
│   └── client.js         # browser half — lazy-CJS bundle
└── schema/               # optional: any data your plugin validates
```

### `package.json` — the three declarations

Miss any one and the plugin silently does nothing.

```jsonc
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".":        { "default": "./lib/index.js"  },   // host half
    "./client": { "default": "./lib/client.js" },   // browser half
    "./package.json": "./package.json"
  },
  "dsh": {
    // ① what this package contributes: a config layer
    "bundle": { "patch": "./cordis.patch.yml" },
    // ② that it has a browser half
    "client": {
      "platform": "web",
      // ③ see §3: required for any plugin with service dependencies
      "immediately": true
    }
  },
  "files": ["lib", "cordis.patch.yml"]
}
```

- **`dsh.bundle.patch`** — without it, `dsh plugin add` installs the package as a
  plain dependency and prints a warning; no layer is activated.
- **`exports["./client"]`** — without it the browser half is never served.
- **`dsh.client.platform`** — must be `"web"`.
- **`dsh.client.inject`** — package *names* of other client plugins whose boot-graph
  rows must load first. Only names that themselves declare `dsh.client`. The theme
  plugin declares connection/locale/renderer/settings/api-remotes this way. A plugin
  whose dependencies are all in the platform seed table needs no `inject` here.
- **`dsh.client.immediately`** — see §3. Required the moment your `inject` is not empty.

### `cordis.patch.yml` — the layer

```yaml
- insert:
    - id: my-plugin
      name: my-plugin
```

The `id` is how users, other bundles, and the profile patch address your row. Keep
it stable. To depend on another plugin's *service* (rather than its package), name
the row you consume so ordering is explicit:

```yaml
- insert:
    - id: my-plugin
      name: my-plugin
      modifies:
        - id: ui-theme
          name: '@deepseek-ai/dsh-client-ui-theme'
```

### Host half — `lib/index.js`

Plain ESM. Reaches Node APIs; **never touches the DOM**.

```js
export const name = 'my-plugin'

export function apply(ctx) {
  // Optional services are acquired, never assumed:
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register('my-namespace', MySchema)
  })
}
```

### Browser half — `lib/client.js`

Must be a **lazy-CJS factory**. This is the bundle format the client module system
loads (`window.__ModuleLoader__.load({ id, factory })`), and it is why a plugin can
ship with **no build step at all**.

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const { defineStore } = require('@deepseek-ai/dsh-client-store')
    const { jsx, jsxs } = require('react/jsx-runtime')

    exports.name = 'my-plugin'
    /** Every entry here is REQUIRED — see §3. */
    exports.inject = ['slots', 'locale']

    exports.apply = function apply(ctx) {
      // ...
    }

    return module.exports
  },
})
```

Value `require` calls resolve against the client's platform seed table
(`react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`,
`@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
`@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`) or
against boot-graph rows supplied by another client plugin. **Everything else must be
listed in `dsh.client.external`.**

---

## 2. Registering into the UI

The UI is slots. A plugin contributes a component to a named slot, and the shell
renders whatever is registered.

Common slots (see the owning package's `contract/slots.d.ts` for the authority):

| Slot | Kind | Use |
|---|---|---|
| `root` | single | **occupied** by the app frame — do not register |
| `sidebar` | single | occupied by the sidebar shell |
| `sidebar.panellist` | list | one icon per global panel; `id` must equal the `main` key |
| `sidebar.footer.action` | list | small control beside Settings |
| `sidebar.settings` | single | occupied by the settings trigger |
| `main` | **keyed** | the main-column page, addressed by the same key |
| `settings.general.item` | list | one row in Settings → General |
| `settings.section` | single | a whole settings section |
| `shell.overlay` | list | frame-wide floating layer, click-through by default |

### A sidebar entrance plus its page — the standard "plugin page" pattern

This is exactly how the shipped **Plugins** page is built, so copying its shape is
copying the canonical one.

```js
ctx.slots.inject('main', () => {
  const disposePage = ctx.slots.register({
    name: 'main',
    key: PANEL_ID,          // same value as the sidebar id
    locale: NS,
    store,
    inject: () => ({ /* the component's business face */ }),
  }, MyPage)

  const disposeChange = ctx.on('something/changed', handler)
  return () => { disposeChange(); disposePage() }
})

ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist',
  id: PANEL_ID,
  order: 30,
  locale: NS,
  label: () => 'My Panel',
}, MyIcon))
```

Rules that are not obvious:

- **Always wrap in `ctx.slots.inject(key, cb)`.** A bare `register` into a slot that
  is not declared yet creates a **pending wait**: the entry appears, then vanishes
  when the shell recomposes. Its callback runs only after the slot exists.
- **Return a single disposer.** The contract documents "callback effects are
  synchronous disposers; iterable effects install transactionally" — the shipped
  panel plugins all return one function. A generator *type-checks* but was observed
  not to install. When in doubt, use the plain form.
- The `main` slot is **keyed**: `key` must be a `MainPanelId` string. The layout
  decides whether a panel exists via
  `ctx.slots.entries('main').some((e) => e.options.key === id)` — so if that
  registration failed, **clicking the sidebar icon does nothing at all**, silently.
- A list slot gives a registrant **one seat per plugin**, so "one plugin per item"
  is structurally impossible in those slots.

### Rendering the page

```js
function MyPage({ useStore, usePanelInfo, locale }) {
  const activeId = usePanelInfo((s) => s.activePanelId)
  // The page stays registered whatever is selected, so it renders nothing while
  // another panel owns the main column.
  if (activeId !== PANEL_ID) return null
  return jsx('div', { children: 'hello' })
}
```

`usePanelInfo` and similar hooks arrive through the slot's standard props; a
component may also receive a `store` seat, a `locale` seat (when the registration
declares `locale`), and the injected business face.

---

## 3. The failure modes, by exact error

Every one of these was hit for real. The error text is what the app shows.

### 3.1 `web boot: 1 entry did not activate` — the app refuses to start

```
DeepSeek Harness 无法使用
web boot: 1 entry did not activate
  my-plugin: pending (waiting for service: settingsScope)
```

**Cause.** Cordis' array-form `inject` makes **every** entry required. An
unavailable service parks the fiber in `pending` forever, and an unactivated entry
fails the whole boot.

**The trap.** `settingsScope` comes from `@deepseek-ai/dsh-client-ui-settings`,
which itself waits on `remote.settings`, so under the desktop composition it never
arrives. Declaring it was the single mistake that made the app unstartable.

**Fix.** Declare only services that are certainly present:

| Service | Provider | Safe? |
|---|---|---|
| `slots`, `locale` | `dsh-client-ui-layout` (statically composed) | ✅ |
| `theme` | `dsh-client-ui-theme` (statically composed) | ✅ |
| `settingsScope` | `dsh-client-ui-settings` → waits on `remote.settings` | ❌ |

Need an unsafe one? Acquire it at runtime and degrade:

```js
ctx.inject({ settingsScope: null }, (scopeCtx) => {
  if (scopeCtx.settingsScope === undefined) { /* work without it */ return }
  // ...
})
```

### 3.2 `cannot get property "X" without inject`

**Cause.** Reading a service you did not declare. Cordis forbids it — this is the
guard working, not a defect.

**Fix.** Add it to `inject`. Note the asymmetry with 3.1: **forgetting** a service
breaks at access time; **over-declaring** one breaks the boot. Declare a service
only when it is both used and guaranteed present.

### 3.3 `Cannot access 'X' before initialization`

**Cause.** `ctx.effect(cb)` runs `cb` **synchronously**. Anything `cb` reads must
already be initialised at the call site. Hit twice (`storeActions`, then
`contributed`), both times because `ctx.effect` *looks* deferred and is not.

**Fix.** Order the call after every declaration it closes over. Keep the invariant
checked: a static audit that walks the `apply` body and reports a synchronous entry
point reading a later-declared top-level name is cheap and catches it without a
restart.

### 3.4 A page that renders but is always empty

**Cause.** `handle.create()` returns a **new instance on every call**. Publishing
through one instance while the component reads another writes into a throwaway.

**Fix.** Pin it — the shipped panel plugins all do, and it reads like boilerplate
until you know why:

```js
const handle = createMyStore()
const instance = handle.create()
const store = { ...handle, create: () => instance }
const actions = instance.actions    // publish through THIS
```

Related, and worth internalising: **do not publish through the registration's
`inject` factory.** `inject` supplies the component's business face, and a page
that reads only its store seat can render perfectly while `inject` never ran —
leaving every publish written into `undefined` and the page silently empty. Publish
into the pinned instance instead.

### 3.5 A theme/skin registers, selects, and paints nothing

**Cause.** Providing `{ light, dark }` token *pairs* to `register`. That pair shape
belongs to `overrideTokens` layers only:

```js
register(def)      { this.themes = [...this.themes, def] }        // stored by reference
composeActive(act) { if (this.overrides.size === 0) return act }  // passed through
```

`ThemeDefinition.tokens` is `Record<string, string>`. Pairs reach CSS as the literal
`[object Object]`.

**Fix.** Flatten to the theme's own `colorScheme` before registering.

### 3.6 The plugin paints over the thing it themes

**Cause.** A stylesheet rule of your own covering a region that carries the theme —
e.g. `background: var(--x, transparent)` on the main column sets it transparent, so
the app's default ground shows through and the skin seems to vanish.

**Fix.** Never paint a themed region from a plugin. Express it as a token layer via
`overrideTokens` (or a token override) and let the theme own the paint.

### 3.7 Desktop profile: `profile "desktop" is managed exclusively by the Electron application`

**Cause.** The desktop profile is owned by the app. The CLI refuses to touch it.

**Fix.** Install through the app's own **Add plugin** entry, which accepts a package
name, a GitHub address, **or a local directory path**. Then restart. Editing the
profile's `package.json` / `cordis.patch.yml` by hand also works and is documented,
but it bypasses the app's bookkeeping and can be reverted by its recovery flow.

Note the app's **Plugins** page can also remove a plugin; if a bundle is disabled or
removed while an entry still references it, prefer that page over hand-editing.

### 3.8 Non-obvious environment facts

- **`$DSH_HOME/settings.yaml` is NOT read by the desktop profile.** `dsh-base` and
  `dsh-web-app` both mount the settings provider as `path: ':memory:'`. A hand-written
  `settings.yaml` gets archived to `settings.yaml.imported` at startup. The composition
  layer — the profile's `cordis.patch.yml` — is the authority.
- **A `ui-theme` preference naming an unregistered theme id aborts the boot**:
  `theme registry lost "<id>"`. Keep the preference on a built-in value until the
  plugin that registers the id is confirmed loading.
- **npm `latest` dist-tags for `@deepseek-ai/dsh-client-*` lag.** `dsh-client-ui-slots`
  published `latest = 0.0.1-rc.1` while the real newest was `0.1.7-rc.2`; the old
  version lacks the `ctx.slots` declaration. **Pin to the version the host actually
  installed** (`~/.dsh/profiles/node_modules/@deepseek-ai/<pkg>/package.json`).
- **`dsh-client-store` needs `zustand` / `immer` / `react` under Node.** Without them
  it cannot even be imported for a contract test.
- **The CLI and the app can be different versions.** Check
  `%APPDATA%\@deepseek-ai\dsh-desktop\logs\` — the crash log names the app version.

### 3.9 `createRoot` can mount nothing, silently — build DOM nodes instead

`react-dom/client` **is** in the client's platform seed table, and `require`ing it
works. It still mounted **nothing at all** inside the shipped desktop app:

```js
// Observed: the container stayed empty (childElementCount === 0), no error surfaced
const { createRoot } = require('react-dom/client')
createRoot(seat).render(element)
```

The seat was correct in every other respect — right parent, right size, right
stylesheet, right z-index — so this was the only link left, and it produced no
exception in the plugin.

**If your UI goes through slots, this never comes up** — the shell owns the React
tree and rendering is its job. It only bites when a plugin must paint into the
shell's DOM directly, which happens when no slot exists for what you need. (Scenery
*behind* the sidebar's nav is the example: a slot child would sit beside it, not
behind it.)

**Fix — walk the JSX element tree and build nodes yourself.** `react/jsx-runtime`
still gives you the element literals, and for static markup with CSS animation that
is all you need:

```js
const SVG_TAGS = new Set(['svg', 'linearGradient', 'stop', 'path', 'ellipse', 'g', 'defs'])
const ATTRIBUTE_NAMES = { className: 'class', htmlFor: 'for', stopColor: 'stop-color' }

function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node))
  if (Array.isArray(node)) {
    const fragment = document.createDocumentFragment()
    for (const child of node) { const built = render(child); if (built !== null) fragment.append(built) }
    return fragment
  }
  const { type, props } = node
  // A component would need hooks this walker cannot provide: refuse, do not skip.
  if (typeof type === 'function') throw new Error('scenery must be plain elements')
  const el = SVG_TAGS.has(type)
    ? document.createElementNS('http://www.w3.org/2000/svg', type)   // ← load-bearing
    : document.createElement(type)
  for (const [name, value] of Object.entries(props ?? {})) {
    if (name === 'children' || value === null || value === undefined) continue
    el.setAttribute(ATTRIBUTE_NAMES[name] ?? name, String(value))
  }
  const child = render(props?.children)
  if (child !== null) el.append(child)
  return el
}
```

Three details, each causing a **silent wrong result** rather than an error:

- **`createElementNS` for SVG.** An HTML-created `<linearGradient>` is inert, so
  `fill="url(#id)"` resolves to nothing and the artwork renders **black**.
- **`className` → `class`, `stopColor` → `stop-color`.** The JSX names written
  verbatim match no CSS rule and no SVG semantics — which looks exactly like a
  stylesheet that never loaded.
- **A function component must throw, not be skipped.** A silent skip is a blank area
  with no explanation.

Node has no DOM, so test the walker against a **small hand-written fake** — and make
the fake behave like the real thing (a `DocumentFragment` inserts its *children*, not
itself, or your array-children assertions mean nothing). Worth writing: namespace
loss, `className` leakage and dropped children are all invisible to a syntax check.

### 3.10 Never let a decoration swallow its own error

A `catch` that only calls `console.error` deletes the only evidence of the failure.
Two rounds were spent on scenery that "did nothing" because the mount error went to a
console nobody had open.

Wrap the risky step **and put the message where the user is already looking** — the
plugin's own panel, a status field, a banner. The corollary is worth stating plainly:
**a `catch` that logs and continues is a decision to debug blind.**

### 3.11 Reading a plugin's dependency graph from the live app

The shipped app is one big `app.asar`; its bundled plugins are the authority for
contracts when your local `node_modules` holds a different release. It is a
concatenated archive, so **plain string search still works** — no extraction needed:

```powershell
$asar = "C:\Users\<you>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar"
# stream it and regex the chunk you care about
```

This is how the real `hasMainPanel` check, the real slot declarations, and the real
theme presenter were read while debugging — each time beating a guess.

### 3.12 A plugin that WRITES an event and SUBSCRIBES to it spins the renderer

**Symptom.** The app enters the interface, then the UI sticks part-way and **renderer
memory climbs monotonically**. Main, host and GPU processes are **perfectly normal**.
**No exception, no crash log** — nothing throws, it just never stops.

Measured: renderer RSS **11,231 MB**, ~**2.7 cores** of accumulated CPU across 305 s of
wall clock (≈75 MB/s). Removing the plugin from the profile stopped it; re-adding it
restarted it.

**Cause.** `theme.overrideTokens()` and `theme.setTheme()` both **emit `theme/change`
synchronously**, and the plugin subscribed to that event:

```
publish → syncSkin → overrideTokens → theme/change → publish → …     (no await anywhere)
```

Because nothing yields to the event loop this is not a *slow* loop — it is a **spin**.
That is also why the process listings look sane: the loop lives entirely in the renderer.

**Why the obvious brake fails.** The guard was `if (id === alreadyStacked) return`, and it
could never work, because the code clears that variable *before* making the call that
re-enters:

```js
stackedSkin = undefined                                   // release the old layer
stackedSkinDispose = ctx.theme.overrideTokens(…)          // ← emits HERE, before the next line
stackedSkin = id                                          // ← too late
```

A re-entrant call therefore always sees a mismatch. **Comparing values cannot distinguish
"the service changed underneath me" from "I just changed the service"** — and that
distinction *is* the bug.

**Fix — mark your own emissions with a depth counter:**

```js
let selfEmitDepth = 0

function emitting(action) {            // wrap EVERY action of yours that emits
  selfEmitDepth += 1
  try { return action() } finally { selfEmitDepth -= 1 }
}

ctx.on('theme/change', (snapshot) => {
  if (selfEmitDepth > 0) return        // my own write coming back — do not re-enter
  contribute(snapshot)
  publish(snapshot)
})
```

Use a **depth counter, not a boolean**: disposing the previous layer emits too, so nesting
must unwind correctly.

**Applies to any "write an event you also listen to"** — theme changes, store
subscriptions, slot re-registration, anything with a change notification.

**Verification.** Bounded counters as assertions, and `npm run watch:renderer` from
outside the app:

| Reading | Meaning |
|---|---|
| renderer CPU peak < 0.5 core, RSS flat or falling | fixed |
| renderer CPU sustained > 1 core, RSS climbing | still spinning |
| main/GPU abnormal | a different problem — they sit *outside* this loop |

**The same bug has a SECOND shape, and it looks nothing like a spin.** Fixed in one place,
it came back at two writers that had been missed, and this time it was loud:

```
[theme-gallery] could not stack the accent layer: RangeError: Maximum call stack size exceeded
    at syncSkin (lib/client.js:3290)
```

**Hundreds of identical lines**, not one error. The cause is the same (`overrideTokens` →
`theme/change` → `publish` → `overrideTokens`), but the difference is **where the loop lives**:

| | Shape 1 — silent spin | Shape 2 — this one |
|---|---|---|
| Where the loop lives | the event loop (each round gets queued) | the **call stack** (each level nests in the previous call) |
| How it ends | never — RSS climbs to GBs | `RangeError` when the stack is exhausted |
| What you see | nothing at all | **the same `catch` message printed once per level** |

So the flood's line count ≈ the recursion depth: **every level has its own `try/catch`**, so each
one logs on the way out. **"The same sentence, hundreds of times" is the fingerprint of
synchronous re-entry** — do not read it as "an intermittent error happening repeatedly".

The two missed writers are the ones easy to forget, because neither looks like a theme write:

- **the layer's disposer** — `layerDispose()` emits too;
- **a second, later-added layer** (`theme-gallery: reading`) — added after the fix, and its
  trigger was a `MutationObserver`, i.e. a loop through the **microtask queue** rather than the
  stack: no exception, CPU burns quietly. Wrap the whole body, and remember the skip test is a
  separate mechanism (`if (wanted === stacked) return`) that only stops *churn*, never re-entry.

**The durable fix is not "remember to wrap the new one".** A rule you have to remember is not a
rule — it is a hope, and this one failed exactly once per forgotten writer. Make a **machine**
count every write site instead. In `dsh-theme-gallery` that is
`tests/check-self-emit-guard.mjs` (+ `-logic.mjs`), and it is part of `npm test`:

- it finds every `ctx.theme.setTheme(`, `ctx.theme.overrideTokens(` and `*Dispose(` call, and
  requires each to sit inside the argument span of an `emitting(...)` call;
- it allows exactly **one** reasoned exception (the slot action handed to the shell: the user's
  click must really write, because that `theme/change` *is* how the plugin learns of the choice);
- precedence is by **paren matching**, and comment/string contents are blanked first — locating
  the subscriber with a plain `indexOf` finds the *prose* that mentions it (this audit lied once
  that way before it was fixed);
- its self-test **mutation-tests the real file**: un-guard a writer, delete the echo check, or
  invalidate the allowlist entry, and the audit must fail.

### 3.13 Every retry/re-apply path needs a GLOBAL budget, not a per-object one

**Cause.** The guard covered only one of two branches. The other branch called
`setTheme()` on **every** publish with **no cooldown and no budget**, and the framework's
own `adopt()` (which copies the *persisted* preference — only ever a built-in id — back
over the in-memory one) guaranteed the active id would never catch up. A perpetual
ping-pong.

**Fix.** Count the ACTION, not the OBJECT:

```js
const WRITE_BUDGET = 6              // per session
const WRITE_COOLDOWN_MS = 1000      // minimum spacing
let writes = 0, lastWriteAt = 0
```

On exhaustion: **stop quietly and say so** on your own surface. "One bounce per skin" is
not a budget — a plugin can have many skins, and the loop does not care which one.

### 3.14 `X is not defined` — a helper that cannot see the name it calls

**Cause.** Extracting a mount body into a function (`mountGallery(ctx)`) silently changes
what everything inside can reach:

| Error | Shape |
|---|---|
| `ctx is not defined` | A factory-level helper referenced `ctx`, which existed only as the mount body's **parameter** |
| `helperFoo is not defined` | A factory-level function called a helper that lives **inside** the mount body |
| `alreadyDisposed is not defined` | Declaration and reader in the same scope but **wrong order** (TDZ) |

All three were hit **for real, repeatedly** — four separate occurrences in one file.

**Why no existing check caught them.** They are two different mistakes:

- **TDZ** (`Cannot access … before initialization`): the name *is* in scope, just later.
  A declaration-order audit catches it.
- **Out of reach** (`X is not defined`): the name is **never lexically bound** at all.
  A declaration-order audit is blind to it, and the `try` around every caller turns it
  into "the feature silently does nothing".

**Fix.**
1. Helpers that only need the module-level context must live at the **same level** as
   their callers, not inside a deeper function.
2. **After any mechanical move or re-indent of code, run a scope-reach audit.** Changing
   indentation does **not** change brace depth, and a `reindent` script really did move a
   declaration into the wrong depth here.

```js
// Cheap and effective: for each factory-level function, check that every function it
// CALLS is bound at an equal-or-shallower brace depth. Parse the bundle as text —
// it cannot be imported under Node.
```

### 3.15 The idempotence check must come before EVERY write

**Cause.** A repaint guard compared a fingerprint — but two DOM-writing calls
(`ensureStylesheet()`, `removeStrayNodes()`) ran **before** the comparison. So the guard
could never prevent a write, each pass mutated the DOM, the `MutationObserver` saw it, and
the cycle sustained itself no matter what the fingerprint said. Two early-return paths
also **reset the fingerprint**, disabling the guard entirely for those windows.

**Fix.**
- Order: **cheap measurement → decide → only then write.** Nothing may write above the guard.
- **Never reset the fingerprint on an early return.** "Not ready yet" is not "state changed".
- Observe as narrowly as you can. A `MutationObserver` on `document.body` with
  `subtree: true`, on a plugin that also writes to `document.body`, is a self-triggering
  loop by construction.

### 3.16 The "in-flight" flag does not close the loop

**Cause.** A `syncInFlight` boolean only covers the synchronous body. The mutations that
re-trigger you — React re-renders, and the `theme/change` emitted by your own writes —
arrive **after** the body exits. So "mutations during sync are dropped" was never true.

**Fix.** A re-entrancy flag is necessary but not sufficient. The loop has to be closed at
its **source**: mark your own emissions (§3.12) and make the write paths bounded (§3.13).

---

## 4. Instrument it before you need it

The single highest-value practice in this skill. From outside, *"I clicked it and
nothing happened"* cannot be split into:

1. the package never loaded
2. the fiber is pending
3. the slot gate never fired
4. the component rendered but the data never arrived
5. the data arrived but was malformed
6. it all worked and your own CSS covered it

So make the plugin **report which link is missing**, on its own surface.

### The decisive probe: service belief vs live document

```js
// What the service believes
const active = ctx.theme.getTheme().active          // → { id, tokens: {...} }
// What is actually in effect — read the LIVE DOM, never the service
getComputedStyle(document.body).getPropertyValue('--dsw-alias-brand-primary')
getComputedStyle(document.body).backgroundColor
```

Print both side by side. A divergence is the bug, and its shape names the cause:

| Reading | Meaning |
|---|---|
| `active.id` is a built-in, not yours | selection never took |
| `active.tokens = 0` | registration lost the tokens |
| token value is `[object Object]` | wrong shape handed to `register` |
| service says the token, DOM says `(unset)` | the presenter never applied it |
| both agree, screen still wrong | your own CSS is covering it |

This one line ended a many-round hunt by showing `brand=[object Object]` and
`body 背景=rgba(0,0,0,0)` together.

### Keep the probes behind a switch

Ship them, gate them, so the surface stays clean but the tool survives:

```js
const debugEnabled = () => location.hash.includes('my-plugin-debug')
```

### Also worth having

- **A `console.error` on every caught failure.** An unactivated entry reports only
  `failed` — never why. Swallowing an exception to "stay safe" removes the evidence.
- **A static declaration-order audit** for §3.3 (the file is a browser bundle, so it
  cannot be imported under Node — parse it instead).
- **A static scope-reach audit** for §3.14 — a *different* mistake from §3.3, and the one
  a declaration-order audit is structurally blind to.
- **A contract test for each framework promise you relied on.** `create()` returning
  a fresh instance, a store's action shape, a schema's strictness: one small Node
  test each. Two of the eight bugs above were found this way in minutes after
  rounds of guessing failed.

### Log DECISIONS, not just attempts — and two clocks

A diagnostic log that records only "I tried to do X" cannot answer *"did the gate even
open?"* Four consecutive debugging rounds stalled on exactly that, because the guards that
silently refused to act left **no trace at all**. Record the decisions:

```js
noteEvent('boot settled')
noteEvent('waiting for shell', wanted)     // ← the refusal is the useful line
noteEvent('applied', `${wanted}#${n}`)
noteEvent('budget exhausted', wanted)
```

**Two clocks, not one.** Stamp each entry with time since page start **and** time since your
plugin mounted. Their difference is what exposed a plugin mounting 20 s into a session —
visible instantly, and invisible with a single clock.

**Collapse repeats.** These paths run every frame; twelve identical lines will push the one
interesting entry out of a ring buffer. Compare against the previous entry and refresh its
timestamp instead of appending. In this project the *first* log entry was the key clue, and
it had long been evicted by repeats by the time anyone read the log.

**A bounded ring buffer, always.** An unbounded diagnostic array in a plugin that is
already suspected of spinning is a second memory leak.

The principle: **a log's value is its ability to preserve the anomaly, not the number of
lines it holds.**

---

## 5. Workflow

1. **Scaffold** per §1. No build step is needed — write `lib/*.js` by hand.
2. **Lint the manifest before installing.** Assert `dsh.bundle.patch`,
   `exports["./client"]`, `dsh.client.platform`, and — when `inject` is non-empty —
   `dsh.client.immediately`.
3. **Install through the app**: Plugins → Add plugin → the local directory path.
   Restart.
4. **First checkpoint: does the app start?** If not, read
   `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log`. It names every
   pending entry **and the service it waits for** — the fastest signal available.
   Also read the count: `1 entry did not activate` when two plugins share a missing
   service means the other one got it.
5. **Second checkpoint: does your surface appear?** Sidebar icon, settings row, panel.
6. **Third checkpoint: does it have data?** Here the §4 probes earn their keep.
7. **Keep the preference safe.** If your plugin registers a theme id, do not point
   `ui-theme.preference` at it until the plugin is confirmed loading.
8. **Publish**: see §7.

---

## 6. Your tests and audits will lie to you

This section exists because it happened, repeatedly, in one session.

### 6.1 An audit that is wrong is worse than no audit

A scope-reach audit was written to catch §3.14. It was wrong **three times**, and
**every time it reported "passed"**:

| Bug in the audit | Effect |
|---|---|
| Brace counting fooled by `${…}` inside template literals | function bodies computed too short → a real violation was **missed** |
| A prose **apostrophe** in a comment (`the presenter's tokens`) parsed as a string opening | swallowed the rest of the file, deleting function declarations → a real violation was **missed** |
| Destructured parameters (`const { now } = options`) not recognised | reported a **false** violation |

**"Passed" looks identical whether the code is clean or the check is broken.** So:

- Every audit needs a companion **`*-logic` self-test**.
- That self-test needs cases in **both** directions: ones it must catch, and ones it must
  **not** flag. A one-directional test cannot detect the failure mode above.
- Wrap the parsing logic in a reusable module so the audit and its self-test run the
  *same* implementation. A self-test that reimplements the check just confirms two
  different bugs agree.

### 6.2 Parsing source for structural facts — the required hygiene

- **Blank whole comment lines first.** Do not scan for a matching quote character:
  prose apostrophes break pairing and silently delete code from your view.
- **Blank string/template contents but keep `${…}` interiors** — those braces are real code.
- **Strip the comment tail before matching a name**, or `// foo() is called above` counts
  as a call. Assertions in this very project were tripped by comments **twice**.
- **Compute brace depth from the blanked text**, and treat indentation as untrusted:
  a mechanical `reindent` moved a declaration into the wrong depth here.

### 6.3 MUTATION-TEST every assertion, and report honestly when it fails

After writing an assertion, **break the code it guards and confirm the assertion fails.**
Without this you have a comment, not a test.

Real outcomes from this project:

| Assertion | Mutation | Verdict |
|---|---|---|
| scene is written exactly once | injected a second render path | ✅ caught it |
| palette survives `adopt()` | removed the token layer | ✅ caught it |
| late presenter still gets painted | removed the retry watcher | ✅ caught it |
| `ambient:false` stops both layers | deleted all three guards | ✅ caught it |
| self-driving loop is cut | removed the echo guard | ❌ **counts did not change** |

The last one is the important one. The stub could not reproduce the *timing* the real spin
depends on, so **that assertion could not prove the guard was necessary** — and saying so
is the correct outcome. **Report "could not verify" rather than implying verification.**
An overstated test is exactly how a defect ships with a green suite.

### 6.4 A stub must reproduce the real component's SIDE EFFECTS

Every stand-in should be asked: *does the real thing emit here? write DOM here? resolve
asynchronously?* Missing side effects make the loop under test **unreachable**:

| Stub gap | What it hid |
|---|---|
| no `MutationObserver` global | the plugin's settling loop never started at all |
| `querySelector` returned `null` for the stylesheet selector | the stylesheet was "always absent", so the draw path **never ran** |
| `defineStore` had no `create()` | the whole mount was blocked by its guard — while the test still passed |
| the emitter was a no-op | the self-driving loop could not form, so the guard looked unnecessary |

The rule: **a test that passes without ever reaching the code under test is worse than a
failing one.**

---

## 7. Publishing

`CONTRIBUTING.zh.md` in the official repository states plainly that **external pull
requests are not accepted**. It then gives the actual path:

> Create a plugin that excites you and share it with others: associate your GitHub
> project with the **`dsh-plugin`** topic.

So: a standalone repository with the `dsh-plugin` topic, not a PR.

| Distribution | How the user installs | Cost |
|---|---|---|
| **npm** (recommended) | Add plugin → package name | build `lib/` before publishing; user grants nothing |
| **tarball** | `pnpm pack`, user gives the `.tgz` path | no registry account needed |
| **git** | `github:you/repo` | needs a `prepare` script **and** the user must allow the build in `pnpm-workspace.yaml` — that is arbitrary code execution on their machine, so pin a commit |

A plugin with no build step (plain `lib/*.js`) behaves identically under all three.

---

## 8. Pre-flight checklist

Before publishing, each of these should be a real check, not a review.

**Manifest and services**

- [ ] `dsh.bundle.patch`, `exports["./client"]`, `dsh.client.platform` present
- [ ] `dsh.client.immediately: true` if `inject` is non-empty
- [ ] `inject` lists only certainly-present services (§3.1)
- [ ] every service read is declared in `inject` (§3.2)
- [ ] `exports.isPlugin = true` — without it the entry never activates

**Scope and ordering — every one of these was hit for real**

- [ ] no factory-level helper reads `ctx` unless `ctx` is in *its* scope (§3.14)
- [ ] no factory-level function calls a helper defined inside a deeper function (§3.14)
- [ ] every `const`/`let` is declared **before** the function that reads it (§3.14, TDZ)
- [ ] every `ctx.effect` / `ctx.on` call sits after the declarations it closes over (§3.3)
- [ ] after any mechanical move / re-indent: the scope-reach audit is green

**Loops — the expensive class**

- [ ] every action of mine that emits an event I also subscribe to is wrapped in the
      self-emit guard (§3.12)
- [ ] no idempotence check sits *after* a DOM write (§3.15)
- [ ] no early-return path resets the idempotence fingerprint (§3.15)
- [ ] every retry / re-apply path has a **global** budget and a cooldown (§3.13)
- [ ] any `MutationObserver` is scoped as narrowly as the feature allows (§3.15)
- [ ] a re-entrancy flag is not the only thing closing the loop (§3.16)

**Surface**

- [ ] every slot registration is wrapped in `ctx.slots.inject`
- [ ] every slot callback returns a single disposer
- [ ] the store instance is pinned and published through directly (§3.4)
- [ ] no stylesheet from this plugin paints a themed region (§3.6)
- [ ] a failure would name its own cause on-screen (§3.10)
- [ ] a kill switch exists so the feature can be turned off **without editing the
      profile's bundle list** (that list is re-derived automatically and will be written
      back)

**Tests**

- [ ] `tsc` against the host's real type packages passes
- [ ] the app starts with the plugin enabled
- [ ] the surface renders and carries data
- [ ] **every assertion has been mutation-tested** — break the guarded code, watch it fail
- [ ] every audit has a `*-logic` self-test with cases in **both** directions (§6.1)
- [ ] every stub reproduces the real component's side effects (§6.4)
- [ ] any assertion that could not be mutation-tested is reported as **unverified** (§6.3)

**Runtime**

- [ ] `watch:renderer`-style sampling shows CPU peak < 0.5 core and non-climbing RSS
      with the plugin enabled — **main/GPU readings are not evidence**, they sit outside
      renderer-side loops

---

## 9. Minimal skeleton to copy

`package.json` — §1. `cordis.patch.yml` — §1.

`lib/index.js`:

```js
export const name = 'my-plugin'
export function apply(ctx) { void ctx }
```

`lib/client.js`:

```js
window.__ModuleLoader__.load({
  id: 'my-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const { defineStore } = require('@deepseek-ai/dsh-client-store')
    const { jsx } = require('react/jsx-runtime')

    const NS = 'my-plugin'
    const PANEL_ID = 'my-plugin'
    const zh = { title: '我的插件' }

    function createStore() {
      return defineStore({
        init: () => ({ rows: [], note: '' }),
        actions: { setRows: (d, rows) => { d.rows = rows }, note: (d, note) => { d.note = note } },
      })
    }

    function Page({ useStore, usePanelInfo }) {
      const activeId = usePanelInfo((s) => s.activePanelId)
      const rows = useStore((s) => s.rows)
      const note = useStore((s) => s.note)
      if (activeId !== PANEL_ID) return null
      if (rows.length === 0) return jsx('div', { children: note || 'loading…' })
      return jsx('div', { children: rows.join(', ') })
    }

    function Icon({ size, active }) {
      const edge = typeof size === 'number' ? size : 16
      return jsx('svg', { width: edge, height: edge, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, 'x')
    }

    exports.name = 'my-plugin'
    exports.inject = ['slots', 'locale']

    exports.apply = function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en: zh }), 'my-plugin: dictionaries')

      const handle = createStore()
      const instance = handle.create()
      const store = { ...handle, create: () => instance }
      const actions = instance.actions

      ctx.slots.inject('main', () => {
        const disposePage = ctx.slots.register({
          name: 'main', key: PANEL_ID, store, locale: NS,
        }, Page)
        actions.note('面板已注册；数据尚未送达')
        return disposePage
      })

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 30, locale: NS, label: () => zh.title,
      }, Icon))
    }

    return module.exports
  },
})
```
