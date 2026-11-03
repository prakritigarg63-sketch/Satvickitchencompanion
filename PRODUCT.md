# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS and vanilla JavaScript with no framework and no build step. The prototype lives in `dist/`: `index.html`, `style.css` (base), `editorial.css` (the editorial layout and a readability layer, loaded after the base), `app.js`, `credits.html` and `assets/`. It is also an installable web app: `manifest.webmanifest`, `icons/`, and `sw.js` (offline support; bump its `VERSION` when the precache list changes). Each view has its own URL (`#plan`, `#recipes`, `#shopping`, `#progress`), so the Back button moves between views and closes dialogs. Fonts load from Google Fonts. All state is kept in the browser's `localStorage` under the key `satvic-kitchen-concept-v1`.

The owner earlier named React / Next.js for the product. The shipped prototype is vanilla, and moving to a framework is an **open decision**, not a plan.

## Users

Home cooks who are moving to a satvic way of eating and need help with it day to day. They're at home, cooking for themselves or a household of 1–8 people, with limited time (20, 30 or 45 minutes of active cooking).

## Product Purpose

Satvic Kitchen Companion makes satvic home cooking feel calm and doable. It does that through one loop: **plan a little → shop simply → cook with joy.**

- **Plan:** a three-day plan of main meals. Each meal can be swapped, cooked or refreshed, and the plan can be filled from a recipe library.
- **Shop:** one combined shopping list, scaled to household size. It's grouped into Fresh Produce and Pantry Staples, and checks against what's already in the pantry.
- **Cook:** step-by-step cooking mode with scaled quantities. Preparation (such as soaking) is shown separately from active cooking time.
- **Small wins:** a record of meals cooked, progress through the current plan, and how each meal went.

Success means the cook actually makes the planned meals and comes back for the next plan.

## Positioning

The prototype's promise: **"Three simple meals. One thoughtful shopping list."** It's a small, finishable plan, not an endless recipe catalogue. Shared ingredients are combined so the cook only buys what they need, and checking the pantry comes before shopping.

The owner's stated longer-term direction is **pantry-first**: start from what is already in the kitchen. The prototype supports this only partly, through the pantry check on the shopping list. It does not yet suggest meals from pantry contents.

## Operating Context

- It's used at home around three moments: deciding the week's meals, shopping, and cooking at the stove.
- Cooking mode is used mid-cook, with a step checklist and "I cooked this!" at the end.
- The shopping list can be copied to the clipboard or printed for use in the shop.
- Data stays on the device. There are no accounts or sync. The only backend is the optional Sprout AI function, which receives the chat message and a snapshot of the plan.

## Capabilities and Constraints

**The satvic layer (Nov 2026):**
- Seasons follow the six Indian ritus by month (`RITU` in `app.js`). The hero, plan and Sprout name the current one.
- Each recipe has `moment` (midday or before sunset), `raw`, `ritu` (seasons it suits), an optional `soak` (hours, what, amount) and a `why` line (`SATVIC` in `app.js`).
- **This week's harvest:** six in-season recipes that fit the preferences, rotating by ISO week ("Harvest no. 45", the next one opens Monday).
- **Tonight's soak:** a strip on the plan listing what to soak for planned meals, with a "soaked" checkbox (`state.soaked`). In the evening, Sprout nudges once per day on desktop.
- **Kitchen ritual** (`ritual.js`): three questions on a first visit (name and household, evening time, appetite), then a varied plan built from the answers. It can be skipped; add `?tour=0` to the URL to skip it for screenshots.
- **Cooking mode** (`cook-mode.js`): full screen and dark, one large step at a time, kitchen timer, ingredient drawer, arrow keys, screen wake lock; finishing runs the normal "I cooked this" flow.
- Quantities read naturally (½ tsp, 1½ lemons · buy 2, 3 medium carrots).
- The Cooked page shows this week's three meals with their status, instead of an empty state.
- `exclusive.css` holds these styles plus one shared photo grade.
- **Sprout AI:** `api/sprout.js` is a Vercel Function that calls Claude (`claude-opus-5-5` by default, override with `SPROUT_MODEL`). It needs `ANTHROPIC_API_KEY` in the Vercel environment; without it, Sprout falls back to the offline guide. The welcome pop-up was removed.

**Built and working in the prototype:**
- 14 hand-written illustrative recipes: Golden moong khichdi, Rainbow chickpea bowl, Tomato & basil soup, Garden millet bowl, Coconut vegetable stew, Sesame veggie noodles, Pumpkin & ginger soup, Carrot & cumin soup, Spinach & sweetcorn soup, Cucumber & coconut salad, Beetroot & carrot salad, Vegetable millet upma, Lauki & moong khichdi, Creamy cashew vegetable curry.
  - Each recipe has its own ingredients, prep note and four steps.
  - Recipes are categorised as *Quick & fresh* or *Comfort bowls*.
- Default plan: khichdi, chickpea bowl, tomato soup.
- Preferences:
  - Household size from 1 to 8, which scales all quantities, including the water amounts written in the steps.
  - Maximum active cooking time.
  - Nut-free filter.
  - Preferences change *suggestions* only. They never replace meals already chosen.
- Plan rules:
  - Adding a recipe that's already planned swaps the two days instead of creating a duplicate.
  - Swapping a meal updates the shopping list.
- Shopping:
  - "To buy" and "In my pantry" tabs, each item with a Have it / Need it toggle.
  - Checkboxes for items bought.
  - The remaining-item count shows both on the page and in the header navigation badge.
- Small wins keeps all-time cooked recipes separate from progress through the current plan. Per-recipe feedback options: Easy & enjoyable / Took longer / Missing ingredients.
- **Sprout**, a kitchen-companion mascot (`sprout.js`, `sprout.css`, `assets/sprout/`), sits bottom-right and slides aside whenever a control is underneath it.
  - It waves once on a first visit, and the greeting can be dismissed. Sprout can be hidden, and brought back from the footer.
  - Its chat panel answers from the app's real state and recipes, using the same scaling helpers (`scaledIngredients`, `scaledStep`) as the recipe dialog.
  - Reply buttons call the existing handlers (view recipe, choose a day, open plan, shopping list, start cooking, small wins). Suggestions never change the plan; only picking a day does.
  - With no AI service configured it runs in **Guided kitchen help** mode, a local intent engine behind an adapter. Adding `<meta name="sprout-endpoint" content="/api/…">` switches to a server endpoint that keeps its own credentials; replies are checked against real recipes and allowed actions.
  - Sprout's own state uses `satvic-sprout-v1` (localStorage) and `satvic-sprout-chat-v1` (sessionStorage); it never writes to the app's key.
  - The animation layers are cut from the supplied artwork (body, arm, leaves, eyes) so the arm can wave around the shoulder while the body stays still.

**Terminology:**
- *My meal plan*, *Explore recipes*, *Shopping list*, *My small wins*
- *Cook this*, *Swap*, *Refresh my plan*, *Make shopping simple*
- *Have it / Need it*, *I cooked this!*

**Krishna Bhajans (Nov 2026):** `dist/bhajans.js` and `bhajans.css`. The white-eye bird in the nav is the control.
- **Source.** Ten Hindi and Braj bhajans are streamed from YouTube through the official IFrame Player API (youtube-nocookie.com). Nothing is downloaded or hosted. Each video is an embeddable upload on its channel; the list, channels and links are in `credits.html#bhajans`.
- **Rights.** Self-hosted, openly licensed recordings of these bhajans couldn't be verified (Nov 2026 research), so streaming from YouTube is the chosen route.
- **YouTube's rules.** No background or audio-only playback, and the player must stay visible at 200 × 200 px or larger. So the player is always on screen while it plays: in the panel, or as a 200 × 200 tile bottom-left when minimised. The tile is a popover in the top layer, re-raised above the site's own dialogs. "Stop & close" is the only way to hide it.
- **Load.** If the browser allows sound without a tap and the cook hasn't stopped or muted it, the saved bhajan plays at the saved volume (15% at first). Otherwise a bubble by the bird says "Welcome 🌿 Tap the bird to play Krishna bhajans." There is one attempt and no retry loop. A video whose channel blocks embedding (error 101/150) is marked "Unavailable here" and skipped once.
- **Shared controller.** `window.SatvicAudio` stops Kitchen Calm when a bhajan starts and vice versa. Sprout's voice pauses music while listening and lowers it while speaking, then restores it unless the cook stopped it.
- **Saved settings.** Kept under `satvic-bhajans-v1`: track, volume, mute, repeat (track or playlist), and whether it was stopped.
- **QA switches.** `?tour=0` skips the autoplay (add `&bhajans=1` to test it). `?bhajans=0` turns the player off so the bird stays Kitchen Calm's. Tests: `.qa/bhajans/test.mjs`.

**Sprout's greeting (Nov 2026):** on every load or refresh, Sprout waves and says "Hi, I'm Sprout 🌱 Hope you are doing well." It asks how the cook is feeling (Doing well / A bit tired / Hungry!) and answers from the real plan: the next meal, or the quickest one when tired, with a button to open it. It waits for the first-visit setup questions, never shows over an open chat, a dialog or a hidden Sprout, and comes before the evening soak reminder. `?tour=0` skips it for screenshots and QA; add `&greet=1` to test it.

**Sprout's voice (Nov 2026):** `dist/sprout-voice.js` and `sprout-voice.css`.
- **Talk to Sprout.** A microphone in the chat uses the browser's speech recognition. The microphone is requested only on that tap: tap to start, tap again to stop. The transcript lands in the text box to review or edit; nothing is sent automatically.
- **Read replies aloud.** An optional switch uses the browser's speech synthesis, with Stop and Replay. Voice settings (language, voice, speed) are kept on the device under `satvic-sprout-voice-v1`.
- **Status.** Idle, Listening, Thinking and Speaking show in the chat, and Sprout moves gently while listening or speaking (none with reduced motion).
- **Kitchen Calm.** Music is lowered while Sprout listens or speaks (`KitchenCalm.duck`, not saved) and restored afterwards. Listening stops before Sprout speaks.
- **Languages.** English (India, US, UK) and Hindi. Hindi answers need the AI replies; the offline guide answers in English. Without a Hindi voice, Hindi text is shown but not spoken.
- **Fallbacks.** Without recognition the microphone is hidden and typing works as before. Errors (denied microphone, silence, offline, unsupported language) show plain messages.
- **Offline.** Speech recognition is an online browser service in most browsers; never claim it works offline.
- **Tests.** `.qa/voice/test.mjs` (scripted speech stand-ins) and `.qa/voice/real.mjs` (real browser APIs).

**Open decisions:**
- whether and when to move to React / Next.js
- whether recipes stay hand-written or become AI-generated (the owner's earlier direction)
- which satvic rule set the product formally follows
- pantry-first meal suggestions
- accounts and sync
- deploy target

## Brand Commitments

- Name: **Satvic Kitchen Companion**. Wordmark "satvic" with the subtitle "KITCHEN COMPANION".
- **Independent portfolio concept, imagined and built by Prakriti Garg. Unaffiliated with Satvic Movement.**
  - This disclaimer must stay visible in the page footer and the credits page.
  - Never use Satvic Movement's name as a brand, nor their logos, program names, founders' names, imagery or recipes, and never suggest endorsement.
  - "Satvic" is used only as the general name for the diet.
- **Voice (since Nov 2026):** calm, confident and specific. Fewer words, concrete details (season, soak, sunset), no "little" softeners. Shipped examples:
  - "Three meals. One list. Done by sunset."
  - "Buy only what you'll cook."
  - "Cook fresh. Eat early. Repeat."
  - "No streaks, no scores. Just the meals you actually made."

  Never guilt the cook.
- Recipes and photos are always labelled *illustrative*.

## Evidence on Hand

- Fourteen illustrative recipes in `dist/app.js`. They are independent examples, not official Satvic Movement recipes.
- Fifteen photos in `dist/assets/`, credited in `dist/credits.html` (no longer linked from the footer; the sound player links to its Sounds section):
  - Unsplash: the vegetable bowls (`hero.jpg` and `chickpea.jpg` are the same image) and the tomato soup.
  - Food Trails: khichdi.
  - Eat-Vegan: vegetable stew.
  - Culinary Vegans: noodles.
  - Eight more for the expanded collection (pumpkin soup, carrot soup, spinach & corn soup, cucumber salad, beetroot salad, millet upma, lauki khichdi, cashew curry), from the food sites listed on the credits page.
  - **The reuse rights for the food-blog and food-site photos are unconfirmed**; crediting a photo doesn't grant them. Confirm permission or replace them before using them more widely.
- Reference screenshot: `preview.jpg`.
- Live prototype: https://satvic-kitchen-companion-prakriti.prakritigarg194.chatgpt.site
- There are no real users, testimonials, usage data, nutrition data, health outcomes or expert review. Never invent any of these.

## Product Principles

1. **Small and finishable.** Three meals and one list beat an overwhelming catalogue. Every screen should point to the next small step.
2. **Your choices stay yours.** Preferences adjust suggestions and never silently change what the cook has chosen.
3. **Honest about time and ingredients.** Show active cooking time and preparation separately. Combine quantities accurately, and flag allergens (nuts, wheat, sesame) in the recipe itself.
4. **Encourage, never judge.** Progress is celebrated without streaks, scores or guilt.
5. **Independent and illustrative.** Be clear that this is a concept with illustrative content, and never borrow another brand's authority.

## Accessibility & Inclusion

No formal standard has been set. The prototype already provides:
- visible keyboard focus outlines
- native `<dialog>` modals that close with Escape or a click outside
- an `aria-live` region that announces toasts
- labelled icon-only buttons
- a print stylesheet for the shopping list

Every recipe tells the cook to check ingredients against their household's dietary needs. Future work must keep all of these.
