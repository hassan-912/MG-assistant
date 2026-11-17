// What the website is made of: the app files plus the self-hosted reader libraries (copied from node_modules).
// Used by the build (Vercel) and by the local server, so both serve exactly the same thing.
export const APP_FILES = ['index.html', 'css/styles.css', 'js/ref-data.js', 'js/util.js', 'js/docs.js', 'js/engine.js', 'js/builder.js', 'js/parse.js', 'js/locate.js',
  'js/reader.js', 'js/snippet.js', 'js/lightbox.js', 'js/app.js', 'js/monitoring.bundle.js'];

// published path → source path (relative to the project folder)
export const VENDOR = {
  'vendor/pdfjs/pdf.min.mjs': 'node_modules/pdfjs-dist/build/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs': 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'vendor/pdfjs/standard_fonts/': 'node_modules/pdfjs-dist/standard_fonts/',
  'vendor/pdfjs/cmaps/': 'node_modules/pdfjs-dist/cmaps/',
  'vendor/tesseract/tesseract.min.js': 'node_modules/tesseract.js/dist/tesseract.min.js',
  'vendor/tesseract/worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'vendor/tesseract-core/': 'node_modules/tesseract.js-core/',
  'vendor/tessdata/': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/',
};

/** Map a request path like "vendor/pdfjs/cmaps/Adobe-CNS1-0.bcmap" to its source file, or null. */
export function vendorSource(p) {
  for (const [pub, src] of Object.entries(VENDOR)) {
    if (pub.endsWith('/') ? p.startsWith(pub) : p === pub) return pub.endsWith('/') ? src + p.slice(pub.length) : src;
  }
  return null;
}
