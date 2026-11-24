# P5-6 staff operations

P5-5 dev checks were reported passing on 25 November. Deliver FE-P5-01..05 in the current working tree, following the owner's instruction to continue without committing.

## FE-P5-01 · Routes and navigation

Extend the existing route branches in `src/app/routes.tsx`. Staff routes under `/ql` are `yeu-cau`, `thong-bao` and `bao-cao`. Put `nhat-ky` and `cai-dat` under the same Boss guard as `nhan-su`. Add `thong-bao`, `yeu-cau` and `yeu-cau/:id` under the tenant branch at `/thue`. Preserve the guest branch at `/toi`. Add the corresponding entries in staff and tenant navigation, with Boss-only items hidden from managers. Keep temporary route pages local and small until P5-7 and P5-8 fill them. Update existing route index, login-flow, guard and menu expectations.

## FE-P5-02 · Request board and staff dashboard

Use the existing authenticated API client and query conventions. Fetch paginated `GET /requests` with `buildingId`, `type`, `status`, `page` and `limit`. Include all six request types. Show the submitted details and photos, and the API's remaining rent warning for early departure. Use the kit’s loading, empty, error/retry and data states.

- For repairs, send `PATCH /requests/:id` with `status`. Resolving requires a nonnegative integer `cost`, including zero. Show the last repair visit's cost when a reopened incident is resolved.
- For move-out, renewal, occupant and vehicle changes, confirm approval or rejection. Send `POST /requests/:id/approve` or `/reject` with a nonblank `decisionNote` on rejection. On successful renewal approval, open the contract renewal form with the approved request ID and proposed term.
- For payment issues, wire `/resolve`, `/escalate` and `/reject` to the corresponding actions. Only Boss can resolve an escalated issue. A confirmed full webhook payment uses the existing request-resolution endpoint. An unmatched bank assignment uses `bankTransactionId`. Keep server errors visible and prevent double submission.
- Refresh the board, dashboard and affected contract queries after successful writes. Add `pendingRequests`, `approvedRenewals` and Boss-only `escalatedPaymentIssues` to the existing `GET /dashboard` client and staff home. Use the server counts and up to five returned items. Links should open the matching board context or approved renewal.

## FE-P5-03 · Announcements

Use `GET /announcements` and `POST /announcements`. Staff select a scoped building, optionally a room in that building. Only Boss can select the entire chain and send `buildingId: null`. Reset the room when its building changes. Submit a trimmed title (up to 150 characters), body and target after confirming the audience. Refresh the paginated sent list and display the API’s read/recipient counts. Render messages as text.

## FE-P5-04 · Renewals

Extend the existing contract detail and actions in `src/features/contracts`. Use `POST /contracts/:id/renew` with integer `termMonths >= 3`, optional approved `requestId` and editable `terms`. Preserve the distinction between copied terms and explicitly cleared terms. Display the existing services and carried deposit. Read contract dates, renewal ownership and money values from the backend. Disable ineligible actions with a reason. After creation, navigate to the HOLD renewal, reuse the current signing flow and use the existing cancellation flow for an eligible HOLD renewal.

## FE-P5-05 · Verification

Run `npm run lint`, `npm run build` and `npm run test:components` in `Source/frontend`. The current script enumerates test directories, so include any new phase suite in its command. Exercise direct links plus navigation as Boss, manager and tenant. Cover cross-role route denial, request errors and retries, confirmation dismissal, audience changes, API-calculated amounts, cleared terms and the dashboard after successful mutations. Check the board and confirmations at 360 px and desktop width. Record actual output and any remaining manual checks in the phase progress log.
