type PrismaColumnError = {
  code?: unknown;
  meta?: { column?: unknown };
  message?: unknown;
};

function isAddressFormattedAddressColumn(column: string): boolean {
  const parts = column.replace(/[\s`"']/g, '').split('.');
  const field = parts.pop();
  const model = parts.pop();

  return field === 'formattedAddress' && model === 'Address';
}

export function isMissingFormattedAddressColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const prismaError = error as PrismaColumnError;
  if (prismaError.code !== 'P2022') return false;

  const column = prismaError.meta?.column;
  if (typeof column === 'string' && column.trim()) {
    return isAddressFormattedAddressColumn(column);
  }

  if (typeof prismaError.message !== 'string') return false;
  const missingColumn = prismaError.message.match(
    /\bcolumn\s+(.+?)\s+(?:does not exist|not found)\b/i
  );
  if (!missingColumn) return false;

  return isAddressFormattedAddressColumn(missingColumn[1]);
}

/**
 * Retry a read without Address.formattedAddress only for that exact missing
 * column error. The legacy read must explicitly omit the column.
 */
export async function readWithFormattedAddressFallback<T>(
  readWithFormattedAddress: () => Promise<T>,
  readLegacy: () => Promise<T>,
  markFormattedAddressUnavailable: (result: T) => T
): Promise<T> {
  try {
    return await readWithFormattedAddress();
  } catch (error) {
    if (!isMissingFormattedAddressColumnError(error)) throw error;

    const legacyResult = await readLegacy();
    return markFormattedAddressUnavailable(legacyResult);
  }
}
