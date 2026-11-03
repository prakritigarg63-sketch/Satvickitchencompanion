# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS and vanilla JavaScript with no framework and no build step. The prototype lives in `dist/`: `index.html`, `style.css` (base), `editorial.css` (the editorial layout and a readability layer, loaded after the base), `app.js`, `credits.html` and `assets/`. Fonts load from Google Fonts. All state is kept in the browser's `localStorage` under the key `satvic-kitchen-concept-v1`.

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
- Data stays on the device. There are no accounts, sync or backend.

## Capabilities and Constraints

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
- Reset demo restores the default state.

**Terminology:**
- *My meal plan*, *Explore recipes*, *Shopping list*, *My small wins*
- *Cook this*, *Swap*, *Refresh my plan*, *Make shopping simple*
- *Have it / Need it*, *I cooked this!*

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
- **Voice:** warm, gentle, encouraging and unhurried. Small, everyday framing, as in this shipped copy:
  - "A little planning. A lot of goodness."
  - "Your kitchen, a little calmer."
  - "Goodness grows one meal at a time."
  - "No perfect streaks needed. Just your next good meal."

  Celebrate small wins and never guilt the cook.
- Recipes and photos are always labelled *illustrative*.

## Evidence on Hand

- Fourteen illustrative recipes in `dist/app.js`. They are independent examples, not official Satvic Movement recipes.
- Fifteen photos in `dist/assets/`, credited in `dist/credits.html`:
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
