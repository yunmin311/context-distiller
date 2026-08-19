# Third-party notices

Context Distiller ships a small, curated **prompt library** (`lib/core/prompt-library.ts`)
that users can import into a custom requirement. Several entries are **adapted**
— translated into Chinese and condensed for this tool's "process the selected
material" context — from the prompt patterns in **Fabric**.

The adapted entries are marked `改编自 Fabric（MIT）` in the picker; the remaining
entries are original to this project (`原创`).

## Fabric

- Project: **Fabric** — an open-source framework of crowdsourced AI prompts.
- Source: https://github.com/danielmiessler/fabric
- License: **MIT License**, © Daniel Miessler and Fabric contributors.

The MIT License permits use, adaptation, and redistribution provided the
copyright notice and permission notice are preserved. The full text:

```
MIT License

Copyright (c) Daniel Miessler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Nothing from Fabric's runtime, CLI, or server is bundled — only text prompts,
reworked as described above. The library is fully offline; importing a prompt
makes no network request.
