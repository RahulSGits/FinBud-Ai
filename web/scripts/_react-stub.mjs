// Minimal React stand-in for bundling server-only modules in a test.
// lib/auth.ts wraps getCurrentUser in React's cache() at module load; outside a
// React runtime that call has to resolve to something. Identity is correct
// here — memoisation is a performance detail, not part of what is under test.
export const cache = (fn) => fn;
export default { cache };
