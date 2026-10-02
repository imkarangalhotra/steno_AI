// Hindi must be Romanized, not deleted. Used at both display and server boundaries.
export const needsRomanization = (text) => /[\u0900-\u097f\ua8e0-\ua8ff\u{11b00}-\u{11b5f}]/u.test(text);
export function safeText(text) {
  if (typeof text !== 'string' || !text.trim() || needsRomanization(text)) {
    throw new Error('The model did not produce usable Roman-script text. Please retry.');
  }
  return text.trim();
}
