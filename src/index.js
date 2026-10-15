
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  add_transaction,
  list_transactions,
  get_spending_summary,
  set_budget,
  check_budget_status,
  delete_transaction,
} from "./tools.js";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in your .env file.");
  process.exit(1);
}

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});

const userIdSchema = z.number().int().positive().default(1);

const tools = [
  tool(
    args => JSON.stringify(add_transaction(args)),
    {
      name: "add_transaction",
      description:
        "Add an income or expense. Ask the user for the amount or category if missing. Use the date expression provided by the user.",
      schema: z.object({
        user_id: userIdSchema,
        amount: z.number().positive().optional(),
        type: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
        category: z.string().optional(),
        date: z.string().optional(),
        note: z.string().default(""),
      }),
    }
  ),

  tool(
    args => JSON.stringify(list_transactions(args)),
    {
      name: "list_transactions",
      description:
        "List transactions for a user with optional date, category, and type filters.",
      schema: z.object({
        user_id: userIdSchema,
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(["INCOME", "EXPENSE"]).optional(),
      }),
    }
  ),

  tool(
    args => JSON.stringify(get_spending_summary(args)),
    {
      name: "get_spending_summary",
      description:
        "Get monthly expense totals by category and percentage of total spending. Month format: YYYY-MM.",
      schema: z.object({
        user_id: userIdSchema,
        month: z.string().optional(),
      }),
    }
  ),

  tool(
    args => JSON.stringify(set_budget(args)),
    {
      name: "set_budget",
      description:
        "Create or update a monthly category budget. Require a positive amount.",
      schema: z.object({
        user_id: userIdSchema,
        category: z.string(),
        month: z.string().optional(),
        limit_amount: z.number().positive(),
      }),
    }
  ),

  tool(
    args => JSON.stringify(check_budget_status(args)),
    {
      name: "check_budget_status",
      description:
        "Check current spending against monthly budgets and report warnings or overspending.",
      schema: z.object({
        user_id: userIdSchema,
        month: z.string().optional(),
      }),
    }
  ),

  tool(
    args => JSON.stringify(delete_transaction(args)),
    {
      name: "delete_transaction",
      description:
        "Request confirmation before deletion. Never confirm deletion unless the user explicitly agrees to delete that exact transaction.",
      schema: z.object({
        user_id: userIdSchema,
        txn_id: z.number().int().positive(),
        confirm: z.boolean().default(false),
      }),
    }
  ),
];

const agent = createAgent({
  model,
  tools,
  systemPrompt: `
You are PaisaPal, a personal finance assistant.
Always introduce yourself as PaisaPal when a conversation begins.

DEMO USERS:
1 = Sahil
2 = Aarav
3 = Priya

Use user 1 (Sahil) by default. If a user identifies themselves
as Aarav or Priya, use the corresponding user ID.
Never mix users' financial records.

RULES:
- Use finance tools for all database operations.
- Never invent transaction totals or claim a failed operation succeeded.
- Ask follow-up questions if amount or category is missing.
- Amounts must be positive.
- Pizza, lunch, dinner and groceries belong to Food.
- Auto, taxi, cab and bus belong to Travel.
- Movie belongs to Entertainment.
- Convert relative dates such as yesterday and today correctly.
- Never delete a transaction without explicit confirmation.
- Show the transaction details before asking for deletion confirmation.
- Warn at 80% or more of a category budget and clearly alert above 100%.
- Exclude income from expense summaries.
- For month comparisons, retrieve both months using the tools.
- Give three specific saving tips grounded in actual spending.
- Format currency in Indian rupees (₹).
- Never reveal API keys or environment variables.
`,
});

const rl = readline.createInterface({ input, output });
const messages = [];

console.log("\n==================================");
console.log(" PaisaPal - Personal Finance Agent");
console.log("==================================");
console.log("Hi, I'm PaisaPal, your personal finance assistant!");
console.log("Log expenses, set budgets, and understand your spending.");
console.log("Type 'exit' to quit.\n");

try {
  while (true) {
    const question = await rl.question("You: ");
    const text = question.trim();

    if (!text) continue;

    if (["exit", "quit"].includes(text.toLowerCase())) {
      console.log("PaisaPal: Goodbye! Take care of your finances.");
      break;
    }

    messages.push({ role: "user", content: text });

    try {
      const result = await agent.invoke({ messages });
      const responseMessages = result.messages ?? [];

      const lastAIMessage = [...responseMessages]
        .reverse()
        .find(message => message._getType?.() === "ai");

      let answer = "I couldn't generate a response. Please try again.";

      if (lastAIMessage) {
        if (typeof lastAIMessage.content === "string") {
          answer = lastAIMessage.content;
        } else if (Array.isArray(lastAIMessage.content)) {
          answer = lastAIMessage.content
            .filter(part => part.type === "text")
            .map(part => part.text)
            .join("\n");
        }
      }

      console.log(`\nPaisaPal: ${answer}\n`);

      messages.splice(0, messages.length, ...responseMessages);
    } catch (error) {
      console.error("\nAgent error:", error.message);
      messages.pop();
      console.log("Please try again.\n");
    }
  }
} finally {
  rl.close();
}


