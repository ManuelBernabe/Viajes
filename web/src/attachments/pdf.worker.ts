// Worker de pdf.js con los polyfills cargados antes: Safari (iOS 26) no tiene aún Map.prototype.getOrInsertComputed.
import './modernPolyfills';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
