// Memberships via Stripe Checkout. Apple Pay (and Google Pay) appear automatically
// on Stripe's hosted Checkout page once enabled in Stripe Dashboard → Settings → Payment methods.
// No STRIPE_SECRET_KEY = demo mode (payments are simulated so you can try the whole flow).
import Stripe from 'stripe';
import { db, save, id } from './db.js';
import { raiseAlert } from './alerts.js';

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const CURRENCY = (process.env.CURRENCY || 'aud').toLowerCase();
const APP = process.env.APP_FULL_NAME || 'Fitplus Well';

export const PLANS = {
  weekly:  { id: 'weekly',  name: 'Weekly',  interval: 'week',  amount: Number(process.env.PRICE_WEEKLY  || 2900),  days: 7 },
  monthly: { id: 'monthly', name: 'Monthly', interval: 'month', amount: Number(process.env.PRICE_MONTHLY || 9900),  days: 30 },
  annual:  { id: 'annual',  name: 'Annual',  interval: 'year',  amount: Number(process.env.PRICE_ANNUAL  || 99900), days: 365 },
};

export const publicPlans = () =>
  Object.values(PLANS).map(({ id, name, interval, amount }) => ({ id, name, interval, amount, currency: CURRENCY }));

// Monthly-equivalent value (cents) for MRR
export const monthlyValue = (planId) => {
  const p = PLANS[planId];
  if (!p) return 0;
  return Math.round({ week: (p.amount * 52) / 12, month: p.amount, year: p.amount / 12 }[p.interval]);
};

export function activate(user, planId, { amount, source = 'stripe', ref, renews } = {}) {
  const p = PLANS[planId] || PLANS.monthly;
  const s = db();
  user.plan = p.id;
  user.subStatus = 'active';
  user.subRenews = renews || new Date(Date.now() + p.days * 864e5).toISOString();
  if (!user.subStartedAt) user.subStartedAt = new Date().toISOString();
  if (!ref || !s.payments.some((x) => x.ref === ref)) {
    s.payments.push({ id: id(), userId: user.id, plan: p.id, amount: amount ?? p.amount, currency: CURRENCY,
      status: 'paid', source, ref: ref || null, createdAt: new Date().toISOString() });
  }
  save();
}

export async function createCheckout(user, planId, origin) {
  const p = PLANS[planId];
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
    client_reference_id: user.id,
    metadata: { userId: user.id, plan: p.id },
    subscription_data: { metadata: { userId: user.id, plan: p.id } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: p.amount,
        recurring: { interval: p.interval },
        product_data: { name: `${APP} ${p.name} Membership` },
      },
    }],
    allow_promotion_codes: true,
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
  });
  return session.url;
}

const periodEnd = (sub) => {
  const end = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : undefined;
};

async function recordSession(user, session) {
  if (session.status !== 'complete') return;
  const sub = typeof session.subscription === 'string'
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription;
  user.stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  user.stripeSubscriptionId = sub?.id;
  activate(user, session.metadata?.plan, { amount: session.amount_total, source: 'stripe', ref: session.id, renews: periodEnd(sub) });
}

// Called on return from Checkout so the account unlocks even before the webhook lands
export async function verifySession(user, sessionId) {
  if (!sessionId) return;
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  if (session.client_reference_id !== user.id) return;
  await recordSession(user, session);
}

export async function portalUrl(user, origin) {
  const p = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${origin}/` });
  return p.url;
}

export async function webhook(req, res) {
  if (!stripe) return res.status(400).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  const s = db();
  const o = event.data.object;
  const findUser = (uid, cust) => s.users.find((u) => uid && u.id === uid) || s.users.find((u) => cust && u.stripeCustomerId === cust);
  const subMeta = o.subscription_details?.metadata || o.parent?.subscription_details?.metadata || o.metadata || {};

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const u = findUser(o.metadata?.userId || o.client_reference_id, o.customer);
        if (u) await recordSession(u, o);
        break;
      }
      case 'invoice.paid': {
        const u = findUser(subMeta.userId, o.customer);
        if (u && o.billing_reason !== 'subscription_create') {
          const end = o.lines?.data?.[0]?.period?.end;
          activate(u, subMeta.plan || u.plan, { amount: o.amount_paid, source: 'stripe', ref: o.id,
            renews: end ? new Date(end * 1000).toISOString() : undefined });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const u = findUser(subMeta.userId, o.customer);
        if (u) {
          u.subStatus = 'past_due';
          s.payments.push({ id: id(), userId: u.id, plan: u.plan, amount: o.amount_due, currency: o.currency, status: 'failed',
            source: 'stripe', ref: o.id, createdAt: new Date().toISOString() });
          raiseAlert(u, 'billing', `${u.name}'s ${u.plan} membership payment failed.`, `billing:${o.id}`);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const u = findUser(o.metadata?.userId, o.customer);
        if (u) { u.subRenews = periodEnd(o) || u.subRenews; if (o.cancel_at_period_end) u.subStatus = 'cancelled'; else if (o.status === 'active') u.subStatus = 'active'; }
        break;
      }
      case 'customer.subscription.deleted': {
        const u = findUser(o.metadata?.userId, o.customer);
        if (u) { u.subStatus = 'cancelled'; u.subRenews = new Date().toISOString(); }
        break;
      }
    }
  } catch (e) {
    console.error('Webhook handling error', e);
    return res.status(500).send('Webhook handler error');
  }
  save();
  res.json({ received: true });
}
