# Phase Extra · Part 8 – Real emails: provider and templates (BE-EX-28..30)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

Rewritten 12/11/2026 after the owner's final decisions (D-25, D-34): the guest inbox and the reminders are not built, so this part is only about sending real email. Task IDs BE-EX-31..32 and FE-EX-29..30 are retired. (The file keeps its old name.)

| | |
|---|---|
| Fixes | Phase 1 (the mailer only logs), Phase 2 (viewings sent no email) |
| Needs first | EX-6 committed; the owner's answer to Q-14 (provider chosen, account created, sending domain verified) |
| Unblocks | EX-9; going live (without this nobody can sign up and managers get no email) |
| How | main session builds (one module); planner not needed |
| Part done when | BE-EX-30 verified |

## Before you start (read, in this order)

1. `CLAUDE.md` (root) and `Source/backend/CLAUDE.md`
2. `docs/spec/00-overview.md` – D-25, D-34, A-15, Q-14
3. `docs/spec/19-notifications.md` – NOTI-04, NOTI-07, NOTI-08; `docs/spec/10-auth.md` – AUTH-07, AUTH-13
4. `docs/spec/13-viewings.md` – VIEW-15, VIEW-19; `docs/spec/01-architecture.md` – LOC-06, DEP-02
5. `docs/spec/20-reports-audit-settings.md` – `email_templates`, env vars
6. Code: `src/modules/mailer/` (`MailerService`, `ConsoleMailerService`), every caller of `MailerService` (password link, email code from EX-1, the two viewing emails from EX-6), `src/common/env.ts`, `.env.example`

## Scope

In: one real provider behind `MailerService`, the four email texts, the owner's setup notes.
Out: any new kind of email, announcements and tenant emails (Phase 5), SMS and Zalo (D-25, D-34).

## Tasks

- [ ] **BE-EX-28** ⏸ Provider adapter: a `MailerService` implementation for the provider the owner chose (Q-14), used when its `MAIL_*` keys are set; otherwise the console mailer in development and test, and in production a send fails (the sign-up answers `MAIL_UNAVAILABLE`, AUTH-13). If the provider needs an SDK package, stop and ask the owner before installing; prefer a plain HTTPS call when the provider's API allows it. Add the key names to `.env.example` with empty values; the owner fills `.env`.
  Done when: unit tests with the provider's HTTP call faked (success, provider error, timeout); the app boots with and without the keys; no key is logged.
- [ ] **BE-EX-29** Templates (NOTI-08, LOC-06): `emailCode` (`vi`, `en`), `passwordReset` (existing; add `en`), `viewingNew` (to staff, `vi`), `viewingConfirmed` (to the guest, `vi`, `en`) in `settings.email_templates`, with defaults in code when a key is missing. Times in Hà Nội time, dates `dd/mm/yyyy`, no internal ids, and the building's public contact in the guest emails.
  Done when: template tests in both languages with the values of the spec; a missing template key falls back to the default.
- [ ] **BE-EX-30** ⏸ Live check with the owner: with the owner's keys in `.env`, send each of the four emails once to an address the owner names and confirm they arrive and are not marked as spam; write the provider's setup steps (domain records, sender address, daily limits of the plan) in `docs/phase-extra-home101/email-setup.md`. `npm run lint`, `test`, `build`.
  Done when: the owner confirms the four emails arrived; all checks pass with real output quoted.

## Questions for the owner

- Q-14 (spec): dịch vụ gửi email nào. Đề xuất: Resend. Chủ dự án tạo tài khoản, xác thực tên miền gửi và điền `MAIL_*`.
- Q-EX8-2 (BE-EX-29): địa chỉ người gửi và tên hiển thị của thư (ví dụ "ROOMS <no-reply@…>")?

## Issues log

<!-- When a task is [!], add: date · task ID · what failed · what is needed -->
