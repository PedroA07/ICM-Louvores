const express = require('express');
const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

const app = express();
const PORT = process.env.PORT || 3131;
const LOUVORES_DIR = process.env.LOUVORES_PATH
  || path.join(__dirname, 'louvores', 'Material para ensaio');

const AUDIO_EXTS = new Set(['.mp3', '.mpeg', '.m4a', '.wav', '.ogg']);
const PDF_EXTS   = new Set(['.pdf']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// art cache: id -> { data: Buffer, mime: string }
const artCache = new Map();

function classifyTrack(f) {
  const n = f.toLowerCase();
  if (n.includes('playback'))                        return 'Playback';
  if (n.includes('soprano'))                         return 'Soprano';
  if (n.includes('contralto') || n.includes('alto')) return 'Contralto';
  if (n.includes('tenor'))                           return 'Tenor';
  if (n.includes('baixo') || n.includes('bass'))     return 'Baixo';
  if (n.includes('metais'))                          return 'Metais';
  if (n.includes('midi'))                            return 'MIDI';
  if (n.includes('ensaio'))                          return 'Ensaio';
  if (n.includes('instrumental'))                    return 'Instrumental';
  if (n.includes('áudio') || n.includes('audio'))   return 'Áudio';
  return 'Áudio';
}

function classifyPdf(f) {
  const n = f.toLowerCase();
  if (n.includes('grade'))                           return 'Grade';
  if (n.includes('coro'))                            return 'Coro';
  if (n.includes('piano'))                           return 'Piano';
  if (n.includes('soprano'))                         return 'Soprano';
  if (n.includes('contralto') || n.includes('alto')) return 'Contralto';
  if (n.includes('tenor'))                           return 'Tenor';
  if (n.includes('baixo') || n.includes('bass'))     return 'Baixo';
  if (n.includes('violino') || n.includes('violin')) return 'Violino';
  if (n.includes('viola'))                           return 'Viola';
  if (n.includes('violoncelo') || n.includes('cello')) return 'Violoncelo';
  if (n.includes('flauta') || n.includes('flute'))   return 'Flauta';
  if (n.includes('clarinete') || n.includes('clarinet')) return 'Clarinete';
  if (n.includes('trompete') || n.includes('trumpet')) return 'Trompete';
  if (n.includes('trompa') || n.includes('horn'))    return 'Trompa';
  if (n.includes('trombone'))                        return 'Trombone';
  if (n.includes('saxofone') || n.includes('sax'))   return 'Saxofone';
  if (n.includes('fagote') || n.includes('bassoon')) return 'Fagote';
  if (n.includes('oboé') || n.includes('oboe'))      return 'Oboé';
  if (n.includes('contrabaixo') || n.includes('contrabass')) return 'Contrabaixo';
  return 'Partitura';
}

async function scanDirectory(dir) {
  const songs = [];

  async function walk(currentDir, currentRelative) {
    let entries;
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); }
    catch { return; }

    const audioFiles = [], pdfFiles = [], imageFiles = [], subdirs = [];
    for (const e of entries) {
      const ext = path.extname(e.name).toLowerCase();
      if (e.isDirectory())       subdirs.push(e);
      else if (AUDIO_EXTS.has(ext)) audioFiles.push(e.name);
      else if (PDF_EXTS.has(ext))   pdfFiles.push(e.name);
      else if (IMAGE_EXTS.has(ext)) imageFiles.push(e.name);
    }

    if (audioFiles.length > 0 || pdfFiles.length > 0) {
      const tracks = audioFiles.map(f => ({
        label:    classifyTrack(f),
        file:     path.join(currentRelative, f).replace(/\\/g, '/'),
        filename: f,
      }));
      const pdfs = pdfFiles.map(f => ({
        label:    classifyPdf(f),
        file:     path.join(currentRelative, f).replace(/\\/g, '/'),
        filename: f,
      }));

      const folderName = path.basename(currentDir);
      const numMatch   = folderName.match(/^(\d+)\s*[-–]\s*(.+)/);
      const aMatch     = folderName.match(/^A(\d+)\s*[-–]\s*(.+)/i);
      let number = null, title = folderName;
      if (numMatch)    { number = numMatch[1]; title = numMatch[2].trim(); }
      else if (aMatch) { number = 'A' + aMatch[1]; title = aMatch[2].trim(); }

      const parts    = currentRelative.split('/');
      const category = parts[0] || 'Outros';
      const id       = currentRelative.replace(/[^a-zA-Z0-9]/g, '_');

      // Read ID3 from the main audio file
      const mainFile = audioFiles.find(f => {
        const n = f.toLowerCase();
        return (n.includes('áudio') || n.includes('audio')) && !n.includes('playback');
      }) || audioFiles.find(f => !f.toLowerCase().includes('playback')) || audioFiles[0];

      let artist = null, album = null;
      if (mainFile) {
        try {
          const meta = await mm.parseFile(path.join(currentDir, mainFile), { skipCovers: false });
          artist = meta.common.artist || meta.common.albumartist || null;
          album  = meta.common.album  || null;
          const pic = meta.common.picture && meta.common.picture[0];
          if (pic) artCache.set(id, { data: pic.data, mime: pic.format || 'image/jpeg' });
        } catch {}
      }

      // Fallback: folder image file
      const coverNames = ['cover', 'capa', 'foto', 'album', 'art'];
      const cover = imageFiles.find(f => coverNames.some(n => f.toLowerCase().includes(n)))
                 || imageFiles[0] || null;

      const mainTrack = tracks.find(t => t.label === 'Áudio') || tracks[0];

      songs.push({
        id,
        title,
        number,
        category,
        artist,
        album,
        folder:    currentRelative,
        tracks,
        pdfs,
        hasArt:    artCache.has(id),
        cover:     cover ? path.join(currentRelative, cover).replace(/\\/g, '/') : null,
        mainTrack: mainTrack ? mainTrack.file : null,
      });
    }

    for (const sub of subdirs) {
      const subRel = currentRelative ? `${currentRelative}/${sub.name}` : sub.name;
      await walk(path.join(currentDir, sub.name), subRel);
    }
  }

  await walk(dir, '');
  return songs;
}

// Single promise so concurrent requests don't duplicate the scan
let catalogPromise = null;

function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      console.log('Escaneando louvores e lendo metadados...');
      const songs = await scanDirectory(LOUVORES_DIR);
      const categories = {};
      for (const s of songs) {
        if (!categories[s.category]) categories[s.category] = [];
        categories[s.category].push(s);
      }
      console.log(`Catálogo: ${songs.length} louvores | ${artCache.size} capas de álbum`);
      return { songs, categories };
    })();
  }
  return catalogPromise;
}

// Embedded album art
app.get('/art/:id', (req, res) => {
  const art = artCache.get(req.params.id);
  if (!art) return res.status(404).end();
  res.set('Content-Type', art.mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(art.data);
});

// Audio, PDF and image files
app.use('/audio', (req, res) => {
  const filePath = path.join(LOUVORES_DIR, decodeURIComponent(req.path));
  const ext = path.extname(filePath).toLowerCase();
  if (AUDIO_EXTS.has(ext) || PDF_EXTS.has(ext) || IMAGE_EXTS.has(ext)) {
    res.sendFile(filePath);
  } else {
    res.status(403).end();
  }
});

app.get('/api/catalog', async (req, res) => res.json(await getCatalog()));

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const { songs } = await getCatalog();
  const results = songs.filter(s =>
    s.title.toLowerCase().includes(q) ||
    (s.number && s.number.toLowerCase().includes(q)) ||
    (s.artist && s.artist.toLowerCase().includes(q)) ||
    (s.album  && s.album.toLowerCase().includes(q))
  );
  res.json(results.slice(0, 60));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\nICM Louvor App → http://localhost:${PORT}`);
  console.log(`Pasta: ${LOUVORES_DIR}\n`);
  getCatalog();
});
