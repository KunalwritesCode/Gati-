const VPA = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$/i;

export function isValidUpiId(id: string): boolean {
  return VPA.test(id.trim());
}

/** upi://pay link that opens a UPI app with the payee filled in. The payer chooses the amount. */
export function upiLink(id: string, name: string, note = 'Buy Me a Coffee'): string | null {
  const vpa = id.trim();
  if (!isValidUpiId(vpa)) return null;
  return `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name.trim() || 'Gati')}&cu=INR&tn=${encodeURIComponent(note)}`;
}
