
import {
  add_transaction,
  list_transactions,
  get_spending_summary,
  set_budget,
  check_budget_status,
  delete_transaction,
} from "./tools.js";

console.log("\n1. ADD TRANSACTION");

console.log(add_transaction({
  user_id: 1,
  amount: 250,
  category: "Food",
  date: "yesterday",
  note: "Pizza",
}));

console.log("\n2. LIST TRANSACTIONS");

console.log(list_transactions({
  user_id: 1,
  category: "Food",
  type: "EXPENSE",
}));

console.log("\n3. SPENDING SUMMARY");

console.log(get_spending_summary({
  user_id: 1,
  month: "2026-09",
}));

console.log("\n4. SET BUDGET");

console.log(set_budget({
  user_id: 1,
  category: "Shopping",
  month: "2026-10",
  limit_amount: 3000,
}));

console.log("\n5. CHECK BUDGET STATUS");

console.log(check_budget_status({
  user_id: 1,
  month: "2026-10",
}));

console.log("\n6. DELETE CONFIRMATION TEST");

// Find a transaction belonging to the demo user.
const records = list_transactions({ user_id: 1 });

const firstTransaction = records.transactions[0];

if (firstTransaction) {
  console.log(delete_transaction({
    user_id: 1,
    txn_id: firstTransaction.txn_id,
  }));

  // Deliberately do not confirm deletion.
  console.log("Transaction remains protected until confirmation.");
}
