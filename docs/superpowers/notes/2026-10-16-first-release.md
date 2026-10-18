# First release: v0.1.0

- Release: https://github.com/Altainia/stingr-scout/releases/tag/v0.1.0 (`stingr-scout-hub-linux-x64.tar.gz`, 44 MB)
- CI run on the merge to `main`: passed (typecheck, unit/component, e2e, packaging test). Release run on tag `v0.1.0`: passed and published.
- The published file was downloaded and installed into a throwaway home folder: the hub started from `stingr-hub` and reported `appBuild: v0.1.0`.
- GitHub warnings to deal with on the next workflow change: `actions/checkout@v4` and `actions/setup-node@v4` run on the deprecated Node.js 20 action runtime; `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19.

## Hub laptop

- HP Compaq 6730b: Core 2 Duo P8400 (64-bit, no SSE4.2), 4 GB RAM, Intel GM45 graphics, legacy BIOS (no UEFI), 1280×800 screen.
- Ubuntu's installer crashed on it. **Linux Mint Xfce** installed and the hub runs, including the bundled Node.js 22.22.1 on this CPU.
- The ZenPad synced with the installed hub over USB and updated to the release's tablet app (Settings → App version: v0.1.0).
- At 1280×800 the hub screens wrapped (form editor toolbar, section headers) and Event setup scrolled sideways; Firefox at 70% zoom worked around it. Fixed after v0.1.0 (laptop-sized controls, narrower menu, tables scroll inside their card) with an e2e test that checks every hub page at 1280×650.

Recommendation for other team laptops of this age: Linux Mint Xfce (Ubuntu base, so the README instructions apply unchanged). On legacy-BIOS machines, write the USB stick with an MBR partition scheme.
