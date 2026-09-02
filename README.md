# linked-rolls

linked-rolls is a lightweight Typescript library for creating, manipulating
and exporting digital editions of piano roll. In particular it allows to:

  - import piano rolls from different formats (such
    as SUPRA's roll analysis files, DSP, etc.)
  - collate differing piano roll copies
  - create an manipulate editorial assumptions 
  - export the edition as JSON-LD (based on the 
    [Roll Edition Format](https://pfefferniels.github.io/linked-rolls/))

This library is the foundation of the
[Roll Desk](https://github.com/pfefferniels/roll-desk).

## Emulation

`Emulation` turns a version of the edition into MIDI, running the
expression code through the mechanism of a Welte-Mignon T-100 as
[welte-t100-emulator](https://github.com/pfefferniels/roll-nuance-tracer)
models it: the take-up spool sets the time axis, the Nuancierbälge fill
through their conduits and are arrested by the Mezzoforte pin, and the two
pedals travel rather than switch. The constants are those fitted against
the hand-drawn nuance lines of roll 3309, with the terms that describe the
drawing apparatus switched off. What the emulator does not determine is
how bellows travel maps onto MIDI velocity; `EmulationOptions.velocity`
anchors that map at the open rail, the Mezzoforte pin and the closed rail,
and its defaults are midi2exp's.

The dependency is declared as `file:../roll-nuance-tracer/emulator`, so
that repository has to be checked out beside this one.

## Building
```
   npm i
   npm run build
```
