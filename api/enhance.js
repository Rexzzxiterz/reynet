// api/enhance.js - VERSI VERCEL
// Token HF diambil dari Vercel Env: HF_TOKEN
// Jangan taro token langsung di sini!

export const config = {
  api: {
    bodyParser: false, // biar kita bisa terima file mentah
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    return res.status(500).send('HF_TOKEN belum di-set di Vercel Settings -> Environment Variables');
  }

  try {
    // Baca body mentah (file gambar dari FormData)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    let imageBuffer = Buffer.concat(chunks);

    // Kalo yang dikirim FormData, kita potong header multipart nya
    // Biar yang kekirim ke HF cuma file gambarnya doang
    // Cara gampang: cari awal file JPEG/PNG di buffer
    const bufStr = imageBuffer.toString('binary');
    // Cari magic bytes JPEG (FF D8) atau PNG (89 50 4E 47)
    let start = -1;
    for (let i = 0; i < imageBuffer.length - 3; i++) {
      // JPEG
      if (imageBuffer[i] === 0xFF && imageBuffer[i+1] === 0xD8 && imageBuffer[i+2] === 0xFF) { start = i; break; }
      // PNG
      if (imageBuffer[i] === 0x89 && imageBuffer[i+1] === 0x50 && imageBuffer[i+2] === 0x4E && imageBuffer[i+3] === 0x47) { start = i; break; }
      // WEBP - RIFF
      if (imageBuffer[i] === 0x52 && imageBuffer[i+1] === 0x49 && imageBuffer[i+2] === 0x46 && imageBuffer[i+3] === 0x46) { start = i; break; }
    }
    if (start > 0) {
      // Potong sampe sebelum boundary akhir FormData
      // Cari boundary terakhir: \r\n------ 
      let end = imageBuffer.length;
      // Cari pattern \r\n-- dari belakang
      for (let i = imageBuffer.length - 100; i > start; i--) {
        if (imageBuffer[i] === 0x0D && imageBuffer[i+1] === 0x0A && imageBuffer[i+2] === 0x2D && imageBuffer[i+3] === 0x2D) {
          end = i;
          break;
        }
      }
      imageBuffer = imageBuffer.subarray(start, end);
    }

    const MODEL = 'sczhou/Real-ESRGAN';
    // Alternatif kalo yang ini error / loading lama:
    // 'Falconsai/real-esrgan'

    const hfRes = await fetch(
      `https://api-inference.huggingface.co/models/${MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
      }
    );

    if (!hfRes.ok) {
      const txt = await hfRes.text();
      console.log('HF error:', txt);
      if (hfRes.status === 503) {
        return res.status(503).send('Model lagi loading, coba lagi 20 detik');
      }
      return res.status(hfRes.status).send(txt);
    }

    const outBuffer = Buffer.from(await hfRes.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(outBuffer);

  } catch (e) {
    console.log(e);
    return res.status(500).send('AI gagal: ' + e.message);
  }
}
