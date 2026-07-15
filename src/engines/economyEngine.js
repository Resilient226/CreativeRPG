// THE ECONOMY ENGINE — pure income/expense/goal math. No React, no rendering.
// Same contract as every other engine here: same input, same output, every time.

/**
 * Sums a finance log into income and expenses. Pure: same log in, same totals out.
 */
export function computeFinanceTotals(financeLog = []) {
  const income = financeLog.filter(f => f.type === "income").reduce((s, f) => s + Number(f.amount || 0), 0);
  const expenses = financeLog.filter(f => f.type === "expense").reduce((s, f) => s + Number(f.amount || 0), 0);
  return { income, expenses };
}

/**
 * Normalizes the core fields of a new finance entry. Deliberately does NOT assign an
 * id or timestamp — those are identity/storage concerns the caller owns (same
 * boundary as buildPersonProfile in relationshipEngine.js), not something a pure
 * data-in/data-out function should generate itself.
 */
export function buildFinanceEntry({ desc, amount, type }) {
  return { desc: (desc || "").trim(), amount: Number(amount) || 0, type: type === "expense" ? "expense" : "income" };
}

/**
 * Logging an income entry moves the Mission goal forward — this is that one rule,
 * named and testable, instead of inlined at the one call site that happens to need it.
 */
export function applyIncomeToGoal(goal, amount) {
  return { ...goal, current: goal.current + Number(amount || 0) };
}

/**
 * The exact inverse — removing a previously-logged income entry backs the goal off
 * by the same amount, floored at 0 so a deletion can never push it negative.
 */
export function removeIncomeFromGoal(goal, amount) {
  return { ...goal, current: Math.max(0, goal.current - Number(amount || 0)) };
}
