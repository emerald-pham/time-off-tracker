# Time Off Tracker

**IATSE Local 631 Regular Full Time (Entertainment Technicians, Costuming, Cosmetology)**

> Estimates only. SAP is the official record.

Plans time off against the Vacation and Floating Holidays a Regular Full Time
cast member earns under Articles 20 and 21 of the STCU agreement (unchanged by
Addendum B-6). Enter your hire date, weekly hours, regular days off and SAP
Balance, and the Ledger shows every Benefit Day you have and will earn, this
year and next.

Vocabulary is in [GLOSSARY.md](GLOSSARY.md); decisions are in [docs/adr/](docs/adr/).

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # engine tests (Vitest)
npm run build   # type-check and production build
```

The rules live in a pure module, `src/engine/`, with no UI or storage code.
Persistence sits behind the `Storage` interface in `src/storage/`.

All example data in this repo (for example the "Sam" fixture) is made up.

## License

MIT. See [LICENSE](LICENSE).
