
import db from "./database.js";
import * as chrono from "chrono-node";

const pendingDeletions = new Map();

const categoryAliases = {
  food: "Food",
  pizza: "Food",
  restaurant: "Food",
  lunch: "Food",
  dinner: "Food",
  breakfast: "Food",
  groceries: "Food",
  travel: "Travel",
  auto: "Travel",
  cab: "Travel",
  taxi: "Travel",
  bus: "Travel",
  transport: "Travel",
  rent: "Rent",
  shopping: "Shopping",
  clothes: "Shopping",
  bills: "Bills",
  electricity: "Bills",
  internet: "Bills",
  entertainment: "Entertainment",
  movie: "Entertainment",
  games: "Entertainment",
  other: "Other",
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
}

function validUser(userId) {
  return db.prepare(
    "SELECT user_id, name FROM users WHERE user_id = ?"
  ).get(userId);
}

function resolveCategory(input) {
  if (!input || typeof input !== "string") return null;

  const cleaned = input.trim().toLowerCase();

  // Resolve aliases safely, then validate against the database.
  const name = categoryAliases[cleaned] ?? input.trim();

  return db.prepare(`
    SELECT category_id, name
    FROM categories
    WHERE lower(name) = lower(?)
  `).get(name) ?? null;
}

function resolveDate(dateText) {
  if (!dateText || !String(dateText).trim()) {
    return new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
  }

  const parsed = chrono.parseDate(
    String(dateText),
    new Date(),
    { forwardDate: true }
  );

  if (!parsed) return null;

  // Use the Indian calendar date for relative dates.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function checkBudget(userId, categoryId, month) {
  const budget = db.prepare(`
    SELECT limit_amount
    FROM budgets
    WHERE user_id = ?
      AND category_id = ?
      AND month = ?
  `).get(userId, categoryId, month);

  if (!budget) return null;

  const spent = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE user_id = ?
      AND category_id = ?
      AND type = 'EXPENSE'
      AND substr(txn_date, 1, 7) = ?
  `).get(userId, categoryId, month).total;

  const percentage =
    (spent / budget.limit_amount) * 100;

  let status = "OK";

  if (percentage > 100) {
    status = "OVER_BUDGET";
  } else if (percentage >= 80) {
    status = "WARNING";
  }

  return {
    spent,
    limit: budget.limit_amount,
    percentage: Number(percentage.toFixed(1)),
    status,
  };
}

// 1. ADD TRANSACTION
export function add_transaction({
  user_id = 1,
  amount,
  type = "EXPENSE",
  category,
  date,
  note = "",
} = {}) {
  if (!validUser(user_id)) {
    return { error: "User not found. Please select a valid user." };
  }

  if (
    amount === undefined ||
    amount === null ||
    amount === "" ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0
  ) {
    return { error: "Please provide a valid positive amount." };
  }

  if (!category || !String(category).trim()) {
    return { error: "Which category is this transaction for?" };
  }

  const normalizedType = String(type).toUpperCase();

  if (!["INCOME", "EXPENSE"].includes(normalizedType)) {
    return { error: "Type must be INCOME or EXPENSE." };
  }

  const resolvedCategory = resolveCategory(String(category));

  if (!resolvedCategory) {
    return {
      error:
        "Unknown category. Choose Food, Travel, Rent, Shopping, Bills, Entertainment, or Other.",
    };
  }

  const txnDate = resolveDate(date);

  if (!txnDate) {
    return {
      error:
        "I couldn't understand that date. Please specify a date such as today or yesterday.",
    };
  }

  const result = db.prepare(`
    INSERT INTO transactions
      (user_id, amount, type, category_id, note, txn_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    user_id,
    Number(amount),
    normalizedType,
    resolvedCategory.category_id,
    String(note),
    txnDate
  );

  const response = {
    success: true,
    message: "Transaction saved successfully.",
    transaction: {
      txn_id: Number(result.lastInsertRowid),
      user_id,
      amount: Number(amount),
      type: normalizedType,
      category: resolvedCategory.name,
      note: String(note),
      date: txnDate,
    },
  };

  if (normalizedType === "EXPENSE") {
    const budget = checkBudget(
      user_id,
      resolvedCategory.category_id,
      txnDate.slice(0, 7)
    );

    if (budget) {
      response.budget = budget;

      if (budget.status === "OVER_BUDGET") {
        response.alert =
          `OVER BUDGET ALERT: You've spent ₹${budget.spent} ` +
          `out of ₹${budget.limit} for ${resolvedCategory.name} ` +
          `(${budget.percentage}%). Your budget has been exceeded.`;
      } else if (budget.status === "WARNING") {
        response.alert =
          `BUDGET WARNING: You've used ${budget.percentage}% ` +
          `of your ${resolvedCategory.name} budget ` +
          `(₹${budget.spent} of ₹${budget.limit}).`;
      }
    }
  }

  return response;
}

// 2. LIST TRANSACTIONS
export function list_transactions({
  user_id = 1,
  start_date,
  end_date,
  category,
  type,
} = {}) {
  if (!validUser(user_id)) {
    return { error: "User not found." };
  }

  const conditions = ["t.user_id = ?"];
  const params = [user_id];

  if (start_date) {
    const resolved = resolveDate(start_date);
    if (!resolved) return { error: "Invalid start date." };

    conditions.push("t.txn_date >= ?");
    params.push(resolved);
  }

  if (end_date) {
    const resolved = resolveDate(end_date);
    if (!resolved) return { error: "Invalid end date." };

    conditions.push("t.txn_date <= ?");
    params.push(resolved);
  }

  if (category) {
    const resolved = resolveCategory(category);
    if (!resolved) return { error: "Unknown category." };

    conditions.push("t.category_id = ?");
    params.push(resolved.category_id);
  }

  if (type) {
    const normalized = String(type).toUpperCase();

    if (!["INCOME", "EXPENSE"].includes(normalized)) {
      return { error: "Type must be INCOME or EXPENSE." };
    }

    conditions.push("t.type = ?");
    params.push(normalized);
  }

  const rows = db.prepare(`
    SELECT
      t.txn_id,
      t.amount,
      t.type,
      c.name AS category,
      t.note,
      t.txn_date AS date
    FROM transactions t
    JOIN categories c ON c.category_id = t.category_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY t.txn_date DESC, t.txn_id DESC
  `).all(...params);

  return { count: rows.length, transactions: rows };
}

// 3. GET SPENDING SUMMARY
export function get_spending_summary({
  user_id = 1,
  month = currentMonth(),
} = {}) {
  if (!validUser(user_id)) {
    return { error: "User not found." };
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { error: "Month must use YYYY-MM format." };
  }

  const rows = db.prepare(`
    SELECT
      c.name AS category,
      SUM(t.amount) AS total
    FROM transactions t
    JOIN categories c ON c.category_id = t.category_id
    WHERE t.user_id = ?
      AND t.type = 'EXPENSE'
      AND substr(t.txn_date, 1, 7) = ?
    GROUP BY c.category_id, c.name
    ORDER BY total DESC
  `).all(user_id, month);

  const totalSpending = rows.reduce(
    (sum, row) => sum + row.total,
    0
  );

  return {
    user_id,
    month,
    total_spending: totalSpending,
    categories: rows.map((row) => ({
      category: row.category,
      total: row.total,
      percentage: totalSpending
        ? Number((row.total / totalSpending * 100).toFixed(1))
        : 0,
    })),
  };
}

// 4. SET OR UPDATE BUDGET
export function set_budget({
  user_id = 1,
  category,
  month = currentMonth(),
  limit_amount,
} = {}) {
  if (!validUser(user_id)) {
    return { error: "User not found." };
  }

  if (!category) {
    return { error: "Please specify a budget category." };
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { error: "Month must use YYYY-MM format." };
  }

  if (
    limit_amount === undefined ||
    limit_amount === null ||
    limit_amount === "" ||
    !Number.isFinite(Number(limit_amount)) ||
    Number(limit_amount) <= 0
  ) {
    return { error: "Budget must be a positive amount." };
  }

  const resolved = resolveCategory(category);

  if (!resolved) {
    return { error: "Unknown category." };
  }

  db.prepare(`
    INSERT INTO budgets
      (user_id, category_id, month, limit_amount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, category_id, month)
    DO UPDATE SET limit_amount = excluded.limit_amount
  `).run(
    user_id,
    resolved.category_id,
    month,
    Number(limit_amount)
  );

  return {
    success: true,
    message: "Budget created or updated.",
    user_id,
    category: resolved.name,
    month,
    limit_amount: Number(limit_amount),
  };
}

// 5. CHECK BUDGET STATUS
export function check_budget_status({
  user_id = 1,
  month = currentMonth(),
} = {}) {
  if (!validUser(user_id)) {
    return { error: "User not found." };
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { error: "Month must use YYYY-MM format." };
  }

  const budgets = db.prepare(`
    SELECT
      c.category_id,
      c.name AS category,
      b.limit_amount
    FROM budgets b
    JOIN categories c ON c.category_id = b.category_id
    WHERE b.user_id = ? AND b.month = ?
  `).all(user_id, month);

  const results = budgets.map((budget) => {
    const status = checkBudget(
      user_id,
      budget.category_id,
      month
    );

    return {
      category: budget.category,
      limit: budget.limit_amount,
      spent: status.spent,
      remaining: Number(
        (budget.limit_amount - status.spent).toFixed(2)
      ),
      percentage: status.percentage,
      status: status.status,
    };
  });

  return { user_id, month, budgets: results };
}

// 6. DELETE TRANSACTION: ALWAYS REQUIRE CONFIRMATION
export function delete_transaction({
  user_id = 1,
  txn_id,
  confirm = false,
} = {}) {
  if (!validUser(user_id)) {
    return { error: "User not found." };
  }

  if (
    !Number.isInteger(Number(txn_id)) ||
    Number(txn_id) <= 0
  ) {
    return { error: "Please provide a valid transaction ID." };
  }

  const id = Number(txn_id);

  const transaction = db.prepare(`
    SELECT
      t.txn_id,
      t.amount,
      t.type,
      t.note,
      t.txn_date AS date,
      c.name AS category
    FROM transactions t
    JOIN categories c ON c.category_id = t.category_id
    WHERE t.txn_id = ? AND t.user_id = ?
  `).get(id, user_id);

  if (!transaction) {
    pendingDeletions.delete(`${user_id}:${id}`);
    return { error: "Transaction not found for this user." };
  }

  const key = `${user_id}:${id}`;

  if (!confirm) {
    pendingDeletions.set(key, true);

    return {
      confirmation_required: true,
      message:
        "Are you sure you want to delete this transaction?",
      transaction,
      instruction:
        `Call delete_transaction with txn_id ${id}, ` +
        `user_id ${user_id}, and confirm true only after ` +
        "the user explicitly agrees.",
    };
  }

  if (!pendingDeletions.has(key)) {
    return {
      error:
        "No pending deletion confirmation. Request confirmation first.",
    };
  }

  pendingDeletions.delete(key);

  db.prepare(`
    DELETE FROM transactions
    WHERE txn_id = ? AND user_id = ?
  `).run(id, user_id);

  return {
    success: true,
    message: "Transaction deleted.",
    txn_id: id,
  };
}
