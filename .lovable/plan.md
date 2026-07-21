## Problem

The Kamatera images endpoint returns 226 images per datacenter (public OS, marketplace apps, private images), but the wizard shows almost nothing usable — tiles display raw IDs and all OSes read "custom".

Root cause in `src/lib/providers/kamatera/adapter.server.ts`:
- The API returns each image with a `description` field (e.g. `ubuntu_server_22.04_64-bit`), not `name`.
- The adapter maps `img.name ?? img.id`, so `name` is always undefined and it falls back to the raw ID.
- `detectOs(img.name ?? img.id)` then runs against undefined/ID and returns `undefined`, so every tile labels as "custom".
- Nothing filters out marketplace apps (`apps_*`, `service_*`) or private images, so the standard OS catalog is buried and hard to find.

## Fix (single file: `src/lib/providers/kamatera/adapter.server.ts`)

In `listImages`:

1. Map from the correct field:
   - `name` ← `img.description || img.name || img.id`
   - Also derive a human `label` from the description (e.g. `ubuntu_server_22.04_64-bit` → `Ubuntu Server 22.04 (64-bit)`).
2. Classify each image:
   - **OS**: description matches `^(ubuntu|debian|almalinux|rockylinux|centos|windows_server|freebsd|fedora)_` — this is the standard public OS catalog.
   - **App**: starts with `apps_` or `service_` — marketplace/preconfigured apps.
   - **Desktop**: matches `*_desktop_*` — desktop images.
   - **Private**: id does not start with the datacenter prefix's public UUID shape (Kamatera public OS IDs start with `6000C29`); everything else is private/custom.
3. Return only OS images by default so the selector is populated with Ubuntu, Debian, AlmaLinux, Rocky Linux, Windows Server, etc. Attach `category: "os" | "app" | "desktop" | "private"` so we can expose the other tabs later without another round-trip.
4. Extend `detectOs` to recognize `rockylinux`, `windows_server`, `centos`, `freebsd`, `fedora` so the correct icon renders.
5. Sort: OS family (Ubuntu → Debian → AlmaLinux → Rocky → Windows Server → others), then version descending.

No UI or types changes required — the wizard already renders `im.name` / `im.os`, and `filteredImages` will now search against real names. The Kamatera adapter is the only place that needed changing; Vultr/Contabo adapters are untouched.

## Verification

- Re-open the wizard, pick Kamatera + EU-ML: expect ~20 tiles including `Ubuntu Server 22.04/24.04`, `Debian 11/12/13`, `AlmaLinux 8/9/10`, `Rocky Linux 8/9/10`, `Windows Server 2016/2019/2022/2025`.
- Search "ubuntu" narrows to Ubuntu entries.
- Selecting one and continuing provisions with a public image ID (no more `EU-ML:6000C296263f732e69fc1ce13e9ad43e` custom-only result).