export function shortenText(value: string | undefined, maxLength: number): string {
  if (!value) {
    return '';
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function shortenPlayerName(value: string | undefined, maxLength: number): string {
  if (!value || value.length <= maxLength) {
    return value || '';
  }

  const trailingNumber = value.match(/(\d+)$/);
  if (!trailingNumber) {
    return shortenText(value, maxLength);
  }

  const suffix = trailingNumber[1];
  const headLength = maxLength - suffix.length - 1;
  if (headLength <= 1) {
    return shortenText(value, maxLength);
  }

  return `${value.slice(0, headLength)}...${suffix}`;
}
