# Blight scene effects (Locations 0.41.0)

Six weather ambiences registered by Ashen Gate | Locations. A GM picks one in **Scene Config → Basics → Weather**; Foundry draws it for every client. No Scene is rewritten and no migration is needed.

| Weather choice | `scene.weather` id | Built from |
|---|---|---|
| Blight: Ash fall | `agBlightAshFall` | two particle generators: grey flakes, a few embers |
| Blight: Spore drift | `agBlightSporeDrift` | one particle generator, gentle pulse |
| Blight: Red rain | `agBlightRedRain` | core `RainShader` (rust tint) plus a faint red wash |
| Blight: Blight haze | `agBlightHaze` | core `FogShader` (violet-grey) plus a soft vignette |
| Blight: Glass motes | `agBlightGlassMotes` | one particle generator, winking |
| Blight: Warped shimmer | `agBlightWarpedShimmer` | one overlay shader: rippling pale bands and edge lights |

The ids are permanent (they are stored in scenes). Labels start with `Blight: `.

## How it registers (Foundry V14, build 367)

`CONFIG.weatherEffects[id] = {id, label, filter?, effects}`. The Scene Config Weather list is built from that object's labels; the canvas reads `CONFIG.weatherEffects[scene.weather]` when it draws. An effect is either `particles: [ParticleGenerator config]` (V14's `foundry.canvas.animation.ParticleGenerator`, ambient mode) or `effectClass` + `shaderClass` (a `WeatherShaderEffect` quad); declaring both makes core skip it. `effects` here is a getter, read at draw time, so the viewed scene's strength and the reduced-motion preference apply without registering anything per scene.

## Blight strength

Optional, GM only: Scene flag `flags.ashen-gate-locations.blightStrength`, a whole number 0 to 3 or unset (null). It mirrors the overland Blight Taint severity.

| Strength | Density (particle count) | Opacity |
|---|---|---|
| unset | same as 2 | same as 2 |
| 0 | none: the effect list is empty, nothing is drawn | none |
| 1 | x0.5 | x0.7 |
| 2 | x1 (the tuned look) | x1 |
| 3 | x1.6 | x1.25 |

Density scales particle counts (shaders have no count, so they scale only by opacity). The field is added to Scene Config under Weather for a GM; a `preUpdateScene` guard refuses a non-GM change and keeps the stored value to null or an integer 0 to 3. A change redraws only the weather of the viewed scene (`canvas.weather.initializeEffects`).

## Cost

- Particle count per generator is capped at 160 (`MAX_PARTICLES`); ambient mode scales it again by the visible share of the scene. Defaults at strength 2: ash 60 flakes + 5 embers, spores 70, glass motes 80. At strength 3 the largest is 128.
- Particles use core's `ui/particles/snow.png` soft dot; the module ships no images.
- Red rain, haze and shimmer are fragment shaders. The haze fog carries `performanceLevel: 1`, so Foundry's lowest performance mode skips the fog and keeps the vignette.

## Reduced motion

`prefers-reduced-motion: reduce` is read when the effect is built. Particle speeds drop to 15%, the spore pulse and the glass wink are removed, and the overlay shader's time term is held (`motion` 0), so the shimmer's bands and lights stand still. A change of the preference redraws the viewed scene's effect.

## Fail-soft

Registration feature-detects `CONFIG.weatherEffects`, `foundry.canvas.animation.ParticleGenerator` and `canvas.rendering.shaders.{WeatherShaderEffect, AbstractWeatherShader, RainShader, FogShader}`. A missing piece skips only the effects that need it, logs one console line and never throws; other modules and Locations itself are unaffected.

## Known limits

The shimmer is an overlay of drifting light, not a true refraction of the map: Foundry's weather layer cannot bend what is drawn beneath it. Effects are tuned by eye; adjust the numbers in `scripts/scene-effects.mjs` if one is too strong for a given map.
