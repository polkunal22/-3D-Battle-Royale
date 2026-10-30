# 3D Battle Royale

A small, browser-based 3D battle royale game built with HTML, CSS, and JavaScript using Three.js.

## Run the game

The game loads Three.js as an ES module from a CDN, so open it through a local web server rather than directly as a `file://` page. An internet connection is needed to load Three.js.

From the project folder, run:

```powershell
cd html
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser. Stop the server with `Ctrl+C` in the terminal.

No package installation or build step is required.

## How to play

- **W / A / S / D** - Move
- **Mouse** - Aim
- **Hold left click** - Fire the rifle
- **Shift** - Sprint
- **R** - Reload
- **Esc** - Pause or release the mouse

Click **Start Game** to begin. Eliminate the other players and stay inside the shrinking zone. The game ends when you are eliminated or all enemies are defeated.

## Features

- Town arena with asphalt streets, sidewalks, road markings, detailed buildings, broadleaf trees, parked cars, and enemy bots
- Third-person player character with tactical gear and a visible rifle
- Health, ammunition, kill count, enemy count, and zone HUD
- Minimap, hit marker, kill feed, and damage indicator
- Searchable ammo crates and medkits
- Shrinking safe zone and enemy attacks
- Browser-generated sound effects

## Project files

- `html/index.html` - Game page and HUD markup
- `html/style.css` - Page and HUD styling
- `html/game.js` - Three.js scene, controls, and gameplay logic
