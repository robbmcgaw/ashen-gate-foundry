# Blight weather effects (General Manager 0.99.0)

Six animated weather ambiences registered by Ashen Gate | General Manager. They were part of Locations 0.41.0 to 0.43.1 and moved to Manager in 0.99.0 (Locations 0.44.0 removed them). Two ways to use one:

- **Scenes tab:** Moods & layers > Add a layer: *Ash fall*, *Spore drift*, *Red rain*, *Blight haze*, *Glass motes*, *Warped shimmer*. Each sets the weather and a light colour grade, and is undone like any layer. Random weather can propose them.
- **Scene Config:** Basics > **Weather**, listed as *Blight: Ash fall* and so on beside Foundry's own.

Foundry draws the weather for every client, so players see it with no permission. No Scene is rewritten and no migration is needed.

| Weather choice | Layer id | `scene.weather` id | Built from | Flashing |
|---|---|---|---|---|
| Blight: Ash fall | `blight-fx-ash-fall` | `agBlightAshFall` | two particle generators: grey flakes, a few embers | no |
| Blight: Spore drift | `blight-fx-spore-drift` | `agBlightSporeDrift` | one particle generator, gentle pulse | no |
| Blight: Red rain | `blight-fx-red-rain` | `agBlightRedRain` | core `RainShader` (rust tint) plus a faint red wash | no |
| Blight: Blight haze | `blight-fx-haze` | `agBlightHaze` | core `FogShader` (violet-grey) plus a soft vignette | no |
| Blight: Glass motes | `blight-fx-glass-motes` | `agBlightGlassMotes` | one particle generator, winking | yes |
| Blight: Warped shimmer | `blight-fx-warped-shimmer` | `agBlightWarpedShimmer` | one overlay shader: rippling pale bands and edge lights | yes |

The weather ids are permanent (they are stored in scenes) and are the ones Locations registered. Labels start with `Blight: `. The two older colour-only layers `ash-fall` and `blight-haze` are named *Ash tint* and *Sickly tint* since 0.99.0 (ids unchanged).

## One look, no strength

Each effect has one fixed look: what Locations drew at its default strength (2, Moderate). Particle counts: ash 60 flakes + 5 embers, spores 70, glass motes 80 (each capped at 160, `MAX_PARTICLES`, and scaled down further by the visible share of the scene). The old Scene flag `flags.ashen-gate-locations.blightStrength` is ignored. Tuning is by editing the numbers in `scripts/blight-weather.js`.

## How it registers (Foundry V14, build 367)

`CONFIG.weatherEffects[id] = {id, label, filter?, effects}` at `init`, on every client. The Scene Config Weather list is built from that object's labels; the canvas reads `CONFIG.weatherEffects[scene.weather]` when it draws. An effect is either `particles: [ParticleGenerator config]` (V14's `foundry.canvas.animation.ParticleGenerator`, ambient mode) or `effectClass` + `shaderClass` (a `WeatherShaderEffect` quad); declaring both makes core skip it. `effects` is a getter read at draw time, so the motion preference and the No flashing switch apply without registering anything per scene. If Manager is not active, the ids do not exist and a scene that picked one shows no weather.

## Cost

- Particles use core's `ui/particles/snow.png` soft dot; the module ships no images.
- Red rain, haze and shimmer are fragment shaders. The haze fog carries `performanceLevel: 1`, so Foundry's lowest performance mode skips the fog and keeps the vignette.

## Reduced motion and No flashing

`prefers-reduced-motion: reduce` is read when the effect is built. Particle speeds drop to 15%, the spore pulse and the glass wink are removed, and the overlay shader's time term is held, so the shimmer's bands and lights stand still. A change of the preference redraws the viewed scene's effect.

The Scenes tab's world switch **No flashing** (`sceneCalm`): Glass motes and Warped shimmer are marked `flashing`, so the switch refuses to add them and keeps them out of Random weather; a scene that already uses them draws them without the wink and the flicker while it is on (read at draw time; a scene redraw picks it up).

## Fail-soft

Registration feature-detects `CONFIG.weatherEffects`, `foundry.canvas.animation.ParticleGenerator` and `canvas.rendering.shaders.{WeatherShaderEffect, AbstractWeatherShader, RainShader, FogShader}`. A missing piece skips only the effects that need it, logs one console line and never throws.

## Known limits

The shimmer is an overlay of drifting light, not a true refraction of the map: Foundry's weather layer cannot bend what is drawn beneath it.
