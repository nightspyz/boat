# Game State

_Last updated: 2026-09-30_

## Concept
_TBD — describe the game idea, genre and core loop here._

## Current status
Project scaffold is set up and runs in the browser.

## What works
- Canvas (800×600) with a HUD for score and status
- Game loop using `requestAnimationFrame` with delta-time
- Keyboard input (Arrow keys / WASD to move, Space to start and pause)
- Placeholder player square that stays inside the screen

## File overview
| File | Purpose |
|------|---------|
| `index.html` | Page layout, canvas and HUD |
| `style.css` | Page and canvas styling |
| `game.js` | Game state, input, update and render loop |
| `assets/` | Images, sounds and fonts |
| `GAME_STATE.md` | This file: snapshot of where the project stands |
| `TODO.md` | Planned work |

## Known issues
- None yet

## How to run
Open `index.html` in a browser. If you add assets loaded with `fetch`, serve the folder instead (e.g. `npx serve .` or `python -m http.server`).
