export const CUSTOMER_WASTE_CATEGORY_NAMES = [
  'E-Waste',
  'Household Dry Waste',
  'Paper & Cardboard',
  'Plastic Waste',
] as const;

const customerWasteCategoryNames = new Set<string>(CUSTOMER_WASTE_CATEGORY_NAMES);

export function isCustomerWasteCategory(category: { name?: string | null }) {
  return customerWasteCategoryNames.has(category.name?.trim() || '');
}
