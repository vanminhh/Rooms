# Phase Extra · Part 8 – Real emails: provider and templates (BE-EX-28..30)

**Owner acceptance — 16/11/2026:** EX-6, EX-7, EX-8 and EX-9 were explicitly accepted as OK, including the phone-whitespace fix, success popup and overlap warning. Tasks below are closed on that owner sign-off and the existing verification record. This is not a new agent-run HTTP/e2e, browser or DB result. Consolidated evidence: [ex-9-qa-checklist.md](ex-9-qa-checklist.md). Earlier pending entries remain historical.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` error/blocked (write the reason on the line below the task).
Rules: mark `[~]` when you start a task, `[x]` only after its "Done when" is verified. Do tasks in order. Work on the main files as in root `CLAUDE.md` "Change workflow": stop at every ⏸ checkpoint, report, and continue only after the owner says they verified and committed. Ask before every deleted file and new dependency. All parts and their order: [README.md](README.md). Read [LESSONS.md](../LESSONS.md) before the first task. At every ⏸ stop, before you report: update your row and add a log line in [PROGRESS.md](PROGRESS.md), and add to `LESSONS.md` any mistake that cost a retry.

Rewritten 12/11/2026 after the owner's final decisions (D-25, D-34): the guest inbox and the reminders are not built, so this part is only about sending real email. Task IDs BE-EX-31..32 and FE-EX-29..30 are retired. (The file keeps its old name.)

| | |
|---|---|
| Fixes | Phase 1 (the mailer only logs), Phase 2 (viewings sent no email) |
| Needs first | EX-6 committed. BE-EX-28 and 29 need nothing from the owner; BE-EX-30 needs the owner's Resend account with a verified sending domain and the keys in `.env` |
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

- [x] **BE-EX-28** ⏸ Provider adapter: a `MailerService` implementation for Resend (owner 12/11/2026, Q-14), used when its `MAIL_*` keys are set (suggested names: `MAIL_PROVIDER=resend`, `MAIL_API_KEY`, `MAIL_FROM`; check the names `env.ts` already uses). Read Resend's current API documentation first and take the request shape and error codes from it, not from memory; otherwise the console mailer in development and test, and in production a send fails (the sign-up answers `MAIL_UNAVAILABLE`, AUTH-13). If the provider needs an SDK package, stop and ask the owner before installing; prefer a plain HTTPS call when the provider's API allows it. Add the key names to `.env.example` with empty values; the owner fills `.env`.
  Done when: unit tests with the provider's HTTP call faked (success, provider error, timeout); the app boots with and without the keys; no key is logged.
- [x] **BE-EX-29** Templates (NOTI-08, LOC-06): `emailCode` (`vi`, `en`), `passwordReset` (existing; add `en`), `viewingNew` (to staff, `vi`), `viewingConfirmed` (to the guest, `vi`, `en`) in `settings.email_templates`, with defaults in code when a key is missing. Times in Hà Nội time, dates `dd/mm/yyyy`, no internal ids, and the building's public contact in the guest emails.
  Done when: template tests in both languages with the values of the spec; a missing template key falls back to the default.
- [x] **BE-EX-30** ⏸ Live check with the owner: with the owner's keys in `.env`, send each of the four emails once to an address the owner names and confirm they arrive and are not marked as spam; write the provider's setup steps (domain records, sender address, daily limits of the plan) in `docs/phase-extra-home101/email-setup.md`. `npm run lint`, `test`, `build`.
  Closing checkpoint (16/11/2026): owner accepted EX-8 in full after the earlier no-spam question was listed. BE-EX-30 is closed on that confirmation; the four deliveries and existing host checks remain the evidence. No further email sends or test reruns, and no separate inbox screenshot or new counts are claimed. Both Vitest configs keep MAIL_PROVIDER: ''.
  Done when: the owner confirms the four emails arrived; all checks pass with real output quoted.

## Questions for the owner

- Q-14 (spec): đã trả lời 12/11/2026 – dùng Resend. Chủ dự án tạo tài khoản, xác thực tên miền gửi và điền `MAIL_*` trước BE-EX-30.
- Q-EX8-2 (BE-EX-29): local test sender is `Rooms <onboarding@resend.dev>`; the final private-domain sender remains pending before sending to other recipients.

## Issues log

- 16/11/2026 · BE-EX-30 [!] · automatic verification is complete on the project host and all four flows were reported OK by the owner. Only the explicit no-spam detail remains unconfirmed. The production private-domain sender is a later rollout requirement, not a reason to rerun the accepted local tests. Close BE-EX-30 when no-spam placement is confirmed; do not repeat HTTP/e2e in the managed environment.
- 16/11/2026 · BE-EX-30 [!] · owner explicitly confirmed both remaining viewing-email flows passed. Together with the earlier sign-up and password-recovery reports, manual acceptance is 4/4. The remaining gate is automated backend verification, with Inbox/Spam placement not separately specified. No new runtime test or code change was performed for this documentation update.
- 15/11/2026 · BE-EX-30 [!] · owner replied "ok rùi" after the password-recovery test instructions. Record the manual password-recovery check as passed, alongside registration. Both viewing emails, Inbox/Spam placement and HTTP/Postgres checks remain outstanding.
- 15/11/2026 · BE-EX-30 [!] · after the sign-up guidance, the owner reported the registration test passed. Record this as an owner-verified manual sign-up check. Password recovery, new-viewing and viewing-confirmation emails, Inbox/Spam placement and HTTP/Postgres checks remain outstanding.
- 15/11/2026 · BE-EX-30 [!] · owner confirmed receipt of the diagnostic email. Inbox versus Spam was not specified. Four application mail flows and current HTTP/Postgres verification remain outstanding; this receipt does not complete BE-EX-30.
- 15/11/2026 · BE-EX-30 [!] · local MAIL_* configured and owner-named recipient tested: Resend accepted one diagnostic email (HTTP 200). Owner Inbox/Spam confirmation, four application mail flows and current HTTP/Postgres verification remain outstanding. The direct API smoke check does not establish end-to-end application delivery.
- 15/11/2026 · BE-EX-30 [!] · awaiting owner Resend configuration and named recipients; real arrival/spam confirmation and current HTTP/Postgres verification remain outstanding.

## Resumption checkpoint — 15/11/2026

BE-EX-28/29 are implemented and isolated checks pass: 47/47 tests (31 templates, 12 provider/retry, 4 module selection/boot). Review found missing mandatory template placeholders; 14 failing cases proved it before the fix, all now pass, and the same reviewer approved the fix. The owner chose real email even in development when all MAIL_* values are configured; Q-14/AUTH-13 are updated. No env file was edited.

BE-EX-30 is blocked pending the owner's verified sender/domain, private configuration and named test recipients. Configuration presence check: all three MAIL_* values absent; no live email sent. Setup and four-message acceptance: [email-setup.md](email-setup.md). Full backend test cannot be marked green: 1047 pass / 759 HTTP EACCES failures on 1806 tests. Backend lint/build pass (0 errors, 4 existing lint warnings). Full reviewer report and hand-check commands: [checkpoint report](CHECKPOINT-2026-11-15-resume.md).

## Final closure — 16/11/2026

Owner accepted this part. The prior blockers are closed by that acceptance; historical logs are preserved with their original scope. No fresh per-case output was supplied with the confirmation. Code was already committed at c5adfde; this follow-up only updates acceptance documents. See [EX-9 ledger](ex-9-qa-checklist.md) for the known test counts, scope exclusions and next phase.
