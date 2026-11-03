/* Sprout — an interactive cooking companion for Satvic Kitchen Companion.
 *
 * Reads the app's own state and helpers (state, recipes, ingredients, find, aggregate,
 * available, quantity, scaledIngredients, scaledStep, people, view) and drives the app
 * through its existing handlers (openRecipe, showSwap, go, showPreferences). Recommendations
 * never change saved meals; only an explicit choice in the day picker does.
 *
 * Replies come from an adapter. With no AI service configured, Sprout uses the local
 * "Guided kitchen help" engine below. To connect an AI endpoint later, add
 *   <meta name="sprout-endpoint" content="/api/sprout">
 * to index.html (the endpoint keeps its own credentials on the server), or call
 *   Sprout.setAdapter(Sprout.adapters.remote('/api/sprout'))
 * The endpoint receives { message, history, context } and returns { text } or
 * { blocks, actions } in the same shape the local engine produces.
 */
(() => {
  'use strict';

  const PREFS_KEY = 'satvic-sprout-v1';          // greeting + hidden; separate from the app's own key
  const CHAT_KEY = 'satvic-sprout-chat-v1';      // this tab's conversation (sessionStorage)
  const ASSET = 'assets/sprout/';
  const SUGGESTIONS = [
    'What can I cook in 20 minutes?',
    'Help me plan my next three meals.',
    'What do I need to buy?',
    'Guide me through my next recipe.',
  ];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const compact = matchMedia('(max-width: 700px)');

  const read = (store, key, fallback) => { try { return { ...fallback, ...JSON.parse(store.getItem(key)) }; } catch { return { ...fallback }; } };
  const write = (store, key, value) => { try { store.setItem(key, JSON.stringify(value)); } catch {} };
  const prefs = read(localStorage, PREFS_KEY, { greeted: false, hidden: false });
  const chat = read(sessionStorage, CHAT_KEY, { messages: [], open: false, minimised: false });
  const savePrefs = () => write(localStorage, PREFS_KEY, prefs);
  const saveChat = () => write(sessionStorage, CHAT_KEY, { ...chat, messages: chat.messages.slice(-40) });

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${path}</svg>`;

  /* ================================================================== *
   *  Context: a snapshot of what the cook has chosen, for any adapter   *
   * ================================================================== */
  function plannedIds() { return state.plan.filter(Boolean); }
  function nextToCook() { return state.plan.find(id => id && !state.planDone.includes(id)) || null; }
  function shoppingSummary() {
    const items = aggregate(), order = ['FRESH PRODUCE', 'PANTRY STAPLES'];
    // same grouping and order as the shopping list page
    const keys = Object.keys(items).sort((a, b) => order.indexOf(ingredients[a].category) - order.indexOf(ingredients[b].category));
    const pantry = keys.filter(k => state.pantry.includes(k));
    const need = keys.filter(k => !state.pantry.includes(k));
    return {
      items, pantry,
      remaining: need.filter(k => !state.bought.includes(k)),
      bought: need.filter(k => state.bought.includes(k)),
      line: k => `${ingredients[k].name} — ${quantity(k, items[k])}`,
    };
  }
  function context() {
    const shop = shoppingSummary();
    return {
      page: view,
      household: state.servings, maxActiveMinutes: state.time, nutFree: state.nutFree,
      plan: state.plan.map((id, i) => ({ day: i + 1, id, name: find(id)?.name ?? null, cooked: !!id && state.planDone.includes(id) })),
      shopping: {
        toBuy: shop.remaining.map(shop.line),
        bought: shop.bought.map(k => ingredients[k].name),
        inPantry: shop.pantry.map(k => ingredients[k].name),
      },
      cookedAllTime: state.cooked.map(id => find(id)?.name).filter(Boolean),
      recipes: recipes.map(r => ({ id: r.id, name: r.name, minutes: r.time, category: r.category, nuts: r.nuts })),
    };
  }

  /* ================================================================== *
   *  Local adapter: "Guided kitchen help"                               *
   * ================================================================== */
  const norm = s => ` ${String(s).toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const has = (text, ...words) => words.some(w => text.includes(` ${w} `) || (w.includes(' ') && text.includes(w)));

  const RECIPE_ALIASES = {
    khichdi: ['golden khichdi', 'moong khichdi', 'golden moong khichdi'],
    chickpea: ['chickpea bowl', 'rainbow bowl'],
    soup: ['tomato soup', 'tomato basil soup', 'tomato and basil soup'],
    millet: ['millet bowl', 'garden bowl'],
    stew: ['stew', 'coconut stew', 'vegetable stew'],
    noodles: ['noodles', 'sesame noodles', 'veggie noodles'],
    'pumpkin-soup': ['pumpkin soup', 'pumpkin ginger soup'],
    'carrot-soup': ['carrot soup', 'carrot cumin soup'],
    'spinach-corn': ['sweetcorn soup', 'corn soup', 'spinach soup', 'spinach corn soup'],
    'cucumber-salad': ['cucumber salad', 'cucumber coconut salad'],
    'beetroot-salad': ['beetroot salad', 'beet salad', 'beetroot carrot salad'],
    'millet-upma': ['upma', 'millet upma'],
    'lauki-khichdi': ['lauki khichdi', 'lauki moong khichdi', 'bottle gourd khichdi'],
    'cashew-curry': ['curry', 'cashew curry', 'vegetable curry', 'cashew vegetable curry'],
  };
  const INGREDIENT_ALIASES = {
    moong: ['moong', 'moong dal', 'dal', 'lentils'], rice: ['rice', 'brown rice'], carrot: ['carrot', 'carrots'],
    spinach: ['spinach'], cumin: ['cumin'], turmeric: ['turmeric'], lemon: ['lemon', 'lemons'],
    chickpea: ['chickpea', 'chickpeas', 'chana'], cucumber: ['cucumber', 'cucumbers'], tomato: ['tomato', 'tomatoes'],
    coriander: ['coriander', 'cilantro'], basil: ['basil'], pepper: ['black pepper'], millet: ['millet'],
    peas: ['peas', 'green peas'], ginger: ['ginger'], coconut: ['coconut milk', 'coconut'], beans: ['beans', 'green beans'],
    cashew: ['cashew', 'cashews'], noodles: ['wheat noodles'], sesame: ['sesame'], pumpkin: ['pumpkin'],
    freshcoconut: ['coconut', 'fresh coconut'], mint: ['mint'], beetroot: ['beetroot', 'beet', 'beets'],
    corn: ['corn', 'sweetcorn'], lauki: ['lauki', 'bottle gourd'], curryleaves: ['curry leaves'], bellpepper: ['bell pepper', 'capsicum'],
  };

  function recipeMentions(text) {
    const hits = [];
    for (const r of recipes) {
      const aliases = [norm(r.name).trim(), ...(RECIPE_ALIASES[r.id] || [])];
      const best = Math.max(0, ...aliases.filter(a => text.includes(` ${a} `)).map(a => a.length));
      if (best) hits.push({ id: r.id, score: best });
    }
    hits.sort((a, b) => b.score - a.score);
    // keep only the strongest matches ("lauki khichdi" beats plain "khichdi")
    return hits.filter(h => h.score === hits[0]?.score).map(h => h.id);
  }
  function ingredientMentions(text) {
    return Object.keys(INGREDIENT_ALIASES).filter(k => INGREDIENT_ALIASES[k].some(a => text.includes(` ${a} `)));
  }
  function minutesAsked(text) {
    const m = text.match(/ (\d{1,3}) ?(min|mins|minute|minutes) /);
    if (m) return Number(m[1]);
    if (has(text, 'half an hour', 'half hour')) return 30;
    if (has(text, 'an hour', 'one hour')) return 60;
    return null;
  }
  const nutsOff = t => state.nutFree || has(t, 'no nuts', 'nut free', 'without nuts', 'no cashews');
  const allowed = (limit, nutFree) => recipes.filter(r => r.time <= limit && (!nutFree || !r.nuts));
  const sharedWithPlan = r => Object.keys(r.ingredients).filter(k => plannedIds().some(id => id !== r.id && find(id).ingredients[k])).length;

  // building blocks for replies
  const text = t => ({ type: 'text', text: t });
  const list = items => ({ type: 'list', items });
  const note = t => ({ type: 'note', text: t });
  const recipeList = (ids, why) => ({ type: 'recipes', items: ids.map(id => ({ id, why: why ? why(find(id)) : '' })) });
  const act = (type, label, extra = {}) => ({ type, label, ...extra });

  function prefsLine() {
    return `${people(state.servings)}, up to ${state.time} minutes${state.nutFree ? ', no nuts' : ''}`;
  }

  const intents = [
    { name: 'greeting', test: t => /^ (hi|hello|hey|namaste|good (morning|afternoon|evening)) /.test(t), run: () => ({
      blocks: [text(`Hello! I'm here whenever you need a hand. I can see you're cooking for ${prefsLine()}.`)],
      suggestions: SUGGESTIONS,
    }) },
    { name: 'thanks', test: t => has(t, 'thanks', 'thank you', 'thank u', 'ty'), run: () => ({
      blocks: [text('You’re very welcome. Happy cooking! 🌱')],
    }) },
    { name: 'health', test: t => has(t, 'calorie', 'calories', 'protein', 'nutrition', 'nutrients', 'vitamin', 'vitamins', 'diabetes', 'diabetic', 'weight', 'disease', 'cure', 'medical', 'medicine', 'pregnant', 'pregnancy'), run: () => ({
      blocks: [
        text('I don’t have nutrition or health information for these recipes, and I can’t give medical advice. The recipes here are illustrative.'),
        text('Each recipe does flag nuts, wheat and sesame in its preparation note. Please check ingredients against your household’s needs.'),
      ],
      actions: [act('preferences', 'Adjust my preferences')],
    }) },
    { name: 'allergy', test: t => has(t, 'allergy', 'allergic', 'allergies', 'gluten', 'wheat') || (has(t, 'nut', 'nuts') && !minutesAsked(t) && !has(t, 'quick', 'fast', 'recipe', 'recipes', 'soup', 'salad', 'plan')), run: t => {
      const nutRecipes = recipes.filter(r => r.nuts).map(r => r.name);
      const blocks = [text(`Recipes with nuts: ${nutRecipes.join(', ')}. ${state.nutFree ? 'Your “recipes without nuts” preference is on, so I leave those out of suggestions.' : 'You can hide them from suggestions with the “recipes without nuts” preference.'}`)];
      if (has(t, 'gluten', 'wheat')) blocks.push(text('Sesame veggie noodles contains wheat. Other allergens are noted in each recipe’s preparation note, but I can’t confirm anything beyond what the recipes say.'));
      return { blocks, actions: [act('preferences', 'Adjust my preferences')] };
    } },
    { name: 'progress', test: t => has(t, 'progress', 'small wins', 'wins', 'how am i doing', 'how many have i cooked', 'achievements', 'streak', 'cooked so far'), run: () => {
      const planned = plannedIds(), done = planned.filter(id => state.planDone.includes(id));
      const blocks = [text(state.cooked.length
        ? `You’ve cooked ${state.cooked.length} ${state.cooked.length === 1 ? 'recipe' : 'recipes'} so far, and ${done.length} of ${planned.length} meals in this plan. That’s lovely progress.`
        : 'No meals marked as cooked yet. Your first small win is one recipe away.')];
      const next = nextToCook();
      if (next) blocks.push(text(`Next up in your plan: ${find(next).name}.`));
      return { blocks, actions: [act('see-wins', 'See my small wins', { primary: true }), ...(next ? [act('start-cooking', 'Start cooking', { id: next })] : [])] };
    } },
    { name: 'pantry-cook', test: t => has(t, 'use up', 'leftover', 'leftovers') || (has(t, 'pantry', 'already have', 'i have', 'got') && has(t, 'cook', 'make', 'recipe', 'recipes')), run: t => {
      const named = ingredientMentions(t);
      const have = named.length ? named : state.pantry;
      if (!have.length) return {
        blocks: [text('I don’t know what’s in your kitchen yet. Mark ingredients as “Have it” on your shopping list, or tell me an ingredient, like “What can I make with spinach?”')],
        actions: [act('view-shopping', 'View shopping list')],
      };
      const ranked = allowed(45, state.nutFree)
        .map(r => ({ r, n: Object.keys(r.ingredients).filter(k => have.includes(k)).length }))
        .filter(x => x.n).sort((a, b) => b.n - a.n || a.r.time - b.r.time).slice(0, 4);
      if (!ranked.length) return { blocks: [text(`None of the recipes use ${have.map(k => ingredients[k].name.toLowerCase()).join(' or ')}${state.nutFree ? ' within your no-nuts preference' : ''}.`)], suggestions: SUGGESTIONS.slice(0, 2) };
      return {
        blocks: [text(named.length ? 'These recipes use what you mentioned:' : 'Based on the ingredients you’ve marked as already at home:'),
          recipeList(ranked.map(x => x.r.id), r => { const n = ranked.find(x => x.r === r).n; return `uses ${n} ${n === 1 ? 'thing' : 'things'} you have`; })],
      };
    } },
    { name: 'shopping', test: t => has(t, 'buy', 'shop', 'shopping', 'groceries', 'grocery', 'list', 'purchase', 'store', 'market') || (has(t, 'need') && has(t, 'ingredients', 'get')), run: () => {
      const planned = plannedIds();
      if (!planned.length) return { blocks: [text('Your plan is empty, so there’s nothing to buy yet. Choose a few meals first.')], actions: [act('open-plan', 'Open my meal plan', { primary: true })] };
      const shop = shoppingSummary();
      const blocks = [];
      if (!shop.remaining.length) blocks.push(text(`You’re all set: everything for your ${planned.length} meals is bought or already at home. 🌿`));
      else {
        blocks.push(text(`For ${planned.length} ${planned.length === 1 ? 'meal' : 'meals'} for ${people(state.servings)}, you still need ${shop.remaining.length} ${shop.remaining.length === 1 ? 'item' : 'items'}:`));
        const lines = shop.remaining.map(shop.line);
        blocks.push(list(lines.length > 10 ? [...lines.slice(0, 9), `…and ${lines.length - 9} more on your list`] : lines));
      }
      const extras = [];
      if (shop.bought.length) extras.push(`${shop.bought.length} already bought`);
      if (shop.pantry.length) extras.push(`${shop.pantry.length} in your pantry (${shop.pantry.map(k => ingredients[k].name).slice(0, 4).join(', ')}${shop.pantry.length > 4 ? '…' : ''})`);
      if (extras.length) blocks.push({ type: 'text', text: `Also: ${extras.join('; ')}.`, muted: true });
      blocks.push({ type: 'text', text: 'Shared ingredients are combined. Water and seasoning aren’t included.', muted: true });
      return { blocks, actions: [act('view-shopping', 'View shopping list', { primary: true })] };
    } },
    { name: 'guide', test: t => has(t, 'guide', 'walk me', 'step by step', 'steps', 'how do i make', 'how to make', 'how do i cook', 'how to cook', 'start cooking', 'next recipe', 'help me cook', 'lets cook', 'cook now'), run: t => {
      const named = recipeMentions(t);
      if (named.length > 1) return { blocks: [text('Which one would you like to make?'), recipeList(named)] };
      const id = named[0] || nextToCook() || plannedIds()[0];
      if (!id) return { blocks: [text('There’s nothing in your plan to cook yet. Pick a recipe and I’ll guide you through it.')], actions: [act('open-plan', 'Open my meal plan', { primary: true })], suggestions: [SUGGESTIONS[0]] };
      return guideStart(id);
    } },
    { name: 'quick', test: t => minutesAsked(t) !== null || has(t, 'quick', 'quickly', 'fast', 'hurry', 'short on time', 'busy', 'no time', 'easy'), run: t => {
      const asked = minutesAsked(t);
      const limit = asked ?? Math.min(state.time, 20);
      const noNuts = nutsOff(t);
      const fits = allowed(limit, noNuts).sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
      if (!fits.length) {
        const quickest = allowed(45, noNuts).sort((a, b) => a.time - b.time)[0];
        return { blocks: [text(`Nothing here takes ${limit} minutes or less${noNuts ? ' without nuts' : ''}. The quickest is ${quickest.name} at ${quickest.time} minutes.`), recipeList([quickest.id])] };
      }
      const shown = fits.slice(0, 4);
      const blocks = [text(`${fits.length === 1 ? 'One recipe fits' : `${fits.length} recipes fit`} in ${limit} minutes of active cooking${noNuts ? ', all without nuts' : ''}${fits.length > shown.length ? '. Here are the quickest:' : ':'}`), recipeList(shown.map(r => r.id))];
      if (asked && asked > state.time) blocks.push({ type: 'text', text: `That’s more than your ${state.time}-minute preference, so I’ve included longer recipes this time.`, muted: true });
      if (shown.some(r => /soak/i.test(r.prep))) blocks.push({ type: 'text', text: 'Times are active cooking. Soaking or other preparation is extra where a recipe notes it.', muted: true });
      return { blocks, actions: fits.length > shown.length ? [act('view-recipes', 'Explore all recipes')] : [] };
    } },
    { name: 'plan', test: t => has(t, 'plan', 'planning', 'next three meals', 'next 3 meals', 'meal ideas', 'what should i cook', 'what should i make', 'what should i eat', 'suggest', 'recommend', 'dinner', 'lunch', 'this week', 'swap', 'change my', 'add'), run: t => {
      const named = recipeMentions(t);
      if (named.length) return { blocks: [text(named.length > 1 ? 'Which one should go in your plan?' : 'Happy to — choose the day it should go on. If that day already has a meal, the two swap places, so nothing is duplicated.'), recipeList(named)] };
      const blocks = [];
      const days = state.plan.map((id, i) => `Day ${i + 1}: ${id ? find(id).name + (state.planDone.includes(id) ? ' ✓ cooked' : '') : 'nothing chosen yet'}`);
      blocks.push(text(`Here’s your plan for ${prefsLine()}:`), list(days));
      const ideas = available().filter(r => !state.plan.includes(r.id))
        .sort((a, b) => sharedWithPlan(b) - sharedWithPlan(a) || a.time - b.time).slice(0, 3);
      if (ideas.length) {
        blocks.push(text(state.plan.includes(null) ? 'To fill the open day, these fit your preferences:' : 'If you’d like a change, these fit your preferences and share ingredients with your plan:'));
        blocks.push(recipeList(ideas.map(r => r.id), r => { const n = sharedWithPlan(r); return n ? `shares ${n} ${n === 1 ? 'ingredient' : 'ingredients'} with your plan` : ''; }));
        blocks.push({ type: 'text', text: 'Nothing changes until you choose a day.', muted: true });
      } else blocks.push(text('Every recipe that fits your preferences is already in your plan.'));
      return { blocks, actions: [act('open-plan', 'Open my meal plan', { primary: true })] };
    } },
    { name: 'preferences', test: t => has(t, 'preferences', 'preference', 'settings', 'how many people', 'servings', 'household', 'portion', 'portions', 'time limit'), run: () => ({
      blocks: [text(`You’re cooking for ${prefsLine()}. Quantities in recipes and on your shopping list are scaled for ${people(state.servings)}.`)],
      actions: [act('preferences', 'Adjust my preferences')],
    }) },
    { name: 'recipe', test: t => recipeMentions(t).length > 0, run: t => {
      const ids = recipeMentions(t);
      if (ids.length > 1) return { blocks: [text('I found a few — which one did you mean?'), recipeList(ids)] };
      const r = find(ids[0]);
      const slot = state.plan.indexOf(r.id);
      return {
        blocks: [
          recipeList([r.id]),
          text(`${r.desc} ${r.time} minutes of active cooking, for ${people(state.servings)}.${slot >= 0 ? ` It’s in your plan for Day ${slot + 1}.` : ''}`),
          note(`A little preparation: ${r.prep}`),
          { type: 'text', text: `You’ll need: ${scaledIngredients(r).map(i => `${i.name.toLowerCase()} (${i.amount})`).join(', ')}.`, muted: true },
        ],
        actions: [act('start-cooking', 'Guide me through it', { id: r.id, guide: true, primary: true })],
      };
    } },
    { name: 'ingredient', test: t => ingredientMentions(t).length > 0, run: t => {
      const keys = ingredientMentions(t);
      const matches = allowed(45, nutsOff(t)).filter(r => keys.some(k => r.ingredients[k]));
      const label = keys.map(k => ingredients[k].name.toLowerCase()).join(' or ');
      if (!matches.length) return { blocks: [text(`None of the recipes${state.nutFree ? ' without nuts' : ''} use ${label}.`)], suggestions: SUGGESTIONS.slice(0, 2) };
      return { blocks: [text(`Recipes with ${label}:`), recipeList(matches.slice(0, 5).map(r => r.id))], actions: matches.length > 5 ? [act('view-recipes', 'Explore all recipes')] : [] };
    } },
    { name: 'category', test: t => has(t, 'soup', 'soups', 'salad', 'salads', 'khichdi', 'bowl', 'bowls', 'comfort', 'fresh'), run: t => {
      const want = has(t, 'soup', 'soups') ? r => /soup/i.test(r.name) : has(t, 'salad', 'salads') ? r => /salad/i.test(r.name)
        : has(t, 'khichdi') ? r => /khichdi/i.test(r.name) : has(t, 'comfort') ? r => r.category === 'Comfort bowls'
        : has(t, 'fresh') ? r => r.category === 'Quick & fresh' : r => /bowl/i.test(r.name);
      const matches = allowed(45, nutsOff(t)).filter(want);
      return matches.length ? { blocks: [text('Here’s what I found:'), recipeList(matches.slice(0, 5).map(r => r.id))] }
        : { blocks: [text('I couldn’t find a recipe like that in the collection.')], suggestions: SUGGESTIONS.slice(0, 2) };
    } },
    { name: 'next', test: t => has(t, 'next', 'what now', 'what should i do', 'where do i start', 'help'), run: () => {
      if (view === 'shopping') return intents.find(i => i.name === 'shopping').run(norm(''));
      if (view === 'progress') return intents.find(i => i.name === 'progress').run(norm(''));
      const id = nextToCook();
      return id ? { blocks: [text(`Your next meal is ${find(id).name}. Want me to guide you through it?`)], actions: [act('start-cooking', 'Guide me through it', { id, guide: true, primary: true }), act('view-recipe', 'View recipe', { id })] }
        : { blocks: [text('Your plan is all cooked or empty. Shall we plan the next few meals?')], suggestions: [SUGGESTIONS[1]] };
    } },
  ];

  function guideStart(id) {
    const r = find(id);
    return {
      blocks: [
        text(`Let’s make ${r.name} for ${people(state.servings)}. It takes about ${r.time} minutes of active cooking.`),
        note(`Before you start: ${r.prep}`),
        { type: 'list', items: scaledIngredients(r).map(i => `${i.name} — ${i.amount}`), title: 'What you’ll need' },
        { type: 'step', label: `Step 1 of ${r.steps.length}`, text: scaledStep(r.steps[0]) },
      ],
      actions: [act('next-step', 'Next step', { id, step: 1, primary: true }), act('start-cooking', 'Start cooking', { id })],
    };
  }
  function guideStep(id, i) {
    const r = find(id), last = i === r.steps.length - 1;
    return {
      blocks: [
        { type: 'step', label: `Step ${i + 1} of ${r.steps.length}`, text: scaledStep(r.steps[i]) },
        ...(last ? [text('That’s the last step. When you’ve finished, open the recipe and tap “I cooked this!” to save your small win.')] : []),
      ],
      actions: last ? [act('start-cooking', 'Start cooking', { id, primary: true, label2: 'Open recipe to finish' })]
        : [act('next-step', 'Next step', { id, step: i + 1, primary: true }), act('start-cooking', 'Start cooking', { id })],
    };
  }

  const LocalKitchenGuide = {
    id: 'local',
    label: 'Guided kitchen help',
    async reply({ message }) {
      const t = norm(message);
      const intent = intents.find(i => i.test(t));
      if (intent) return intent.run(t);
      return {
        blocks: [text('I’m not sure I can help with that yet. I know this kitchen’s recipes, your plan, your shopping list and your progress — try one of these:')],
        suggestions: SUGGESTIONS,
      };
    },
  };

  /* Remote adapter for a future AI endpoint. Replies are checked against the
     actual recipes and allowed actions before anything is shown. */
  const ACTIONS = new Set(['view-recipe', 'choose-day', 'open-plan', 'view-shopping', 'start-cooking', 'see-wins', 'next-step', 'preferences', 'view-recipes']);
  function sanitizeReply(data) {
    const blocks = Array.isArray(data?.blocks) ? data.blocks : [{ type: 'text', text: String(data?.text ?? '') }];
    return {
      blocks: blocks.filter(b => b && typeof b === 'object').map(b => b.type === 'recipes'
        ? { type: 'recipes', items: (b.items || []).filter(x => find(x?.id)).map(x => ({ id: x.id, why: String(x.why ?? '') })) }
        : { type: ['text', 'list', 'note', 'step'].includes(b.type) ? b.type : 'text', text: String(b.text ?? ''), label: b.label ? String(b.label) : undefined, items: Array.isArray(b.items) ? b.items.map(String) : undefined, muted: !!b.muted }),
      actions: (data?.actions || []).filter(a => ACTIONS.has(a?.type) && (!a.id || find(a.id))).map(a => ({ type: a.type, label: String(a.label || a.type), id: a.id, step: Number.isInteger(a.step) ? a.step : undefined, primary: !!a.primary })),
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 4).map(String) : undefined,
    };
  }
  const RemoteKitchenAI = endpoint => ({
    id: 'remote',
    label: 'AI kitchen help',
    async reply({ message, history, context: ctx }) {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history, context: ctx }) });
      if (!res.ok) throw new Error(`Sprout endpoint returned ${res.status}`);
      return sanitizeReply(await res.json());
    },
  });

  const endpoint = document.querySelector('meta[name="sprout-endpoint"]')?.content;
  let adapter = endpoint ? RemoteKitchenAI(endpoint) : LocalKitchenGuide;

  /* ================================================================== *
   *  Markup                                                             *
   * ================================================================== */
  const layer = (name, cls = name) => `<img class="sprout-layer-${cls}" src="${ASSET}${name}.png" alt="" draggable="false">`;
  const root = document.createElement('div');
  root.className = 'sprout';
  root.id = 'sprout';
  root.innerHTML = `
    <div class="sprout-bubble" id="sprout-bubble" role="region" aria-label="Message from Sprout" hidden></div>
    <section class="sprout-panel" id="sprout-panel" role="dialog" aria-modal="false" aria-labelledby="sprout-title" hidden>
      <header class="sprout-head">
        <span class="sprout-avatar" aria-hidden="true"><img src="${ASSET}full.png" alt=""></span>
        <div class="sprout-title"><h2 id="sprout-title" tabindex="-1">Sprout <span>· Your kitchen companion</span></h2><span class="sprout-mode" id="sprout-mode"></span></div>
        <button type="button" class="sprout-minimise" aria-label="Minimise chat" aria-expanded="true" aria-controls="sprout-log">${svg('<path d="M5 12h14"/>')}</button>
        <button type="button" class="sprout-close" aria-label="Close chat">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
      </header>
      <div class="sprout-log" id="sprout-log" role="log" aria-live="off" aria-label="Conversation with Sprout" tabindex="0"></div>
      <form class="sprout-compose" autocomplete="off">
        <label class="sr-only" for="sprout-input">Ask Sprout a question</label>
        <input id="sprout-input" name="message" type="text" placeholder="Ask about meals, shopping or cooking…" enterkeyhint="send" maxlength="300">
        <button type="submit" disabled>Send</button>
      </form>
    </section>
    <div class="sprout-dock">
      <button type="button" class="sprout-button" aria-label="Chat with Sprout, your kitchen companion" aria-expanded="false" aria-controls="sprout-panel">
        <span class="sprout-art" aria-hidden="true"><span class="sprout-body">${layer('arm')}${layer('body')}${layer('leaves')}<span class="sprout-eyes">${layer('eye-left')}${layer('eye-right')}</span></span></span>
      </button>
      <button type="button" class="sprout-hide" aria-label="Hide Sprout">×</button>
    </div>
    <div class="sr-only" role="status" aria-live="polite" id="sprout-live"></div>`;
  document.body.appendChild(root);

  const $ = sel => root.querySelector(sel);
  const panel = $('#sprout-panel'), log = $('#sprout-log'), form = $('.sprout-compose'), input = $('#sprout-input'),
    sendBtn = form.querySelector('[type=submit]'), mascot = $('.sprout-button'), bubble = $('#sprout-bubble'), live = $('#sprout-live');

  // "Bring back Sprout" lives with the footer shortcuts once Sprout is hidden.
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.className = 'sprout-restore';
  restore.textContent = 'Bring back Sprout';
  document.querySelector('.footer-links')?.appendChild(restore);

  const announce = msg => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 60); };
  const setMode = () => { $('#sprout-mode').textContent = adapter.label; };
  setMode();

  /* ================================================================== *
   *  Animation states                                                   *
   * ================================================================== */
  function play(cls, ms) {
    root.classList.remove(cls);
    void root.offsetWidth;            // restart the animation if it is already running
    root.classList.add(cls);
    clearTimeout(play[cls]);
    play[cls] = setTimeout(() => root.classList.remove(cls), reduceMotion.matches ? 0 : ms);
  }
  const wave = () => play('is-waving', 1700);
  const celebrateAnim = () => play('is-celebrating', 1300);
  mascot.addEventListener('focus', () => { if (!mascot.matches(':focus-visible')) return; mascot.classList.remove('is-hello'); void mascot.offsetWidth; mascot.classList.add('is-hello'); });
  mascot.addEventListener('animationend', () => mascot.classList.remove('is-hello'));

  /* ================================================================== *
   *  Rendering messages                                                 *
   * ================================================================== */
  function recipeItem({ id, why }) {
    const r = find(id); if (!r) return '';
    const slot = state.plan.indexOf(id);
    const meta = [`${r.time} min`, r.category, r.nuts ? 'contains nuts' : '', slot >= 0 ? `in your plan · Day ${slot + 1}` : ''].filter(Boolean).join(' · ');
    return `<li class="sprout-recipe"><img src="assets/${r.image}.jpg" alt="" loading="lazy"><div>
      <strong>${esc(r.name)}</strong><small>${esc(meta)}${why ? `<br>${esc(why)}` : ''}</small>
      <div class="sprout-actions">${actionButton({ type: 'view-recipe', label: 'View recipe', id })}${actionButton({ type: 'choose-day', label: 'Choose a day', id })}</div></div></li>`;
  }
  function actionButton(a) {
    return `<button type="button" class="sprout-action${a.primary ? ' is-primary' : ''}" data-sprout-action="${esc(a.type)}"${a.id ? ` data-id="${esc(a.id)}"` : ''}${a.step != null ? ` data-step="${a.step}"` : ''}${a.guide ? ' data-guide="1"' : ''}>${esc(a.label2 || a.label)}</button>`;
  }
  function renderReply(reply) {
    const blocks = (reply.blocks || []).map(b => {
      if (b.type === 'list') return `${b.title ? `<p><strong>${esc(b.title)}</strong></p>` : ''}<ul>${(b.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
      if (b.type === 'recipes') return `<ul class="sprout-recipes">${b.items.map(recipeItem).join('')}</ul>`;
      if (b.type === 'note') return `<p class="sprout-note">${esc(b.text)}</p>`;
      if (b.type === 'step') return `<div class="sprout-step"><b>${esc(b.label)}</b>${esc(b.text)}</div>`;
      return `<p${b.muted ? ' class="sprout-muted"' : ''}>${esc(b.text)}</p>`;
    }).join('');
    const actions = reply.actions?.length ? `<div class="sprout-actions">${reply.actions.map(actionButton).join('')}</div>` : '';
    const sugg = reply.suggestions?.length ? `<div class="sprout-suggestions is-inline">${reply.suggestions.map(s => `<button type="button" class="sprout-suggestion" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
    return blocks + actions + sugg;
  }
  const plain = reply => (reply.blocks || []).map(b => b.type === 'recipes' ? b.items.map(x => find(x.id)?.name).join(', ')
    : b.type === 'list' ? (b.items || []).join(', ') : `${b.label ? b.label + ': ' : ''}${b.text || ''}`).join(' ').slice(0, 400);

  function messageHTML(m) {
    if (m.from === 'user') return `<div class="sprout-msg from-user">${esc(m.text)}</div>`;
    return `<div class="sprout-msg from-sprout">${renderReply(m.reply)}</div>`;
  }
  function emptyState() {
    const next = nextToCook();
    return `<div class="sprout-empty">
      <h3>Hi, I’m Sprout 🌱</h3>
      <p class="sprout-intro">I know this kitchen’s ${recipes.length} recipes, your plan and your shopping list. You’re cooking for ${esc(prefsLine())}${next ? `, and ${esc(find(next).name)} is next` : ''}.</p>
      <div class="sprout-suggestions">${SUGGESTIONS.map(s => `<button type="button" class="sprout-suggestion" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </div>`;
  }
  function renderLog() {
    log.innerHTML = chat.messages.length ? chat.messages.map(messageHTML).join('') : emptyState();
    log.scrollTop = log.scrollHeight;
  }
  function appendMessage(m) {
    chat.messages.push(m);
    saveChat();
    if (log.querySelector('.sprout-empty')) log.innerHTML = '';
    log.insertAdjacentHTML('beforeend', messageHTML(m));
    const last = log.lastElementChild;
    if (m.from === 'sprout') last.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    else log.scrollTop = log.scrollHeight;
  }

  /* ================================================================== *
   *  Conversation                                                       *
   * ================================================================== */
  let busy = false;
  async function ask(message, { echo = true } = {}) {
    message = message.trim();
    if (!message || busy) return;
    busy = true;
    form.querySelector('[type=submit]').disabled = true;
    log.querySelector('.sprout-error')?.remove();
    if (echo) appendMessage({ from: 'user', text: message });
    log.insertAdjacentHTML('beforeend', '<div class="sprout-thinking" aria-hidden="true"><i></i><i></i><i></i></div>');
    log.scrollTop = log.scrollHeight;
    root.classList.add('is-thinking');
    announce('Sprout is thinking…');
    try {
      const history = chat.messages.slice(-10).map(m => ({ from: m.from, text: m.from === 'user' ? m.text : plain(m.reply) }));
      const started = Date.now();
      const reply = await adapter.reply({ message, history, context: context() });
      const wait = 450 - (Date.now() - started);  // a short, visible beat so the reply doesn't feel abrupt
      if (wait > 0 && !reduceMotion.matches) await new Promise(r => setTimeout(r, wait));
      log.querySelector('.sprout-thinking')?.remove();
      appendMessage({ from: 'sprout', reply });
      announce(`Sprout: ${plain(reply)}`);
    } catch (err) {
      log.querySelector('.sprout-thinking')?.remove();
      log.insertAdjacentHTML('beforeend', `<div class="sprout-error" role="alert"><span>Sorry, I couldn’t answer just now.</span><button type="button" class="sprout-action" data-retry="${esc(message)}">Retry</button></div>`);
      log.scrollTop = log.scrollHeight;
    } finally {
      root.classList.remove('is-thinking');
      busy = false;
      sendBtn.disabled = !input.value.trim();
    }
  }
  function sproutSays(reply) {
    appendMessage({ from: 'sprout', reply });
    announce(`Sprout: ${plain(reply)}`);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const value = input.value;
    input.value = '';
    sendBtn.disabled = true;
    ask(value);
  });
  input.addEventListener('input', () => { sendBtn.disabled = busy || !input.value.trim(); });

  /* ================================================================== *
   *  Actions inside replies — wired to the app's own handlers          *
   * ================================================================== */
  function runAction(type, id, step, guide) {
    const leavePanel = () => { if (compact.matches) minimise(true); };
    switch (type) {
      case 'view-recipe': return find(id) && openRecipe(id);
      case 'choose-day': return find(id) && showSwap(0, id);           // the cook picks the day; nothing changes until then
      case 'start-cooking':
        if (guide) return sproutSays(guideStart(id));
        return find(id) && openRecipe(id);
      case 'next-step': return sproutSays(guideStep(id, step));
      case 'open-plan': leavePanel(); go('plan'); return setTimeout(() => document.getElementById('meal-plan')?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' }), 80);
      case 'view-shopping': leavePanel(); return go('shopping');
      case 'see-wins': leavePanel(); return go('progress');
      case 'view-recipes': leavePanel(); return go('recipes');
      case 'preferences': return showPreferences();
    }
  }
  root.addEventListener('click', e => {
    const el = e.target.closest('button');
    if (!el || !root.contains(el)) return;
    if (el.dataset.sproutAction) return runAction(el.dataset.sproutAction, el.dataset.id, Number(el.dataset.step), !!el.dataset.guide);
    if (el.dataset.ask) return ask(el.dataset.ask);
    if (el.dataset.retry != null) return ask(el.dataset.retry, { echo: false });
  });

  /* ================================================================== *
   *  Panel: open / minimise / close                                     *
   * ================================================================== */
  function open() {
    hideBubble(true);
    chat.open = true; chat.minimised = false; saveChat();
    panel.hidden = false;
    panel.classList.remove('is-minimised');
    $('.sprout-minimise').setAttribute('aria-expanded', 'true');
    $('.sprout-minimise').setAttribute('aria-label', 'Minimise chat');
    mascot.setAttribute('aria-expanded', 'true');
    mascot.setAttribute('aria-label', 'Close chat with Sprout');
    root.classList.add('is-chatting');
    renderLog();
    untuck();
    // On touch screens, don't pop the keyboard up uninvited; land on the title instead.
    (finePointer.matches ? input : $('#sprout-title')).focus({ preventScroll: true });
  }
  function minimise(toggle) {
    const min = toggle === true ? true : !panel.classList.contains('is-minimised');
    panel.classList.toggle('is-minimised', min);
    chat.minimised = min; saveChat();
    const btn = $('.sprout-minimise');
    btn.setAttribute('aria-expanded', String(!min));
    btn.setAttribute('aria-label', min ? 'Expand chat' : 'Minimise chat');
    btn.innerHTML = min ? svg('<path d="M6 15l6-6 6 6"/>') : svg('<path d="M5 12h14"/>');
    root.classList.toggle('is-chatting', !min);
    if (!min) { log.scrollTop = log.scrollHeight; if (finePointer.matches) input.focus({ preventScroll: true }); }
    else if (root.contains(document.activeElement) && !btn.contains(document.activeElement) && document.activeElement !== btn) btn.focus({ preventScroll: true });
  }
  function close({ focus = true } = {}) {
    chat.open = false; saveChat();
    panel.hidden = true;
    mascot.setAttribute('aria-expanded', 'false');
    mascot.setAttribute('aria-label', 'Chat with Sprout, your kitchen companion');
    root.classList.remove('is-chatting', 'is-keyboard');
    if (focus) mascot.focus({ preventScroll: true });
    checkCollision();
  }
  mascot.addEventListener('click', () => {
    if (root.classList.contains('is-tucked')) { untuck(true); }
    if (panel.hidden) open();
    else if (panel.classList.contains('is-minimised')) minimise(false);
    else close();
  });
  $('.sprout-minimise').addEventListener('click', () => minimise());
  $('.sprout-close').addEventListener('click', () => close());
  root.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!bubble.hidden) { e.stopPropagation(); hideBubble(); mascot.focus(); return; }
    if (!panel.hidden && panel.contains(e.target)) { e.stopPropagation(); close(); }
  });

  /* ================================================================== *
   *  Hide / restore                                                     *
   * ================================================================== */
  function applyHidden() {
    root.hidden = prefs.hidden;
    restore.hidden = !prefs.hidden;
  }
  $('.sprout-hide').addEventListener('click', () => {
    prefs.hidden = true; prefs.greeted = true; savePrefs();
    close({ focus: false });
    hideBubble(true);
    applyHidden();
    (typeof toast === 'function') && toast('Sprout is resting. Bring Sprout back from the page footer anytime.');
    document.getElementById('content')?.focus({ preventScroll: true });
  });
  restore.addEventListener('click', () => {
    prefs.hidden = false; savePrefs();
    applyHidden();
    wave();
    mascot.focus({ preventScroll: true });
    (typeof toast === 'function') && toast('Sprout is back. 🌱');
  });

  /* ================================================================== *
   *  Welcome bubble + celebration bubble                                *
   * ================================================================== */
  let bubbleTimer;
  function showBubble(html, { autoHide = 0, label = 'Message from Sprout' } = {}) {
    if (!panel.hidden) return;
    bubble.innerHTML = `<button type="button" class="sprout-bubble-close" aria-label="Dismiss message">×</button>${html}`;
    bubble.setAttribute('aria-label', label);
    bubble.hidden = false;
    untuck();
    clearTimeout(bubbleTimer);
    if (autoHide) bubbleTimer = setTimeout(() => hideBubble(true), autoHide);
  }
  function hideBubble(silent) {
    if (bubble.hidden) return;
    bubble.hidden = true;
    if (bubble.dataset.kind === 'welcome') { prefs.greeted = true; savePrefs(); }
    bubble.dataset.kind = '';
    if (!silent) mascot.focus({ preventScroll: true });
    checkCollision();
  }
  bubble.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el) return;
    if (el.classList.contains('sprout-bubble-close') || el.dataset.bubble === 'later') { hideBubble(); return; }
    if (el.dataset.bubble === 'chat') { hideBubble(true); open(); return; }
    if (el.dataset.bubble === 'wins') { hideBubble(true); go('progress'); }
  });
  function welcome() {
    if (prefs.greeted || prefs.hidden) return;
    showBubble(`<p>Hi, I’m Sprout 🌱 Need a little help in your kitchen?</p>
      <div class="sprout-bubble-actions"><button type="button" class="button primary" data-bubble="chat">Yes, let’s chat</button><button type="button" class="button outline" data-bubble="later">Not now</button></div>`, { label: 'Sprout says hello' });
    bubble.dataset.kind = 'welcome';
    wave();
    announce('Sprout says: Hi, I’m Sprout. Need a little help in your kitchen?');
  }

  /* After "I cooked this!" the recipe dialog is still open over Sprout, so the
     celebration waits for it to close. */
  let pendingCelebration = null;
  document.addEventListener('kitchen:cooked', e => { pendingCelebration = e.detail.id; if (!document.querySelector('dialog[open]')) celebrate(); });
  document.getElementById('recipe-dialog')?.addEventListener('close', () => setTimeout(() => { if (pendingCelebration && !document.querySelector('dialog[open]')) celebrate(); }, 120));
  function celebrate() {
    const r = find(pendingCelebration); pendingCelebration = null;
    if (!r || prefs.hidden) return;
    celebrateAnim();
    const planned = plannedIds(), done = planned.filter(id => state.planDone.includes(id)).length;
    const progress = planned.includes(r.id) ? `${done} of ${planned.length} planned meals cooked.` : `${state.cooked.length} ${state.cooked.length === 1 ? 'recipe' : 'recipes'} cooked so far.`;
    if (!panel.hidden && !panel.classList.contains('is-minimised')) {
      sproutSays({ blocks: [text(`You made ${r.name}! 🎉 That’s a small win worth noticing. ${progress}`)], actions: [act('see-wins', 'See my small wins', { primary: true })] });
    } else {
      showBubble(`<p>You made ${esc(r.name)}! 🎉 ${esc(progress)}</p>${view === 'progress' ? '' : '<div class="sprout-bubble-actions"><button type="button" class="button primary" data-bubble="wins">See my small wins</button></div>'}`, { autoHide: 7000, label: 'Sprout celebrates' });
      announce(`Sprout says: You made ${r.name}! ${progress}`);
    }
  }

  /* ================================================================== *
   *  Never cover controls: tuck aside when something tappable is below  *
   * ================================================================== */
  const INTERACTIVE = 'button,a[href],input,select,textarea,label,summary,[role="button"],[tabindex]:not([tabindex="-1"])';
  let manualUntuckUntil = 0, raf = 0, focusInside = false;
  function homeRect() {
    const r = root.getBoundingClientRect();
    const w = parseFloat(getComputedStyle(root).getPropertyValue('--sprout-w')) || 90;
    const h = w * 298 / 360;
    return { left: r.right - w, right: r.right, top: r.bottom - h, bottom: r.bottom, width: w, height: h };
  }
  function overlapsControl() {
    const r = homeRect();
    for (let ix = 0; ix < 4; ix++) for (let iy = 0; iy < 4; iy++) {
      const x = r.left + 4 + ix * (r.width - 8) / 3, y = r.top + 4 + iy * (r.height - 8) / 3;
      for (const el of document.elementsFromPoint(x, y)) {
        if (root.contains(el)) continue;
        if (el.closest(INTERACTIVE)) return true;
        break;                                   // only the topmost page element matters
      }
    }
    return false;
  }
  function setTuck(on) {
    if (on) {
      // Leave a small tab inside the page gutter, so even the tab sits beside the content.
      const content = document.querySelector('.content')?.getBoundingClientRect();
      const gutter = content ? innerWidth - content.right : 20;
      const visible = Math.max(12, Math.min(34, gutter - 4));
      const r = homeRect();
      root.style.setProperty('--tuck-x', `${Math.max(0, innerWidth - visible - r.left)}px`);
    }
    root.classList.toggle('is-tucked', on);
    mascot.setAttribute('aria-label', panel.hidden ? (on ? 'Sprout is tucked aside. Chat with Sprout, your kitchen companion' : 'Chat with Sprout, your kitchen companion') : 'Close chat with Sprout');
  }
  function checkCollision() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (root.hidden || !panel.hidden || !bubble.hidden || focusInside || Date.now() < manualUntuckUntil) { setTuck(false); return; }
      setTuck(overlapsControl());
    });
  }
  function untuck(manual) { if (manual) manualUntuckUntil = Date.now() + 2500; setTuck(false); }
  // Reaching Sprout by mouse or keyboard slides it back out, so its controls are never off-screen.
  const dock = $('.sprout-dock');
  dock.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') untuck(true); });
  dock.addEventListener('focusin', () => { focusInside = true; untuck(); });
  dock.addEventListener('focusout', () => { focusInside = false; manualUntuckUntil = Date.now() + 1500; setTimeout(checkCollision, 1600); });
  addEventListener('scroll', checkCollision, { passive: true });
  addEventListener('resize', checkCollision);
  document.addEventListener('kitchen:render', checkCollision);
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', checkCollision));
  addEventListener('load', checkCollision);

  /* ================================================================== *
   *  Phone keyboard: keep the input visible above it (iOS doesn't resize *
   *  the layout for the keyboard; Android does via interactive-widget)   *
   * ================================================================== */
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onViewport = () => {
      const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
      const typing = !panel.hidden && kb > 120 && panel.contains(document.activeElement);
      root.classList.toggle('is-keyboard', typing);
      root.style.setProperty('--sprout-kb', typing ? `${kb}px` : '0px');
      root.style.setProperty('--sprout-vh', `${vv.height}px`);
      if (typing) log.scrollTop = log.scrollHeight;
    };
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
    input.addEventListener('blur', () => setTimeout(onViewport, 50));
  }

  /* ================================================================== *
   *  Start                                                              *
   * ================================================================== */
  applyHidden();
  if (chat.open && !prefs.hidden) { open(); if (chat.minimised) minimise(true); document.activeElement?.blur(); }
  else setTimeout(welcome, 1200);
  checkCollision();

  window.Sprout = {
    open, close, minimise: () => minimise(true), ask,
    setAdapter(a) { adapter = a; setMode(); },
    adapters: { local: LocalKitchenGuide, remote: RemoteKitchenAI },
  };
})();
