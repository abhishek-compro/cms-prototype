# Whiteboard

Transcribed from `20261029_170750.jpg` and `20261029_170753.jpg`.
Items marked _(?)_ are hard to read in the photo.

## Problems

1. All teams should know the final content.
2. Brute-force generated utility content should be reviewed. _(?: "utility")_
3. Content validation, e.g. length, button text.
4. Scheduling details should be visible on content: when it will be sent, CA, … _(the line is cut off at "CA,")_
5. Multimedia content.
6. Journey payloads?
7. Review comments.
8. Compare old / new template content.
9. CRUD – Template.
10. Template reference id on re-approval.

## Non-Functional Requirements

- Audit.
- Other systems should work without this service (i.e. no dependency on it).
  - Other systems should not push or pull. _(?)_ Written next to "(I pull / push)", which reads as: this service pulls/pushes, and other systems do not.
- Non-country specific (ID by namespace)
  → Single deployment.

## Content Types

- Template, Free text _(boxed; "PREF" is written above, likely "preferred")_

## Users / Roles

- **Creators:** Content, Med, Comms
- **Prod / Tech** _(marked "IMP", i.e. important)_

## POC

- Ann / Kripesh
- Pooja / Sahana
