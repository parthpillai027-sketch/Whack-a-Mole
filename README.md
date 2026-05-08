# Improved Whack-a-Mole Game

Open `index.html` in a browser to play.

## Improvements added
- Lives system: bombs reduce lives and can end the game.
- Level progression: level increases every 10 points and speeds up gameplay.
- Power-up mole: lightning mole activates temporary 2× points.
- Better scoring: streak and power-up multipliers stack for more exciting gameplay.
- Mute toggle: sound preference is saved in local storage.
- Keyboard support: press number keys 1–9 to whack holes.
- Stronger polish: animated particles, level-up flash, screen shake, power timer, responsive improvements.
- Timer cleanup: prevents duplicate mole-spawn loops between rounds.

## Latest visual update
- Added a dedicated `.hole-mask` clipping layer around every mole.
- Added a front `.hole-cover` lip so the lower body stays hidden.
- Added darker inner-hole shadows and a small dust/ripple effect when a mole appears.


- Visibility fix: the hole mask is wider and the front lip is lower, so the mole face and upper body are easier to see.
- Hole-only constraint: each mole is clipped to its own hole tile and tunnel, preventing it from appearing outside the hole area.
