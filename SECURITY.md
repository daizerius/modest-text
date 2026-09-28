# Security

Modest Text is one HTML file that runs in your browser. It makes no network request: a
Content-Security-Policy in the page forbids them, and only the page's own two scripts (identified by
their hash) may run. Your notes stay in the browser's storage, on your computer.

## Reporting a vulnerability

Please report it **privately**, not in a public issue: use
[Report a vulnerability](https://github.com/daizerius/modest-text/security/advisories/new) on the
repository's Security tab. Say what you found, in which browser and version, and how to reproduce it.
You will get an answer as soon as possible.

Examples of what counts: anything that lets a note's content, a pasted text or an imported file run
script, load a remote resource, or read or change another page's storage; any way around the
Content-Security-Policy.

## Supported versions

Only the latest release is supported: fixes are published as a new release.
