
import Database from "better-sqlite3";

const db = new Database("paisapal.db");

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    monthly_income REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    category_id INTEGER NOT NULL,
    note TEXT,
    txn_date TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
  );

  CREATE TABLE IF NOT EXISTS budgets (
    budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    limit_amount REAL NOT NULL CHECK (limit_amount > 0),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    UNIQUE (user_id, category_id, month)
  );
`);

const seed = db.transaction(() => {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (user_id, name, monthly_income)
    VALUES (?, ?, ?)
  `);

  [
    [1, "Sahil", 20000],
    [2, "Aarav", 25000],
    [3, "Priya", 30000],
  ].forEach(user => insertUser.run(...user));

  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name) VALUES (?)
  `);

  const categoryNames = [
    "Food",
    "Travel",
    "Rent",
    "Shopping",
    "Bills",
    "Entertainment",
    "Other",
  ];

  categoryNames.forEach(name => insertCategory.run(name));

  const getCategoryId = db.prepare(
    "SELECT category_id FROM categories WHERE name = ?"
  );

  const insertTransaction = db.prepare(`
    INSERT INTO transactions
      (user_id, amount, type, category_id, note, txn_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertBudget = db.prepare(`
    INSERT INTO budgets
      (user_id, category_id, month, limit_amount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, category_id, month)
    DO UPDATE SET limit_amount = excluded.limit_amount
  `);

  // Seed transactions only once.
  const transactionCount = db.prepare(
    "SELECT COUNT(*) AS count FROM transactions"
  ).get().count;

  if (transactionCount === 0) {
    const expenseTemplates = [
      ["Food", 180, "Lunch"],
      ["Food", 250, "Pizza"],
      ["Travel", 120, "Auto fare"],
      ["Shopping", 450, "Clothes"],
      ["Bills", 600, "Internet bill"],
      ["Entertainment", 300, "Movie"],
      ["Rent", 5000, "Rent payment"],
      ["Other", 150, "Miscellaneous"],
      ["Food", 90, "Breakfast"],
      ["Travel", 80, "Bus fare"],
      ["Food", 220, "Dinner"],
      ["Shopping", 350, "Household items"],
    ];

    const demoUsers = [
      { id: 1, income: 20000 },
      { id: 2, income: 25000 },
      { id: 3, income: 30000 },
    ];

    for (const user of demoUsers) {
      // 24 expenses per user, split across two months.
      for (let i = 0; i < 24; i++) {
        const [category, amount, note] =
          expenseTemplates[i % expenseTemplates.length];

        const month = i < 12 ? "2026-08" : "2026-09";
        const day = (i % 12) + 1;
        const date = `${month}-${String(day).padStart(2, "0")}`;

        insertTransaction.run(
          user.id,
          amount + (user.id - 1) * 10,
          "EXPENSE",
          getCategoryId.get(category).category_id,
          note,
          date
        );
      }

      // One income record per month per user.
      for (const month of ["2026-08", "2026-09"]) {
        insertTransaction.run(
          user.id,
          user.income,
          "INCOME",
          getCategoryId.get("Other").category_id,
          "Monthly income",
          `${month}-01`
        );
      }
    }
  }

  // October budgets for all three users.
  const budgetTemplates = [
    ["Food", 4000],
    ["Travel", 2000],
    ["Shopping", 3000],
    ["Entertainment", 1500],
    ["Bills", 2500],
    ["Rent", 8000],
  ];

  for (const userId of [1, 2, 3]) {
    for (const [category, limit] of budgetTemplates) {
      insertBudget.run(
        userId,
        getCategoryId.get(category).category_id,
        "2026-10",
        limit
      );
    }
  }
});

seed();

console.log("PaisaPal database initialized.");
console.log(
  "Users:",
  db.prepare("SELECT COUNT(*) AS count FROM users").get().count
);
console.log(
  "Categories:",
  db.prepare("SELECT COUNT(*) AS count FROM categories").get().count
);
console.log(
  "Transactions:",
  db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count
);
console.log(
  "Budgets:",
  db.prepare("SELECT COUNT(*) AS count FROM budgets").get().count
);

export default db;
