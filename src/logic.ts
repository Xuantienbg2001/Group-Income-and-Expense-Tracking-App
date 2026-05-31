export interface Expense {
  paidBy: string;
  amount: number;
  splitFor: string[];
}

export interface EqualSplitResult {
  sharePerPerson: number;
  shares: Record<string, number>;
  debts: { from: string; to: string; amount: number }[];
}

function buildEqualShares(amount: number, members: string[]): Record<string, number> {
  const count = members.length;
  const baseShare = Math.floor(amount / count);
  const remainder = amount - baseShare * count;
  const shares: Record<string, number> = {};

  members.forEach((member, index) => {
    shares[member] = baseShare + (index < remainder ? 1 : 0);
  });

  return shares;
}

export const calculateGroupBalances = (expenses: Expense[], members: string[]) => {
  const balances: Record<string, number> = {};
  members.forEach((member) => {
    balances[member] = 0;
  });

  expenses.forEach((expense) => {
    const shares = buildEqualShares(expense.amount, expense.splitFor);

    balances[expense.paidBy] += expense.amount;
    expense.splitFor.forEach((memberId) => {
      if (balances[memberId] !== undefined) {
        balances[memberId] -= shares[memberId];
      }
    });
  });

  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  Object.keys(balances).forEach((memberId) => {
    if (balances[memberId] > 0.01) {
      creditors.push({ id: memberId, amount: balances[memberId] });
    } else if (balances[memberId] < -0.01) {
      debtors.push({ id: memberId, amount: Math.abs(balances[memberId]) });
    }
  });

  const debts: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settledAmount = Math.min(debtor.amount, creditor.amount);

    debts.push({
      from: debtor.id,
      to: creditor.id,
      amount: Math.round(settledAmount),
    });

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return debts;
};

export const calculateEqualSplit = (
  amount: number,
  paidBy: string,
  members: string[]
): EqualSplitResult => {
  const shares = buildEqualShares(amount, members);
  const debts = calculateGroupBalances(
    [{ amount, paidBy, splitFor: members }],
    members
  );

  const shareValues = Object.values(shares);
  const sharePerPerson =
    shareValues.length > 0 ? Math.min(...shareValues) : 0;

  return { sharePerPerson, shares, debts };
};