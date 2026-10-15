# PaisaPal - Personal Expense & Budget Coach

PaisaPal is an AI-powered personal finance assistant that helps users record income and expenses using natural language, manage monthly budgets, and understand their spending habits.

Instead of entering every transaction manually, users can type messages such as "Spent 250 on pizza yesterday." PaisaPal interprets the request, categorizes the transaction, stores it in an SQLite database, and provides useful spending insights.

## Features

- **Natural Language Expense Tracking:** Record expenses and income using plain English.
- **Transaction Management:** Add, list, filter, and request deletion of transactions.
- **Automatic Date Interpretation:** Understand relative dates such as today and yesterday.
- **Monthly Spending Summary:** Calculate total expenses and category-wise spending percentages.
- **Budget Management:** Create or update monthly budgets for different categories.
- **Budget Alerts:** Warn users when spending reaches 80% of a budget and clearly flag spending above 100%.
- **Spending Comparison:** Compare spending between months and generate practical saving tips.
- **Multiple Users:** Maintain separate users, transactions, and budgets.
- **Deletion Confirmation:** Require explicit confirmation before deleting a transaction.

## Technology Stack

- **Runtime:** Node.js
- **Programming Language:** JavaScript (ES Modules)
- **AI Model Provider:** Groq
- **Agent Framework:** LangChain
- **Database:** SQLite
- **Database Library:** better-sqlite3
- **Date Parsing:** chrono-node
- **Environment Variables:** dotenv

## Database Design

PaisaPal uses four main database tables.

### 1. users
Stores user information, including user ID, name, and monthly income.

### 2. categories
Stores the expense categories:
- Food
- Travel
- Rent
- Shopping
- Bills
- Entertainment
- Other

### 3. transactions
Stores transaction IDs, user IDs, amounts, transaction types, categories, notes, and dates.

Transaction types are `INCOME` and `EXPENSE`.

### 4. budgets
Stores each user's category-wise monthly budget, including the month and spending limit.

## Project Structure

```text
paisapal/
├── src/
│   ├── database.js
│   ├── tools.js
│   ├── index.js
│   ├── test-db.js
│   ├── check-transactions.js
│   ├── verify-summary.js
│   ├── inspect-months.js
│   └── fix-seed-dates.js
├── .env
├── .gitignore
├── package.json
└── README.md
```

The verification and inspection scripts are development utilities. They are not required to run the main agent.

## Installation and Setup

### Prerequisites

- Node.js installed
- npm installed
- A Groq API key

### 1. Install dependencies

Open a terminal in the project directory and run:

```bash
npm install
```

### 2. Configure the API key

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Replace the placeholder with your own API key. Never publish your real API key or commit the `.env` file to GitHub.

### 3. Initialize the database

Run:

```bash
node src/database.js
```

This initializes the database tables and seeds the demo data when the transaction table is empty.

### 4. Start PaisaPal

Run:

```bash
node src/index.js
```

The assistant introduces itself as PaisaPal and accepts natural-language requests at the `You:` prompt.

Type `exit` to quit.

## Mandatory Test Prompts

Use the following prompts to test the application.

### Test 1: Add transactions

```text
Spent 250 on pizza yesterday and 120 on an auto today.
```

Expected behavior: PaisaPal identifies the amounts, maps pizza to Food and auto to Travel, interprets the dates, and records the transactions.

### Test 2: Monthly spending summary

```text
How much did I spend on food this month?
```

Expected behavior: Return the monthly Food total and its share of total expenses.

### Test 3: Set a budget

```text
Set my shopping budget to 3000 for this month.
```

Expected behavior: Create or update the Shopping budget for the current month.

### Test 4: Check budget status

```text
Am I over budget anywhere?
```

Expected behavior: Show category-wise budget limits, spending, remaining amounts, percentages, and status.

### Test 5: Compare monthly spending

```text
Compare my spending this month with last month and give me 3 saving tips.
```

Expected behavior: Compare the two months and provide three practical saving tips based on the spending data.

## Budget Rules

- Transaction amounts must be positive.
- Missing amounts or categories should be clarified instead of guessed.
- Relative dates should be interpreted as calendar dates.
- Spending at or above 80% of a budget triggers a warning.
- Spending above 100% triggers an over-budget alert.
- A transaction must not be deleted without explicit user confirmation.

## Verification

The development database was verified to contain:
- 3 users
- 7 categories
- 81 transactions
- 18 budget records

The five mandatory prompts were exercised during development. Additional checks covered missing transaction details, negative amounts, deletion confirmation, budget warnings, and over-budget alerts.

## Future Improvements

- Add recurring expense support for rent and subscriptions.
- Build a user interface with category-wise spending charts.
- Add more advanced spending analytics.
- Improve transaction editing and duplicate detection.

## Author

Developed as a personal expense and budget coaching agent using JavaScript, LangChain, Groq, and SQLite.