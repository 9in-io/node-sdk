# Legacy SSOfy 2.x toolkit (not built, not published)

`v1-toolkit/` is the SSOfy 2.x resource-server toolkit (datasource connections, client /
scope / OTP / social-link / user repositories, filters, transformers, entity models,
helpers). It was moved here unchanged when the package became `@9in/node` 3.0, including
an uncommitted refactor that was in progress at the time (FilterGroup queries in
`Datasource/*`, `Models/Filter.ts`, `Models/Sort.ts`, …), so that work is not lost.

9in's adapter protocol v2 needs only `authenticate`, `findUser` and `onEvent`, so none of
this is required. Port the datasource connections into a v2 user store, or delete the
directory.
