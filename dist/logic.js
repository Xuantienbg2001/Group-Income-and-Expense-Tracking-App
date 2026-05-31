"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateEqualSplit = exports.calculateGroupBalances = void 0;
function buildEqualShares(amount, members) {
    const count = members.length;
    const baseShare = Math.floor(amount / count);
    const remainder = amount - baseShare * count;
    const shares = {};
    members.forEach((member, index) => {
        shares[member] = baseShare + (index < remainder ? 1 : 0);
    });
    return shares;
}
const calculateGroupBalances = (expenses, members) => {
    const balances = {};
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
    const creditors = [];
    const debtors = [];
    Object.keys(balances).forEach((memberId) => {
        if (balances[memberId] > 0.01) {
            creditors.push({ id: memberId, amount: balances[memberId] });
        }
        else if (balances[memberId] < -0.01) {
            debtors.push({ id: memberId, amount: Math.abs(balances[memberId]) });
        }
    });
    const debts = [];
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
        if (debtor.amount < 0.01)
            i++;
        if (creditor.amount < 0.01)
            j++;
    }
    return debts;
};
exports.calculateGroupBalances = calculateGroupBalances;
const calculateEqualSplit = (amount, paidBy, members) => {
    const shares = buildEqualShares(amount, members);
    const debts = (0, exports.calculateGroupBalances)([{ amount, paidBy, splitFor: members }], members);
    const shareValues = Object.values(shares);
    const sharePerPerson = shareValues.length > 0 ? Math.min(...shareValues) : 0;
    return { sharePerPerson, shares, debts };
};
exports.calculateEqualSplit = calculateEqualSplit;
