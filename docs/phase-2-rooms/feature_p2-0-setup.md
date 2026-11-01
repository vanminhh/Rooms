# Phase 2 · Part 0 – Setup (P2-SETUP-01..03)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
All parts and their order: [README.md](README.md).

| | |
|---|---|
| Needs first | Phase 1 done |
| Unblocks | Part 1 |
| How | By hand (installs go straight to the main files, owner's rule) |
| Part done when | All three tasks below are `[x]` |

- [x] **P2-SETUP-01** Install `@nestjs/schedule` 12.0.2 (`--save-exact`) in `Source/backend` (owner 01/11/2026).
  Done when: in `package.json`; `npm run build` and `npm run test` pass (592/592, 01/11/2026); committed (`3429b8b`).
- [x] **P2-SETUP-02** Owner creates a Cloudinary account and puts `CLOUDINARY_URL` in `Source/backend/.env` (never in chat or git).
  Done when: the value has the form `cloudinary://<key>:<secret>@<cloud>` and an authenticated call to the Cloudinary API returns 200 (checked 01/11/2026 without printing the value).
- [x] **P2-SETUP-03** Commit the working tree before Part 1.
  Done when: `git status` clean (01/11/2026, `3429b8b`).

## Questions for the owner

None.

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
- 01/11/2026 · P2-SETUP-02 · the first `CLOUDINARY_URL` was cut off (no `:` and `@`) · owner copied it again; fixed
