/**
 * Convert File to base64 data URL (for upload from computer/mobile)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
  });
}

/**
 * Convert clipboard paste (e.g. screenshot) to base64 string.
 * Call from paste event: getClipboardImageAsBase64(event.clipboardData).
 */
export function getClipboardImageAsBase64(clipboardData: DataTransfer | null): Promise<string | null> {
  if (!clipboardData?.items?.length) return Promise.resolve(null);
  const item = Array.from(clipboardData.items).find((i) => i.type.startsWith("image/"));
  if (!item) return Promise.resolve(null);
  const file = item.getAsFile();
  if (!file) return Promise.resolve(null);
  return fileToBase64(file);
}
