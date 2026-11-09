# Developing staked


```sh
npm install
npm test        # builds, then runs the vitest suite (unit, e2e through a real git hook, history replay)
```

Requires Node 20+ and git. Paths are handled for Windows, macOS and Linux (backslashes, CRLF checkouts); the suite has so far run on Linux only.
