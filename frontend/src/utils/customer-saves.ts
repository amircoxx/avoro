/** Resolves the current user once before a saved-tech action needs customer-only behavior. */
export async function resolveCustomerForSavedTech<T>(
  currentUser: T | null,
  getCurrentUser: () => Promise<T | null>
) {
  return currentUser ?? getCurrentUser();
}
