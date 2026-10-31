// Food estimates for the nutrition log.
// With ANTHROPIC_API_KEY: Claude reads the photo and/or description (best accuracy, handles any food).
// Without it: a built-in food table parses descriptions like "2 slices brown bread, butter, 150g chicken with mayo".

// [aliases, kcal/100g, protein, carbs, fat (g/100g), default portion g, unit weights g]
const FOODS = [
  [['wholemeal bread', 'brown bread', 'multigrain bread', 'grain bread', 'rye bread', 'sourdough', 'toast', 'bread'], 247, 13, 41, 3.4, 38, { slice: 38, piece: 38 }],
  [['white bread'], 265, 9, 49, 3.2, 35, { slice: 35, piece: 35 }],
  [['bagel'], 257, 10, 50, 1.6, 100, { piece: 100 }],
  [['croissant'], 406, 8, 46, 21, 60, { piece: 60 }],
  [['wrap', 'tortilla'], 310, 8, 52, 7.5, 60, { piece: 60 }],
  [['crumpet'], 190, 6, 38, 1, 50, { piece: 50 }],
  [['butter', 'margarine'], 717, 0.9, 0.1, 81, 10, { tbsp: 14, tsp: 5, slice: 10 }],
  [['mayonnaise', 'mayo', 'aioli'], 680, 1, 0.6, 75, 15, { tbsp: 14, tsp: 5 }],
  [['chicken breast', 'chicken thigh', 'grilled chicken', 'roast chicken', 'chicken'], 165, 31, 0, 3.6, 150, { piece: 150, breast: 170, fillet: 150, slice: 25 }],
  [['turkey'], 135, 30, 0, 1, 120, { slice: 25 }],
  [['steak', 'beef', 'mince', 'beef mince'], 250, 26, 0, 15, 180, { piece: 200 }],
  [['pork', 'pork chop'], 242, 27, 0, 14, 150, { piece: 150 }],
  [['lamb'], 294, 25, 0, 21, 150, { piece: 150 }],
  [['ham'], 145, 21, 1.5, 6, 40, { slice: 20 }],
  [['bacon'], 541, 37, 1.4, 42, 40, { rasher: 20, slice: 20 }],
  [['sausage', 'snag'], 301, 12, 2, 27, 60, { piece: 60 }],
  [['salmon'], 208, 20, 0, 13, 150, { fillet: 150, piece: 150 }],
  [['tuna'], 116, 26, 0, 1, 95, { can: 95, tin: 95 }],
  [['prawns', 'prawn', 'shrimp'], 99, 24, 0.2, 0.3, 100, {}],
  [['white fish', 'barramundi', 'fish'], 105, 22, 0, 2, 150, { fillet: 150, piece: 150 }],
  [['tofu'], 76, 8, 1.9, 4.8, 150, {}],
  [['eggs', 'egg'], 143, 12.6, 0.7, 9.5, 50, { piece: 50 }],
  [['cheese', 'cheddar', 'tasty cheese'], 402, 25, 1.3, 33, 30, { slice: 20 }],
  [['feta'], 264, 14, 4, 21, 30, {}],
  [['cottage cheese'], 98, 11, 3.4, 4.3, 100, { cup: 225 }],
  [['greek yoghurt', 'greek yogurt', 'yoghurt', 'yogurt'], 97, 9, 3.9, 5, 170, { cup: 245, tub: 170 }],
  [['skim milk'], 35, 3.4, 5, 0.1, 250, { cup: 250, glass: 250 }],
  [['milk'], 64, 3.4, 4.8, 3.6, 250, { cup: 250, glass: 250 }],
  [['flat white', 'latte', 'cappuccino'], 50, 3, 4.5, 2.5, 240, { cup: 240, piece: 240 }],
  [['black coffee', 'long black', 'espresso', 'coffee'], 2, 0.1, 0, 0, 240, { cup: 240 }],
  [['protein shake', 'whey', 'protein powder'], 400, 80, 8, 6, 30, { scoop: 30 }],
  [['protein bar'], 350, 30, 35, 10, 60, { piece: 60 }],
  [['oats', 'rolled oats'], 389, 16.9, 66, 6.9, 40, { cup: 80 }],
  [['porridge', 'oatmeal'], 71, 2.5, 12, 1.5, 250, { bowl: 250, cup: 240 }],
  [['granola', 'muesli'], 471, 10, 64, 20, 60, { cup: 100, bowl: 60 }],
  [['cereal', 'weet-bix', 'weetbix'], 360, 11, 70, 2, 40, { bowl: 40, piece: 17 }],
  [['banana'], 89, 1.1, 23, 0.3, 118, { piece: 118 }],
  [['apple'], 52, 0.3, 14, 0.2, 180, { piece: 180 }],
  [['orange'], 47, 0.9, 12, 0.1, 150, { piece: 150 }],
  [['berries', 'berry', 'blueberries', 'strawberries'], 50, 0.7, 12, 0.3, 100, { cup: 150, handful: 50 }],
  [['avocado', 'avo'], 160, 2, 8.5, 14.7, 75, { piece: 150 }],
  [['white rice', 'brown rice', 'rice'], 130, 2.7, 28, 0.3, 180, { cup: 160, bowl: 200 }],
  [['pasta', 'spaghetti', 'penne', 'noodles'], 158, 5.8, 31, 0.9, 200, { cup: 140, bowl: 250 }],
  [['sweet potato'], 90, 2, 21, 0.2, 170, { piece: 170 }],
  [['potato', 'mashed potato', 'mash'], 87, 1.9, 20, 0.1, 170, { piece: 170, cup: 210 }],
  [['chips', 'fries', 'hot chips'], 312, 3.4, 41, 15, 150, {}],
  [['broccoli'], 34, 2.8, 7, 0.4, 90, { cup: 90 }],
  [['salad', 'lettuce', 'leaves', 'spinach', 'rocket'], 17, 1.2, 3.3, 0.2, 80, { cup: 50, bowl: 150, handful: 30 }],
  [['vegetables', 'veggies', 'veg', 'stir fry vegetables'], 40, 2, 8, 0.3, 150, { cup: 120, bowl: 200 }],
  [['tomato', 'tomatoes'], 18, 0.9, 3.9, 0.2, 120, { piece: 120, slice: 20 }],
  [['carrot'], 41, 0.9, 10, 0.2, 60, { piece: 60 }],
  [['corn'], 96, 3.4, 21, 1.5, 100, { cup: 150, piece: 100 }],
  [['olive oil', 'oil'], 884, 0, 0, 100, 10, { tbsp: 14, tsp: 5 }],
  [['peanut butter'], 588, 25, 20, 50, 16, { tbsp: 16, tsp: 6 }],
  [['almonds', 'nuts', 'cashews', 'walnuts'], 579, 21, 22, 50, 30, { handful: 30, cup: 140 }],
  [['honey'], 304, 0.3, 82, 0, 21, { tbsp: 21, tsp: 7 }],
  [['jam', 'vegemite'], 250, 0.4, 60, 0.1, 15, { tbsp: 20, tsp: 6 }],
  [['hummus'], 166, 8, 14, 10, 30, { tbsp: 15 }],
  [['tomato sauce', 'ketchup', 'bbq sauce', 'sauce'], 112, 1.2, 26, 0.2, 17, { tbsp: 17 }],
  [['pizza'], 266, 11, 33, 10, 214, { slice: 107 }],
  [['burger'], 295, 17, 24, 14, 220, { piece: 220 }],
  [['sandwich', 'sanga'], 250, 12, 30, 9, 200, { piece: 200 }],
  [['sushi'], 150, 6, 28, 1.5, 200, { piece: 30, roll: 200 }],
  [['soup'], 50, 2.5, 6, 1.8, 300, { cup: 250, bowl: 350 }],
  [['smoothie'], 60, 2, 12, 0.8, 400, { glass: 400, cup: 250 }],
  [['orange juice', 'juice'], 45, 0.7, 10, 0.2, 250, { glass: 250, cup: 250 }],
  [['chocolate'], 546, 4.9, 61, 31, 40, { piece: 10, square: 10 }],
  [['beer'], 43, 0.5, 3.6, 0, 375, { glass: 285, can: 375, piece: 375 }],
  [['wine'], 85, 0.1, 2.6, 0, 150, { glass: 150 }],
];

const INDEX = FOODS.flatMap(([aliases, kcal, p, c, f, portion, units]) =>
  aliases.map((alias) => ({ alias, food: { kcal, p, c, f, portion, units } }))).sort((a, b) => b.alias.length - a.alias.length);

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, couple: 2, few: 3 };
const UNITS = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  cup: 'cup', cups: 'cup', tbsp: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  slice: 'slice', slices: 'slice', piece: 'piece', pieces: 'piece', scoop: 'scoop', scoops: 'scoop', handful: 'handful', handfuls: 'handful',
  rasher: 'rasher', rashers: 'rasher', can: 'can', cans: 'can', tin: 'tin', tins: 'tin', serve: 'piece', serves: 'piece', serving: 'piece', servings: 'piece',
  bowl: 'bowl', bowls: 'bowl', glass: 'glass', glasses: 'glass', fillet: 'fillet', fillets: 'fillet', breast: 'breast', breasts: 'breast', tub: 'tub', square: 'square', squares: 'square',
};
const GENERIC = { cup: 240, tbsp: 15, tsp: 5, slice: 30, handful: 30, scoop: 30, rasher: 20, glass: 250, bowl: 250, tub: 170, square: 10 };
const QTY_RE = new RegExp(`\\b(\\d+(?:\\.\\d+)?|\\d+\\/\\d+|${Object.keys(NUMW).join('|')})\\s*(?:of\\s+)?(${Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|')})?\\b`, 'i');
const FILLER = /\b(i had|i ate|i've had|had|ate|for (breakfast|lunch|dinner|tea|snack|a snack)|this morning|tonight|today|some|a bit of|then|also|just)\b/gi;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const r1 = (n) => Math.round(n * 10) / 10;

function parseFragment(raw) {
  const frag = raw.toLowerCase().replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (frag.length < 2) return null;
  const hit = INDEX.find(({ alias }) => new RegExp(`\\b${alias.replace(/[-]/g, '\\-')}(?:s|es)?\\b`).test(frag));
  if (!hit) return { name: cap(frag.slice(0, 60)), quantity: '', grams: null, kcal: null, protein: 0, carbs: 0, fat: 0, unknown: true };

  const { food } = hit;
  const m = frag.match(QTY_RE);
  let grams = food.portion;
  let quantity = '1 serve';
  if (m) {
    const nRaw = m[1].toLowerCase();
    const n = NUMW[nRaw] ?? (nRaw.includes('/') ? nRaw.split('/').reduce((a, b) => Number(a) / Number(b)) : Number(nRaw));
    const unit = m[2] ? UNITS[m[2].toLowerCase()] : null;
    if (unit === 'g' || unit === 'ml') grams = n;
    else if (unit === 'kg' || unit === 'l') grams = n * 1000;
    else if (unit && food.units[unit]) grams = n * food.units[unit];
    else if (unit && GENERIC[unit]) grams = n * GENERIC[unit];
    else grams = n * (food.units.piece || food.units.slice || food.portion);
    const nTxt = n === 0.5 ? '½' : String(+n.toFixed(2));
    quantity = unit === 'g' || unit === 'ml' || unit === 'kg' || unit === 'l' ? `${nTxt} ${unit}` : unit ? `${nTxt} ${m[2].toLowerCase()}` : `× ${nTxt}`;
  }
  const k = grams / 100;
  return { name: cap(hit.alias), quantity, grams: Math.round(grams), kcal: Math.round(food.kcal * k),
    protein: r1(food.p * k), carbs: r1(food.c * k), fat: r1(food.f * k) };
}

export function estimateFromText(text) {
  return String(text || '')
    .split(/,|;|\n|\+|&|\band\b|\bwith\b|\bplus\b|\bthen\b|\balso\b|\bon\b(?=\s+(?:toast|bread|rice|a\b))/i)
    .map(parseFragment)
    .filter(Boolean);
}

export const totals = (items) => items.reduce((t, i) => ({
  kcal: t.kcal + (Number(i.kcal) || 0), protein: r1(t.protein + (Number(i.protein) || 0)),
  carbs: r1(t.carbs + (Number(i.carbs) || 0)), fat: r1(t.fat + (Number(i.fat) || 0)),
}), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

export function guessMeal(text) {
  const t = String(text || '').toLowerCase();
  if (/\bbreakfast|brekkie|this morning\b/.test(t)) return 'breakfast';
  if (/\blunch\b/.test(t)) return 'lunch';
  if (/\b(dinner|tea tonight|supper)\b/.test(t)) return 'dinner';
  if (/\bsnack\b/.test(t)) return 'snack';
  return null;
}

async function estimateAI({ text, image, mime }) {
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: image.toString('base64') } });
  content.push({
    type: 'text',
    text: `Estimate the nutrition of this meal${image ? ' from the photo' : ''}${text ? ` described as: """${String(text).slice(0, 1000)}"""` : ''}.
Use typical Australian portion sizes unless amounts are given. Split it into its separate foods.
Reply with ONLY JSON: {"items":[{"name":string,"quantity":string,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number}],"confidence":"low"|"medium"|"high","notes":string}
"notes" is one short sentence (e.g. assumptions about portion or cooking oil). If there is no food, return {"items":[],"confidence":"low","notes":"No food found"}.`,
  });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 900,
      system: 'You are a sports nutritionist estimating calories and macros for a food diary. Be realistic, not conservative. Output JSON only.',
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const j = await res.json();
  const out = JSON.parse(((j.content || []).map((c) => c.text || '').join('')).match(/\{[\s\S]*\}/)[0]);
  const items = (out.items || []).slice(0, 30).map((i) => ({
    name: cap(String(i.name || 'Food').slice(0, 80)), quantity: String(i.quantity || '').slice(0, 40), grams: null,
    kcal: Math.max(0, Math.round(Number(i.kcal) || 0)), protein: r1(Number(i.protein_g) || 0),
    carbs: r1(Number(i.carbs_g) || 0), fat: r1(Number(i.fat_g) || 0),
  }));
  return { items, engine: 'claude', confidence: out.confidence || 'medium', notes: String(out.notes || '').slice(0, 240) };
}

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function estimate({ text, image, mime }) {
  if (aiEnabled() && (text?.trim() || image)) {
    try { return await estimateAI({ text, image, mime }); } catch (e) { console.warn('AI food estimate failed, using food table:', e.message); }
  }
  if (!text?.trim()) {
    throw Object.assign(new Error('Add a quick description of the meal — automatic photo estimates switch on once an AI key is added.'), { status: 400 });
  }
  const items = estimateFromText(text);
  const unknown = items.filter((i) => i.unknown).length;
  return { items, engine: 'food-table', confidence: unknown ? 'low' : 'medium',
    notes: unknown ? 'Some items weren\'t recognised — enter their calories.' : 'Estimated from standard portion sizes.' };
}

export function sanitizeItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((i) => ({
    name: String(i.name || 'Food').trim().slice(0, 80) || 'Food',
    quantity: String(i.quantity || '').slice(0, 40),
    kcal: Math.min(5000, Math.max(0, Math.round(Number(i.kcal) || 0))),
    protein: Math.min(500, Math.max(0, r1(Number(i.protein) || 0))),
    carbs: Math.min(800, Math.max(0, r1(Number(i.carbs) || 0))),
    fat: Math.min(500, Math.max(0, r1(Number(i.fat) || 0))),
  }));
}
