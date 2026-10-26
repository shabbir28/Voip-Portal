export function vendorCredit(credit, amount = 0) {
  const totalCredit = credit === '' || credit == null ? null : Number(credit);
  const remainingCredit =
    totalCredit === null
      ? null
      : (Math.round(totalCredit * 100) - Math.round(Number(amount || 0) * 100)) / 100;
  return {
    totalCredit,
    remainingCredit,
    lowCredit: remainingCredit !== null && remainingCredit <= 1000,
  };
}
