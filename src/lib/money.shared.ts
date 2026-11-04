/**
 * Money helpers shared by quotation documents, the quote studio payload and
 * any total that is stored or printed.
 */

/**
 * Half-up rounding to cents. Plain toFixed() drifts on exact .005 values
 * (361.515 becomes "361.51"), which would leave a document that does not add up.
 */
export const round2 = (value: number) =>
  Math.round(value * 100 + (value >= 0 ? 1e-9 : -1e-9)) / 100;
