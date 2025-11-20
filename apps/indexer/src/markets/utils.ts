export function marketTypeToString(marketTypeId: number) {
  if (marketTypeId === 0) {
    return "borrow";
  } else if (marketTypeId === 1) {
    return "mint";
  } else if (marketTypeId === 2) {
    return "dao_mint";
  } else {
    throw new Error(`Invalid market type: ${marketTypeId}`);
  }
}

export function irmTypeToString(irmTypeId: number) {
  if (irmTypeId === 0) {
    return "fixed";
  } else if (irmTypeId === 1) {
    return "adaptive";
  } else {
    throw new Error(`Invalid IRM type: ${irmTypeId}`);
  }
}
