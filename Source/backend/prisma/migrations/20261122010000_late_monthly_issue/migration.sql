BEGIN;

ALTER TABLE invoices DROP CONSTRAINT invoices_issued_dates;
ALTER TABLE invoices ADD CONSTRAINT invoices_issued_dates CHECK (
  status IN ('DRAFT', 'CANCELLED') OR (
    issue_date IS NOT NULL AND due_date IS NOT NULL AND (
      due_date >= issue_date OR (
        type = 'MONTHLY' AND period_end IS NOT NULL
        AND due_date = (date_trunc('month', period_end::timestamp) + interval '2 months' - interval '1 day')::date
      )
    )
  )
);

COMMIT;
