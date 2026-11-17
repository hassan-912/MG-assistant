// Node entry for the document parser (the same code runs in the browser as js/parse.js).
import '../js/ref-data.js';
import '../js/util.js';
import '../js/docs.js';
import '../js/builder.js';
import '../js/parse.js';

const P = globalThis.VFR.parse;
export const parseDocument = P.parseDocument;
export const classify = P.classify;
export const datesIn = P.datesIn;
export const findMrz = P.findMrz;
