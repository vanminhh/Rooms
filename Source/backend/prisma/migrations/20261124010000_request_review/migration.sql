BEGIN;

ALTER TABLE requests
  ADD COLUMN review_rating SMALLINT,
  ADD COLUMN review_comment TEXT,
  ADD COLUMN review_at TIMESTAMPTZ,
  ADD COLUMN review_updated_at TIMESTAMPTZ,
  ADD COLUMN review_hidden_reason TEXT,
  ADD COLUMN review_hidden_at TIMESTAMPTZ,
  ADD COLUMN review_hidden_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE requests
  ADD CONSTRAINT requests_review_rating CHECK (
    review_rating IS NULL OR (review_rating BETWEEN 1 AND 5 AND type = 'INCIDENT')
  ),
  ADD CONSTRAINT requests_review_hide_pair CHECK (
    (review_hidden_reason IS NULL) = (review_hidden_at IS NULL)
  ),
  ADD CONSTRAINT requests_review_hide_requires_rating CHECK (
    review_hidden_at IS NULL OR review_rating IS NOT NULL
  );

COMMIT;
