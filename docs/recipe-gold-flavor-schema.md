# Recipe gold flavour: `additional_gp_flavor`

Built in General Manager 0.89.0. A `REC-*` recipe already carries `additional_gp`: gold paid on top of the materials. The optional field `additional_gp_flavor` says, in a few words, what that gold pays for. It is **display flavour only**: Manager stores it with the record's definition exactly as written and never applies it. A module that shows the cost may print `75 gp (ash and vials)`.

| Field | Where | Rule |
|---|---|---|
| `additional_gp_flavor` | `REC-*` / `entity_type: "Recipe"` record, top level beside `additional_gp` | Optional. When present: text of 1 to 40 characters using only lower-case letters `a-z`, digits, spaces, commas, apostrophes (`'`) and hyphens (`-`), with no space at the start or end. No markup, no other punctuation, no line breaks. Valid **only** when `additional_gp` is a number above 0. |

Refused by the Import preview and by `node scripts/validate-content.mjs`:

- `additional_gp` is 0, missing, negative or not a number;
- the value is empty, longer than 40 characters, not text, or uses any character outside the list above (`<b>`, `&`, `[[AGREF:...]]`, capitals, full stops, accents and so on).

Leaving the field out is always fine, and existing recipes are unchanged.

```json
{"id": "REC-TEST-SALVE", "entity_type": "Recipe", "additional_gp": 75, "additional_gp_flavor": "ash and vials"}
```

(Shape only. A real recipe also needs its ingredients, `profession_id` and the other recipe fields.) Examples: `test-fixtures/recipe-gold-flavor/` (one accepted file; the mistakes are in `invalid/`, each naming the message it expects).
