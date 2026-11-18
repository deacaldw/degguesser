# DegGuesser

DegGuesser is a game where you guess the temperature in the other unit. It shows you a temperature in °C, and you drag the thermometer to where you think it is in °F, or the other way around. A game has six rounds, and the closer you get, the more points you score.

You can play it on the demo page at [degguesser.deancaldwell.com](https://degguesser.deancaldwell.com/).

## Modes

- **Weather** uses everyday temperatures and gives you hints.
- **Oven** uses baking temperatures.
- **Permadeath** gives you 15 seconds a round and no hints. If you miss by a lot, the game is over.

Your scores, achievements and settings are saved in your browser.

## Files

- `index.html` has the page and its layout.
- `game.js` has the game itself.
- `manifest.webmanifest` sets the name and icons for when you add it to your home screen.
- `res/` has the sounds, the icons and the share image. `res/deacald/` is the kit.

## Build

Use `./build.sh` to build the static site in `public/`. It pulls a git submodule for the UI framework, [deacald.css](https://github.com/deacaldw/deacald.css), from GitHub.

If you just want to pull the submodule into your working project, use:

```bash
git submodule update --init
```

That does basically the same thing as `./build.sh`, but `./build.sh` also puts everything you need to upload to your host in `public/`.

### Run it locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

### Update deacald.css

The submodule stays on the same deacald.css commit until you move it. Don't edit `res/deacald/` here. Make your changes in the deacald.css repo and push them, and then run:

```bash
./build.sh --latest
git commit -am "Update deacald.css"
```
