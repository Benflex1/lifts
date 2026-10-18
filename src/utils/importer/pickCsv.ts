// Node/test fallback entry point. Metro resolves pickCsv.native.ts on
// Android/iOS and pickCsv.web.ts on web; the base file never selects a variant
// at runtime. See docs/platform-dispatch.md.
export { pickCsvFile } from './pickCsv.web';
