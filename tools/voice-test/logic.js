// Logic for the blind rating page (rate.html). No page code in here, so it can be tested with Node.
(function (root) {
  var FIELDS = ['clear', 'pron', 'rhythm', 'sim'];
  var HEADER = ['rater', 'clip', 'candidate', 'voice', 'passage', 'clear', 'pron', 'rhythm', 'sim', 'wrong_words'];

  // File names look like  candidate__voice__passage.mp3   for example  elevenlabs__dad__p2.mp3
  // A stock voice (not a clone) uses the voice name "stock".
  function parseClipName(fileName) {
    var base = String(fileName).replace(/\.[^.]+$/, '');
    var parts = base.split('__');
    return { candidate: parts[0] || '?', voice: parts[1] || '?', passage: parts[2] || '?' };
  }

  function isClone(voice) {
    return String(voice).toLowerCase() !== 'stock';
  }

  // Fisher-Yates shuffle. `rand` returns a number from 0 up to (not including) 1.
  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function csvEscape(value) {
    var s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // The first character is a byte-order mark, so Excel reads the Hebrew correctly.
  function toCsv(rows) {
    var lines = [HEADER.join(',')];
    rows.forEach(function (row) {
      lines.push(
        HEADER.map(function (key) {
          return csvEscape(key === 'wrong_words' ? row.wrong : row[key]);
        }).join(',')
      );
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // Average of each rating per candidate and kind (clone or stock). Unrated clips (empty) are skipped.
  function summarize(rows) {
    var groups = {};
    rows.forEach(function (row) {
      var key = row.candidate + ' / ' + (isClone(row.voice) ? 'clone' : 'stock');
      var g = groups[key] || (groups[key] = { name: key, clips: 0, sums: {}, counts: {} });
      g.clips++;
      FIELDS.forEach(function (f) {
        var n = Number(row[f]);
        if (n >= 1 && n <= 5) {
          g.sums[f] = (g.sums[f] || 0) + n;
          g.counts[f] = (g.counts[f] || 0) + 1;
        }
      });
    });
    return Object.keys(groups)
      .sort()
      .map(function (key) {
        var g = groups[key];
        var out = { name: g.name, clips: g.clips };
        FIELDS.forEach(function (f) {
          out[f] = g.counts[f] ? Math.round((g.sums[f] / g.counts[f]) * 100) / 100 : null;
        });
        // Pass mark: clear words, pronunciation and rhythm all average 4 or more.
        out.pass = ['clear', 'pron', 'rhythm'].every(function (f) {
          return out[f] !== null && out[f] >= 4;
        });
        return out;
      });
  }

  var api = { FIELDS: FIELDS, parseClipName: parseClipName, isClone: isClone, shuffle: shuffle, csvEscape: csvEscape, toCsv: toCsv, summarize: summarize };
  root.VoiceTest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
