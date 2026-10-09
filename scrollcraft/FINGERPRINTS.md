# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|

| busa-landing | 2.3 Live surface | chrome aplikasi: strip status + tab babak yang melompat, badge "data contoh", jam berjalan; bukan bar wordmark+CTA | lantai mesin nyata yang sudah berputar (6 drum dari state, bar beban, countdown) tanpa klaim hero | 6 babak / 1 flow+count, 1 reveal, 1 pin (puncak), 1 pan, 1 flow+parallax+count, 1 in · ≈11vh, puncak 3,2vh | input nyata: form 3 kolom yang mengisi keranjang portal pelanggan + satu baris hold; bukan footer | drum penampung: air naik per progres gulir, tiap batas babak menempel label cucian ke dalam drum, lalu dilipat keluar jadi rekap saat form terbuka; kecepatan gulir menaikkan RPM semua drum | krem sabun + tinta arang, aksen oranye-sinyal; fotografi dokumenter + SVG mesin | 5173 |

---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- **busa-landing** — grammar **Live surface** dengan nav berupa chrome aplikasi dan
  penutup berupa input nyata (bukan tombol magnetik, bukan footer).
- **busa-landing** — signature move **"drum penampung"**: chrome bawah sebagai porthole
  progres yang menampung label per babak lalu melipatnya jadi rekap. Jangan dipakai ulang
  sebagai "trace rail" generik.
- **busa-landing** — band panjang: **6 babak / ≈11vh** dengan satu pin 3,2vh sebagai puncak.
  Build berikutnya sebaiknya keluar dari band 6-7 babak 11-14vh ini.
- **busa-landing** — perangkat pembuka: **papan operasional real-time tanpa klaim hero**.
  Build berikutnya jangan membuka dengan scrub video atau headline kinetik di pojok.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
