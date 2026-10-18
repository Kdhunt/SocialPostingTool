# Unit hierarchy (wards, stakes, regions, districts)

## Requirement

Stakes need their own view. A stake works like a ward (its own sign-in code,
administrators, directory, campaigns and public page) but also has wards under
it. The same holds further up: wards sit under stakes, stakes under regions,
and regions under districts.

## Model

Every level is a row in the `ward` table (the table name predates the
hierarchy). Two columns place it:

| Column      | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `level`     | `Ward`, `Stake`, `Region` or `District` (default `Ward`)    |
| `parent_id` | The unit directly above, which must be exactly one level up |

Because a stake _is_ a unit, it gets everything a ward has (users, roles,
directory, audiences, campaigns, Facebook Page, public `/{slug}` page) with no
extra code. Rules live in `packages/domain/src/units/unit-hierarchy.ts`:

- A parent is always exactly one level up (`canContain`, `parentLevelOf`).
- A unit can never be placed beneath itself (`checkParentAssignment`).
- Districts are the top level; any level may also exist unplaced until a
  platform operator places it.

## Sign-in

Users sign in with **unit code + username + password**. The code alone
identifies the unit, so usernames only need to be unique within a unit.
Leaving the code blank is platform-operator (superadmin) sign-in.

- Each code version stores an Argon2 hash (verified) and a pepper-keyed
  HMAC `lookup_key` (indexed) so sign-in finds the unit in one query instead
  of Argon2-checking every unit. Rows created before the key existed are still
  checked and get their key backfilled on first successful sign-in.
- Creating or changing a code is refused if another unit's active code is the
  same, so a code always means exactly one unit. If two ever match, sign-in
  fails rather than guessing.
- When nothing matches, sign-in still spends one Argon2 verify so response
  time does not reveal whether the code or the username was wrong.
- The login rate limit is keyed on IP + username (not on the code), so
  cycling codes does not buy fresh attempts.

## Authorization

- Permission `units.manage` (granted to `WardAdmin`) unlocks `/admin/units`.
- Every route there checks the target is **strictly beneath** the caller's
  unit (`UnitScopeService`). Siblings, parents and other trees answer
  "Unit not found." so admins cannot probe outside their tree.
- A stake admin can create wards under their stake, move wards between their
  own stakes' units, change a unit's sign-in code, reset its administrators'
  passwords and set its public page path. A ward admin sees no Units page.
- Platform operators (`platform.wards.manage`) can create any level, place
  any unit under any valid parent, or leave a unit unplaced.

## Audit

`unit.created` (or `platform.ward.created` for operators) records level and
parent; `unit.parent.updated` records the old and new parent;
`ward_code.rotated` is unchanged.

## API

| Route                                                           | Who                     |
| --------------------------------------------------------------- | ----------------------- |
| `GET /admin/units`                                              | `units.manage`          |
| `POST /admin/units`                                             | `units.manage`          |
| `POST /admin/units/:unitId/parent`                              | `units.manage`          |
| `POST /admin/units/:unitId/code/rotate`                         | `units.manage`          |
| `POST /admin/units/:unitId/public-slug`                         | `units.manage`          |
| `POST /admin/units/:unitId/admins/:userId/password`             | `units.manage`          |
| `POST /admin/units/:unitId/admins/:userId/password-reset-email` | `units.manage`          |
| `POST /platform/wards/:wardId/parent`                           | `platform.wards.manage` |

`POST /auth/login` now takes `unitCode` instead of `wardSlug`.

## Migration notes

`20261018200000_unit_hierarchy` adds the `UnitLevel` enum, `ward.level`
(default `Ward`), `ward.parent_id` (FK, `ON DELETE RESTRICT`, cannot point at
itself) and `ward_code_version.lookup_key` with an index. Existing wards become
top-level `Ward` units; no data backfill is needed. Run the seed once so the
`units.manage` permission exists and is granted to `WardAdmin`.

Rollback: drop the two indexes, the `lookup_key`, `parent_id` and `level`
columns, and the `UnitLevel` type. Sign-in then needs the previous release,
which used the ward page path instead of the code.

## Client changes

Web and mobile sign-in forms ask for **Unit code** instead of the ward page
path, and the separate "ward code" step is gone. The Administration area shows
**Units** for stake, region and district admins and labels the code page by
level ("Stake code").
