# Business template

Copy this folder's pieces into the game to add a new business. The example
is Chapter 2's ice-cream kiosk on Beach Boardwalk: a service point where
tourists on foot buy a cone. Every name and number in it is a placeholder
to replace.

Every business is built from the five station types (strategy doc,
section 6): service point, shop till, rental slot, producer, mover. Pick
the types first; a new type needs a written reason.

## Steps

1. **Station kinds.** Add each station from `stations.json` to
   `src/data/stations.json`. The key is the station's `kind`. `type` is one
   of the five types, `customer` is `car` or `walker`, `serves` names the
   need it ticks off, and `size` names a size in the town's layout.
2. **Needs.** Add anything customers can now want from `needs.json` to
   `src/data/needs.json`, with an icon and either `stagePay` or a
   `payFactor` (its share of the customer's base price).
3. **Tickets.** Add ticket kinds that include the new need to
   `tickets.kinds` in `src/data/tuning.json`, with weights. A ticket with
   several needs pays the combo bonus.
4. **Pads.** Add the business's pads, in unlock order, to the town's
   `src/data/towns/<town>/pads.json` (see `pads.json` here): the building,
   then its staff, then add-ons. Give each a `targetMinute` on the town's
   price curve, and give each pad a spot in the town's `layout.json`
   (`pads`, plus `staffSpots` for staff).
5. **Model.** Copy `business.py` to `art/blender/<business>.py`, model the
   building with the `kit` helpers, and export it to
   `public/models/buildings/<business>.glb`. List it in the town's
   `models` in `src/core/towns.ts` so it loads with the town, and credit
   it in `public/models/CREDITS.md` if it isn't made in Blender here.
6. **Staff.** If it hires someone, add the role to `ROLES` and `WORKS` in
   `src/systems/staff.ts` and their look to `src/data/characters.json`.
7. **Tests.** Copy `business.test.ts` to `tests/<business>.test.ts` and
   fill in the business's own rules (what it serves, what it pays).
8. **Pacing.** Run `npm run pacing` and compare the simulated minute of
   each new pad with its `targetMinute`. Change prices or pay until the
   curve matches the town's plan (strategy doc, section 8).
9. **Check.** `npm run typecheck`, `npm test`, `npm run build` and
   `npm run size` (each town: at most 10 MiB, every file under 512 KiB).

`tests/template.test.ts` checks that the example files here still fit the
game's data rules, so this template can't quietly go out of date.
