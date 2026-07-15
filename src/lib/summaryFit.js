// Live "will this fit the report's summary box" check for the AI-summary
// textareas. Uses the same wrapText()/SUMMARY_BOX as the actual PDF
// generator (reportPdf.js) so this never drifts out of sync with what the
// download button actually produces — no separate word/character estimate.
import fontkit from '@pdf-lib/fontkit';
import { wrapText, SUMMARY_BOX } from './reportPdf';

let fontPromise = null;
function loadFont() {
  if (!fontPromise) {
    fontPromise = fetch('/fonts/Comfortaa-Regular.ttf')
      .then(res => res.arrayBuffer())
      .then(buf => fontkit.create(buf));
  }
  return fontPromise;
}

// Adapts a fontkit font to the {widthOfTextAtSize} shape wrapText() expects,
// without pulling in a full pdf-lib PDFDocument just to measure text.
function widthAdapter(fontkitFont) {
  return { widthOfTextAtSize: (text, size) => fontkitFont.layout(text).advanceWidth / fontkitFont.unitsPerEm * size };
}

// Returns { lines, maxLines, fits, overflowLines }. Safe to call on every
// keystroke — the font loads once and is cached.
export async function checkSummaryFit(text) {
  const fontkitFont = await loadFont();
  const font = widthAdapter(fontkitFont);
  const lines = wrapText(text, font, SUMMARY_BOX.fontSize, SUMMARY_BOX.maxWidth).length;
  return { lines, maxLines: SUMMARY_BOX.maxLines, fits: lines <= SUMMARY_BOX.maxLines, overflowLines: Math.max(0, lines - SUMMARY_BOX.maxLines) };
}
