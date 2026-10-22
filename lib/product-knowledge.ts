export const productKnowledge = {
  name: "FlowDesk",
  category: "AI helpdesk software",
  targetCustomer: "Small businesses with 2 to 50 employees",
  description:
    "FlowDesk brings customer emails, WhatsApp messages, and chat messages into one shared inbox. It can auto-reply to common questions.",
  benefits: [
    "Faster replies",
    "Fewer missed messages",
    "A 24/7 AI assistant",
  ],
  trial: {
    free: true,
    durationDays: 14,
    creditCardRequired: false,
  },
  demo: {
    durationMinutes: 20,
    booking: "A live walkthrough booked through the FlowDesk team",
  },
  guardrails: [
    "Pricing and plan details are unconfirmed. Do not quote a price or describe a plan; offer a team follow-up.",
    "Security and data-handling details are not provided. Do not make security claims; offer a team follow-up.",
    "For any fact not listed here, say the FlowDesk team can follow up. Never guess.",
  ],
} as const;

export const productFactsForBot = [
  `Product: ${productKnowledge.name}, ${productKnowledge.category}.`,
  `Target customers: ${productKnowledge.targetCustomer}.`,
  productKnowledge.description,
  `Benefits: ${productKnowledge.benefits.join(", ")}.`,
  `Trial: ${productKnowledge.trial.durationDays}-day free trial; no credit card required.`,
  `Demo: ${productKnowledge.demo.durationMinutes}-minute live walkthrough, booked through the FlowDesk team.`,
  ...productKnowledge.guardrails,
].join("\n");
