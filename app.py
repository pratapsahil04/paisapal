import os
import json
import sqlite3
from datetime import date, datetime
from calendar import monthrange

import streamlit as st
from openai import OpenAI

APP_TITLE = "PaisaPal"
DB_PATH = os.environ.get("PAISAPAL_DB_PATH", "paisapal_streamlit.db")
CATEGORIES = ["Food", "Travel", "Rent", "Shopping", "Bills", "Entertainment", "Other"]
ALIASES = {
    "pizza": "Food", "restaurant": "Food", "lunch": "Food", "dinner": "Food",
    "breakfast": "Food", "groceries": "Food", "auto": "Travel", "cab": "Travel",
    "taxi": "Travel", "bus": "Travel", "transport": "Travel", "clothes": "Shopping",
    "electricity": "Bills", "internet": "Bills", "movie": "Entertainment", "games": "Entertainment",
}

st.set_page_config(page_title="PaisaPal | Finance Coach", page_icon="💸", layout="wide")

def connect_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with connect_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            monthly_income REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS categories (
            category_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS transactions (
            txn_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),
            category_id INTEGER NOT NULL,
            note TEXT DEFAULT '',
            txn_date TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(user_id),
            FOREIGN KEY(category_id) REFERENCES categories(category_id)
        );
        CREATE TABLE IF NOT EXISTS budgets (
            budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            month TEXT NOT NULL,
            limit_amount REAL NOT NULL CHECK(limit_amount > 0),
            UNIQUE(user_id, category_id, month),
            FOREIGN KEY(user_id) REFERENCES users(user_id),
            FOREIGN KEY(category_id) REFERENCES categories(category_id)
        );
        """)
        # Demo users/categories only. No real financial data is preloaded.
        conn.executemany(
            "INSERT OR IGNORE INTO users(user_id,name,monthly_income) VALUES(?,?,?)",
            [(1, "Sahil", 20000), (2, "Aarav", 25000), (3, "Priya", 30000)]
        )
        conn.executemany(
            "INSERT OR IGNORE INTO categories(name) VALUES(?)",
            [(c,) for c in CATEGORIES]
        )

def current_month():
    return date.today().strftime("%Y-%m")

def resolve_category(value):
    if not value:
        return None
    cleaned = str(value).strip()
    canonical = ALIASES.get(cleaned.lower(), cleaned)
    for category in CATEGORIES:
        if category.lower() == canonical.lower():
            return category
    return None

def category_id(conn, category):
    row = conn.execute("SELECT category_id FROM categories WHERE name=?", (category,)).fetchone()
    return row["category_id"] if row else None

def parse_date(value):
    if not value or str(value).strip().lower() in ("today", "now"):
        return date.today().isoformat()
    text = str(value).strip().lower()
    if text == "yesterday":
        from datetime import timedelta
        return (date.today() - timedelta(days=1)).isoformat()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return None

def money(value):
    return f"₹{float(value or 0):,.2f}"

def budget_status(conn, user_id, category, month):
    cid = category_id(conn, category)
    budget = conn.execute(
        "SELECT limit_amount FROM budgets WHERE user_id=? AND category_id=? AND month=?",
        (user_id, cid, month)
    ).fetchone()
    if not budget:
        return None
    spent = conn.execute(
        """SELECT COALESCE(SUM(amount),0) AS total FROM transactions
           WHERE user_id=? AND category_id=? AND type='EXPENSE' AND substr(txn_date,1,7)=?""",
        (user_id, cid, month)
    ).fetchone()["total"]
    limit_amount = float(budget["limit_amount"])
    percentage = (float(spent) / limit_amount * 100) if limit_amount else 0
    status = "OVER_BUDGET" if percentage > 100 else ("WARNING" if percentage >= 80 else "OK")
    return {"spent": float(spent), "limit": limit_amount, "percentage": round(percentage, 1), "status": status}

def add_transaction(user_id, amount, txn_type, category, txn_date, note=""):
    if amount is None or float(amount) <= 0:
        return {"error": "Amount must be a positive number."}
    if txn_type not in ("INCOME", "EXPENSE"):
        return {"error": "Transaction type must be INCOME or EXPENSE."}
    category = resolve_category(category)
    if not category:
        return {"error": "Choose a valid category: " + ", ".join(CATEGORIES)}
    parsed = parse_date(txn_date)
    if not parsed:
        return {"error": "I couldn't understand that date. Use today, yesterday, or YYYY-MM-DD."}
    with connect_db() as conn:
        cid = category_id(conn, category)
        cur = conn.execute(
            "INSERT INTO transactions(user_id,amount,type,category_id,note,txn_date) VALUES(?,?,?,?,?,?)",
            (user_id, float(amount), txn_type, cid, str(note or ""), parsed)
        )
        result = {
            "success": True, "message": "Transaction saved.",
            "transaction": {"txn_id": cur.lastrowid, "amount": float(amount), "type": txn_type,
                            "category": category, "note": str(note or ""), "date": parsed}
        }
        if txn_type == "EXPENSE":
            budget = budget_status(conn, user_id, category, parsed[:7])
            if budget:
                result["budget"] = budget
                if budget["status"] == "OVER_BUDGET":
                    result["alert"] = f"OVER BUDGET: {category} is at {budget['percentage']}% ({money(budget['spent'])} of {money(budget['limit'])})."
                elif budget["status"] == "WARNING":
                    result["alert"] = f"BUDGET WARNING: {category} is at {budget['percentage']}% ({money(budget['spent'])} of {money(budget['limit'])})."
        return result

def list_transactions(user_id, month=None, category=None, txn_type=None, limit=100):
    query = """SELECT t.txn_id,t.amount,t.type,c.name AS category,t.note,t.txn_date AS date
               FROM transactions t JOIN categories c ON c.category_id=t.category_id
               WHERE t.user_id=?"""
    params = [user_id]
    if month:
        query += " AND substr(t.txn_date,1,7)=?"
        params.append(month)
    if category and category != "All":
        canonical = resolve_category(category)
        if not canonical:
            return []
        query += " AND c.name=?"
        params.append(canonical)
    if txn_type and txn_type != "All":
        query += " AND t.type=?"
        params.append(txn_type)
    query += " ORDER BY t.txn_date DESC,t.txn_id DESC LIMIT ?"
    params.append(int(limit))
    with connect_db() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]

def spending_summary(user_id, month):
    with connect_db() as conn:
        rows = conn.execute(
            """SELECT c.name AS category, SUM(t.amount) AS total
               FROM transactions t JOIN categories c ON c.category_id=t.category_id
               WHERE t.user_id=? AND t.type='EXPENSE' AND substr(t.txn_date,1,7)=?
               GROUP BY c.category_id,c.name ORDER BY total DESC""",
            (user_id, month)
        ).fetchall()
    total = sum(float(r["total"]) for r in rows)
    return {"month": month, "total_spending": total,
            "categories": [{"category": r["category"], "total": float(r["total"]),
                            "percentage": round(float(r["total"]) / total * 100, 1) if total else 0}
                           for r in rows]}

def set_budget(user_id, category, month, limit_amount):
    category = resolve_category(category)
    if not category:
        return {"error": "Choose a valid category: " + ", ".join(CATEGORIES)}
    if float(limit_amount) <= 0:
        return {"error": "Budget must be positive."}
    with connect_db() as conn:
        cid = category_id(conn, category)
        conn.execute(
            """INSERT INTO budgets(user_id,category_id,month,limit_amount) VALUES(?,?,?,?)
               ON CONFLICT(user_id,category_id,month) DO UPDATE SET limit_amount=excluded.limit_amount""",
            (user_id, cid, month, float(limit_amount))
        )
    return {"success": True, "category": category, "month": month, "limit_amount": float(limit_amount)}

def check_budgets(user_id, month):
    with connect_db() as conn:
        rows = conn.execute(
            """SELECT c.name AS category,b.limit_amount FROM budgets b
               JOIN categories c ON c.category_id=b.category_id
               WHERE b.user_id=? AND b.month=? ORDER BY c.name""",
            (user_id, month)
        ).fetchall()
        results = []
        for row in rows:
            status = budget_status(conn, user_id, row["category"], month)
            results.append({
                "category": row["category"], "limit": float(row["limit_amount"]),
                "spent": status["spent"], "remaining": round(float(row["limit_amount"]) - status["spent"], 2),
                "percentage": status["percentage"], "status": status["status"]
            })
    return results

def delete_transaction(user_id, txn_id):
    with connect_db() as conn:
        row = conn.execute(
            """SELECT t.txn_id,t.amount,t.type,c.name AS category,t.note,t.txn_date AS date
               FROM transactions t JOIN categories c ON c.category_id=t.category_id
               WHERE t.txn_id=? AND t.user_id=?""", (int(txn_id), user_id)
        ).fetchone()
    if not row:
        return {"error": "Transaction not found for this user."}
    st.session_state.pending_delete = dict(row)
    return {"confirmation_required": True, "transaction": dict(row)}

TOOLS = [
    {"type":"function","function":{"name":"add_transaction","description":"Record an income or expense. Ask if amount or category is missing. Use a date like today, yesterday, or YYYY-MM-DD.","parameters":{"type":"object","properties":{"amount":{"type":"number","description":"Positive amount in INR"},"type":{"type":"string","enum":["INCOME","EXPENSE"]},"category":{"type":"string","enum":CATEGORIES},"date":{"type":"string"},"note":{"type":"string"}},"required":["amount","type","category"]}}},
    {"type":"function","function":{"name":"list_transactions","description":"List transactions for the selected user, optionally filtered by month/category/type.","parameters":{"type":"object","properties":{"month":{"type":"string","description":"YYYY-MM"},"category":{"type":"string"},"type":{"type":"string","enum":["INCOME","EXPENSE"]},"limit":{"type":"integer"}}}}},
    {"type":"function","function":{"name":"get_spending_summary","description":"Get total monthly expenses and category-wise breakdown. Income is excluded.","parameters":{"type":"object","properties":{"month":{"type":"string","description":"YYYY-MM"}}}}},
    {"type":"function","function":{"name":"set_budget","description":"Create or update a category budget for a month.","parameters":{"type":"object","properties":{"category":{"type":"string","enum":CATEGORIES},"month":{"type":"string","description":"YYYY-MM"},"limit_amount":{"type":"number"}},"required":["category","limit_amount"]}}},
    {"type":"function","function":{"name":"check_budget_status","description":"Show budget spending, remaining amount, percentage and warnings for a month.","parameters":{"type":"object","properties":{"month":{"type":"string","description":"YYYY-MM"}}}}},
    {"type":"function","function":{"name":"delete_transaction","description":"Request deletion of a transaction by ID. The app will require explicit confirmation before deleting.","parameters":{"type":"object","properties":{"txn_id":{"type":"integer"}},"required":["txn_id"]}}},
]

def run_tool(name, args, user_id):
    month = args.get("month") or current_month()
    if name == "add_transaction":
        return add_transaction(user_id, args.get("amount"), args.get("type","EXPENSE"),
                               args.get("category"), args.get("date") or date.today().isoformat(), args.get("note",""))
    if name == "list_transactions":
        return {"transactions": list_transactions(user_id, args.get("month"), args.get("category"),
                                                   args.get("type"), args.get("limit",100))}
    if name == "get_spending_summary":
        return spending_summary(user_id, month)
    if name == "set_budget":
        if args.get("limit_amount") is None:
            return {"error":"Please specify a budget amount."}
        return set_budget(user_id, args.get("category"), month, args["limit_amount"])
    if name == "check_budget_status":
        return {"month":month,"budgets":check_budgets(user_id, month)}
    if name == "delete_transaction":
        return delete_transaction(user_id, args["txn_id"])
    return {"error":"Unknown tool."}

def ask_paisapal(prompt, user_id):
    api_key = st.secrets.get("GROQ_API_KEY", os.getenv("GROQ_API_KEY", ""))
    if not api_key:
        return "Please add GROQ_API_KEY in Streamlit app Secrets before using the AI chat."
    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    messages = [{
        "role":"system",
        "content": f"""You are PaisaPal, a personal finance assistant. Current user ID is {user_id}.
Current month is {current_month()}. Currency is Indian rupees (₹).
Use tools for all database operations. Never invent totals or say an operation succeeded unless a tool confirms it.
Ask a follow-up when amount or category is missing. Amounts must be positive.
Map pizza/lunch/dinner/groceries to Food; auto/taxi/cab/bus to Travel; movies to Entertainment.
Relative dates today/yesterday should be interpreted as calendar dates. Use YYYY-MM when calling month-based tools.
Never delete without showing the transaction and receiving explicit confirmation in the app.
Warn at 80% or more of budget and clearly flag spending above 100%.
For comparisons, call summary for both months and base three saving tips on actual results.
Keep responses concise and friendly."""
    }]
    messages.extend(st.session_state.chat_history[-12:])
    messages.append({"role":"user","content":prompt})
    for _ in range(5):
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0
        )
        message = response.choices[0].message
        if not message.tool_calls:
            answer = message.content or "I couldn't generate a response. Please try again."
            st.session_state.chat_history.append({"role":"user","content":prompt})
            st.session_state.chat_history.append({"role":"assistant","content":answer})
            return answer
        messages.append(message.model_dump(exclude_none=True))
        for call in message.tool_calls:
            try:
                args = json.loads(call.function.arguments or "{}")
                result = run_tool(call.function.name, args, user_id)
            except Exception as exc:
                result = {"error": f"Tool could not complete: {str(exc)}"}
            messages.append({"role":"tool","tool_call_id":call.id,"content":json.dumps(result,ensure_ascii=False)})
    return "I couldn't finish that request in one turn. Please try again."

init_db()

st.markdown("""
<style>
.stApp {background: linear-gradient(135deg, #f7f9fc 0%, #eef3f8 100%);}
.block-container {padding-top: 2rem; max-width: 1200px;}
.hero {padding: 1.3rem 1.5rem; border-radius: 18px; background: #14213d; color: white; margin-bottom: 1rem;}
.hero h1 {margin:0; color:white;}
.hero p {margin:.35rem 0 0 0; color:#dce6f5;}
div[data-testid="stMetric"] {background:white; border:1px solid #e4eaf2; padding:1rem; border-radius:14px;}
</style>
<div class="hero">
<h1>💸 PaisaPal</h1>
<p>Your personal expense tracker and AI budget coach.</p>
</div>
""", unsafe_allow_html=True)

with st.sidebar:
    st.header("Your workspace")
    with connect_db() as conn:
        users = conn.execute("SELECT user_id,name FROM users ORDER BY user_id").fetchall()
    user_labels = {f"{r['name']} (demo user {r['user_id']})": r["user_id"] for r in users}
    selected_label = st.selectbox("Demo profile", list(user_labels.keys()))
    user_id = user_labels[selected_label]
    selected_month = st.text_input("Month (YYYY-MM)", current_month())
    if len(selected_month) != 7 or selected_month[4] != "-":
        st.warning("Use YYYY-MM format, e.g. 2026-10.")
        selected_month = current_month()
    st.caption("Demo app: profiles are not private accounts. Do not enter real sensitive financial data.")

with connect_db() as conn:
    income = conn.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=? AND type='INCOME' AND substr(txn_date,1,7)=?",
        (user_id, selected_month)
    ).fetchone()["total"]
    expenses = conn.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE user_id=? AND type='EXPENSE' AND substr(txn_date,1,7)=?",
        (user_id, selected_month)
    ).fetchone()["total"]
    txn_count = conn.execute(
        "SELECT COUNT(*) AS total FROM transactions WHERE user_id=? AND substr(txn_date,1,7)=?",
        (user_id, selected_month)
    ).fetchone()["total"]

metric1, metric2, metric3, metric4 = st.columns(4)
metric1.metric("Income", money(income))
metric2.metric("Expenses", money(expenses))
metric3.metric("Net balance", money(income-expenses))
metric4.metric("Transactions", int(txn_count))

tab_chat, tab_transactions, tab_budgets, tab_summary = st.tabs(["💬 AI Coach", "🧾 Transactions", "🎯 Budgets", "📊 Insights"])

with tab_chat:
    st.subheader("Talk to PaisaPal")
    st.caption('Try: “Spent ₹250 on pizza yesterday”, “Set my shopping budget to 3000 this month”, or “Am I over budget anywhere?”')
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    for item in st.session_state.chat_history:
        with st.chat_message(item["role"]):
            st.markdown(item["content"])
    prompt = st.chat_input("Ask about expenses, budgets, or saving tips...")
    if prompt:
        with st.chat_message("user"):
            st.markdown(prompt)
        with st.chat_message("assistant"):
            with st.spinner("PaisaPal is checking your finances..."):
                answer = ask_paisapal(prompt, user_id)
            st.markdown(answer)
            if "alert" in answer.lower() or "budget warning" in answer.lower():
                st.warning(answer)
        st.rerun()
    pending = st.session_state.get("pending_delete")
    if pending:
        st.warning(f"Confirm deletion of transaction #{pending['txn_id']}: {pending['type']} {money(pending['amount'])} · {pending['category']} · {pending['date']} · {pending['note']}")
        c1, c2 = st.columns(2)
        if c1.button("Yes, delete this transaction", type="primary"):
            with connect_db() as conn:
                conn.execute("DELETE FROM transactions WHERE txn_id=? AND user_id=?", (pending["txn_id"], user_id))
            st.session_state.pending_delete = None
            st.success("Transaction deleted.")
            st.rerun()
        if c2.button("Cancel deletion"):
            st.session_state.pending_delete = None
            st.info("Deletion cancelled.")
            st.rerun()

with tab_transactions:
    st.subheader("Transactions")
    f1, f2, f3 = st.columns(3)
    filter_category = f1.selectbox("Category", ["All"] + CATEGORIES, key="txn_category")
    filter_type = f2.selectbox("Type", ["All", "EXPENSE", "INCOME"], key="txn_type")
    show_all_months = f3.checkbox("Show all months", value=False)
    rows = list_transactions(user_id, None if show_all_months else selected_month,
                             filter_category, filter_type, 500)
    if rows:
        import pandas as pd
        frame = pd.DataFrame(rows)
        frame["amount"] = frame["amount"].map(lambda x: f"₹{x:,.2f}")
        st.dataframe(frame, use_container_width=True, hide_index=True)
        delete_ids = {f"#{r['txn_id']} · {r['date']} · {r['category']} · {money(r['amount'])}": r["txn_id"] for r in rows}
        chosen = st.selectbox("Choose a transaction to delete", ["Select a transaction"] + list(delete_ids.keys()))
        if chosen != "Select a transaction" and st.button("Request deletion", key="request_delete"):
            result = delete_transaction(user_id, delete_ids[chosen])
            if result.get("confirmation_required"):
                st.session_state.pending_delete = result["transaction"]
                st.info("Review and confirm the deletion in the AI Coach tab.")
    else:
        st.info("No transactions found for these filters.")

    st.markdown("#### Add transaction manually")
    with st.form("add_transaction_form"):
        c1, c2, c3 = st.columns(3)
        amount = c1.number_input("Amount (₹)", min_value=1.0, step=50.0)
        txn_type = c2.selectbox("Type", ["EXPENSE", "INCOME"])
        category = c3.selectbox("Category", CATEGORIES)
        note = st.text_input("Description")
        txn_date = st.date_input("Date", value=date.today())
        submitted = st.form_submit_button("Save transaction")
    if submitted:
        result = add_transaction(user_id, amount, txn_type, category, txn_date.isoformat(), note)
        if result.get("success"):
            st.success("Transaction saved.")
            if result.get("alert"):
                st.warning(result["alert"])
            st.rerun()
        else:
            st.error(result.get("error", "Could not save transaction."))

with tab_budgets:
    st.subheader(f"Budget status · {selected_month}")
    budgets = check_budgets(user_id, selected_month)
    if budgets:
        import pandas as pd
        budget_frame = pd.DataFrame(budgets)
        budget_frame["limit"] = budget_frame["limit"].map(money)
        budget_frame["spent"] = budget_frame["spent"].map(money)
        budget_frame["remaining"] = budget_frame["remaining"].map(money)
        st.dataframe(budget_frame, use_container_width=True, hide_index=True)
        for item in budgets:
            st.write(f"**{item['category']}** · {item['percentage']}% used")
            st.progress(min(max(item["percentage"]/100, 0.0), 1.0))
            if item["status"] == "OVER_BUDGET":
                st.error(f"Over budget by {money(abs(item['remaining']))}.")
            elif item["status"] == "WARNING":
                st.warning("You've used at least 80% of this budget.")
    else:
        st.info("No budgets set for this month yet.")
    st.markdown("#### Create or update a budget")
    with st.form("budget_form"):
        bc1, bc2 = st.columns(2)
        budget_category = bc1.selectbox("Budget category", CATEGORIES)
        budget_limit = bc2.number_input("Monthly limit (₹)", min_value=1.0, step=500.0)
        budget_submit = st.form_submit_button("Save budget")
    if budget_submit:
        result = set_budget(user_id, budget_category, selected_month, budget_limit)
        if result.get("success"):
            st.success(f"{budget_category} budget saved at {money(budget_limit)}.")
            st.rerun()
        else:
            st.error(result["error"])

with tab_summary:
    st.subheader(f"Spending insights · {selected_month}")
    summary = spending_summary(user_id, selected_month)
    st.metric("Total expenses", money(summary["total_spending"]))
    if summary["categories"]:
        import pandas as pd
        chart_data = pd.DataFrame(summary["categories"]).set_index("category")
        st.bar_chart(chart_data["total"])
        display_data = pd.DataFrame(summary["categories"])
        display_data["total"] = display_data["total"].map(money)
        display_data["percentage"] = display_data["percentage"].map(lambda x: f"{x}%")
        st.dataframe(display_data, use_container_width=True, hide_index=True)
    else:
        st.info("No expenses recorded for this month yet.")
    st.caption("The AI Coach can compare months and suggest savings based on recorded transactions.")
