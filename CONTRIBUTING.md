# Contributing

Thank you for taking an interest in Modest Text.

## Reporting a problem or an idea

[Open an issue](https://github.com/daizerius/modest-text/issues). For a problem, please give:

- your system and browser, with their versions;
- whether you opened the file from disk or from a web server;
- your keyboard layout, if a shortcut is involved;
- the steps that show the problem, and any error in the browser console (`F12` → Console).

Report security problems privately instead, as described in [SECURITY.md](SECURITY.md).

## Proposing a change

For anything bigger than a small fix, open an issue first, so that we can agree on the change before
you write it. The app deliberately stays small (see [ABOUT.md](ABOUT.md)).

Then:

1. Read [AGENTS.md](AGENTS.md): how to build and test, the conventions, and the traps to avoid.
   [specs.md](specs.md) describes what the app does, in detail.
2. Make the change in `src/`, rebuild with `node build.mjs`, and commit the rebuilt `modest-text.html`
   together with it.
3. Add a test that fails without your change, then run the whole suite with `npm test` (Chromium,
   Firefox and WebKit).
4. The app is in English and French. Any text you add or change on screen goes in `src/i18n.js`, in
   both languages.
5. Open a pull request against `master`. CI runs the suite on Windows.

By contributing, you agree that your contribution is released under the project's
[MIT License](LICENSE).
