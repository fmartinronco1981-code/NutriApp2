export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta GEMINI_API_KEY en Vercel' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const categoryKey = String(body.categoryKey || 'comida').trim();
    const description = String(body.description || '').trim();

    if (!description) {
      return res.status(400).json({ error: 'Falta la descripción de la comida' });
    }

    const prompt = `Analiza esta comida para el turno "${categoryKey}": "${description}". Devuelve un array JSON con cada alimento o componente indicado, estimando con realismo calorías totales, gramos de proteína, carbohidratos y grasas, cantidad y unidad ("grams" o "units"). Responde solo con JSON válido.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`;
    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                amount: { type: 'NUMBER' },
                unit: { type: 'STRING', enum: ['grams', 'units'] },
                kcal: { type: 'NUMBER' },
                protein: { type: 'NUMBER' },
                carbs: { type: 'NUMBER' },
                fat: { type: 'NUMBER' }
              },
              required: ['name', 'amount', 'unit', 'kcal', 'protein', 'carbs', 'fat']
            }
          }
        }
      })
    });

    const data = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      const msg = data?.error?.message || `Error HTTP ${geminiRes.status} desde Gemini`;
      return res.status(geminiRes.status).json({ error: msg });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const parsedItems = JSON.parse(rawText);

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(422).json({ error: 'Gemini no devolvió alimentos reconocibles' });
    }

    const items = parsedItems.map(it => ({
      name: String(it.name || description).trim(),
      brand: 'Gemini IA',
      amount: Number(it.amount) > 0 ? Number(it.amount) : 1,
      unit: it.unit === 'grams' ? 'grams' : 'units',
      kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
      protein: Math.max(0, Math.round((Number(it.protein) || 0) * 10) / 10),
      carbs: Math.max(0, Math.round((Number(it.carbs) || 0) * 10) / 10),
      fat: Math.max(0, Math.round((Number(it.fat) || 0) * 10) / 10)
    }));

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Error interno en /api/estimate-meal' });
  }
}
