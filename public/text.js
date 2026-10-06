// Hindi and Urdu-script recognizer output must be Romanized, not deleted.
export const needsRomanization = (text) => /[\u0900-\u097f\ua8e0-\ua8ff\u{11b00}-\u{11b5f}]|\p{Script=Arabic}/u.test(text);
export function safeText(text) {
  if (typeof text !== 'string' || !text.trim() || needsRomanization(text)) {
    throw new Error('The model did not produce usable Roman-script text. Please retry.');
  }
  return text.trim();
}
