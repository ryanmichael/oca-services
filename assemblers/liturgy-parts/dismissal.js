'use strict';

const makeBlock = require('../_shared/make-block');
const warnings  = require('../_shared/warnings');

function _litDismissalTroparia(isBasil, f, feastTroparia) {
  const section  = 'Dismissal Troparia';
  const gloryNow = f['glory-now-doxology'] ||
    'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.';

  // Pentecostarion Sundays: repeat the full Liturgy troparia + kontakia
  // (Resurrection + feast troparia + saint kontakia, etc.).
  if (feastTroparia?.troparia?.length) {
    const blocks = [];
    feastTroparia.troparia.forEach((t, i) => {
      if (t.rubric) blocks.push(makeBlock(`dt-trop-rubric-${i}`, section, 'rubric', null, t.rubric));
      blocks.push(makeBlock(`dt-trop-${i}`, section, 'hymn', 'choir', t.text, { tone: t.tone }));
    });
    (feastTroparia.kontakia || []).forEach((k, i) => {
      if (k.connector) {
        blocks.push(makeBlock(`dt-kont-conn-${i}`, section, 'doxology', null, k.connector));
      } else if (i === 0) {
        blocks.push(makeBlock('dt-kont-glory-now', section, 'doxology', null,
          gloryNow));
      }
      if (k.rubric) blocks.push(makeBlock(`dt-kont-rubric-${i}`, section, 'rubric', null, k.rubric));
      blocks.push(makeBlock(`dt-kont-${i}`, section, 'hymn', 'choir', k.text, { tone: k.tone }));
    });
    return blocks;
  }

  // Great feasts: use feast troparion + kontakion instead of liturgy-saint troparia
  if (feastTroparia?.troparion) {
    const ft = feastTroparia.troparion;
    const blocks = [
      makeBlock('dt-rubric', section, 'rubric', null, ft.rubric || `Troparion, Tone ${ft.tone}:`),
      makeBlock('dt-trop',   section, 'hymn',   'choir', ft.text, { tone: ft.tone }),
    ];
    if (feastTroparia.kontakion) {
      const fk = feastTroparia.kontakion;
      blocks.push(
        makeBlock('dt-glory',  section, 'doxology', null, gloryNow),
        makeBlock('dt-kont',   section, 'hymn',     'choir', fk.text, { tone: fk.tone }),
      );
    }
    return blocks;
  }

  // Ordinary Liturgy: no dismissal troparia — the OCA ending goes straight from
  // the Closing Doxology to the priest's dismissal. (The Liturgy-author's
  // troparion + Theotokion previously emitted here is not part of the standard
  // ending.) Feast / Pentecostarion troparia repeats are handled above.
  return [];
}

function _litDismissal(dismissalSpec, isBasil, isPaschalPeriod, liturgyFixed) {
  const section = 'Dismissal';
  if (!dismissalSpec) {
    return [makeBlock('dis-text', section, 'prayer', 'priest', '[Dismissal]')];
  }

  const liturgySaintName = isBasil ? 'our holy father Basil the Great, Archbishop of Caesarea in Cappadocia' : 'our father among the saints John Chrysostom, Archbishop of Constantinople';
  const saintsList = (dismissalSpec.saints || []).filter(Boolean);
  const dayPatron = dismissalSpec.dayPatron || null;

  let opening;
  if (dismissalSpec.dismissalIntroit) {
    // Festal introit names the feast (e.g., Ascension: "Who ascended in glory from us into heaven…").
    opening = dismissalSpec.dismissalIntroit;
  } else if (dismissalSpec.opening === 'feast' && dismissalSpec.feastLabel) {
    opening = `May Christ our true God,`;
  } else if (dismissalSpec.opening === 'sunday') {
    opening = 'May He Who rose from the dead, Christ our true God,';
  } else {
    opening = 'May Christ our true God,';
  }

  // Order: Theotokos → day-of-week patron → liturgy saint → day's saints →
  // ancestors of God Joachim and Anna → all saints. The holy and righteous
  // ancestors of God are a fixed commemoration near the end of every dismissal,
  // immediately before "and of all the saints".
  const parts = ['through the prayers of His most pure Mother'];
  if (dayPatron) parts.push(`of ${dayPatron}`);
  parts.push(`of ${liturgySaintName}`);
  saintsList.forEach(s => parts.push(`of ${s}`));
  parts.push('of the holy and righteous ancestors of God, Joachim and Anna');
  const closing = `${parts.join('; ')}; and of all the saints, have mercy on us and save us, forasmuch as He is good and loveth mankind.`;

  const blocks = [];

  // Seasonal Theotokos magnification at the dismissal — feast/paschal overrides
  // ONLY. The ordinary Liturgy dismissal has NO "Most holy Theotokos, save us" /
  // "More honorable" (those belong to the Vespers/Matins/Hours dismissals): the
  // OCA ending goes straight from the Closing Doxology to the priest's dismissal.
  //   1. Explicit override (`spec.dismissalTheotokos`) — Ascension/Pentecost period, great-feast irmos.
  //   2. Paschal period (Pascha → Pascha leavetaking): "The Angel cried..."
  const dt = dismissalSpec.dismissalTheotokos;
  const dtMalformed = dt != null
    && !(typeof dt === 'object' && dt.hymn)
    && !(typeof dt === 'string' && dt.length > 0);
  if (dtMalformed) {
    warnings.push({ source: 'spec', key: 'liturgy.dismissal.dismissalTheotokos', scope: section,
      detail: `dismissalTheotokos has unrecognized shape (expected {hymn,priestCue?} or non-empty string); omitting` });
  }
  if (dt && typeof dt === 'object' && dt.hymn) {
    if (dt.priestCue) blocks.push(makeBlock('dis-theos', section, 'prayer', 'priest', dt.priestCue));
    blocks.push(makeBlock('dis-mag', section, 'response', 'choir', dt.hymn));
  } else if (typeof dt === 'string' && dt.length > 0) {
    blocks.push(makeBlock('dis-mag', section, 'response', 'choir', dt));
  } else if (isPaschalPeriod && liturgyFixed && liturgyFixed['megalynarion-paschal']) {
    blocks.push(makeBlock('dis-mag-paschal', section, 'response', 'choir', liturgyFixed['megalynarion-paschal']));
  }

  // Priest's dismissal, choir "Amen", then the Slavonic acclamation (the
  // "Preserve, O God…" / Many-Years) — after the dismissal, not before it.
  blocks.push(makeBlock('dis-proper',   section, 'prayer',  'priest', `${opening} ${closing}`));
  blocks.push(makeBlock('dis-amen',     section, 'response','choir',  'Amen.'));
  blocks.push(makeBlock('dis-preserve', section, 'response','choir',  'Preserve, O God, the holy Orthodox faith and Orthodox Christians, unto ages of ages.'));

  return blocks;
}

module.exports = { _litDismissalTroparia, _litDismissal };
