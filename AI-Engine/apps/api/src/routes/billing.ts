import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";

import { createStripe } from "@tfn/integrations";
import { stripeEvents, subscriptions } from "@tfn/db";

import { env } from "../config/env.js";
import { parseBody } from "../utils/validation.js";

export async function billingRoutes(app: FastifyInstance) {
  const stripe = createStripe(env.STRIPE_SECRET_KEY);

  app.post("/checkout", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseBody(
      z.object({
        plan: z.enum(["pro", "team"]),
      }),
      request.body,
    );
    if (!stripe) {
      return reply.code(503).send({ error: "stripe_not_configured" });
    }
    const price = body.plan === "pro" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_TEAM;
    if (!price) {
      return reply.code(503).send({ error: "stripe_price_not_configured" });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: request.user!.email,
      client_reference_id: request.user!.id,
      line_items: [{ price, quantity: 1 }],
      success_url: `${env.WEB_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.WEB_APP_URL}/billing/cancel`,
      metadata: {
        userId: request.user!.id,
        plan: body.plan,
      },
    });
    return { url: session.url };
  });

  app.post("/portal", { preHandler: app.requireAuth }, async (request, reply) => {
    if (!stripe) {
      return reply.code(503).send({ error: "stripe_not_configured" });
    }
    const [subscription] = await app.db.select().from(subscriptions).where(eq(subscriptions.userId, request.user!.id)).limit(1);
    if (!subscription?.stripeCustomerId) {
      return reply.code(404).send({ error: "stripe_customer_not_found" });
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${env.WEB_APP_URL}/billing`,
    });
    return { url: portal.url };
  });

  app.post("/webhook", async (request, reply) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: "stripe_webhook_not_configured" });
    }

    const signature = request.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      return reply.code(400).send({ error: "missing_signature" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(String(request.rawBody ?? ""), signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      request.log.warn({ error }, "stripe_webhook_signature_failed");
      return reply.code(400).send({ error: "invalid_signature" });
    }

    await app.db.insert(stripeEvents).values({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> }).onConflictDoNothing();
    await handleStripeEvent(app, event);
    await app.db.update(stripeEvents).set({ processedAt: new Date() }).where(eq(stripeEvents.id, event.id));
    return { received: true };
  });
}

async function handleStripeEvent(app: FastifyInstance, event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan === "team" ? "team" : "pro";
    if (userId && session.customer) {
      await app.db
        .insert(subscriptions)
        .values({
          userId,
          plan,
          status: "active",
          stripeCustomerId: String(session.customer),
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            plan,
            status: "active",
            stripeCustomerId: String(session.customer),
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
            updatedAt: new Date(),
          },
        });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await app.db
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
  }
}
