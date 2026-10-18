/**
 * The native database tests import fresh module instances with a query suffix
 * (for example `db.native?store-concurrency`) so `node:test` module mocks can
 * replace dependencies per test. TypeScript has no file for those specifiers,
 * so declare the query-suffixed forms as `any` for the test typecheck.
 */
declare module '*?database-store-interleaving' {
  const value: any;
  export = value;
}
declare module '*?database-open-retry' {
  const value: any;
  export = value;
}
declare module '*?store-concurrency' {
  const value: any;
  export = value;
}
declare module '*?init-concurrency' {
  const value: any;
  export = value;
}
declare module '*?init-retry' {
  const value: any;
  export = value;
}
declare module '*?init-sequential-success' {
  const value: any;
  export = value;
}
declare module '*?init-failed-reset' {
  const value: any;
  export = value;
}
declare module '*?init-close-failure' {
  const value: any;
  export = value;
}
