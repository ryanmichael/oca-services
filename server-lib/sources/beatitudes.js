'use strict';

/**
 * Build Beatitudes troparia array for the Liturgy Third Antiphon.
 * On Sundays: 8 troparia from Octoechos Canon of the Resurrection (Odes 3+6).
 * Each item has { tone, label, source, text }.
 */
function buildBeatitudesTroparia(isSunday, tone, srcs) {
  if (!isSunday) return []; // weekday beatitudes not yet implemented

  const tk = `tone${tone}`;
  const oct = srcs?.octoechos;
  const beatData = oct?.[tk]?.sunday?.liturgy?.beatitudes;
  if (!beatData) return [];

  const troparia = [];
  const src = 'octoechos';

  // Ode 3: irmos, troparion1, troparion2, theotokion
  if (beatData.ode3) {
    const o = beatData.ode3;
    if (o.irmos)      troparia.push({ tone, label: 'Irmos of Ode 3', source: src, text: o.irmos });
    if (o.troparia?.[0]) troparia.push({ tone, label: 'Troparion of Ode 3', source: src, text: o.troparia[0] });
    if (o.troparia?.[1]) troparia.push({ tone, label: 'Troparion of Ode 3', source: src, text: o.troparia[1] });
    if (o.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 3', source: src, text: o.theotokion });
  }

  // Ode 6: irmos, troparion1, troparion2, theotokion
  if (beatData.ode6) {
    const o = beatData.ode6;
    if (o.irmos)      troparia.push({ tone, label: 'Irmos of Ode 6', source: src, text: o.irmos });
    if (o.troparia?.[0]) troparia.push({ tone, label: 'Troparion of Ode 6', source: src, text: o.troparia[0] });
    if (o.troparia?.[1]) troparia.push({ tone, label: 'Troparion of Ode 6', source: src, text: o.troparia[1] });
    if (o.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 6', source: src, text: o.theotokion });
  }

  return troparia;
}

module.exports = { buildBeatitudesTroparia };
